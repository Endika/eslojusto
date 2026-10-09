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

const tr: Translate = (key, vars) => t('es', key, vars);
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
  const p = prefill({ fields: LOAN, charges: OPENING });

  it('fills the loan, its rate, its stated APR and its instalments', () => {
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
    expect(entry(p, 'openingFee')).toBe('761,25');
    expect(entry(p, 'openingHow')).toBe('deducted');
  });

  it('quotes the early repayment clause beside the compensation', () => {
    expect(p.quotes.compensation).toMatch(/^El prestatario podrá reembolsar/);
  });

  it('never fills what the documents do not say, such as the purpose or the drawdown', () => {
    expect(entry(p, 'purpose')).toBeUndefined();
    expect(entry(p, 'drawnOn')).toBeUndefined();
    expect(entry(p, 'confirmedApr')).toBeUndefined();
    expect(p.entries.some(([, v]) => v.includes('Financiera'))).toBe(false);
  });

  it('gives answers the form reads into the engine’s input once the person adds the rest', () => {
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
