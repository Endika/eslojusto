import { LIMITS, MORTGAGE_PAGE_KINDS } from './documents';
import type { FieldSpec, ListSpec, ReviewSchema, SectionSchema } from './extraction-schema';

// Mirrors of the site's mortgage engine unions (src/engine/mortgage/types.ts);
// test/mortgage-contract.test.ts keeps them equal. An invoice's concept, after its document's
// prefix (`notary_`, `registry_`, `ajd_`), is one of the engine's invoice kinds.
export const MORTGAGE_BORROWERS = ['individual', 'company'] as const;
export const MORTGAGE_PURPOSES = ['housing', 'business'] as const;
export const MORTGAGE_LOAN_KINDS = [
  'standard',
  'developer_subrogation',
  'multicurrency',
  'reverse',
] as const;
export const MORTGAGE_RATE_TYPES = ['fixed', 'variable', 'mixed'] as const;
export const PREPAYMENT_OPTIONS = ['a_015_5y', 'b_025_3y'] as const;
export const MORTGAGE_OPERATION_KINDS = [
  'partial_prepayment',
  'full_prepayment',
  'fixed_rate_novation',
  'creditor_subrogation',
] as const;
export const MORTGAGE_CLAUSE_LABELS = [
  'floor_clause',
  'irph',
  'euribor',
  'default_interest',
  'early_termination',
  'rounding_up',
  'opening_fee',
  'prepayment_fee',
  'expenses_clause',
  'insurance_required',
] as const;
export const NOTARY_CONCEPTS = [
  'loan',
  'purchase',
  'copy_bank',
  'copy_borrower',
  'cancellation',
] as const;
export const REGISTRY_CONCEPTS = ['mortgage', 'purchase', 'cancellation'] as const;
export const AJD_CONCEPTS = ['loan', 'purchase'] as const;

export const MORTGAGE_INDICES = ['euribor', 'irph', 'other'] as const;
export const SUPPLIED_CONCEPTS = ['ajd', 'registry', 'notary', 'valuation', 'other'] as const;

export const MORTGAGE_READABILITY = [
  'ok',
  'handwritten',
  'blurry',
  'dark',
  'cropped',
  'not_mortgage_document',
  'foreign_jurisdiction',
  'unknown_format',
] as const;

const MAX_NAME = 80;
export const MAX_MORTGAGE_CLAUSE_TEXT = 1500;
export const MAX_CLAUSES = 12;
export const MAX_INVOICES = 6;
export const MAX_SUPPLIED = 6;
export const MAX_OPERATIONS = 6;
// Fifty years of monthly instalments, the site's own limit for a loan.
const MAX_MONTHS = 600;

const field = (type: FieldSpec['type'], description: string): FieldSpec => ({ type, description });
const date = (description: string) => field({ type: 'date' }, description);
const money = (description: string) => field({ type: 'money' }, description);
const flag = (description: string) => field({ type: 'boolean' }, description);
const rate = (description: string) => field({ type: 'rate' }, description);
const months = (description: string) =>
  field({ type: 'integer', min: 1, max: MAX_MONTHS }, description);
const text = (maxLength: number, description: string) =>
  field({ type: 'text', maxLength }, description);
const oneOf = (values: readonly string[], description: string) =>
  field({ type: 'enum', values }, description);

const list = (
  description: string,
  maxItems: number,
  item: Readonly<Record<string, FieldSpec>>,
  required: readonly string[],
): ListSpec => ({ description, maxItems, item, required });

// Clause texts are copied word for word so the person can check them; the model never judges them.
const LITERAL =
  ' Copy it word for word, at most the first characters that fit; never summarise or judge it.';

const invoiceOn = date('Date of the invoice.');
const base = money('Taxable base (base imponible, honorarios, derechos de arancel).');
const vat = money('VAT (IVA) of the invoice.');
const total = money('Total of the invoice (total factura), outlays included.');
// Notaries and registries bill the purchase and the loan of one day apart or together.
const SPLIT =
  ' When one invoice prints separate amounts for the purchase and for the loan, one entry for each part; when it bills both in one amount, one entry with mixed true.';
const mixed = flag(
  'true when the invoice bills the purchase (compraventa) and the mortgage loan together without splitting their amounts; false when it bills only one of them.',
);

const mortgageDeed = {
  description:
    'The mortgage loan deed (escritura de préstamo hipotecario), alone or after the purchase in one deed.',
  source: 'mortgage_deed',
  fields: {
    deedOn: date('Date of the deed before the notary («En …, a … de …»).'),
    lenderName: text(MAX_NAME, 'The lender (entidad acreedora, prestamista): its name as printed.'),
    borrowerType: oneOf(
      MORTGAGE_BORROWERS,
      'Who borrows: individual (one or more natural persons) or company (a company, sociedad).',
    ),
    purpose: oneOf(
      MORTGAGE_PURPOSES,
      'What the deed says the loan is for, only if it says so: housing (buying, building or renovating a home, its garage or storage room) or business (a business, professional activity or premises).',
    ),
    loanKind: oneOf(
      MORTGAGE_LOAN_KINDS,
      'standard; developer_subrogation (the buyer takes over the developer’s loan, subrogación en el préstamo del promotor); multicurrency (multidivisa, a loan in another currency); reverse (hipoteca inversa).',
    ),
    principal: money('Capital lent (capital del préstamo, principal).'),
    termMonths: months('Term in months (plazo); 25 years is 300.'),
    rateType: oneOf(
      MORTGAGE_RATE_TYPES,
      'As the deed names it: fixed (tipo fijo for the whole term), variable (tipo variable, revised by an index, even after an initial rate) or mixed (tipo mixto: a fixed stretch the deed calls so, then variable). Leave it out when the deed does not say which.',
    ),
    fixedUntil: date('For a mixed rate: the last day of its fixed stretch, if printed.'),
    initialRate: rate(
      'Initial or fixed nominal annual rate (tipo de interés inicial), 2,5 % is 2.5.',
    ),
    index: oneOf(
      MORTGAGE_INDICES,
      'The reference index of a variable rate: euribor (Euríbor), irph (IRPH, of the entities, savings banks or banks), other.',
    ),
    spread: rate('Points added to the index (diferencial), 0,875 is 0.875.'),
    rateRevisionMonths: months(
      'Months between two revisions of a variable rate (revisión semestral is 6).',
    ),
    floorPercent: rate(
      'The lowest rate the deed lets the variable rate reach (tipo mínimo, límite a la variación a la baja); 0 when it says only that the rate can never be negative.',
    ),
    defaultRate: rate('Default interest (interés de demora), when printed as a rate.'),
    defaultMarginPoints: rate(
      'Default interest when printed as points over the ordinary rate (interés remuneratorio más 2 puntos is 2).',
    ),
    earlyTerminationInstalments: months(
      'Monthly instalments left unpaid after which the lender may call in the whole loan (vencimiento anticipado); one instalment is 1.',
    ),
    prepaymentOption: oneOf(
      PREPAYMENT_OPTIONS,
      'For a variable rate, the compensation for repaying early the deed picks (art. 23.5 Ley 5/2019): a_015_5y (0,15 % in the first five years) or b_025_3y (0,25 % in the first three years).',
    ),
    variablePrepaymentFeePercent: rate(
      'Compensation for repaying early in a variable stretch, as a percentage of the capital repaid.',
    ),
    fixedPrepaymentFeePercent: rate(
      'Compensation for repaying early in a fixed stretch, as a percentage of the capital repaid; the first one printed when it has two periods.',
    ),
    openingFee: money('Opening fee (comisión de apertura), in euros.'),
    openingFeePercent: rate('Opening fee as a percentage of the capital.'),
    otherSetUpFee: flag(
      'true when, besides the opening fee, the deed charges a study, processing or similar fee for granting the loan (comisión de estudio, de tramitación); false when it charges none.',
    ),
    transparencyActStated: flag(
      'true when the deed states that the notarial act on the information given before it was drawn up (acta previa, art. 15 Ley 5/2019); false when it says nothing of it.',
    ),
    handwrittenStatement: flag(
      'true when the deed holds or mentions a statement written by the borrower’s own hand about the risks of the loan (expresión manuscrita); false when it does not.',
    ),
  },
  lists: {
    clauses: list(
      'Each clause of the deed that matches one of the labels, one entry each, in the order printed; past twelve, the first twelve. Leave out clauses that match none.',
      MAX_CLAUSES,
      {
        label: oneOf(
          MORTGAGE_CLAUSE_LABELS,
          'floor_clause (a lowest rate, límite a la baja, cláusula suelo), irph (an IRPH index), euribor (a Euríbor index), default_interest (interés de demora), early_termination (vencimiento anticipado), rounding_up (rounding the rate up, redondeo al alza), opening_fee (comisión de apertura, de estudio o de tramitación), prepayment_fee (compensation for repaying early or for changing to a fixed rate), expenses_clause (who pays the costs of the deed: notary, registry, agency, valuation, taxes), insurance_required (an insurance or another product the loan requires).',
        ),
        text: text(MAX_MORTGAGE_CLAUSE_TEXT, 'The clause.' + LITERAL),
        page: field(
          { type: 'integer', min: 1, max: LIMITS.maxImages },
          'The number of the page it starts on.',
        ),
      },
      ['label', 'text'],
    ),
  },
} as const satisfies SectionSchema;

const notaryInvoice = {
  description: 'Every notary invoice (factura de notaría).',
  source: 'notary_invoice',
  fields: {},
  lists: {
    notaryInvoices: list(
      'Every notary invoice, one entry each.' + SPLIT,
      MAX_INVOICES,
      {
        invoiceOn,
        concept: oneOf(
          NOTARY_CONCEPTS,
          'What it bills: loan (the mortgage loan deed), purchase (the purchase deed, compraventa), copy_bank (a copy for the lender, copia autorizada para la entidad), copy_borrower (a copy for the borrower, copia simple), cancellation (the deed that cancels a mortgage).',
        ),
        mixed,
        base,
        vat,
        supplied: money('Outlays the notary passed on (suplidos), added up as printed.'),
        total,
      },
      ['total'],
    ),
  },
} as const satisfies SectionSchema;

const registryInvoice = {
  description: 'Every land registry invoice (factura del Registro de la Propiedad).',
  source: 'registry_invoice',
  fields: {},
  lists: {
    registryInvoices: list(
      'Every land registry invoice, one entry each.' + SPLIT,
      MAX_INVOICES,
      {
        invoiceOn,
        concept: oneOf(
          REGISTRY_CONCEPTS,
          'What it registers: mortgage (the mortgage, inscripción de la hipoteca), purchase (the purchase, inscripción de la compraventa), cancellation (the cancellation of a mortgage).',
        ),
        mixed,
        base,
        vat,
        total,
      },
      ['total'],
    ),
  },
} as const satisfies SectionSchema;

const agencyInvoice = {
  description:
    'Every invoice of the agency that handled the deed (gestoría), with the outlays it passed on.',
  source: 'agency_invoice_mortgage',
  fields: {},
  lists: {
    agencyInvoices: list(
      'Every agency invoice, one entry each.',
      3,
      {
        invoiceOn,
        fee: money('The agency’s own fee (honorarios), before VAT.'),
        vat,
        total,
      },
      ['total'],
    ),
    agencySupplied: list(
      'Every outlay the agency paid and passed on (suplidos, provisión de fondos aplicada), one entry each.',
      MAX_SUPPLIED,
      {
        concept: oneOf(
          SUPPLIED_CONCEPTS,
          'ajd (the stamp duty, Actos Jurídicos Documentados, modelo 600), registry (the land registry), notary, valuation (tasación), other.',
        ),
        amount: money('Its amount, in euros.'),
      },
      ['concept', 'amount'],
    ),
  },
} as const satisfies SectionSchema;

const valuationInvoice = {
  description: 'Every invoice for the valuation of the home (tasación).',
  source: 'valuation_invoice',
  fields: {},
  lists: {
    valuationInvoices: list(
      'Every valuation invoice, one entry each.',
      3,
      { invoiceOn, base, vat, total },
      ['total'],
    ),
  },
} as const satisfies SectionSchema;

const ajdForm = {
  description:
    'Every stamp duty or transfer tax return (modelo 600, autoliquidación de Actos Jurídicos Documentados o de Transmisiones Patrimoniales).',
  source: 'ajd_form',
  fields: {},
  lists: {
    ajdForms: list(
      'Every return, one entry each.',
      3,
      {
        concept: oneOf(
          AJD_CONCEPTS,
          'What it taxes: loan (the mortgage loan, préstamo hipotecario, constitución de hipoteca) or purchase (the purchase of the home, compraventa).',
        ),
        accruedOn: date('Date the tax accrued (fecha de devengo).'),
        taxBase: money('Taxable base (base imponible).'),
        amountPaid: money('Amount paid (total a ingresar, cuota).'),
        paidOn: date('Date it was paid, if printed.'),
        paidByLender: flag(
          'true when it shows the lender as the taxpayer (sujeto pasivo); false when it shows the borrower or buyer.',
        ),
      },
      ['concept'],
    ),
  },
} as const satisfies SectionSchema;

const fein = {
  description:
    'The European Standardised Information Sheet (Ficha Europea de Información Normalizada, FEIN).',
  source: 'fein',
  fields: {
    deliveredOn: date('Date it was handed over (fecha de entrega), if stated.'),
    principal: money('Capital of the loan it offers.'),
    initialRate: rate('Initial nominal annual rate it offers.'),
  },
  lists: {},
} as const satisfies SectionSchema;

const fiae = {
  description: 'The Standardised Warnings Sheet (Ficha de Advertencias Estandarizadas, FiAE).',
  source: 'fiae',
  fields: { deliveredOn: date('Date it was handed over (fecha de entrega), if stated.') },
  lists: {},
} as const satisfies SectionSchema;

const transparencyDeed = {
  description:
    'The notarial act on the information given before the loan (acta notarial de transparencia, art. 15 Ley 5/2019).',
  source: 'transparency_deed',
  fields: {
    actOn: date('Date of the act.'),
    amountCharged: money('What it bills the borrower (honorarios del acta), only if printed.'),
  },
  lists: {},
} as const satisfies SectionSchema;

const prepaymentStatement = {
  description:
    'Every statement of an early repayment, a change to a fixed rate or a move to another lender (liquidación de amortización anticipada, novación, subrogación).',
  source: 'prepayment_statement',
  fields: {},
  lists: {
    operations: list(
      'Every operation, one entry each.',
      MAX_OPERATIONS,
      {
        on: date('Date of the operation.'),
        kind: oneOf(
          MORTGAGE_OPERATION_KINDS,
          'partial_prepayment (amortización parcial), full_prepayment (cancelación, amortización total), fixed_rate_novation (novación a tipo fijo), creditor_subrogation (subrogación a otra entidad).',
        ),
        principal: money('Capital repaid or switched (capital amortizado).'),
        feeCharged: money(
          'Compensation or fee charged for it (compensación, comisión por amortización anticipada o por conversión).',
        ),
        feeConcept: text(MAX_NAME, 'The concept of that charge exactly as printed.'),
        premiumRefunded: money(
          'Insurance premium refunded (prima no consumida, extorno), if printed.',
        ),
      },
      ['on', 'kind'],
    ),
  },
} as const satisfies SectionSchema;

// One section per kind of document, named after it.
export const MORTGAGE_SECTIONS = {
  mortgage_deed: mortgageDeed,
  notary_invoice: notaryInvoice,
  registry_invoice: registryInvoice,
  agency_invoice_mortgage: agencyInvoice,
  valuation_invoice: valuationInvoice,
  ajd_form: ajdForm,
  fein,
  fiae,
  transparency_deed: transparencyDeed,
  prepayment_statement: prepaymentStatement,
} as const satisfies Readonly<
  Record<Exclude<(typeof MORTGAGE_PAGE_KINDS)[number], 'other'>, SectionSchema>
>;

export type MortgageSectionKind = keyof typeof MORTGAGE_SECTIONS;

export const MORTGAGE_READABILITY_DESCRIPTION =
  'ok: legible enough to transcribe, in whatever language. Otherwise the main reason the page cannot be used: handwritten (the values are written by hand; a handwritten statement beside a printed deed is no reason), blurry, dark, cropped (the part with the values is cut off), not_mortgage_document (not about a mortgage loan), foreign_jurisdiction (a mortgage under the law of another country; never because of its language), unknown_format (about a mortgage loan, but no kind of document you know).';
export const MORTGAGE_PAGE_KIND_DESCRIPTION =
  'mortgage_deed: a page of the mortgage loan deed (escritura de préstamo hipotecario), the purchase and the loan in one deed included. notary_invoice: a notary invoice. registry_invoice: a land registry invoice. agency_invoice_mortgage: an agency invoice (gestoría) for the deed. valuation_invoice: a valuation invoice (tasación). ajd_form: a stamp duty or transfer tax return (modelo 600). fein: the FEIN. fiae: the FiAE. transparency_deed: the notarial act on the information given before the loan (acta de transparencia). prepayment_statement: a statement of an early repayment, a change to a fixed rate or a move to another lender. other: anything else, such as an ID card, a purchase deed without a loan, a property tax receipt or a payslip.';

export const MORTGAGE_SCHEMA: ReviewSchema = {
  pageKinds: MORTGAGE_PAGE_KINDS,
  pageKindDescription: MORTGAGE_PAGE_KIND_DESCRIPTION,
  readability: MORTGAGE_READABILITY,
  readabilityDescription: MORTGAGE_READABILITY_DESCRIPTION,
  monthDescription: 'Leave it out: no mortgage page has a month of its own.',
  sections: MORTGAGE_SECTIONS,
};
