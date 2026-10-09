import { LIMITS } from '../../src/domain/documents';
import { MAX_CHARGES, MAX_SCHEDULE_ROWS, MAX_STATEMENTS } from '../../src/domain/credit-schema';

// What a credit read of 25 pages can record, to measure its output: a car finance contract with its
// information sheet, a schedule at its longest, an early repayment statement, a revolving card
// contract and a year of statements. `largest` copies every text to its limit; `typical` copies
// texts of the length real documents print. Made-up values only.

const f = (value: unknown) => ({ value, confidence: 'high' });
const page = (n: number, kind: string, document: number) => ({
  page: n,
  kind,
  document,
  readability: f('ok'),
  confidence: 'high',
});
const PROSE =
  'El prestatario podrá reembolsar anticipadamente, de forma total o parcial y en cualquier momento, las cantidades adeudadas, con derecho a la reducción del coste total del crédito que comprenda los intereses y costes correspondientes al plazo que quede por transcurrir. ';
const prose = (length: number) => PROSE.repeat(Math.ceil(length / PROSE.length)).slice(0, length);
const day = (i: number) =>
  `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-05`;

const KINDS = [
  ...Array<string>(4).fill('credit_agreement'),
  'credit_precontract_info',
  ...Array<string>(4).fill('amortization_schedule'),
  'early_repayment_statement',
  ...Array<string>(3).fill('revolving_agreement'),
];

export function creditRecord(texts: 'largest' | 'typical'): Record<string, unknown> {
  const largest = texts === 'largest';
  const named = (name: string, limit: number) => (largest ? name.padEnd(limit, 'X') : name);
  const statementPages = LIMITS.maxImages - KINDS.length;
  const kinds = [...KINDS, ...Array<string>(statementPages).fill('card_statement')];
  const charges = (n: number) =>
    Array.from({ length: n }, () => ({
      kind: 'opening',
      concept: named('Comisión de apertura', 80),
      amount: 790,
      how: 'financed',
      confidence: 'high',
    }));
  return {
    pages: kinds.map((kind, i) => page(i + 1, kind, kinds.indexOf(kind) + 1)),
    credit_agreement: {
      product: f('car_loan'),
      lenderName: f(named('Financiera Inventada E.F.C., S.A.', 80)),
      intermediaryType: f('company'),
      intermediaryCompanyName: f(named('Concesionario Ficticio S.L.', 80)),
      agreedOn: f('2024-01-15'),
      principal: f(20000),
      netDisbursed: f(19210),
      cashPrice: f(24500),
      goods: f(named('Turismo de ocasión', 80)),
      nominalRate: f(7.99),
      rateType: f('fixed'),
      declaredApr: f(10.08),
      declaredTotalPayable: f(25287),
      instalmentCount: f(60),
      instalmentAmount: f(421.45),
      firstDueOn: f('2024-02-05'),
      balloonAmount: f(6500),
      balloonDueOn: f('2029-01-05'),
      agreedEndOn: f('2029-01-05'),
      insurancePremium: f(950),
      insuranceSingle: f(true),
      insuranceFinanced: f(true),
      insuranceRequired: f(false),
      earlyRepaymentClauseText: f(prose(largest ? 600 : 350)),
      withdrawalClauseText: f(prose(largest ? 600 : 350)),
      charges: charges(largest ? MAX_CHARGES : 2),
    },
    credit_precontract_info: {
      deliveredOn: f('2024-01-10'),
      representativeExample: f(false),
      principal: f(20000),
      nominalRate: f(7.99),
      declaredApr: f(10.08),
      declaredTotalPayable: f(25287),
      instalmentCount: f(60),
      instalmentAmount: f(421.45),
    },
    amortization_schedule: {
      schedule: Array.from({ length: MAX_SCHEDULE_ROWS }, (_, i) => ({
        dueOn: day(i),
        amount: 421.45,
        interest: 133.17,
        principal: 288.28,
        balance: 19711.72,
        fees: 15.83,
        confidence: 'high',
      })),
    },
    early_repayment_statement: {
      repaidOn: f('2026-03-05'),
      principalRepaid: f(12000),
      interestSettled: f(45.12),
      compensationCharged: f(120),
      compensationConcept: f(named('Comisión por cancelación anticipada', 80)),
      premiumRefunded: f(410.5),
      agreedEndOn: f('2029-01-05'),
      paidByInsurance: f(false),
      discountLost: f(false),
    },
    revolving_agreement: {
      lenderName: f(named('Tarjetas Imaginarias E.F.C., S.A.', 80)),
      agreedOn: f('2021-06-01'),
      creditLimit: f(3000),
      nominalRate: f(21.94),
      declaredApr: f(24.29),
      minimumPayment: f(30),
      minimumPaymentPercent: f(3),
      annualFee: f(0),
      paymentMode: f('percent_of_balance'),
      charges: charges(largest ? MAX_CHARGES : 1),
    },
    card_statement: {
      statements: Array.from({ length: MAX_STATEMENTS }, (_, i) => ({
        statementOn: day(i),
        balance: 2874.12,
        interest: 52.55,
        payment: 90,
        nominalRate: 21.94,
        estimatedEndOn: '2029-11-05',
        totalToPay: 3990.4,
        confidence: 'high',
      })),
    },
  };
}
