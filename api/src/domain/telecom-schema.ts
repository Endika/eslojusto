import { LIMITS, TELECOM_PAGE_KINDS } from './documents';
import type { FieldSpec, ListSpec, ReviewSchema, SectionSchema } from './extraction-schema';

// Mirror of the site's bills engine union (src/engine/bills/types.ts);
// test/telecom-contract.test.ts keeps it equal.
export const PRICE_INDEXES = ['ipc', 'ipc_plus', 'fixed_amount', 'none', 'other'] as const;

// What a line of a phone or internet bill is: the monthly fee of a service, premium-rate calls or
// messages (tarificación adicional), a third party's charge, a penalty, a handset instalment, a
// discount or anything else.
export const TELECOM_LINE_KINDS = [
  'fixed_fee',
  'premium_rate',
  'third_party',
  'penalty',
  'handset',
  'discount',
  'other',
] as const;

export const TELECOM_READABILITY = [
  'ok',
  'handwritten',
  'blurry',
  'dark',
  'cropped',
  'not_telecom_document',
  'foreign_jurisdiction',
  'unknown_format',
] as const;

const MAX_NAME = 80;
export const MAX_TELECOM_CLAUSE_TEXT = 600;
export const MAX_TELECOM_BILLS = 12;
export const MAX_TELECOM_LINES = 60;
// Five years: well past the 24 months the law allows, so a longer term is still read.
const MAX_COMMITMENT_MONTHS = 60;

const field = (type: FieldSpec['type'], description: string): FieldSpec => ({ type, description });
const date = (description: string) => field({ type: 'date' }, description);
const money = (description: string) => field({ type: 'money' }, description);
const flag = (description: string) => field({ type: 'boolean' }, description);
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

const LITERAL =
  ' Copy it word for word, at most the first characters that fit; never summarise or judge it.';

const operatorName = text(MAX_NAME, 'The operator (operador): its company name as printed.');
const billDocument = field(
  { type: 'integer', min: 1, max: LIMITS.maxImages },
  'The number of the document (as given in pages) of the bill this row belongs to.',
);

const telecomBill = {
  description: 'Phone, mobile or internet bills (facturas de teléfono, móvil o fibra).',
  source: 'telecom_bill',
  fields: {},
  lists: {
    bills: list(
      'Every bill, one entry each; past twelve, the twelve most recent.',
      MAX_TELECOM_BILLS,
      {
        document: billDocument,
        operatorName,
        issuedOn: date('Date the bill was issued.'),
        periodFrom: date('First day of the period billed.'),
        periodTo: date('Last day of the period billed.'),
        vatAmount: money('VAT or other indirect tax (IVA, IGIC, IPSI), its amount.'),
        total: money('Total of the bill (total factura, total a pagar).'),
      },
      ['document'],
      'periodTo',
    ),
    lines: list(
      'Every charge or discount of the bills, one entry per line, with its own dates when it prints them.',
      MAX_TELECOM_LINES,
      {
        document: billDocument,
        concept: text(MAX_NAME, 'The concept exactly as printed.'),
        kind: oneOf(
          TELECOM_LINE_KINDS,
          'fixed_fee (cuota mensual de un servicio), premium_rate (tarificación adicional, números 80x, 90x, SMS premium), third_party (servicios de terceros, compras con cargo a la factura), penalty (penalización por permanencia o por baja), handset (plazo de un terminal), discount (descuento), other.',
        ),
        from: date('First day the line is for, if printed.'),
        to: date('Last day the line is for, if printed.'),
        amount: money('Its amount, as a positive.'),
      },
      ['document', 'kind', 'amount'],
    ),
  },
} as const satisfies SectionSchema;

const telecomContract = {
  description:
    'The contract of a phone, mobile or internet service, its conditions or its commitment (compromiso de permanencia).',
  source: 'telecom_contract',
  fields: {
    signedOn: date('Date of the contract.'),
    operatorName,
    commitmentStartsOn: date('Date the commitment starts (inicio de la permanencia), if printed.'),
    commitmentMonths: field(
      { type: 'integer', min: 1, max: MAX_COMMITMENT_MONTHS },
      'Months of the commitment (permanencia).',
    ),
    agreedPenalty: money(
      'The penalty for leaving before the commitment ends, as stated for leaving at its start (penalización máxima).',
    ),
    penaltyText: text(
      MAX_TELECOM_CLAUSE_TEXT,
      'The clause that sets that penalty and how it is worked out.' + LITERAL,
    ),
    handsetSubsidised: flag(
      'true when the contract gives a handset or device at a reduced price tied to the commitment (terminal subvencionado); false when it says there is none.',
    ),
    handsetValue: money('The value it states for that handset or device.'),
    priceReviewText: text(
      MAX_TELECOM_CLAUSE_TEXT,
      'The clause on how prices can change (revisión de precios, actualización de tarifas).' +
        LITERAL,
    ),
    priceReviewIndex: oneOf(
      PRICE_INDEXES,
      'What that clause ties a price rise to: ipc (the consumer price index, IPC, alone), ipc_plus (the IPC plus some points), fixed_amount (a fixed amount or percentage), none (it says prices do not change), other.',
    ),
  },
  lists: {},
} as const satisfies SectionSchema;

// One section per kind of document, named after it.
export const TELECOM_SECTIONS = {
  telecom_bill: telecomBill,
  telecom_contract: telecomContract,
} as const satisfies Readonly<
  Record<Exclude<(typeof TELECOM_PAGE_KINDS)[number], 'other'>, SectionSchema>
>;

export type TelecomSectionKind = keyof typeof TELECOM_SECTIONS;

export const TELECOM_READABILITY_DESCRIPTION =
  'ok: legible enough to transcribe, in whatever language. Otherwise the main reason the page cannot be used: handwritten (the values are written by hand), blurry, dark, cropped (the part with the values is cut off), not_telecom_document (not about a phone, mobile or internet service), foreign_jurisdiction (a service contracted outside Spain; never because of its language), unknown_format (about such a service, but no kind of document you know).';
export const TELECOM_PAGE_KIND_DESCRIPTION =
  'telecom_bill: a phone, mobile or internet bill, any of its pages. telecom_contract: the contract of such a service, its conditions or its commitment. other: anything else, such as an electricity bill, a handset receipt or an ID card.';

export const TELECOM_SCHEMA: ReviewSchema = {
  pageKinds: TELECOM_PAGE_KINDS,
  pageKindDescription: TELECOM_PAGE_KIND_DESCRIPTION,
  readability: TELECOM_READABILITY,
  readabilityDescription: TELECOM_READABILITY_DESCRIPTION,
  monthDescription: 'Leave it out: each bill gives its own period in its fields.',
  sections: TELECOM_SECTIONS,
};
