import { beforeEach, describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { LEGAL_INTEREST } from '../../src/engine/law/data/legal-interest';
import { reviewMortgage } from '../../src/engine/mortgage/review';
import type { ExpenseItem } from '../../src/engine/mortgage/expenses';
import type { TodayItem } from '../../src/engine/mortgage/fees';
import type { MortgageReview } from '../../src/engine/mortgage/review';
import type { MortgageDeps, MortgageInput, Operation } from '../../src/engine/mortgage/types';
import type { Block, DocumentModel } from '../../src/documents/ports';
import type { Translate } from '../../src/i18n/client';
import { mortgageReport } from '../../src/mortgage/report';
import { DEPS, invoice, mortgage, TODAY, UNREAD_DEPS } from '../engine/mortgage/input';
import { pageTranslator } from '../support/page-strings';

const tr: Translate = pageTranslator('mortgage');
const d = parseDate;

const report = (change: Partial<MortgageInput>, deps: MortgageDeps = DEPS): DocumentModel => {
  const input = mortgage(change);
  const r = reviewMortgage(input, TODAY, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return mortgageReport({ input, review: r.review }, LEGAL_INTEREST, tr, TODAY);
};

const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

const rows = (model: DocumentModel) =>
  model.blocks
    .filter((b): b is Extract<Block, { type: 'row' }> => b.type === 'row')
    .map((b) => [b.label, plain(b.value)]);

const texts = (model: DocumentModel) =>
  model.blocks.flatMap((b) => ('text' in b ? [plain(b.text)] : []));

const between = (model: DocumentModel, heading: string): DocumentModel => {
  const all = model.blocks;
  const from = all.findIndex((b) => b.type === 'heading' && b.text === heading);
  const to = all.findIndex((b, i) => i > from && b.type === 'heading');
  return { ...model, blocks: all.slice(from, to === -1 ? undefined : to) };
};

// A deed of 14-12-2018 with every invoice paid on its day, once the Supreme Court rulings are read:
// the tax by law, the notary and the registry by the split, with legal interest from that day.
const SPLIT: Partial<MortgageInput> = {
  deedOn: d('2018-12-14'),
  loanAmount: 150_000,
  invoices: [
    invoice('notary_loan', 800, { paidOn: d('2018-12-14') }),
    invoice('registry_mortgage', 400, { paidOn: d('2018-12-14') }),
    invoice('ajd_loan', 1_500, { paidOn: d('2018-12-14') }),
  ],
  clauses: [{ label: 'irph', present: true }],
};

describe('the mortgage report', () => {
  let model: DocumentModel;
  beforeEach(() => {
    model = report(SPLIT, DEPS);
  });

  it('dates the report and gives the data the person confirmed', () => {
    expect(model.title).toBe('Revisión de los gastos y comisiones de tu hipoteca');
    expect(model.footer).toContain('9 de octubre de 2026');
    expect(texts(model)).toContain('eslojusto.es · 9 de octubre de 2026');
    expect(rows(model)).toEqual(
      expect.arrayContaining([
        ['Fecha de la escritura', '14-12-2018'],
        ['Capital del préstamo', '150.000,00 €'],
        ['La pediste como particular, para tu casa', 'Sí'],
        ['Tipo de interés', 'Variable'],
        ['Revisión del tipo', 'Cada 12 meses'],
        ['Cláusula de gastos en la escritura', 'La tiene'],
        ['Notaría del préstamo', '800,00 € · lo pagaste tú'],
        ['Impuesto del préstamo (AJD)', '1.500,00 € · lo pagaste tú'],
        ['Día del pago', '14-12-2018'],
        ['IRPH', 'Aparece en tu escritura'],
      ]),
    );
  });

  it('keeps the total by law and the one by the Supreme Court on lines of their own', () => {
    const summary = between(model, 'Resumen');
    expect(rows(summary)).toEqual([
      ['Por ley', '1.500,00 €'],
      ['Según el reparto del Tribunal Supremo', '800,00 €'],
      ['Interés legal hasta el 08-10-2026', expect.stringMatching(/ €$/)],
    ]);
    const all = texts(summary).join('\n');
    expect(all).toContain('Estas cifras no se suman');
    expect(all).toContain('hace falta que el banco lo acepte o que un juez anule');
    expect(all).not.toContain('2.300');
  });

  it('gives the legal interest of each split item year by year', () => {
    const expenses = between(model, 'Gasto por gasto');
    expect(texts(expenses)).toContain('Interés legal sobre la parte del banco, año por año:');
    const years = rows(expenses).filter(([label]) => /^\d{4}: /.test(label ?? ''));
    // 18 days of 2018, then each year up to 2026, for each of the two split items.
    const nine = [...Array(9).keys()].map((i) => String(2018 + i));
    expect(years.map(([label]) => label?.slice(0, 4))).toEqual([...nine, ...nine]);
    expect(years[0]).toEqual(['2018: 18 días al 3 %', expect.stringMatching(/ €$/)]);
    // The statute item carries no interest.
    const tax = texts(expenses).indexOf('Impuesto del préstamo (AJD)');
    expect(texts(expenses).slice(tax)).not.toContain(
      'Interés legal sobre la parte del banco, año por año:',
    );
  });

  it('dates the state of the case law in the flags and gives every source with its state', () => {
    expect(texts(between(model, 'Cláusulas de tu escritura'))).toContain(
      'Lo que dicen los tribunales · estado a 19-10-2026',
    );
    const sources = between(model, 'Las normas y criterios, y su estado').blocks.filter(
      (b) => b.type === 'source',
    );
    expect(sources.length).toBeGreaterThan(4);
    expect(sources.map((s) => ('text' in s ? s.text : ''))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/art\. 29\b.* · con efectos desde el .* · en vigor$/),
        expect.stringMatching(/C-125\/18.* · estado a \d\d-\d\d-\d{4}$/),
      ]),
    );
  });

  it('gives no figure for the split if its rulings were unread', () => {
    const summary = rows(between(report(SPLIT, UNREAD_DEPS), 'Resumen'));
    expect(summary).toContainEqual([
      'Según el reparto del Tribunal Supremo',
      'Sin cifra por ahora',
    ]);
    expect(summary.some(([label]) => label?.startsWith('Interés legal'))).toBe(false);
  });

  it('with the agreement unknown, says the split is held in «Para revisar», not that nothing is owed', () => {
    const summary = rows(between(report({ ...SPLIT, agreementOnExpenses: null }, DEPS), 'Resumen'));
    expect(summary).toContainEqual([
      'Según el reparto del Tribunal Supremo',
      'Sin cifra: hay gastos en «Para revisar»',
    ]);
  });

  it('gives the fees over their caps apart, with the lowest reading', () => {
    const fees = report({
      deedOn: d('2021-03-10'),
      operations: [
        {
          on: d('2022-03-01'),
          kind: 'partial_prepayment',
          principal: 20_000,
          feeCharged: 200,
          hadInsurance: null,
        },
      ],
    });
    expect(rows(between(fees, 'Resumen'))).toContainEqual([
      'Comisiones por encima del tope legal',
      '150,00 €',
    ]);
    expect(texts(between(fees, 'Resumen')).join('\n')).toContain('la más alta da 170,00 €');
    expect(rows(fees)).toContainEqual([
      'Amortización parcial',
      '01-03-2022: 20.000,00 € amortizados, 200,00 € de comisión',
    ]);
  });

  it('ends with what the review does not look at and where to find out for free', () => {
    const headings = model.blocks.flatMap((b) => (b.type === 'heading' ? [b.text] : []));
    expect(headings).toEqual([
      'Tus datos',
      'Resumen',
      'Gasto por gasto',
      'Si devolvieras capital hoy',
      'Cláusulas de tu escritura',
      'Las normas y criterios, y su estado',
      'Para que lo sepas',
      'Lo que esta revisión no mira',
      'Dónde informarte gratis',
    ]);
    expect(texts(between(model, 'Lo que esta revisión no mira'))).toContain(
      'Los plazos de tu caso',
    );
  });
});

describe('what repaying capital today may cost', () => {
  it('gives the cap of today on 10.000 €, when it changes and its norm', () => {
    const today = between(
      report({ deedOn: d('2023-02-01'), rateType: 'fixed' }),
      'Si devolvieras capital hoy',
    );
    expect(texts(today)).toEqual([
      'Si devolvieras capital hoy',
      'Lo más que tu banco puede cobrarte hoy como compensación por amortizar capital, con lo que dicen tu escritura y la ley. Va con un ejemplo de 10.000 € amortizados: la cifra crece en proporción a lo que devuelvas.',
      'Tope de hoy: el 2 % del capital amortizado, 200,00 € por cada 10.000 €.',
      'Con tipo fijo, la ley fija como tope el 2 % del capital amortizado en los 10 primeros años (art. 23.7).',
      'La ley también limita la compensación a la pérdida que sufre el banco (art. 23.8), que aquí no se puede calcular.',
      'Desde el 01-02-2033, el tope de la ley pasa al 1,5 %.',
      expect.stringMatching(/^Ley de contratos de crédito inmobiliario, art\. 23\.7/),
      expect.stringMatching(/^Ley de contratos de crédito inmobiliario, art\. 23\.8/),
    ]);
  });

  it('says 0 € once the variable rate years are over, with no change to come', () => {
    const today = between(
      report({ deedOn: d('2020-03-01'), rateType: 'variable', prepaymentOption: 'a_015_5y' }),
      'Si devolvieras capital hoy',
    );
    expect(texts(today)).toContain('Tope de hoy: 0 €. No se puede cobrar compensación.');
    expect(texts(today).some((t) => t.startsWith('Desde el'))).toBe(false);
  });

  it('gives each option when the deed does not say which', () => {
    const today = between(
      report({ deedOn: d('2024-06-01'), rateType: 'variable', prepaymentOption: 'unknown' }),
      'Si devolvieras capital hoy',
    );
    expect(texts(today)).toEqual(
      expect.arrayContaining([
        'Con el 0,15 % durante 5 años',
        'Tope de hoy: el 0,15 % del capital amortizado, 15,00 € por cada 10.000 €.',
        'Desde el 01-06-2029, el tope de la ley pasa al 0 %.',
        'Con el 0,25 % durante 3 años',
        'Tope de hoy: el 0,25 % del capital amortizado, 25,00 € por cada 10.000 €.',
        'Desde el 01-06-2027, el tope de la ley pasa al 0 %.',
      ]),
    );
  });
});

describe('the mortgage report, block by block', () => {
  const echo: Translate = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);
  const reviewed = (change: Partial<MortgageInput>, deps: MortgageDeps = DEPS) => {
    const input = mortgage(change);
    const r = reviewMortgage(input, TODAY, deps);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return { input, review: r.review };
  };
  const echoed = (change: Partial<MortgageInput>, deps: MortgageDeps = DEPS) =>
    mortgageReport(reviewed(change, deps), LEGAL_INTEREST, echo, TODAY);

  const structure = (model: DocumentModel): string => {
    const runs: string[] = [];
    let last = '';
    let count = 0;
    const flush = () => count > 0 && runs.push(count > 1 ? `${last}×${count}` : last);
    for (const { type } of model.blocks) {
      if (type === last) count++;
      else {
        flush();
        last = type;
        count = 1;
      }
    }
    flush();
    return runs.join(' ');
  };
  const lines = (blocks: readonly Block[]) =>
    blocks.map((b) =>
      plain(
        b.type === 'row'
          ? `row: ${b.label} = ${b.value}`
          : `${b.type}: ${'text' in b ? b.text : ''}`,
      ),
    );
  const part = (model: DocumentModel, from: string) => {
    const start = model.blocks.findIndex((b) => b.type === 'heading' && b.text === from);
    const end = model.blocks.findIndex((b, i) => i > start && b.type === 'heading');
    return lines(model.blocks.slice(start + 1, end));
  };
  const YOUR_DATA = 'client.mortgage.report.your_data';
  const SUMMARY = 'client.mortgage.report.summary';
  const EXPENSES = 'client.mortgage.report.expenses';
  const op = (change: Partial<Operation> = {}): Operation => ({
    on: d('2022-03-01'),
    kind: 'partial_prepayment',
    principal: 20_000,
    feeCharged: 200,
    hadInsurance: null,
    ...change,
  });
  const TODAY_DEED = d('2026-10-09');

  const FULL: Partial<MortgageInput> = {
    deedOn: d('2021-03-10'),
    loanAmount: 100_000,
    consumer: null,
    rateType: 'fixed',
    rateRevisionMonths: null,
    expensesClause: 'unknown',
    prepaymentOption: 'unknown',
    alreadyReturned: 300,
    agreementOnExpenses: true,
    invoices: [
      invoice('notary_loan', 600, { mixed: true, paidBy: 'bank' }),
      invoice('valuation', null),
      invoice('transparency_deed', 50, { paidBy: 'unknown', paidOn: d('2021-03-10') }),
    ],
    operations: [op()],
  };
  const SPLIT_DEED = {
    deedOn: d('2018-12-14'),
    loanAmount: 150_000,
    invoices: [
      invoice('notary_loan', 800, { paidOn: d('2018-12-14') }),
      invoice('registry_mortgage', 400),
      invoice('ajd_loan', 1_500),
    ],
    clauses: [{ label: 'irph', present: true }],
  } satisfies Partial<MortgageInput>;
  const LCCI = {
    deedOn: d('2021-03-10'),
    invoices: [invoice('notary_loan', 600), invoice('transparency_deed', 50)],
    alreadyReturned: 300,
  };
  const READINGS = { deedOn: d('2021-03-10'), operations: [op()] };
  const SINGLE = { ...READINGS, prepaymentOption: 'a_015_5y' } as const;

  describe('what the person confirmed', () => {
    it('gives only what was asked, when little was', () => {
      expect(part(echoed({}), YOUR_DATA)).toEqual([
        'row: client.mortgage.report.deed_on = 10-05-2012',
        'row: client.mortgage.report.consumer = client.mortgage.answer.yes',
        'row: client.mortgage.report.rate_type = client.mortgage.report.rate.variable',
        'row: client.mortgage.report.revision = client.mortgage.report.revision_months {"meses":"12"}',
        'row: client.mortgage.report.expenses_clause = client.mortgage.report.expenses_clause.present',
      ]);
    });

    it('gives everything else when it was asked, in the order of the form', () => {
      expect(part(echoed(FULL), YOUR_DATA)).toEqual([
        'row: client.mortgage.report.deed_on = 10-03-2021',
        'row: client.mortgage.report.loan_amount = 100.000,00 €',
        'row: client.mortgage.report.consumer = client.mortgage.answer.unknown',
        'row: client.mortgage.report.rate_type = client.mortgage.report.rate.fixed',
        'row: client.mortgage.report.expenses_clause = client.mortgage.report.expenses_clause.unknown',
        'row: client.mortgage.invoice.notary_loan = client.mortgage.report.invoice_mixed {"importe":"600,00 €","pagador":"client.mortgage.report.paid_by.bank"}',
        'row: client.mortgage.invoice.valuation = client.mortgage.report.no_figure',
        'row: client.mortgage.invoice.transparency_deed = client.mortgage.report.invoice {"importe":"50,00 €","pagador":"client.mortgage.report.paid_by.unknown"}',
        'row: client.mortgage.report.paid_on = 10-03-2021',
        'row: client.mortgage.report.agreement = client.mortgage.answer.yes',
        'row: client.mortgage.report.returned = 300,00 €',
        'row: client.mortgage.operation.partial_prepayment = client.mortgage.report.operation {"fecha":"01-03-2022","capital":"20.000,00 €","comision":"200,00 €"}',
        'row: client.mortgage.report.prepayment_option = client.mortgage.report.prepayment_option.unknown',
      ]);
    });

    it.each([
      ['no invoices to say who agreed', { invoices: [] }],
      ['the invoices out of reach', { invoicesAtHand: false }],
    ])('leaves the agreement out with %s', (_name, change) => {
      const withInvoices = { invoices: [invoice('valuation', 300)], agreementOnExpenses: false };
      const rows = part(echoed({ ...withInvoices, ...change }), YOUR_DATA);
      expect(rows.some((r) => r.includes('report.agreement'))).toBe(false);
      const kept = part(echoed(withInvoices), YOUR_DATA);
      expect(kept).toContain('row: client.mortgage.report.agreement = client.mortgage.answer.no');
    });

    it('leaves out what came back when it was nothing', () => {
      for (const alreadyReturned of [null, 0])
        expect(
          part(echoed({ alreadyReturned }), YOUR_DATA).some((r) => r.includes('returned')),
        ).toBe(false);
    });

    it('gives the day of the first invoice that has one', () => {
      const rows = part(
        echoed({
          invoices: [
            invoice('valuation', 300),
            invoice('agency', 100, { paidOn: d('2020-02-02') }),
            invoice('notary_loan', 100, { paidOn: d('2020-03-03') }),
          ],
        }),
        YOUR_DATA,
      );
      expect(rows).toContain('row: client.mortgage.report.paid_on = 02-02-2020');
    });
  });

  describe('the summary', () => {
    const summary = (change: Partial<MortgageInput>, deps: MortgageDeps = DEPS) =>
      part(echoed(change, deps), SUMMARY);
    const STATUTE = 'row: client.mortgage.report.total_statute';
    const CASE_LAW = 'row: client.mortgage.report.total_case_law';
    const TAIL = [
      'note: client.mortgage.report.case_law_condition',
      'text: client.mortgage.report.totals_apart',
    ];

    it('says nothing is owed when nothing is', () => {
      expect(summary({})).toEqual([
        `${STATUTE} = client.mortgage.total.nothing`,
        `${CASE_LAW} = client.mortgage.total.nothing`,
        ...TAIL,
      ]);
    });

    it('gives the law’s figure, the notary record charged to nobody, and what came back', () => {
      expect(summary(LCCI)).toEqual([
        `${STATUTE} = 300,00 €`,
        'row: client.mortgage.report.total_not_chargeable = 50,00 €',
        `${CASE_LAW} = client.mortgage.total.nothing`,
        ...TAIL,
        'bullet: client.mortgage.calculation.expenses.returned {"euros":"300,00 €"}',
      ]);
    });

    it('gives the split with the legal interest up to the day, even when it comes to nothing', () => {
      expect(
        summary({
          deedOn: d('2018-12-14'),
          invoices: [invoice('notary_loan', 800, { paidOn: TODAY_DEED })],
        }),
      ).toEqual([
        `${STATUTE} = client.mortgage.total.nothing`,
        `${CASE_LAW} = 400,00 €`,
        'row: client.mortgage.report.total_interest {"fecha":"08-10-2026"} = 0,00 €',
        ...TAIL,
      ]);
    });

    it('gives no figure for the split while its rulings are unread, nor interest', () => {
      expect(
        summary({ deedOn: d('2018-12-14'), invoices: [invoice('notary_loan', 800)] }, UNREAD_DEPS),
      ).toEqual([
        `${STATUTE} = client.mortgage.total.nothing`,
        `${CASE_LAW} = client.mortgage.total.no_figure_yet`,
        ...TAIL,
      ]);
    });

    it('gives the law’s total as to review while some invoice is, and the interest as estimated', () => {
      expect(summary(FULL)[0]).toBe(`${STATUTE} = client.mortgage.total.review_it`);
      expect(summary(SPLIT_DEED)).toEqual([
        `${STATUTE} = 1.500,00 €`,
        `${CASE_LAW} = 800,00 €`,
        'row: client.mortgage.report.total_interest_estimated {"fecha":"08-10-2026"} = 195,34 €',
        ...TAIL,
      ]);
    });

    it.each([
      ['none', { caseLaw: { principal: 100, interest: null } }],
      [
        'with nothing to give it on',
        {
          caseLaw: { principal: 0, interest: { amount: 5, until: '2026-10-08', estimated: false } },
        },
      ],
    ])('gives no interest row for interest %s', (_name, totals) => {
      const r = reviewed({ deedOn: d('2018-12-14'), invoices: [invoice('notary_loan', 800)] });
      const injected = { ...r, review: { ...r.review, totals: { ...r.review.totals, ...totals } } };
      const model = mortgageReport(injected as never, LEGAL_INTEREST, echo, TODAY);
      expect(part(model, SUMMARY).some((l) => l.includes('total_interest'))).toBe(false);
    });

    it.each([
      [
        'the least a fee over its cap gives, and the most',
        READINGS,
        [
          'row: client.mortgage.report.total_fees = 150,00 €',
          'note: client.mortgage.report.fees_up_to {"maximo":"170,00 €"}',
        ],
      ],
      [
        'a fee over its cap in every reading',
        SINGLE,
        ['row: client.mortgage.report.total_fees = 170,00 €'],
      ],
      [
        'a fee within its cap',
        { ...SINGLE, operations: [op({ feeCharged: 10 })] },
        ['row: client.mortgage.report.total_fees = client.mortgage.total.nothing'],
      ],
    ])('gives %s apart', (_name, change, fees) => {
      expect(summary(change)).toEqual([
        `${STATUTE} = client.mortgage.total.nothing`,
        `${CASE_LAW} = client.mortgage.total.nothing`,
        TAIL[0],
        ...fees,
        TAIL[1],
      ]);
    });
  });

  describe('what to know', () => {
    it('puts the lines of what to know one after the other in one text', () => {
      const info = part(echoed({ deedOn: d('2021-03-10') }), 'client.mortgage.report.information');
      const i = info.indexOf('subheading: client.mortgage.info.fein_timing');
      expect(info[i + 1]).toBe(
        'text: client.mortgage.calculation.information.fein_timing {} client.mortgage.calculation.information.transparency_act {}',
      );
    });

    it('dates only what is given as of a day', () => {
      const info = part(echoed({}), 'client.mortgage.report.information').filter(
        (l) => !l.startsWith('source'),
      );
      expect(info.slice(0, 4)).toEqual([
        'subheading: client.mortgage.info.limitation_rule',
        'text: client.mortgage.calculation.information.limitation_rule {} client.mortgage.info.as_of {"fecha":"10-10-2026"}',
        'subheading: client.mortgage.info.prior_step_439bis',
        'text: client.mortgage.calculation.information.prior_step_439bis {}',
      ]);
    });
  });

  describe('a review read differently', () => {
    const SPLIT_PAID = { deedOn: d('2018-12-14'), invoices: [invoice('notary_loan', 800)] };
    const inject = (change: Partial<MortgageInput>, edit: (review: MortgageReview) => object) => {
      const r = reviewed(change);
      return mortgageReport(
        { ...r, review: { ...r.review, ...edit(r.review) } },
        LEGAL_INTEREST,
        echo,
        TODAY,
      );
    };
    const INTEREST = 'client.mortgage.report.interest_by_year';
    const withItem = (item: Partial<ExpenseItem>) => (review: MortgageReview) => ({
      expenses: {
        ...review.expenses,
        items: review.expenses.items.map((i) => ({ ...i, ...item })),
      },
    });
    const interestOf = (review: MortgageReview) => review.expenses.items[0]?.interest ?? null;

    it('gives the interest year by year of an item that has both its figure and its interest', () => {
      const model = inject(SPLIT_PAID, (r) => withItem({ interest: interestOf(r) })(r));
      expect(part(model, EXPENSES).some((l) => l.includes(INTEREST))).toBe(true);
    });

    it.each([
      ['no interest', (r: MortgageReview) => withItem({ interest: null })(r)],
      ['no figure', (r: MortgageReview) => withItem({ interest: interestOf(r), amount: null })(r)],
      [
        'an invoice that is not there',
        (r: MortgageReview) => withItem({ interest: interestOf(r), index: 9 })(r),
      ],
    ])('gives none for an item with %s', (_name, edit) => {
      const model = inject(SPLIT_PAID, edit);
      expect(part(model, EXPENSES).some((l) => l.includes(INTEREST))).toBe(false);
    });

    it('gives no section, nor sources, for a cap of today that is not there', () => {
      const model = inject({ deedOn: d('2024-06-01'), rateType: 'fixed' }, () => ({
        prepaymentToday: null,
      }));
      expect(
        model.blocks.some((b) => 'text' in b && b.text === 'client.mortgage.report.today'),
      ).toBe(false);
      const withToday = echoed({ deedOn: d('2024-06-01'), rateType: 'fixed' });
      expect(model.blocks.length).toBeLessThan(withToday.blocks.length);
      expect(structure(model)).toBe(
        structure(withToday).replace(
          'heading text×2 bullet×2 text source×2 heading source×7',
          'heading source×5',
        ),
      );
    });

    it('gives no fee for an operation with no reading, and no section for it', () => {
      const model = inject(READINGS, () => ({
        fees: [{ kind: 'readings', question: 'prepayment_option', readings: [] }],
      }));
      expect(
        model.blocks.some((b) => 'text' in b && b.text === 'client.mortgage.report.fees'),
      ).toBe(false);
    });

    it.each([
      ['a cap the law cannot check', { status: 'review_it', cap: 25 }],
      ['a cap with no figure', { status: 'cap', cap: null }],
    ])('gives no cap for %s', (_name, change) => {
      const model = inject({ deedOn: d('2024-06-01'), rateType: 'fixed' }, (r) => ({
        prepaymentToday: {
          kind: 'single',
          finding: { ...(r.prepaymentToday as TodayItem & { finding: object }).finding, ...change },
        },
      }));
      const today = part(model, 'client.mortgage.report.today');
      expect(today.some((l) => l.includes('today_cap') || l.includes('today_nothing'))).toBe(false);
    });
  });

  describe('the whole of it', () => {
    const cases: [string, Partial<MortgageInput>, string, MortgageDeps?][] = [
      [
        'a deed with nothing to show',
        {},
        'title meta rule text heading row×5 heading row×2 note text heading text×2 bullet source heading source×6 heading subheading text source×2 subheading text source subheading text source subheading text source heading bullet×7 heading text',
      ],
      [
        'a deed of the split, with its interest and a clause',
        SPLIT_DEED,
        'title meta rule text heading row×12 heading row×3 note text heading subheading text bullet×3 text row×9 source×5 subheading text bullet×4 text row×9 source×5 subheading text bullet source heading text×2 bullet source heading note subheading text×2 bullet source×2 heading source×15 heading subheading text source subheading text source×2 subheading text source subheading text source subheading text source heading bullet×7 heading text',
      ],
      [
        'the same with no figure for the split',
        SPLIT_DEED,
        'title meta rule text heading row×12 heading row×2 note text heading subheading text bullet×2 source×3 subheading text bullet×2 source×3 subheading text bullet source heading text×2 bullet source heading note subheading text×2 bullet source×2 heading source×12 heading subheading text source subheading text source subheading text source subheading text source subheading text source heading bullet×7 heading text',
        UNREAD_DEPS,
      ],
      [
        'a deed of the split paid today, with no interest to give year by year',
        {
          deedOn: d('2018-12-14'),
          invoices: [invoice('notary_loan', 800, { paidOn: TODAY_DEED })],
        },
        'title meta rule text heading row×8 heading row×3 note text heading subheading text bullet×3 source×5 heading text×2 bullet source heading source×12 heading subheading text source subheading text source×2 subheading text source subheading text source subheading text source heading bullet×7 heading text',
      ],
      [
        'everything the form asks',
        FULL,
        'title meta rule text heading row×13 heading row×2 note row text bullet heading subheading text bullet source subheading text bullet source subheading text bullet source heading subheading text bullet×3 source×2 heading text×2 bullet×2 text source×2 heading source×8 heading subheading text source×2 subheading text source subheading text source subheading text source heading bullet×7 heading text',
      ],
      [
        'a fee over its cap in some readings',
        READINGS,
        'title meta rule text heading row×6 heading row×2 note row note text heading subheading text×3 bullet×2 text×2 bullet×2 source heading text×4 bullet×2 text×2 bullet×2 source heading source×6 heading subheading text source×2 subheading text source subheading text source subheading text source heading bullet×7 heading text',
      ],
      [
        'a fee over its cap in every reading',
        SINGLE,
        'title meta rule text heading row×7 heading row×2 note row text heading subheading text bullet×2 source heading text×2 bullet×2 source heading source×6 heading subheading text source×2 subheading text source subheading text source subheading text source heading bullet×7 heading text',
      ],
      [
        'what repaying today costs in each reading',
        { deedOn: d('2024-06-01'), rateType: 'variable', prepaymentOption: 'unknown' },
        'title meta rule text heading row×6 heading row×2 note text heading text×4 bullet×2 text×3 bullet×2 text source×2 heading source×7 heading subheading text source×2 subheading text source subheading text source subheading text source heading bullet×7 heading text',
      ],
      [
        'what repaying today costs in one',
        { deedOn: d('2024-06-01'), rateType: 'fixed' },
        'title meta rule text heading row×5 heading row×2 note text heading text×2 bullet×2 text source×2 heading source×7 heading subheading text source×2 subheading text source subheading text source subheading text source heading bullet×7 heading text',
      ],
      [
        'what repaying today costs when it costs nothing',
        { deedOn: d('2020-03-01'), rateType: 'variable', prepaymentOption: 'a_015_5y' },
        'title meta rule text heading row×6 heading row×2 note text heading text×2 bullet×2 source heading source×6 heading subheading text source×2 subheading text source subheading text source subheading text source heading bullet×7 heading text',
      ],
    ];

    it.each(cases)('is made of the blocks of %s', (_name, change, expected, deps = DEPS) => {
      expect(structure(echoed(change, deps))).toBe(expected);
    });

    it('opens with the title, the day and the intro, and ends with where to find out', () => {
      const { blocks } = echoed({});
      expect(lines(blocks.slice(0, 5))).toEqual([
        'title: client.mortgage.report.title',
        'meta: client.documents.report.generated {"fecha":"9 de octubre de 2026"}',
        'rule: ',
        'text: client.mortgage.report.intro',
        'heading: client.mortgage.report.your_data',
      ]);
      expect(lines(blocks.slice(-2))).toEqual([
        'heading: client.mortgage.report.channels',
        'text: client.mortgage.report.channels_text',
      ]);
      expect(lines(blocks.slice(-3, -2))[0]).toMatch(/^bullet: client\.mortgage\.unchecked\./);
      expect(echoed({}).footer).toBe(
        'client.mortgage.report.footer {"fecha":"9 de octubre de 2026"}',
      );
    });
  });
});
