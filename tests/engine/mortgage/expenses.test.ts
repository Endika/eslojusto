import { describe, expect, it } from 'vitest';
import { parseDate, type CivilDate } from '../../../src/engine/date';
import { reviewExpenses, type ExpenseItem } from '../../../src/engine/mortgage/expenses';
import type { SourceTable } from '../../../src/engine/mortgage/norms';
import type { Invoice, MortgageDeps, MortgageInput } from '../../../src/engine/mortgage/types';
import { DEPS, invoice, mortgage, READ_DEPS, TODAY } from './input';

const d = parseDate;

const run = (change: Partial<MortgageInput>, deps: MortgageDeps = DEPS, today: CivilDate = TODAY) =>
  reviewExpenses(mortgage(change), today, deps);

const statuses = (items: readonly ExpenseItem[]) =>
  items.map((i) => [i.kind, i.basis, i.status, i.share, i.amount]);

const keys = (item: ExpenseItem | undefined) => item?.calculation.map((c) => c.key);

const sourceIds = (item: ExpenseItem | undefined) => item?.sources.map((s) => s.id);

// The set-up costs of one deed, each paid on the deed's day.
const setUp = (deedOn: string): readonly Invoice[] =>
  [
    invoice('notary_loan', 600),
    invoice('registry_mortgage', 400),
    invoice('agency', 300),
    invoice('valuation', 350),
    invoice('ajd_loan', 1_500),
  ].map((i) => ({ ...i, paidOn: d(deedOn) }));

const NOTHING = { principal: 0, interest: null };

describe('set-up costs of a 2012 deed, consumer, with a costs clause', () => {
  const deed = { deedOn: d('2012-05-10'), invoices: setUp('2012-05-10') };

  it('explains the Supreme Court split without a figure while its rulings are unread', () => {
    const r = run(deed);
    expect(statuses(r.items)).toEqual([
      ['notary_loan', 'case_law', 'split_explained', 50, null],
      ['registry_mortgage', 'case_law', 'split_explained', 100, null],
      ['agency', 'case_law', 'split_explained', 100, null],
      ['valuation', 'case_law', 'split_explained', 100, null],
      ['ajd_loan', null, 'not_applicable_to_date', null, null],
    ]);
    expect(keys(r.items[0])).toEqual([
      'expenses.case_law_explained',
      'expenses.case_law_condition',
    ]);
    expect(r.items[0]?.calculation[0]?.vars).toEqual({ share: { percent: 50 } });
    expect(keys(r.items[4])).toEqual(['expenses.ajd_before_2018']);
    expect(sourceIds(r.items[4])).toEqual(['sts147_148_2018']);
    expect(r.totals).toEqual({ statute: NOTHING, caseLaw: NOTHING });
  });

  it('cites rulings 35/2021 and 816/2023 and C-224/19 for the split, nothing else', () => {
    expect(sourceIds(run(deed).items[0])).toEqual(['sts35_2021', 'sts816_2023', 'tjue_c224_19']);
  });

  it('gives the split in euros once those rulings are read: 300 + 400 + 300 + 350', () => {
    const r = run(deed, READ_DEPS);
    expect(statuses(r.items)).toEqual([
      ['notary_loan', 'case_law', 'lender_bears', 50, 300],
      ['registry_mortgage', 'case_law', 'lender_bears', 100, 400],
      ['agency', 'case_law', 'lender_bears', 100, 300],
      ['valuation', 'case_law', 'lender_bears', 100, 350],
      ['ajd_loan', null, 'not_applicable_to_date', null, null],
    ]);
    expect(r.items[0]?.calculation.slice(0, 2)).toEqual([
      { key: 'expenses.case_law', vars: { euros: { euros: 300 }, share: { percent: 50 } } },
      { key: 'expenses.case_law_condition' },
    ]);
    expect(r.totals.caseLaw.principal).toBe(1_350);
    expect(r.totals.statute).toEqual(NOTHING);
  });

  it('a split marked to give figures still gives none while a ruling is unread', () => {
    const r = run(deed, { ...DEPS, criteria: READ_DEPS.criteria });
    expect(r.items.map((i) => i.status)).not.toContain('lender_bears');
    expect(r.totals.caseLaw).toEqual(NOTHING);
  });

  it('read rulings alone give no figure while the split is still marked as information', () => {
    const r = run(deed, { ...DEPS, sources: READ_DEPS.sources });
    expect(r.items.map((i) => i.status)).not.toContain('lender_bears');
  });
});

describe('a 2018-12 deed, before the LCCI with the lender bearing the tax', () => {
  const deed = { deedOn: d('2018-12-14'), invoices: setUp('2018-12-14') };

  it('puts the tax by law and the rest under the split', () => {
    const r = run(deed);
    expect(statuses(r.items).at(-1)).toEqual(['ajd_loan', 'statute', 'lender_bears', 100, 1_500]);
    expect(r.items.at(-1)?.calculation[0]).toEqual({
      key: 'expenses.statute',
      vars: { euros: { euros: 1_500 } },
    });
    expect(sourceIds(r.items.at(-1))).toEqual(['ajd_lender']);
    expect(r.items.slice(0, 4).map((i) => i.status)).toEqual(Array(4).fill('split_explained'));
    expect(r.totals).toEqual({ statute: { principal: 1_500, interest: null }, caseLaw: NOTHING });
  });

  // Interest on these costs rests on ruling 725/2018, a court's criterion: it never rides on the
  // tax the law puts on the lender, read or not.
  it('works out no interest on the tax by law, whether ruling 725/2018 is read or not', () => {
    for (const deps of [DEPS, READ_DEPS]) {
      const tax = run(deed, deps).items.at(-1);
      expect([tax?.interest, keys(tax), sourceIds(tax)]).toEqual([
        null,
        ['expenses.statute'],
        ['ajd_lender'],
      ]);
    }
    const r = run(deed, READ_DEPS);
    expect(r.totals.statute).toEqual({ principal: 1_500, interest: null });
    expect(r.totals.caseLaw.principal).toBe(1_350);
    expect(r.totals.caseLaw.interest?.amount).toBeGreaterThan(0);
  });
});

describe('the LCCI regime starts with deeds of 16-06-2019', () => {
  it('a deed of 15-06-2019 still falls under the split; the tax, by law', () => {
    const r = run({ deedOn: d('2019-06-15'), invoices: setUp('2019-06-15') });
    expect(r.items.map((i) => [i.basis, i.status])).toEqual([
      ['case_law', 'split_explained'],
      ['case_law', 'split_explained'],
      ['case_law', 'split_explained'],
      ['case_law', 'split_explained'],
      ['statute', 'lender_bears'],
    ]);
  });

  it('a deed of 16-06-2019 puts it all on the lender by law but the valuation', () => {
    const r = run({ deedOn: d('2019-06-16'), invoices: setUp('2019-06-16') }, READ_DEPS);
    expect(statuses(r.items)).toEqual([
      ['notary_loan', 'statute', 'lender_bears', 100, 600],
      ['registry_mortgage', 'statute', 'lender_bears', 100, 400],
      ['agency', 'statute', 'lender_bears', 100, 300],
      ['valuation', 'statute', 'borrower_bears', 0, null],
      ['ajd_loan', 'statute', 'lender_bears', 100, 1_500],
    ]);
    expect(keys(r.items[3])).toEqual(['expenses.valuation_borrower']);
    expect(sourceIds(r.items[0])?.[0]).toBe('expenses_lcci');
    // Ruling 725/2018 speaks of deeds before the LCCI: not a word on interest after it.
    expect(keys(r.items[0])).toEqual(['expenses.statute']);
    expect(sourceIds(r.items[0])).toEqual(['expenses_lcci']);
    expect(r.totals).toEqual({ statute: { principal: 2_800, interest: null }, caseLaw: NOTHING });
  });
});

describe('a 2021 deed', () => {
  const deedOn = d('2021-04-20');

  it('puts the notary, its copy, registry, agency and tax on the lender; the record on nobody', () => {
    const r = run({
      deedOn,
      invoices: [
        ...setUp('2021-04-20'),
        invoice('notary_copy_bank', 30),
        invoice('notary_copy_borrower', 25),
        invoice('transparency_deed', 60),
      ],
    });
    expect(statuses(r.items).slice(5)).toEqual([
      ['notary_copy_bank', 'statute', 'lender_bears', 100, 30],
      ['notary_copy_borrower', 'statute', 'borrower_bears', 0, null],
      ['transparency_deed', 'statute', 'not_chargeable', null, 60],
    ]);
    expect(sourceIds(r.items[7])).toEqual(['transparency_act_free']);
    // Art. 15.8: the record carries no fee; whoever charged it was not the lender.
    expect(r.items[7]?.calculation).toEqual([
      { key: 'expenses.transparency_free', vars: { euros: { euros: 60 } } },
    ]);
    // 600 + 400 + 300 + 1.500 + 30, without the record.
    expect(r.totals.statute.principal).toBe(2_830);
    expect(r.totals.caseLaw).toEqual(NOTHING);
  });

  it('counts an outlay of the agency once, under the tax it matches within 5 cents', () => {
    const r = run({
      deedOn,
      invoices: [
        invoice('agency', 2_100, { supplied: [1_500, 100] }),
        invoice('ajd_loan', 1_500.03),
      ],
    });
    // 2.100 − 1.500 counted with the tax − 100 that matches nothing entered.
    expect(statuses(r.items)).toEqual([
      ['agency', 'statute', 'lender_bears', 100, 500],
      ['ajd_loan', 'statute', 'lender_bears', 100, 1_500.03],
    ]);
    expect(r.items[0]?.calculation.slice(1, 3)).toEqual([
      { key: 'expenses.supplied_own_line', vars: { euros: { euros: 1_500 } } },
      { key: 'expenses.supplied_left_out', vars: { euros: { euros: 100 } } },
    ]);
    expect(r.totals.statute.principal).toBe(2_000.03);
  });

  it('takes out an outlay matching a tax that counts nothing here, saying only where it goes', () => {
    const r = run(
      {
        deedOn: d('2017-03-01'),
        invoices: [invoice('agency', 1_900, { supplied: [1_500] }), invoice('ajd_loan', 1_500)],
      },
      READ_DEPS,
    );
    // 1.900 − 1.500 of the tax, which is the borrower's before 10-11-2018.
    expect(statuses(r.items)).toEqual([
      ['agency', 'case_law', 'lender_bears', 100, 400],
      ['ajd_loan', null, 'not_applicable_to_date', null, null],
    ]);
    expect(keys(r.items[0])).toContain('expenses.supplied_own_line');
  });

  it('keeps the figures by law after an agreement with the lender, citing art. 3', () => {
    const r = run({ deedOn, agreementOnExpenses: true, invoices: [invoice('notary_loan', 600)] });
    expect(r.items[0]?.status).toBe('lender_bears');
    expect(keys(r.items[0])).toContain('expenses.agreement_statute');
    expect(sourceIds(r.items[0])).toContain('binding_terms');
  });
});

describe('what stays out of the figures', () => {
  it.each(['notary_purchase', 'registry_purchase', 'ajd_purchase'] as const)(
    'the purchase cost %s',
    (kind) => {
      for (const deedOn of ['2012-05-10', '2021-04-20']) {
        const [item] = run({ deedOn: d(deedOn), invoices: [invoice(kind, 900)] }, READ_DEPS).items;
        expect([item?.basis, item?.status, keys(item)]).toEqual([
          null,
          'not_applicable',
          ['expenses.purchase'],
        ]);
      }
    },
  );

  it('an invoice mixing the purchase and the loan without a breakdown', () => {
    for (const deedOn of ['2012-05-10', '2021-04-20']) {
      const r = run(
        { deedOn: d(deedOn), invoices: [invoice('notary_loan', 1_400, { mixed: true })] },
        READ_DEPS,
      );
      expect([r.items[0]?.status, r.items[0]?.amount, keys(r.items[0])]).toEqual([
        'review_it',
        null,
        ['expenses.mixed'],
      ]);
      expect(r.totals).toEqual({ statute: NOTHING, caseLaw: NOTHING });
    }
  });

  // Half of an invoice that also holds the purchase is not the lender's, and a share of what the
  // lender paid itself means nothing: neither shows a share, read or not.
  it.each([
    ['mixed', { mixed: true }, 'review_it', 'expenses.mixed'],
    ['paid by the lender', { paidBy: 'bank' }, 'paid_by_bank', 'expenses.paid_by_bank'],
    ['of an unknown payer', { paidBy: 'unknown' }, 'review_it', 'expenses.payer_unknown'],
  ] as const)('an invoice %s under the split shows no share', (_, change, status, key) => {
    for (const deps of [DEPS, READ_DEPS]) {
      const [item] = run({ invoices: [invoice('notary_loan', 900, change)] }, deps).items;
      expect([item?.status, item?.share, item?.amount, keys(item)]).toEqual([
        status,
        null,
        null,
        [key],
      ]);
    }
  });

  it('the copies: the lender pays its own, the borrower whichever it asks for', () => {
    const r = run(
      { invoices: [invoice('notary_copy_bank', 30), invoice('notary_copy_borrower', 25)] },
      READ_DEPS,
    );
    expect(statuses(r.items)).toEqual([
      ['notary_copy_bank', 'case_law', 'lender_bears', 100, 30],
      ['notary_copy_borrower', 'case_law', 'borrower_bears', 0, null],
    ]);
  });

  it('the cancellation: the notary is not a set-up cost, the registry is left to check', () => {
    for (const deedOn of ['2012-05-10', '2021-04-20']) {
      const r = run(
        {
          deedOn: d(deedOn),
          invoices: [invoice('notary_cancellation', 300), invoice('registry_cancellation', 80)],
        },
        READ_DEPS,
      );
      expect(r.items.map((i) => [i.status, keys(i)])).toEqual([
        ['not_applicable', ['expenses.cancellation']],
        ['review_it', ['expenses.registry_cancellation']],
      ]);
    }
  });

  it('a notary record of the advice on a deed before the LCCI', () => {
    const [item] = run({ invoices: [invoice('transparency_deed', 60)] }, READ_DEPS).items;
    expect([item?.status, keys(item)]).toEqual([
      'review_it',
      ['expenses.transparency_before_lcci'],
    ]);
  });

  it('a person who is not a consumer, before 2019: the split does not apply', () => {
    const r = run({ consumer: false, invoices: setUp('2012-05-10') }, READ_DEPS);
    expect(r.items.slice(0, 4).map((i) => [i.status, keys(i)])).toEqual(
      Array(4).fill(['not_applicable', ['expenses.not_consumer']]),
    );
    expect(r.totals.caseLaw).toEqual(NOTHING);
  });

  it('a person who does not know: both answers differ, so it is left to check', () => {
    const r = run(
      { deedOn: d('2018-12-14'), consumer: null, invoices: setUp('2018-12-14') },
      READ_DEPS,
    );
    expect(r.items.map((i) => [i.status, keys(i)?.[0]])).toEqual([
      ...Array(4).fill(['review_it', 'expenses.consumer_unknown']),
      ['lender_bears', 'expenses.statute'],
    ]);
  });

  it.each([
    ['absent', 'expenses.no_clause'],
    ['unknown', 'expenses.clause_unknown'],
  ] as const)('a costs clause %s', (expensesClause, key) => {
    const r = run({ expensesClause, invoices: [invoice('registry_mortgage', 400)] }, READ_DEPS);
    expect([r.items[0]?.status, keys(r.items[0])]).toEqual(['review_it', [key]]);
  });

  it('an agreement on the costs before the LCCI leaves the split and the tax to check', () => {
    const r = run(
      {
        deedOn: d('2018-12-14'),
        agreementOnExpenses: true,
        invoices: [invoice('registry_mortgage', 400), invoice('ajd_loan', 1_500)],
      },
      READ_DEPS,
    );
    expect(r.items.map((i) => [i.status, keys(i)])).toEqual([
      ['review_it', ['expenses.agreement_case_law']],
      ['review_it', ['expenses.agreement_ajd']],
    ]);
  });

  it('not knowing about an agreement leaves the split and the earlier tax to check, not the LCCI', () => {
    const before = run(
      {
        deedOn: d('2018-12-14'),
        agreementOnExpenses: null,
        invoices: [invoice('registry_mortgage', 400), invoice('ajd_loan', 1_500)],
      },
      READ_DEPS,
    );
    expect(before.items.map((i) => [i.status, keys(i)])).toEqual(
      Array(2).fill(['review_it', ['expenses.agreement_unknown']]),
    );
    const after = run({
      deedOn: d('2021-04-20'),
      agreementOnExpenses: null,
      invoices: [invoice('registry_mortgage', 400)],
    });
    expect(after.items[0]?.status).toBe('lender_bears');
  });

  it.each([
    ['bank', 'paid_by_bank', 'expenses.paid_by_bank'],
    ['unknown', 'review_it', 'expenses.payer_unknown'],
  ] as const)('a cost paid by %s', (paidBy, status, key) => {
    const r = run({ deedOn: d('2021-04-20'), invoices: [invoice('agency', 300, { paidBy })] });
    expect([r.items[0]?.status, r.items[0]?.amount, keys(r.items[0])]).toEqual([
      status,
      null,
      [key],
    ]);
  });

  it('a cost with no invoice nor amount is never estimated', () => {
    const r = run({ deedOn: d('2021-04-20'), invoices: [invoice('notary_loan', null)] });
    expect([r.items[0]?.status, keys(r.items[0])]).toEqual(['not_entered', ['item.not_entered']]);
  });
});

describe('legal interest on the split, once ruling 725/2018 is read', () => {
  // 1.000 € paid on 15-02-2009 and looked at on 15-02-2010: 45 days at 5,50 % (6,7808), 275 at
  // 4,00 % (30,1370) and 45 of 2010 at 4,00 % (4,9315) = 41,85.
  it('splits 2009 at the change of rate on 1 April and at the year change', () => {
    const r = run(
      {
        deedOn: d('2009-02-15'),
        invoices: [invoice('registry_mortgage', 1_000, { paidOn: d('2009-02-15') })],
      },
      READ_DEPS,
      d('2010-02-15'),
    );
    expect(r.items[0]?.interest).toEqual({
      amount: 41.85,
      until: '2010-02-14',
      estimated: false,
      missingYear: null,
    });
    expect(r.items[0]?.calculation.at(-1)).toEqual({
      key: 'interest.counted',
      vars: {
        euros: { euros: 41.85 },
        from: { date: '2009-02-15' },
        until: { date: '2010-02-14' },
      },
    });
  });

  // 400 € from 10-05-2012: 236 days of 2012 and the whole of 2013-2014 at 4 %, 2015 at 3,50 %,
  // 2016-2022 at 3 % (2.557 days), 2023-2026 at 3,25 % (1.461 days), 365-day years:
  // 400 × (9,44 + 29,2 + 12,775 + 76,71 + 47,4825) / 365 = 192,45.
  it('stops at 31-12 of the last published year, never using the year before', () => {
    const r = run(
      { invoices: [invoice('registry_mortgage', 400, { paidOn: d('2012-05-10') })] },
      READ_DEPS,
      d('2027-03-01'),
    );
    expect(r.items[0]?.interest).toEqual({
      amount: 192.45,
      until: '2026-12-31',
      estimated: false,
      missingYear: 2027,
    });
    expect(keys(r.items[0])?.at(-1)).toBe('interest.not_published');
  });

  it('counts from the deed day, marked as an estimate, when the day of payment is unknown', () => {
    const r = run({ invoices: [invoice('registry_mortgage', 400)] }, READ_DEPS);
    expect(r.items[0]?.interest?.estimated).toBe(true);
    expect(keys(r.items[0])).toContain('interest.estimated');
    expect(r.totals.caseLaw.interest?.estimated).toBe(true);
  });

  it('works out no interest once something has come back, and takes it off each line', () => {
    const r = run(
      { deedOn: d('2018-12-14'), invoices: setUp('2018-12-14'), alreadyReturned: 200 },
      READ_DEPS,
    );
    expect(r.items.map((i) => i.interest)).toEqual(Array(5).fill(null));
    expect(keys(r.items[0])).toContain('interest.returned');
    expect(r.totals).toEqual({
      statute: { principal: 1_300, interest: null },
      caseLaw: { principal: 1_150, interest: null },
    });
    expect(r.calculation).toEqual([{ key: 'expenses.returned', vars: { euros: { euros: 200 } } }]);
  });
});

describe('a court criterion never moves what the law settles', () => {
  const deed = { deedOn: d('2018-12-14'), invoices: setUp('2018-12-14') };
  const unread = (id: keyof SourceTable): MortgageDeps => ({
    ...READ_DEPS,
    sources: { ...READ_DEPS.sources, [id]: { ...READ_DEPS.sources[id], verified: false } },
  });

  it.each(['sts35_2021', 'sts816_2023', 'tjue_c224_19', 'sts725_2018'] as const)(
    'taking %s back to unread leaves the tax by law as it was',
    (id) => {
      const read = run(deed, READ_DEPS);
      const back = run(deed, unread(id));
      expect(back.items.at(-1)).toEqual(read.items.at(-1));
      expect(back.totals.statute).toEqual(read.totals.statute);
    },
  );

  it('the line by law is the same with every ruling unread, read, or the criteria as information', () => {
    const lines = [DEPS, READ_DEPS, { ...READ_DEPS, criteria: DEPS.criteria }].map((deps) => {
      const r = run(deed, deps);
      return [r.totals.statute, r.items.filter((i) => i.basis === 'statute')];
    });
    expect(lines[1]).toEqual(lines[0]);
    expect(lines[2]).toEqual(lines[0]);
    expect(lines[0]?.[0]).toEqual({ principal: 1_500, interest: null });
  });
});
