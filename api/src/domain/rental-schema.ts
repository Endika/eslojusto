import { RENTAL_PAGE_KINDS } from './documents';
import type { FieldSpec, ListSpec, ReviewSchema, SectionSchema } from './extraction-schema';

// Mirrors of the site's rental engine unions (src/engine/rental/types.ts);
// test/rental-contract.test.ts keeps them equal.
export const LEASE_USES = [
  'main_home',
  'seasonal',
  'room',
  'other_use',
  'protected',
  'old_rent',
] as const;
export const LANDLORD_TYPES = ['person', 'company'] as const;
export const UPDATE_CLAUSE_INDEXES = [
  'ipc',
  'irav',
  'igc',
  'fixed_percent',
  'unspecified_index',
  'none',
  'other',
] as const;
export const GUARANTEE_KINDS = ['cash', 'bank_guarantee', 'insurance', 'other'] as const;
export const CHARGE_KINDS = ['community', 'property_tax', 'waste', 'other'] as const;
export const FEE_CONCEPT_KINDS = [
  'agency_fee',
  'formalisation',
  'solvency_check',
  'reservation',
  'management',
  'other',
] as const;
export const DEDUCTION_KINDS = [
  'damage',
  'cleaning',
  'unpaid_rent',
  'unpaid_bills',
  'wear',
  'other',
] as const;

export const UTILITY_KINDS = ['electricity', 'water', 'gas', 'internet', 'other'] as const;
export const UTILITY_PAYERS = ['tenant', 'landlord'] as const;
export const NOTICE_MEDIA = [
  'letter',
  'burofax',
  'email',
  'messaging',
  'receipt_note',
  'other',
] as const;
export const NAMED_INDEXES = ['ipc', 'irav', 'igc', 'other'] as const;
export const INVOICE_ISSUERS = ['agency', 'landlord', 'other'] as const;

export const RENTAL_READABILITY = [
  'ok',
  'handwritten',
  'blurry',
  'dark',
  'cropped',
  'not_rental_document',
  'foreign_jurisdiction',
  'unknown_format',
] as const;

const MAX_CONCEPT = 80;
export const MAX_CLAUSE_TEXT = 600;
export const MAX_FEES_TEXT = 300;
// Fifty years, the longest a lease is likely to run.
export const MAX_AGREED_MONTHS = 600;

const field = (type: FieldSpec['type'], description: string): FieldSpec => ({ type, description });
const date = (description: string) => field({ type: 'date' }, description);
const money = (description: string) => field({ type: 'money' }, description);
const flag = (description: string) => field({ type: 'boolean' }, description);
const text = (maxLength: number, description: string) =>
  field({ type: 'text', maxLength }, description);
const oneOf = (values: readonly string[], description: string) =>
  field({ type: 'enum', values }, description);
const percent = (description: string) => field({ type: 'percent' }, description);
const concept = text(MAX_CONCEPT, 'The concept exactly as printed.');

const list = (
  description: string,
  maxItems: number,
  item: Readonly<Record<string, FieldSpec>>,
  required: readonly string[],
): ListSpec => ({ description, maxItems, item, required });

// Clause texts are copied word for word so the person can check the label against them; the
// model labels a clause and never says whether it holds.
const LITERAL =
  ' Copy it word for word, at most the first characters that fit; never summarise or judge it.';

const lease = {
  description:
    'Residential lease contract (contrato de arrendamiento de vivienda), with its annexes.',
  source: 'lease',
  fields: {
    signedOn: date('Date the contract was signed (fecha del contrato, «en … a … de …»).'),
    startDate: date('Date the lease starts (fecha de inicio, entrada en vigor), if stated.'),
    postcode: field(
      { type: 'text', maxLength: 5, pattern: '^[0-9]{5}$' },
      'Postcode (código postal) of the rented home: five digits.',
    ),
    landlordType: oneOf(
      LANDLORD_TYPES,
      'person: the landlord (arrendador) is a natural person. company: a company or other legal entity (S.L., S.A., sociedad, fondo, SOCIMI, cooperativa, fundación).',
    ),
    landlordCompanyName: text(
      MAX_CONCEPT,
      'Only when the landlord is a company: its name as printed. Never the name of a person.',
    ),
    agencyNamed: flag(
      'true when an estate agency or intermediary (agencia, inmobiliaria, API) appears in the contract; false when none does.',
    ),
    use: oneOf(
      LEASE_USES,
      'What the contract says the home is for: main_home (vivienda habitual y permanente), seasonal (temporada: estudios, trabajo, vacaciones), room (alquiler de habitación), other_use (uso distinto de vivienda: local, oficina, garaje), protected (vivienda protegida, VPO), old_rent (renta antigua, before 1985).',
    ),
    agreedMonths: field(
      { type: 'integer', min: 1, max: MAX_AGREED_MONTHS },
      'Agreed duration in months (duración pactada), only if stated: one year is 12.',
    ),
    initialRent: money('Monthly rent agreed at the start (renta mensual), in euros.'),
    updateClauseText: text(
      MAX_CLAUSE_TEXT,
      'The clause about how the rent is updated each year (actualización de la renta).' + LITERAL,
    ),
    updateClauseIndex: oneOf(
      UPDATE_CLAUSE_INDEXES,
      'The label that matches that clause: ipc (IPC, índice de precios de consumo, «IPC general»), irav (Índice de Referencia para la Actualización de Arrendamientos de Vivienda), igc (Índice de Garantía de Competitividad), fixed_percent (a fixed percentage a year), unspecified_index (an update with no index or percentage named), none (it says the rent is not updated), other (any other rule).',
    ),
    updateFixedPercent: percent(
      'For a fixed_percent clause only: the percentage a year, 3 for «un 3 %».',
    ),
    deposit: money('Deposit (fianza legal), in euros.'),
    advanceMonths: field(
      { type: 'integer', min: 0, max: 24 },
      'Monthly rents paid in advance at signing (mensualidades por adelantado), beyond the first month, only if stated.',
    ),
    necessityClause: flag(
      'true when a clause lets the landlord end the lease early to live in the home (necesidad del arrendador, artículo 9.3 LAU); false when there is none.',
    ),
    feesText: text(
      MAX_FEES_TEXT,
      'What the contract says about agency, management or formalisation fees (honorarios, gastos de gestión) and who pays them.' +
        LITERAL,
    ),
    chargesClauseText: text(
      MAX_CLAUSE_TEXT,
      'The clause that passes community fees, IBI, waste rates or other costs on to the tenant (gastos generales, tributos).' +
        LITERAL,
    ),
  },
  lists: {
    guarantees: list(
      'Every guarantee besides the deposit (garantía adicional): a cash sum, a bank guarantee (aval bancario) or a rent insurance.',
      5,
      {
        kind: oneOf(
          GUARANTEE_KINDS,
          'cash (depósito o garantía en metálico), bank_guarantee (aval bancario), insurance (seguro de impago), other.',
        ),
        amount: money('Its amount, in euros, if stated.'),
        months: field(
          { type: 'integer', min: 1, max: 24 },
          'Its size in whole monthly rents, if stated that way.',
        ),
      },
      ['kind'],
    ),
    charges: list(
      'Every cost passed on to the tenant besides the rent, as the contract states it.',
      10,
      {
        kind: oneOf(
          CHARGE_KINDS,
          'community (gastos de comunidad), property_tax (IBI), waste (tasa de basuras), other.',
        ),
        annualAmount: money('What it comes to a year, in euros, only if stated as such.'),
        concept,
      },
      ['kind'],
    ),
    utilities: list(
      'Every utility the contract assigns (suministros).',
      6,
      {
        kind: oneOf(UTILITY_KINDS, 'electricity, water, gas, internet or other.'),
        payer: oneOf(UTILITY_PAYERS, 'Who pays it according to the contract.'),
      },
      ['kind', 'payer'],
    ),
  },
} as const satisfies SectionSchema;

const rentUpdateNotice = {
  description:
    'Notice of a rent update (comunicación de actualización de renta), by letter, burofax, email, message or a note on a receipt.',
  source: 'rent_update_notice',
  fields: {},
  lists: {
    notices: list(
      'Every update notice, one entry each.',
      8,
      {
        noticeOn: date('Date of the notice.'),
        medium: oneOf(NOTICE_MEDIA, 'How it was sent.'),
        percent: percent('The percentage of the update, as printed.'),
        indexNamed: oneOf(NAMED_INDEXES, 'The index it names: ipc, irav, igc or other.'),
        referenceMonth: field({ type: 'month' }, 'The month of the index it cites, as YYYY-MM.'),
        previousRent: money('Monthly rent before the update.'),
        newRent: money('Monthly rent after the update.'),
        appliesFrom: date('Date from which the new rent applies.'),
      },
      [],
    ),
  },
} as const satisfies SectionSchema;

const rentReceipt = {
  description: 'Rent receipt or bank statement line for the rent (recibo de alquiler).',
  source: 'rent_receipt',
  fields: {},
  lists: {
    receipts: list(
      'Every monthly receipt, one entry each, with each part only as printed.',
      36,
      {
        month: field({ type: 'month' }, 'The month the receipt is for, as YYYY-MM.'),
        total: money('Total of the receipt.'),
        rent: money('Rent (renta).'),
        community: money('Community fees (comunidad).'),
        propertyTax: money('IBI.'),
        waste: money('Waste rate (basuras).'),
        utilities: money('Utilities (suministros: luz, agua, gas).'),
        other: money('Any other line, added up.'),
      },
      ['month'],
    ),
  },
} as const satisfies SectionSchema;

const agencyInvoice = {
  description:
    'Invoice or receipt for a fee charged when renting (factura de honorarios, gestión, reserva o estudio de solvencia).',
  source: 'agency_invoice',
  fields: {},
  lists: {
    invoices: list(
      'Every invoice, one entry each.',
      4,
      {
        issuedOn: date('Date of the invoice.'),
        issuer: oneOf(INVOICE_ISSUERS, 'Who issues it: agency, landlord or other.'),
        concept,
        conceptKind: oneOf(
          FEE_CONCEPT_KINDS,
          'agency_fee (honorarios de agencia, comisión), formalisation (formalización del contrato), solvency_check (estudio de solvencia, scoring), reservation (reserva, señal), management (gestión, gastos de gestión), other.',
        ),
        base: money('Taxable base (base imponible).'),
        vat: money('VAT amount (IVA), in euros.'),
        total: money('Total.'),
      },
      ['conceptKind'],
    ),
  },
} as const satisfies SectionSchema;

const depositReturn = {
  description:
    'Deposit return or end-of-lease settlement (devolución de la fianza, liquidación, acta de entrega de llaves).',
  source: 'deposit_return',
  fields: {
    keysReturnedOn: date('Date the keys were handed back (entrega de llaves).'),
    deposit: money('Deposit it says was held (fianza).'),
    closingDocumentSigned: flag(
      'true when the document is signed by both parties as the end of the lease; false when it is not.',
    ),
  },
  lists: {
    returns: list(
      'Every payment returning money, one entry each.',
      4,
      { on: date('Date of the payment.'), amount: money('Amount returned.') },
      ['amount'],
    ),
    deductions: list(
      'Every amount kept back from the deposit, one entry each.',
      10,
      {
        amount: money('Amount kept back.'),
        kind: oneOf(
          DEDUCTION_KINDS,
          'damage (desperfectos), cleaning (limpieza), unpaid_rent (rentas impagadas), unpaid_bills (suministros pendientes), wear (desgaste, pintura), other.',
        ),
        concept,
      },
      ['amount'],
    ),
  },
} as const satisfies SectionSchema;

// One section per kind of document, named after it.
export const RENTAL_SECTIONS = {
  lease,
  rent_update_notice: rentUpdateNotice,
  rent_receipt: rentReceipt,
  agency_invoice: agencyInvoice,
  deposit_return: depositReturn,
} as const satisfies Readonly<
  Record<Exclude<(typeof RENTAL_PAGE_KINDS)[number], 'other'>, SectionSchema>
>;

export type RentalSectionKind = keyof typeof RENTAL_SECTIONS;

export const RENTAL_READABILITY_DESCRIPTION =
  'ok: legible enough to transcribe, in whatever language. Otherwise the main reason the page cannot be used: handwritten (the values are written by hand), blurry, dark, cropped (the part with the values is cut off), not_rental_document (not about renting a home), foreign_jurisdiction (a tenancy document for a home outside Spain; never because of its language), unknown_format (about renting a home, but no kind of document you know).';
export const RENTAL_PAGE_KIND_DESCRIPTION =
  'lease: a residential lease contract (contrato de arrendamiento) or its annex. rent_update_notice: a notice that the rent goes up or down (actualización de renta), as a letter, burofax, email, message or a note on a receipt. rent_receipt: a rent receipt (recibo) or a bank statement showing the rent paid. agency_invoice: an invoice or receipt for a fee charged when renting (honorarios, gestión, reserva, estudio de solvencia). deposit_return: a deposit return, end-of-lease settlement or key handover record (devolución de la fianza, entrega de llaves). other: anything else, such as an ID card or a payslip.';

export const RENTAL_SCHEMA: ReviewSchema = {
  pageKinds: RENTAL_PAGE_KINDS,
  pageKindDescription: RENTAL_PAGE_KIND_DESCRIPTION,
  readability: RENTAL_READABILITY,
  readabilityDescription: RENTAL_READABILITY_DESCRIPTION,
  monthDescription: 'For a rent receipt page only: the month it is for, as YYYY-MM.',
  sections: RENTAL_SECTIONS,
};
