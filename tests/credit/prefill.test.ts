// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type {
  Confidence,
  CreditExtraction,
  ExtractedRow,
  ExtractedValue,
  SourceKind,
} from '../../src/documents/contract';
import { creditPrefill } from '../../src/credit/prefill';
import { readCreditForm } from '../../src/credit/form';
import { parseDate } from '../../src/engine/date';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { pageTranslator } from '../support/page-strings';

const tr: Translate = pageTranslator('credit');
const TODAY = parseDate('2026-10-09');

const f = (
  value: ExtractedValue,
  confidence: Confidence = 'high',
  source: SourceKind = 'credit_agreement',
) => ({ value, confidence, source });
const row = (
  values: Record<string, ExtractedValue>,
  source: SourceKind,
  confidence: Confidence = 'high',
): ExtractedRow => ({ values, confidence, source });

const extraction = (e: Partial<CreditExtraction>): CreditExtraction => ({
  pages: [],
  documents: [{ kind: 'credit_agreement', pages: 2 }],
  fields: {},
  conflicts: [],
  charges: [],
  schedule: [],
  statements: [],
  ...e,
});

const prefill = (e: Partial<CreditExtraction>, checks: Parameters<typeof creditPrefill>[2] = []) =>
  creditPrefill(extraction(e), tr, checks);
type P = ReturnType<typeof prefill>;
const entry = (p: P, name: string) => p.entries.find(([n]) => n === name)?.[1];
const mark = (p: P, id: string) => p.marks.find((m) => m.id === id);

// A synthetic personal loan: 10.500 € at a 12 % nominal rate, 48 instalments of 273,35 € and an
// opening charge of 761,25 € taken off what was handed over.
const LOAN: CreditExtraction['fields'] = {
  product: f('personal_loan'),
  lenderName: f('Financiera Ficticia, S.A.'),
  agreedOn: f('2019-02-15'),
  principal: f(10_500),
  nominalRate: f(12),
  rateType: f('fixed'),
  declaredApr: f(12, 'medium'),
  declaredTotalPayable: f(13_120.8),
  instalmentCount: f(48),
  instalmentAmount: f(273.35),
  firstDueOn: f('2019-03-15'),
  earlyRepaymentClauseText: f(
    'El prestatario podrá reembolsar anticipadamente el préstamo abonando una compensación del 1 % del capital reembolsado.',
  ),
};
const OPENING = [
  row(
    { kind: 'opening', concept: 'Comisión de apertura', amount: 761.25, how: 'deducted' },
    'credit_agreement',
  ),
];

// The answers the form holds after the read, with what the documents never say, as a person would
// add them; read as the review reads its form.
function readAnswers(p: P, added: Record<string, string>) {
  const el = document.createElement('form');
  const values = { ...Object.fromEntries(p.entries), ...added };
  el.innerHTML = Object.entries(values)
    .map(([name, value]) => `<input name="${name}" value="${value}" />`)
    .join('');
  return readCreditForm(el, TODAY);
}

describe('a credit contract', () => {
  const contract = () => prefill({ fields: LOAN, charges: OPENING });

  it('fills the loan, its rate, its stated APR and its instalments', () => {
    const p = contract();
    expect(entry(p, 'product')).toBe('personal_loan');
    expect(entry(p, 'agreedOn')).toBe('2019-02-15');
    expect(entry(p, 'principal')).toBe('10.500,00');
    expect(entry(p, 'nominalRate')).toBe('12');
    expect(entry(p, 'rateType')).toBe('fixed');
    expect(entry(p, 'aprStated')).toBe('yes');
    expect(entry(p, 'declaredApr')).toBe('12');
    expect(entry(p, 'declaredTotalPayable')).toBe('13.120,80');
    expect(entry(p, 'instalmentCount')).toBe('48');
    expect(entry(p, 'instalmentAmount')).toBe('273,35');
    expect(entry(p, 'firstDueOn')).toBe('2019-03-15');
    expect(mark(p, 'declaredApr')?.confidence).toBe('medium');
    // Opening a question is no read value: it carries no mark.
    expect(mark(p, 'aprStated')).toBeUndefined();
  });

  it('puts the opening charge on its sheet with how it was paid', () => {
    const p = contract();
    expect(entry(p, 'openingFee')).toBe('761,25');
    expect(entry(p, 'openingHow')).toBe('deducted');
  });

  it('quotes the early repayment clause beside the compensation', () => {
    const p = contract();
    expect(p.quotes.compensation).toMatch(/^El prestatario podrá reembolsar/);
  });

  it('never fills what the documents do not say, such as the purpose or the drawdown', () => {
    const p = contract();
    expect(entry(p, 'purpose')).toBeUndefined();
    expect(entry(p, 'drawnOn')).toBeUndefined();
    expect(entry(p, 'confirmedApr')).toBeUndefined();
    expect(p.entries.some(([, v]) => v.includes('Financiera'))).toBe(false);
  });

  it('gives answers the form reads into the engine’s input once the person adds the rest', () => {
    const p = contract();
    const read = readAnswers(p, {
      purpose: 'personal',
      drawnOn: '2019-02-15',
      hasBalloon: 'no',
      hasInsurance: 'no',
      confirmedApr: 'recalculated',
      repaid: 'no',
      infoReceived: 'yes',
    });
    expect(read).toMatchObject({
      input: {
        principal: 10_500,
        nominalRate: 12,
        declaredApr: 12,
        instalments: { count: 48, amount: 273.35 },
        charges: [{ kind: 'opening', amount: 761.25, how: 'deducted' }],
      },
    });
  });
});

describe('the other charges', () => {
  it('adds up those paid the same way, as worked out', () => {
    const p = prefill({
      charges: [
        row({ kind: 'study', amount: 50, how: 'paid' }, 'credit_agreement'),
        row({ kind: 'management', amount: 25.5, how: 'paid' }, 'credit_agreement', 'medium'),
      ],
    });
    expect(entry(p, 'otherFee')).toBe('75,50');
    expect(entry(p, 'otherHow')).toBe('paid');
    expect(mark(p, 'otherFee')).toMatchObject({ confidence: 'medium', derived: true });
  });

  it('leaves to the person those paid in different ways, and says so', () => {
    const p = prefill({
      charges: [
        row({ kind: 'study', amount: 50, how: 'paid' }, 'credit_agreement'),
        row({ kind: 'other', amount: 30, how: 'financed' }, 'credit_agreement'),
      ],
    });
    expect(entry(p, 'otherFee')).toBeUndefined();
    expect(p.notes).toContain(t('es', 'client.credit.documents.charges_apart'));
  });

  it('gives the amount without how it was paid when the document does not say', () => {
    const p = prefill({ charges: [row({ kind: 'opening', amount: 100 }, 'credit_agreement')] });
    expect(entry(p, 'openingFee')).toBe('100,00');
    expect(entry(p, 'openingHow')).toBeUndefined();
  });
});

describe('a schedule', () => {
  const rows = (amounts: readonly number[]) =>
    amounts.map((amount, i) =>
      row(
        {
          dueOn: `2024-${String(i + 1).padStart(2, '0')}-05`,
          amount,
          interest: 10 - i,
          principal: amount - (10 - i),
        },
        'amortization_schedule',
      ),
    );

  it('gives the count, the first day and the amount of even instalments, as worked out', () => {
    const p = prefill({ fields: { product: f('car_loan') }, schedule: rows([100, 100, 100, 100]) });
    expect(entry(p, 'instalmentCount')).toBe('4');
    expect(entry(p, 'firstDueOn')).toBe('2024-01-05');
    expect(entry(p, 'instalmentAmount')).toBe('100,00');
    expect(mark(p, 'instalmentCount')?.derived).toBe(true);
    expect(p.notes).toContain(t('es', 'client.credit.documents.schedule'));
  });

  it('keeps the regular amount when the last row is a larger final instalment', () => {
    const p = prefill({ schedule: rows([100, 100, 100, 900]) });
    expect(entry(p, 'instalmentAmount')).toBe('100,00');
  });

  it('gives no amount for uneven instalments, and says so', () => {
    const p = prefill({ schedule: rows([100, 120, 100, 100]) });
    expect(entry(p, 'instalmentAmount')).toBeUndefined();
    expect(p.notes).toContain(t('es', 'client.credit.documents.schedule_uneven'));
  });

  it('never overrides what the contract states', () => {
    const p = prefill({ fields: LOAN, schedule: rows([100, 100]) });
    expect(entry(p, 'instalmentCount')).toBe('48');
    expect(p.entries.filter(([n]) => n === 'instalmentCount')).toHaveLength(1);
  });

  it('works nothing out from a schedule cut at its maximum', () => {
    const p = prefill({ schedule: rows([100, 100, 100]), truncated: true });
    expect(entry(p, 'instalmentCount')).toBeUndefined();
    expect(p.notes).toContain(t('es', 'client.credit.documents.rows_cut'));
  });
});

describe('a final instalment and a linked insurance', () => {
  it('opens the final instalment with its amount and day', () => {
    const p = prefill({
      fields: { product: f('car_loan'), balloonAmount: f(6_000), balloonDueOn: f('2029-05-01') },
    });
    expect(entry(p, 'hasBalloon')).toBe('yes');
    expect(entry(p, 'balloonAmount')).toBe('6.000,00');
    expect(entry(p, 'balloonDueOn')).toBe('2029-05-01');
  });

  it('fills a single financed premium the contract says is required', () => {
    const p = prefill({
      fields: {
        insurancePremium: f(450),
        insuranceSingle: f(true),
        insuranceFinanced: f(true),
        insuranceRequired: f(true, 'medium'),
      },
    });
    expect(entry(p, 'hasInsurance')).toBe('yes');
    expect(entry(p, 'premium')).toBe('450,00');
    expect(entry(p, 'premiumKind')).toBe('single');
    expect(entry(p, 'premiumFinanced')).toBe('yes');
    expect(entry(p, 'insuranceRequired')).toBe('yes');
  });

  it('marks a premium paid in instalments as to be checked', () => {
    const p = prefill({ fields: { insurancePremium: f(20), insuranceSingle: f(false) } });
    expect(entry(p, 'premiumKind')).toBe('periodic');
    expect(mark(p, 'premium')?.confidence).toBe('low');
    expect(p.notes).toContain(t('es', 'client.credit.documents.premium_periodic'));
  });
});

describe('an early repayment', () => {
  const schedule = [
    row({ dueOn: '2025-01-05', amount: 300, interest: 40 }, 'amortization_schedule'),
    row({ dueOn: '2025-02-05', amount: 300, interest: 35 }, 'amortization_schedule'),
    row({ dueOn: '2025-03-05', amount: 300, interest: 30.5 }, 'amortization_schedule', 'medium'),
  ];
  const statement = {
    product: f('car_loan'),
    repaidOn: f('2025-01-20', 'high', 'early_repayment_statement'),
    principalRepaid: f(8_000, 'high', 'early_repayment_statement'),
    compensationCharged: f(80, 'high', 'early_repayment_statement'),
    agreedEndOn: f('2025-03-05', 'high', 'early_repayment_statement'),
    paidByInsurance: f(false, 'high', 'early_repayment_statement'),
    discountLost: f(true, 'medium', 'early_repayment_statement'),
  };

  it('opens its sheets and fills what the statement says', () => {
    const p = prefill({ fields: statement });
    expect(entry(p, 'repaid')).toBe('yes');
    expect(entry(p, 'repaidOn')).toBe('2025-01-20');
    expect(entry(p, 'principalRepaid')).toBe('8.000,00');
    expect(entry(p, 'compensation')).toBe('80,00');
    expect(entry(p, 'agreedEndOn')).toBe('2025-03-05');
    expect(entry(p, 'paidByInsurance')).toBe('no');
    expect(entry(p, 'discountLost')).toBe('yes');
  });

  it('adds up the interest of the schedule rows due after it, as worked out', () => {
    const p = prefill({ fields: statement, schedule });
    expect(entry(p, 'remainingInterest')).toBe('65,50');
    expect(mark(p, 'remainingInterest')).toMatchObject({ confidence: 'medium', derived: true });
  });

  it('works out no interest when a later row does not give it', () => {
    const p = prefill({
      fields: statement,
      schedule: [...schedule, row({ dueOn: '2025-04-05', amount: 300 }, 'amortization_schedule')],
    });
    expect(entry(p, 'remainingInterest')).toBeUndefined();
  });

  it('asks nothing of a lost discount on a personal loan', () => {
    const p = prefill({ fields: { ...statement, product: f('personal_loan') } });
    expect(entry(p, 'discountLost')).toBeUndefined();
  });
});

describe('a revolving card', () => {
  const statements = [
    row({ statementOn: '2026-08-01', balance: 2_400, payment: 60 }, 'card_statement'),
    row({ statementOn: '2026-09-01', balance: 2_380.5, payment: 60 }, 'card_statement', 'medium'),
  ];

  it('is told from its documents when no contract names the product', () => {
    const p = prefill({
      documents: [{ kind: 'card_statement', pages: 1, month: '2026-09' }],
      statements,
    });
    expect(entry(p, 'product')).toBe('revolving');
    expect(mark(p, 'product')).toMatchObject({ confidence: 'medium', derived: true });
  });

  it('fills its limit, rate and fee, and its balance and payment from the latest statement', () => {
    const p = prefill({
      documents: [{ kind: 'revolving_agreement', pages: 3 }],
      fields: {
        product: f('revolving', 'high', 'revolving_agreement'),
        creditLimit: f(3_000, 'high', 'revolving_agreement'),
        nominalRate: f(21.94, 'high', 'revolving_agreement'),
        annualFee: f(0, 'high', 'revolving_agreement'),
        minimumPayment: f(30, 'high', 'revolving_agreement'),
      },
      statements,
    });
    expect(entry(p, 'cardLimit')).toBe('3.000,00');
    expect(entry(p, 'principal')).toBeUndefined();
    expect(entry(p, 'nominalRate')).toBe('21,94');
    expect(entry(p, 'annualFee')).toBe('0,00');
    expect(entry(p, 'balance')).toBe('2.380,50');
    expect(entry(p, 'monthlyPayment')).toBe('60,00');
    expect(mark(p, 'balance')).toMatchObject({ confidence: 'medium', derived: true });
  });

  it('takes the contract’s minimum as the monthly payment without a statement, to be checked', () => {
    const p = prefill({
      fields: { product: f('revolving'), minimumPayment: f(30, 'high', 'revolving_agreement') },
    });
    expect(entry(p, 'monthlyPayment')).toBe('30,00');
    expect(mark(p, 'monthlyPayment')?.confidence).toBe('medium');
    expect(p.notes).toContain(t('es', 'client.credit.documents.minimum_payment'));
  });
});

describe('the summary', () => {
  it('names a figure the documents state differently and the one used', () => {
    const p = prefill({
      fields: LOAN,
      conflicts: [
        { field: 'declaredApr', sources: ['credit_agreement', 'credit_precontract_info'] },
      ],
    });
    expect(p.notes[0]).toBe(
      'TAE: los documentos no dicen lo mismo. Se ha usado lo que pone el contrato; compáralo con los demás.',
    );
  });

  it('words each check of the API', () => {
    const p = prefill({ fields: LOAN }, ['schedule_rows_do_not_sum', 'end_before_start']);
    expect(p.notes).toEqual([t('es', 'client.credit.documents.check.schedule_rows_do_not_sum')]);
  });

  it('says when something was read with low confidence', () => {
    const p = prefill({ fields: { principal: f(5_000, 'low') } });
    expect(p.lowConfidence).toBe(true);
    expect(p.notes).toContain(t('es', 'client.documents.done_low'));
  });
});

describe('reading a figure only when it is one', () => {
  const read = (field: string, value: ExtractedValue, name: string) =>
    entry(prefill({ fields: { product: f('personal_loan'), [field]: f(value) } }), name);

  it.each([
    ['principal', 10_500.456, '10.500,46'],
    ['principal', '10500', undefined],
    ['principal', -5, undefined],
    ['principal', 0, undefined],
    ['principal', Number.NaN, undefined],
    ['principal', Number.POSITIVE_INFINITY, undefined],
    ['principal', null, undefined],
    ['nominalRate', 0, '0'],
    ['nominalRate', 7.125, '7,125'],
    ['nominalRate', 7.12345, '7,1235'],
    ['declaredApr', 7.9912, '7,9912'],
    ['nominalRate', 12_345.5, '12345,5'],
    ['nominalRate', -1, undefined],
    ['nominalRate', '12', undefined],
    ['declaredApr', 7.99, '7,99'],
    ['declaredApr', -1, undefined],
    ['agreedOn', '2019-02-15', '2019-02-15'],
    ['agreedOn', '2019-02-30', undefined],
    ['agreedOn', 20_190_215, undefined],
    ['rateType', 'variable', 'variable'],
    ['rateType', 'balloon', undefined],
    ['instalmentCount', 48, '48'],
    ['instalmentCount', 0, undefined],
    ['instalmentCount', 48.5, undefined],
    ['instalmentCount', '48', undefined],
    ['instalmentAmount', 0, undefined],
    ['firstDueOn', '2019-13-15', undefined],
  ] as [string, ExtractedValue, string | undefined][])(
    '%s %j reads as %j',
    (field, value, expected) => {
      expect(read(field, value, field)).toBe(expected);
    },
  );

  it('opens the stated APR question only with an APR that reads', () => {
    const stated = (value: ExtractedValue) =>
      entry(prefill({ fields: { declaredApr: f(value) } }), 'aprStated');
    expect(stated(7.99)).toBe('yes');
    expect(stated(-1)).toBeUndefined();
    expect(stated('7,99')).toBeUndefined();
  });

  it('marks each answer with the sheet question it fills and how surely it was read', () => {
    const p = prefill({ fields: { principal: f(5_000, 'medium') } });
    expect(mark(p, 'principal')).toEqual({
      id: 'principal',
      container: '[data-field="principal"]',
      confidence: 'medium',
    });
  });
});

describe('what kind of credit it is', () => {
  const product = (e: Partial<CreditExtraction>) => entry(prefill(e), 'product');
  const docs = (...kinds: SourceKind[]) => ({
    documents: kinds.map((kind) => ({ kind, pages: 1 })),
  });

  it('keeps the product a contract states, with how surely', () => {
    const p = prefill({ fields: { product: f('car_loan', 'low') } });
    expect(entry(p, 'product')).toBe('car_loan');
    expect(mark(p, 'product')).toMatchObject({ confidence: 'low' });
  });

  it.each([
    ['a card contract alone', ['revolving_agreement'], 'revolving'],
    ['card statements alone', ['card_statement'], 'revolving'],
    [
      'a card contract with a loan schedule',
      ['revolving_agreement', 'amortization_schedule'],
      undefined,
    ],
    [
      'a card statement with an early repayment statement',
      ['card_statement', 'early_repayment_statement'],
      undefined,
    ],
    ['a card statement with a loan agreement', ['card_statement', 'credit_agreement'], undefined],
    [
      'a card statement with the precontract information',
      ['card_statement', 'credit_precontract_info'],
      undefined,
    ],
    ['a loan agreement alone', ['credit_agreement'], undefined],
    ['an unrelated document', ['telecom_contract'], undefined],
  ] as [string, SourceKind[], string | undefined][])('tells %s as %j', (_, kinds, expected) => {
    expect(product({ ...docs(...kinds) })).toBe(expected);
  });

  it('reads a card’s limit once the documents tell it is one', () => {
    const p = prefill({
      documents: [{ kind: 'card_statement', pages: 1 }],
      fields: { creditLimit: f(3_000) },
    });
    expect(entry(p, 'cardLimit')).toBe('3.000,00');
  });

  it('falls back on the documents when the stated product is not one the review covers', () => {
    expect(product({ ...docs('card_statement'), fields: { product: f('mortgage') } })).toBe(
      'revolving',
    );
  });

  it('reads a card’s limit and leaves the loan questions alone', () => {
    const fields = {
      product: f('revolving'),
      creditLimit: f(3_000),
      principal: f(9_999),
      rateType: f('fixed'),
      declaredTotalPayable: f(5_000),
    };
    const p = prefill({ fields });
    expect(entry(p, 'cardLimit')).toBe('3.000,00');
    expect(entry(p, 'principal')).toBeUndefined();
    expect(entry(p, 'rateType')).toBeUndefined();
    expect(entry(p, 'declaredTotalPayable')).toBeUndefined();
    expect(
      entry(prefill({ fields: { ...fields, product: f('personal_loan') } }), 'cardLimit'),
    ).toBeUndefined();
  });
});

describe('the instalments', () => {
  const instalments = (
    dates: readonly (string | null)[],
    amounts: readonly (number | null)[] = dates.map(() => 100),
    confidences: readonly Confidence[] = [],
  ) =>
    dates.map((dueOn, i) =>
      row(
        { ...(dueOn !== null && { dueOn }), ...(amounts[i] != null && { amount: amounts[i] }) },
        'amortization_schedule',
        confidences[i],
      ),
    );
  const MONTHS = ['2024-01-05', '2024-02-05', '2024-03-05', '2024-04-05'];
  const derived = (p: P) => p.marks.filter((m) => m.derived).map((m) => m.id);

  it('orders the schedule by day, counts only the rows with one, and trusts it as much as its weakest row', () => {
    const p = prefill({
      schedule: instalments(
        ['2024-03-05', '2024-01-05', null, '2024-02-05'],
        [100, 100, 100, 100],
        ['high', 'medium', 'high', 'low'],
      ),
    });
    expect(entry(p, 'instalmentCount')).toBe('3');
    expect(entry(p, 'firstDueOn')).toBe('2024-01-05');
    expect(mark(p, 'instalmentCount')).toMatchObject({ confidence: 'low', derived: true });
    expect(mark(p, 'firstDueOn')).toMatchObject({ confidence: 'medium', derived: true });
    expect(mark(p, 'instalmentAmount')).toMatchObject({ confidence: 'low', derived: true });
  });

  it.each([
    ['nothing', [], ['instalmentCount', 'firstDueOn', 'instalmentAmount'], true],
    ['the count and the first day', ['instalmentCount', 'firstDueOn'], ['instalmentAmount'], true],
    ['the count and the amount', ['instalmentCount', 'instalmentAmount'], ['firstDueOn'], true],
    ['the first day and the amount', ['firstDueOn', 'instalmentAmount'], ['instalmentCount'], true],
    ['all three', ['instalmentCount', 'instalmentAmount', 'firstDueOn'], [], false],
  ] as [string, string[], string[], boolean][])(
    'with %s stated, works out what is left and says so only then',
    (_, stated, worked, noted) => {
      const fields = Object.fromEntries(
        Object.entries({
          instalmentCount: f(4),
          instalmentAmount: f(100),
          firstDueOn: f('2024-01-05'),
        }).filter(([name]) => stated.includes(name)),
      );
      const p = prefill({ fields, schedule: instalments(MONTHS) });
      expect(derived(p).sort()).toEqual([...worked].sort());
      expect(p.notes.includes(t('es', 'client.credit.documents.schedule'))).toBe(noted);
    },
  );

  it.each([
    ['one instalment', [100], '100,00'],
    ['equal ones', [100, 100, 100], '100,00'],
    ['a larger last one', [100, 100, 900], '100,00'],
    ['a smaller last one', [100, 100, 90], undefined],
    ['a different one among the first', [100, 120, 100], undefined],
    ['the first one missing', [null, 100, 100], undefined],
    ['the last one missing', [100, 100, null], undefined],
    ['none given', [null, null], undefined],
  ] as [string, (number | null)[], string | undefined][])(
    'reads the amount from %s',
    (_, amounts, expected) => {
      const dates = MONTHS.slice(0, amounts.length);
      const p = prefill({ schedule: instalments(dates, amounts) });
      expect(entry(p, 'instalmentAmount')).toBe(expected);
      expect(p.notes.includes(t('es', 'client.credit.documents.schedule_uneven'))).toBe(
        expected === undefined,
      );
    },
  );

  it('says nothing of a schedule when it has no row with a day', () => {
    const p = prefill({ schedule: instalments([null, null]) });
    expect(p.entries).toEqual([]);
    expect(p.notes).toEqual([]);
  });

  it('opens a final instalment with its amount alone when the day is not stated', () => {
    const p = prefill({ fields: { balloonAmount: f(6_000), balloonDueOn: f('2029-13-01') } });
    expect(entry(p, 'hasBalloon')).toBe('yes');
    expect(entry(p, 'balloonAmount')).toBe('6.000,00');
    expect(entry(p, 'balloonDueOn')).toBeUndefined();
    const undated = prefill({ fields: { balloonAmount: f(6_000) } });
    expect(entry(undated, 'balloonAmount')).toBe('6.000,00');
    expect(entry(undated, 'balloonDueOn')).toBeUndefined();
    const noAmount = prefill({ fields: { balloonAmount: f(0), balloonDueOn: f('2029-05-01') } });
    expect(noAmount.entries).toEqual([]);
  });
});

describe('the charges on their sheets', () => {
  const charge = (values: Record<string, ExtractedValue>, confidence: Confidence = 'high') =>
    row(values, 'credit_agreement', confidence);

  it('ignores a charge of no kind the form knows, without an amount or without a positive one', () => {
    const p = prefill({
      charges: [
        charge({ kind: 'fee', amount: 10 }),
        charge({ amount: 10 }),
        charge({ kind: 'opening', amount: 0 }),
        charge({ kind: 'other' }),
        charge({ kind: 'other', amount: '10' }),
      ],
    });
    expect(p.entries).toEqual([]);
  });

  it('puts the opening charge and the rest on their own sheets, worked out only when added up', () => {
    const p = prefill({
      charges: [
        charge({ kind: 'opening', amount: 761.25, how: 'deducted' }, 'low'),
        charge({ kind: 'study', amount: 50, how: 'paid' }),
        charge({ kind: 'management', amount: 25.5, how: 'paid' }),
      ],
    });
    expect(p.entries).toEqual([
      ['openingFee', '761,25'],
      ['openingHow', 'deducted'],
      ['otherFee', '75,50'],
      ['otherHow', 'paid'],
    ]);
    expect(mark(p, 'openingFee')).toEqual({
      id: 'openingFee',
      container: '[data-field="openingFee"]',
      confidence: 'low',
    });
    expect(mark(p, 'openingHow')?.confidence).toBe('low');
    expect(mark(p, 'otherFee')).toMatchObject({ confidence: 'high', derived: true });
  });

  it('leaves the other sheet alone when only the opening charge is read, and the reverse', () => {
    expect(
      entry(prefill({ charges: [charge({ kind: 'opening', amount: 10 })] }), 'otherFee'),
    ).toBeUndefined();
    expect(
      entry(prefill({ charges: [charge({ kind: 'other', amount: 10 })] }), 'openingFee'),
    ).toBeUndefined();
  });

  it('leaves to the person a sheet whose charges are paid in different ways, saying so once', () => {
    const p = prefill({
      charges: [
        charge({ kind: 'opening', amount: 10, how: 'paid' }),
        charge({ kind: 'opening', amount: 10 }),
        charge({ kind: 'other', amount: 10, how: 'paid' }),
        charge({ kind: 'other', amount: 10, how: 'financed' }),
      ],
    });
    expect(p.entries).toEqual([]);
    expect(p.notes).toEqual([t('es', 'client.credit.documents.charges_apart')]);
  });
});

describe('a linked insurance', () => {
  const insure = (fields: CreditExtraction['fields']) => prefill({ fields });

  it.each([
    ['no premium', {}],
    ['a premium of nothing', { insurancePremium: f(0) }],
    ['a premium that is no figure', { insurancePremium: f('300') }],
  ] as [string, CreditExtraction['fields']][])('opens nothing with %s', (_, fields) => {
    expect(insure(fields).entries).toEqual([]);
  });

  it('keeps the premium as sure as it was read when it is a single one', () => {
    const p = insure({ insurancePremium: f(450, 'medium'), insuranceSingle: f(true, 'low') });
    expect(mark(p, 'premium')?.confidence).toBe('medium');
    expect(mark(p, 'premiumKind')?.confidence).toBe('low');
    expect(p.notes).not.toContain(t('es', 'client.credit.documents.premium_periodic'));
  });

  it('asks nothing of the kind when the document does not say, nor of its financing in instalments', () => {
    const unknown = insure({ insurancePremium: f(450), insuranceSingle: f('maybe') });
    expect(entry(unknown, 'premiumKind')).toBeUndefined();
    expect(entry(unknown, 'premium')).toBe('450,00');
    const periodic = insure({
      insurancePremium: f(20),
      insuranceSingle: f(false),
      insuranceFinanced: f(true),
    });
    expect(entry(periodic, 'premiumFinanced')).toBeUndefined();
    expect(
      entry(insure({ insurancePremium: f(450), insuranceSingle: f(true) }), 'premiumFinanced'),
    ).toBeUndefined();
  });

  it('reads requirement and financing as yes or no, and nothing else', () => {
    const p = insure({
      insurancePremium: f(450),
      insuranceSingle: f(true),
      insuranceFinanced: f(false),
      insuranceRequired: f(false),
    });
    expect(entry(p, 'premiumFinanced')).toBe('no');
    expect(entry(p, 'insuranceRequired')).toBe('no');
    const odd = insure({ insurancePremium: f(450), insuranceRequired: f('yes') });
    expect(entry(odd, 'insuranceRequired')).toBeUndefined();
  });
});

describe('a revolving card’s figures', () => {
  const statement = (on: string | null, values: Record<string, ExtractedValue>, c?: Confidence) =>
    row({ ...(on !== null && { statementOn: on }), ...values }, 'card_statement', c);
  const card = (e: Partial<CreditExtraction>) =>
    prefill({ ...e, fields: { product: f('revolving'), ...e.fields } });
  const NOTE = t('es', 'client.credit.documents.card_statement');
  const MINIMUM = t('es', 'client.credit.documents.minimum_payment');

  it('takes the latest statement whatever the order, and skips one with no day', () => {
    const p = card({
      statements: [
        statement('2026-09-01', { balance: 2_000, payment: 50 }),
        statement(null, { balance: 9_999, payment: 99 }),
        statement('2026-10-01', { balance: 1_900, payment: 40 }),
        statement('2026-08-01', { balance: 2_100, payment: 60 }),
      ],
    });
    expect(entry(p, 'balance')).toBe('1.900,00');
    expect(entry(p, 'monthlyPayment')).toBe('40,00');
  });

  it('fills what the statement gives and says so, a balance of nothing included', () => {
    const only = card({ statements: [statement('2026-09-01', { balance: 0 }, 'medium')] });
    expect(entry(only, 'balance')).toBe('0,00');
    expect(mark(only, 'balance')).toMatchObject({ confidence: 'medium', derived: true });
    expect(entry(only, 'monthlyPayment')).toBeUndefined();
    expect(only.notes).toContain(NOTE);
    const payment = card({ statements: [statement('2026-09-01', { payment: 40 })] });
    expect(entry(payment, 'monthlyPayment')).toBe('40,00');
    expect(mark(payment, 'monthlyPayment')?.derived).toBe(true);
    expect(entry(payment, 'balance')).toBeUndefined();
    expect(payment.notes).toContain(NOTE);
  });

  it('says nothing of a statement that gives neither, or of no statement', () => {
    expect(card({ statements: [statement('2026-09-01', { payment: 0 })] }).notes).toEqual([]);
    expect(card({}).notes).toEqual([]);
  });

  it('falls back on the contract’s minimum only without a payment from the statement', () => {
    const minimum = { minimumPayment: f(30, 'low') };
    const without = card({
      fields: minimum,
      statements: [statement('2026-09-01', { balance: 100 })],
    });
    expect(entry(without, 'monthlyPayment')).toBe('30,00');
    expect(mark(without, 'monthlyPayment')).toMatchObject({ confidence: 'low', derived: true });
    expect(without.notes).toEqual([t('es', 'client.documents.done_low'), NOTE, MINIMUM]);
    const paid = card({ fields: minimum, statements: [statement('2026-09-01', { payment: 40 })] });
    expect(entry(paid, 'monthlyPayment')).toBe('40,00');
    expect(paid.notes).toEqual([NOTE]);
    expect(card({ fields: { minimumPayment: f(0) } }).entries).toEqual([['product', 'revolving']]);
    expect(card({ fields: { minimumPayment: f('30') } }).notes).toEqual([]);
  });

  it('reads a fee of nothing and none that is negative', () => {
    expect(entry(card({ fields: { annualFee: f(0) } }), 'annualFee')).toBe('0,00');
    expect(entry(card({ fields: { annualFee: f(-1) } }), 'annualFee')).toBeUndefined();
  });
});

describe('an early repayment statement, piece by piece', () => {
  const car = (fields: CreditExtraction['fields'], e: Partial<CreditExtraction> = {}) =>
    prefill({ fields: { product: f('car_loan'), ...fields }, ...e });
  const day = (iso: string, interest: number | null, confidence?: Confidence) =>
    row(
      { dueOn: iso, ...(interest !== null && { interest }) },
      'amortization_schedule',
      confidence,
    );

  it.each([
    ['the day', { repaidOn: f('2025-01-20') }],
    ['the capital', { principalRepaid: f(8_000) }],
    ['a compensation of nothing', { compensationCharged: f(0) }],
  ] as [string, CreditExtraction['fields']][])('opens the sheets with only %s', (_, fields) => {
    expect(entry(car(fields), 'repaid')).toBe('yes');
  });

  it.each([
    ['nothing of it', {}],
    ['only its end and interest', { agreedEndOn: f('2025-03-05'), interestSettled: f(40) }],
    [
      'a day that does not read, a capital of nothing and a negative compensation',
      {
        repaidOn: f('2025-13-20'),
        principalRepaid: f(0),
        compensationCharged: f(-5),
      },
    ],
  ] as [string, CreditExtraction['fields']][])('opens nothing with %s', (_, fields) => {
    expect(entry(car(fields), 'repaid')).toBeUndefined();
  });

  it('fills the interest settled, the end and the insurance answer, and the discount only on a car loan', () => {
    const fields = {
      repaidOn: f('2025-01-20'),
      interestSettled: f(40),
      agreedEndOn: f('2025-03-05', 'medium'),
      paidByInsurance: f('yes'),
    };
    const p = car(fields);
    expect(entry(p, 'interestSettled')).toBe('40,00');
    expect(entry(p, 'agreedEndOn')).toBe('2025-03-05');
    expect(mark(p, 'agreedEndOn')?.confidence).toBe('medium');
    expect(entry(p, 'paidByInsurance')).toBeUndefined();
    expect(entry(p, 'discountLost')).toBeUndefined();
    expect(entry(car({ ...fields, discountLost: f(false) }), 'discountLost')).toBe('no');
  });

  it('adds up only the interest of rows after the repayment day, as sure as the weakest of them', () => {
    const p = car(
      { repaidOn: f('2025-01-20') },
      {
        schedule: [
          day('2025-01-20', 99),
          day('2025-02-05', 35, 'medium'),
          day('2025-03-05', 0, 'high'),
          day('2025-01-05', 99, 'low'),
        ],
      },
    );
    expect(entry(p, 'remainingInterest')).toBe('35,00');
    expect(mark(p, 'remainingInterest')).toMatchObject({ confidence: 'medium', derived: true });
    expect(p.notes).toContain(t('es', 'client.credit.documents.remaining_interest'));
  });

  it.each([
    ['no schedule', { repaidOn: f('2025-01-20') }, []],
    ['only rows before the day', { repaidOn: f('2025-01-20') }, [day('2025-01-05', 40)]],
    ['no repayment day', { principalRepaid: f(8_000) }, [day('2025-02-05', 40)]],
    [
      'a later row without interest',
      { repaidOn: f('2025-01-20') },
      [day('2025-02-05', 40), day('2025-03-05', null)],
    ],
  ] as [string, CreditExtraction['fields'], ExtractedRow[]][])(
    'works out no interest with %s',
    (_, fields, schedule) => {
      const p = car(fields, { schedule });
      expect(entry(p, 'remainingInterest')).toBeUndefined();
      expect(p.notes).not.toContain(t('es', 'client.credit.documents.remaining_interest'));
    },
  );

  it('works out no interest from a schedule cut at its maximum', () => {
    const p = car(
      { repaidOn: f('2025-01-20') },
      { schedule: [day('2025-02-05', 40)], truncated: true },
    );
    expect(entry(p, 'remainingInterest')).toBeUndefined();
  });
});

describe('the clauses and the notes', () => {
  it('quotes the early repayment clause for a loan only, and the withdrawal clause for any credit', () => {
    const fields = {
      earlyRepaymentClauseText: f('  Podrá reembolsar.  '),
      withdrawalClauseText: f('Podrá desistir en 14 días.'),
    };
    expect(prefill({ fields }).quotes).toEqual({
      compensation: 'Podrá reembolsar.',
      infoReceived: 'Podrá desistir en 14 días.',
    });
    expect(prefill({ fields: { ...fields, product: f('revolving') } }).quotes).toEqual({
      infoReceived: 'Podrá desistir en 14 días.',
    });
  });

  it('quotes nothing blank or that is not text', () => {
    const blank = { earlyRepaymentClauseText: f('   '), withdrawalClauseText: f(14) };
    expect(prefill({ fields: blank }).quotes).toEqual({});
  });

  it('orders the notes: conflicts, low confidence, what was worked out, rows cut, the checks', () => {
    const p = prefill(
      {
        fields: { principal: f(5_000, 'low') },
        conflicts: [
          { field: 'principal', sources: ['credit_agreement', 'credit_precontract_info'] },
        ],
        schedule: [row({ dueOn: '2024-01-05', amount: 100 }, 'amortization_schedule')],
        truncated: true,
      },
      ['schedule_rows_do_not_sum'],
    );
    expect(p.notes).toEqual([
      expect.stringContaining('los documentos no dicen lo mismo'),
      t('es', 'client.documents.done_low'),
      t('es', 'client.credit.documents.rows_cut'),
      t('es', 'client.credit.documents.check.schedule_rows_do_not_sum'),
    ]);
    expect(p.lowConfidence).toBe(true);
    expect(p.count).toBe(p.marks.length);
  });

  it('reads nothing from an extraction with nothing in it', () => {
    expect(prefill({})).toEqual({
      entries: [],
      marks: [],
      count: 0,
      lowConfidence: false,
      notes: [],
      quotes: {},
    });
  });

  it('says nothing of low confidence when nothing was read with it', () => {
    const p = prefill({ fields: { principal: f(5_000, 'medium') } });
    expect(p.lowConfidence).toBe(false);
    expect(p.notes).toEqual([]);
  });
});
