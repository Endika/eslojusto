import { CREDIT_PAGE_KINDS } from './documents';
import type { FieldSpec, ListSpec, ReviewSchema, SectionSchema } from './extraction-schema';

// Mirrors of the site's consumer credit engine unions (src/engine/credit/types.ts);
// test/credit-contract.test.ts keeps them equal. `CREDIT_ITEM_IDS` already names the final pay's
// items, hence the LOAN_ and CARD_ prefixes.
export const LOAN_PRODUCTS = ['personal_loan', 'car_loan', 'revolving'] as const;
export const LOAN_CHARGE_KINDS = ['opening', 'study', 'management', 'other'] as const;
export const LOAN_CHARGE_PAYMENTS = ['deducted', 'financed', 'paid'] as const;
export const LOAN_RATE_TYPES = ['fixed', 'variable'] as const;
export const INTERMEDIARY_TYPES = ['person', 'company'] as const;
export const CARD_PAYMENT_MODES = [
  'fixed_amount',
  'percent_of_balance',
  'full_balance',
  'other',
] as const;

export const CREDIT_READABILITY = [
  'ok',
  'handwritten',
  'blurry',
  'dark',
  'cropped',
  'not_credit_document',
  'foreign_jurisdiction',
  'unknown_format',
] as const;

const MAX_NAME = 80;
export const MAX_CREDIT_CLAUSE_TEXT = 600;
// Fifty years of monthly instalments, the site's own limit.
export const MAX_INSTALMENTS = 600;
// Eight years of monthly rows, which a schedule fits in two to four pages; a longer one keeps its
// first rows and the read says it was cut. More would not fit in max_tokens beside the other lists.
export const MAX_SCHEDULE_ROWS = 96;
export const MAX_STATEMENTS = 12;
export const MAX_CHARGES = 8;

const field = (type: FieldSpec['type'], description: string): FieldSpec => ({ type, description });
const date = (description: string) => field({ type: 'date' }, description);
const money = (description: string) => field({ type: 'money' }, description);
const flag = (description: string) => field({ type: 'boolean' }, description);
const percent = (description: string) => field({ type: 'percent' }, description);
const text = (maxLength: number, description: string) =>
  field({ type: 'text', maxLength }, description);
const oneOf = (values: readonly string[], description: string) =>
  field({ type: 'enum', values }, description);

const list = (
  description: string,
  maxItems: number,
  item: Readonly<Record<string, FieldSpec>>,
  required: readonly string[],
  keepLatestBy?: string,
): ListSpec => ({
  description,
  maxItems,
  item,
  required,
  ...(keepLatestBy !== undefined && { keepLatestBy }),
});

// Clause texts are copied word for word so the person can check them; the model never judges them.
const LITERAL =
  ' Copy it word for word, at most the first characters that fit; never summarise or judge it.';

const lenderName = text(MAX_NAME, 'The lender (prestamista): its company name as printed.');
const intermediaryType = oneOf(
  INTERMEDIARY_TYPES,
  'The credit intermediary (concesionario, tienda), if one appears: person or company.',
);
const intermediaryCompanyName = text(
  MAX_NAME,
  'Only when the intermediary is a company: its name as printed. Never the name of a person.',
);
const agreedOn = date('Date of the contract (fecha del contrato, «en … a … de …»).');
const nominalRate = percent('Nominal annual interest rate (TIN, tipo deudor), 7,99 % is 7.99.');
const declaredApr = percent('The APR the document states (TAE), 8,29 % is 8.29.');

const charges = list(
  'Every charge (comisión, gasto) the document states, one entry each.',
  MAX_CHARGES,
  {
    kind: oneOf(
      LOAN_CHARGE_KINDS,
      'opening (comisión de apertura), study (comisión de estudio), management (gastos de gestión, tramitación), other.',
    ),
    concept: text(MAX_NAME, 'The concept exactly as printed.'),
    amount: money('Its amount, in euros.'),
    how: oneOf(
      LOAN_CHARGE_PAYMENTS,
      'deducted (descontada del importe entregado), financed (sumada al capital) or paid (pagada aparte), if stated.',
    ),
  },
  ['kind'],
);

const creditAgreement = {
  description:
    'Consumer credit contract (préstamo personal, financiación de un coche o de una compra a plazos) and its conditions.',
  source: 'credit_agreement',
  fields: {
    product: oneOf(
      LOAN_PRODUCTS,
      'personal_loan (préstamo personal), car_loan (financiación de un vehículo), revolving (tarjeta o línea de pago aplazado).',
    ),
    lenderName,
    intermediaryType,
    intermediaryCompanyName,
    agreedOn,
    principal: money('Amount of credit (importe total del crédito, capital prestado), in euros.'),
    netDisbursed: money(
      'Amount actually handed over or paid into the account (importe entregado, neto), only if printed apart from the capital.',
    ),
    cashPrice: money('Cash price of the goods financed (precio al contado), if stated.'),
    goods: text(MAX_NAME, 'The goods or service financed (bien financiado), as printed.'),
    nominalRate,
    rateType: oneOf(
      LOAN_RATE_TYPES,
      'fixed (tipo fijo) or variable (tipo variable, referenciado).',
    ),
    declaredApr,
    declaredTotalPayable: money(
      'Total amount payable the contract states (importe total adeudado).',
    ),
    instalmentCount: field(
      { type: 'integer', min: 1, max: MAX_INSTALMENTS },
      'Number of instalments (número de cuotas).',
    ),
    instalmentAmount: money('Amount of each regular instalment (importe de la cuota).'),
    firstDueOn: date('Due date of the first instalment (primera cuota, primer vencimiento).'),
    balloonAmount: money(
      'A last payment larger than the instalments (cuota final, valor futuro garantizado).',
    ),
    balloonDueOn: date('Its due date, only if printed.'),
    agreedEndOn: date('Date the credit ends (fecha de vencimiento final), if stated.'),
    insurancePremium: money(
      'Premium of an insurance linked to the credit (prima del seguro), in euros.',
    ),
    insuranceSingle: flag(
      'true for a single premium for the whole term (prima única); false for a periodic one.',
    ),
    insuranceFinanced: flag('true when that premium is added to the capital (financiada).'),
    insuranceRequired: flag(
      'true when the contract says the insurance is required to grant the credit; false when it says it is optional.',
    ),
    earlyRepaymentClauseText: text(
      MAX_CREDIT_CLAUSE_TEXT,
      'The clause on early repayment (reembolso o amortización anticipada) and its compensation.' +
        LITERAL,
    ),
    withdrawalClauseText: text(
      MAX_CREDIT_CLAUSE_TEXT,
      'The clause on the right of withdrawal (derecho de desistimiento).' + LITERAL,
    ),
  },
  lists: {
    charges,
  },
} as const satisfies SectionSchema;

const precontractInfo = {
  description: 'Información Normalizada Europea (INE) given before the contract.',
  source: 'credit_precontract_info',
  fields: {
    deliveredOn: date('Date it was handed over (fecha de entrega), if stated.'),
    representativeExample: flag(
      'true when its figures are a representative example (ejemplo representativo) rather than this credit’s own; false when they are this credit’s.',
    ),
    principal: money('Importe total del crédito.'),
    nominalRate: percent('TIN.'),
    declaredApr: percent('TAE.'),
    declaredTotalPayable: money('Importe total adeudado.'),
    instalmentCount: field(
      { type: 'integer', min: 1, max: MAX_INSTALMENTS },
      'Number of instalments.',
    ),
    instalmentAmount: money('Amount of each instalment.'),
  },
  lists: {},
} as const satisfies SectionSchema;

const amortizationSchedule = {
  description: 'Repayment schedule (cuadro de amortización), one row per instalment.',
  source: 'amortization_schedule',
  fields: {},
  lists: {
    schedule: list(
      'Every row in the order printed; past 96, the first 96.',
      MAX_SCHEDULE_ROWS,
      {
        dueOn: date('Due date.'),
        amount: money('Instalment (cuota).'),
        interest: money('Interest part (intereses).'),
        principal: money('Capital part (amortización, capital).'),
        balance: money('Capital outstanding after it (capital pendiente).'),
        fees: money('Charges or premium in the row, if any.'),
      },
      ['dueOn', 'amount'],
    ),
  },
} as const satisfies SectionSchema;

const earlyRepaymentStatement = {
  description:
    'Statement of an early repayment (liquidación de amortización o cancelación anticipada).',
  source: 'early_repayment_statement',
  fields: {
    repaidOn: date('Date of the repayment.'),
    principalRepaid: money('Capital repaid (capital amortizado).'),
    interestSettled: money('Interest settled that day (intereses liquidados), if printed.'),
    compensationCharged: money(
      'Compensation or fee charged for repaying early (compensación, comisión por amortización anticipada).',
    ),
    compensationConcept: text(MAX_NAME, 'The concept of that charge exactly as printed.'),
    premiumRefunded: money('Insurance premium refunded (prima no consumida, extorno), if printed.'),
    agreedEndOn: date('Date the credit was to end (fecha de vencimiento final pactada).'),
    paidByInsurance: flag('true when the statement says an insurance paid the repayment.'),
    discountLost: flag(
      'true when it charges back a discount given for financing the purchase (pérdida del descuento, bonificación por financiar).',
    ),
  },
  lists: {},
} as const satisfies SectionSchema;

const revolvingAgreement = {
  description: 'Contract of a revolving card or credit line (tarjeta de pago aplazado, revolving).',
  source: 'revolving_agreement',
  fields: {
    lenderName,
    intermediaryType,
    intermediaryCompanyName,
    agreedOn,
    creditLimit: money('Credit limit (límite de crédito, disponible).'),
    nominalRate,
    declaredApr,
    minimumPayment: money('Minimum monthly payment in euros (cuota mínima).'),
    minimumPaymentPercent: percent('Minimum monthly payment as a percentage of the balance.'),
    annualFee: money('Annual fee (cuota anual, de emisión o mantenimiento).'),
    paymentMode: oneOf(
      CARD_PAYMENT_MODES,
      'How it is repaid (modalidad de pago): fixed_amount (cuota fija), percent_of_balance (porcentaje del saldo), full_balance (pago total a fin de mes), other.',
    ),
  },
  lists: { charges },
} as const satisfies SectionSchema;

const cardStatement = {
  description: 'Monthly statement of a revolving card or credit line (extracto).',
  source: 'card_statement',
  fields: {},
  lists: {
    statements: list(
      'Every statement, one entry each; past twelve, the twelve most recent.',
      MAX_STATEMENTS,
      {
        statementOn: date('Date of the statement.'),
        balance: money('Balance owed (saldo dispuesto, deuda pendiente).'),
        interest: money('Interest charged in the period.'),
        payment: money('Payment due for the period (cuota, recibo).'),
        nominalRate,
        estimatedEndOn: date(
          'Estimated date the balance is paid off (fecha estimada de fin), if printed.',
        ),
        totalToPay: money('Estimated total still to pay (importe total a pagar), if printed.'),
      },
      ['statementOn'],
      'statementOn',
    ),
  },
} as const satisfies SectionSchema;

// One section per kind of document, named after it.
export const CREDIT_SECTIONS = {
  credit_agreement: creditAgreement,
  credit_precontract_info: precontractInfo,
  amortization_schedule: amortizationSchedule,
  early_repayment_statement: earlyRepaymentStatement,
  revolving_agreement: revolvingAgreement,
  card_statement: cardStatement,
} as const satisfies Readonly<
  Record<Exclude<(typeof CREDIT_PAGE_KINDS)[number], 'other'>, SectionSchema>
>;

export type CreditSectionKind = keyof typeof CREDIT_SECTIONS;

export const CREDIT_READABILITY_DESCRIPTION =
  'ok: legible enough to transcribe, in whatever language. Otherwise the main reason the page cannot be used: handwritten (the values are written by hand), blurry, dark, cropped (the part with the values is cut off), not_credit_document (not about a consumer credit), foreign_jurisdiction (a credit under the law of another country; never because of its language), unknown_format (about a consumer credit, but no kind of document you know).';
export const CREDIT_PAGE_KIND_DESCRIPTION =
  'credit_agreement: a consumer credit contract (préstamo personal, financiación de un coche, compra a plazos) or its conditions. credit_precontract_info: the Información Normalizada Europea (INE, SECCI) given before it. amortization_schedule: a repayment schedule (cuadro de amortización). early_repayment_statement: a statement of an early repayment (liquidación de amortización o cancelación anticipada). revolving_agreement: the contract of a revolving card or credit line. card_statement: a monthly statement (extracto) of such a card. other: anything else, such as an ID card, a mortgage or a payslip.';

export const CREDIT_SCHEMA: ReviewSchema = {
  pageKinds: CREDIT_PAGE_KINDS,
  pageKindDescription: CREDIT_PAGE_KIND_DESCRIPTION,
  readability: CREDIT_READABILITY,
  readabilityDescription: CREDIT_READABILITY_DESCRIPTION,
  monthDescription: 'For a card statement page only: the month it is for, as YYYY-MM.',
  sections: CREDIT_SECTIONS,
};
