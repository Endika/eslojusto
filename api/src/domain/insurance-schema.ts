import { INSURANCE_PAGE_KINDS } from './documents';
import type { FieldSpec, ListSpec, ReviewSchema, SectionSchema } from './extraction-schema';
import { INTERMEDIARY_TYPES } from './credit-schema';

// Mirrors of the site's insurance engine unions (src/engine/insurance/types.ts);
// test/insurance-contract.test.ts keeps them equal.
export const INSURANCE_LINES = ['home', 'car', 'life', 'health', 'funeral', 'other'] as const;
export const CAR_COVERS = ['compulsory_only', 'with_voluntary'] as const;

export const POLICY_CHANNELS = ['online', 'phone', 'in_person', 'other'] as const;
export const RENEWAL_NOTICE_MEDIA = ['letter', 'email', 'sms', 'app', 'other'] as const;
export const SUM_INSURED_KINDS = ['building', 'contents', 'liability', 'vehicle', 'other'] as const;

export const INSURANCE_READABILITY = [
  'ok',
  'handwritten',
  'blurry',
  'dark',
  'cropped',
  'not_insurance_document',
  'foreign_jurisdiction',
  'unknown_format',
] as const;

const MAX_NAME = 80;
export const MAX_INSURANCE_CLAUSE_TEXT = 600;

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
): ListSpec => ({ description, maxItems, item, required });

const LITERAL =
  ' Copy it word for word, at most the first characters that fit; never summarise or judge it.';

const insurancePolicy = {
  description:
    'Insurance policy (póliza: condiciones particulares, generales o especiales, certificado o recibo de la póliza).',
  source: 'insurance_policy',
  fields: {
    line: oneOf(
      INSURANCE_LINES,
      'The line of insurance (ramo): home (hogar, multirriesgo del hogar), car (automóvil, vehículo, moto), life (vida), health (salud, asistencia sanitaria), funeral (decesos), other.',
    ),
    carCover: oneOf(
      CAR_COVERS,
      'For a motor policy only: compulsory_only (solo responsabilidad civil obligatoria) or with_voluntary (also voluntary covers: terceros ampliado, todo riesgo, lunas, robo, asistencia).',
    ),
    insurerName: text(
      MAX_NAME,
      'The insurer (aseguradora, entidad aseguradora): its company name as printed.',
    ),
    intermediaryType: oneOf(
      INTERMEDIARY_TYPES,
      'Who the intermediary (mediador, agente, corredor) is, if one appears: person (a natural person) or company.',
    ),
    intermediaryCompanyName: text(
      MAX_NAME,
      'Only when the intermediary is a company: its name as printed. Never the name of a person.',
    ),
    concludedOn: date(
      'Date the policy was taken out or issued (fecha de emisión, de contratación).',
    ),
    effectiveOn: date('Date the current period starts (fecha de efecto).'),
    expiresOn: date('Date the current period ends (fecha de vencimiento).'),
    renews: flag(
      'true when the policy says it extends itself each year (prórroga tácita, renovación automática); false when it says it does not.',
    ),
    premiumNet: money('Net premium of the period (prima neta).'),
    premiumSurcharges: money('Surcharges (recargos: Consorcio, otros), added up as printed.'),
    premiumTaxes: money('Taxes on the premium (impuestos, IPS).'),
    premiumTotal: money('Total premium of the period (prima total, total recibo).'),
    proportionalRuleExcluded: flag(
      'true when the policy says the proportional rule does not apply (sin regla proporcional, a primer riesgo, valor total); false when it says it applies.',
    ),
    proportionalRuleMarginPercent: percent(
      'Margin before the proportional rule applies (margen de tolerancia por infraseguro), 15 % is 15, if stated.',
    ),
    channel: oneOf(
      POLICY_CHANNELS,
      'How the policy was taken out, only if the document states it: online (por internet), phone (por teléfono), in_person (en oficina, presencial), other.',
    ),
    nonRenewalClauseText: text(
      MAX_INSURANCE_CLAUSE_TEXT,
      'The clause on how either party can stop the policy from renewing (oposición a la prórroga, duración del contrato).' +
        LITERAL,
    ),
  },
  lists: {
    sumsInsured: list(
      'Every sum insured (suma asegurada, capital asegurado), one entry each.',
      8,
      {
        kind: oneOf(
          SUM_INSURED_KINDS,
          'building (continente), contents (contenido), liability (responsabilidad civil), vehicle (valor del vehículo), other.',
        ),
        concept: text(MAX_NAME, 'The concept exactly as printed.'),
        amount: money('The sum, in euros.'),
      },
      ['kind', 'amount'],
    ),
  },
} as const satisfies SectionSchema;

const renewalNotice = {
  description:
    'Notice of the policy’s renewal or of changes to it (aviso de renovación, comunicación de modificación de la prima o de las condiciones).',
  source: 'insurance_renewal_notice',
  fields: {
    noticeOn: date('Date of the notice.'),
    noticeMedium: oneOf(RENEWAL_NOTICE_MEDIA, 'How it was sent: letter, email, sms, app or other.'),
    expiresOn: date('Date the current period ends, from which the renewal applies (vencimiento).'),
    previousPremium: money('Total premium of the period that ends.'),
    newPremium: money('Total premium of the new period.'),
    coverChanges: flag(
      'true when it announces changes to covers, excesses or conditions besides the premium (coberturas, franquicias); false when it says there are none.',
    ),
    changesText: text(
      MAX_INSURANCE_CLAUSE_TEXT,
      'What it says changes, besides the premium.' + LITERAL,
    ),
  },
  lists: {},
} as const satisfies SectionSchema;

// One section per kind of document, named after it.
export const INSURANCE_SECTIONS = {
  insurance_policy: insurancePolicy,
  insurance_renewal_notice: renewalNotice,
} as const satisfies Readonly<
  Record<Exclude<(typeof INSURANCE_PAGE_KINDS)[number], 'other'>, SectionSchema>
>;

export type InsuranceSectionKind = keyof typeof INSURANCE_SECTIONS;

export const INSURANCE_READABILITY_DESCRIPTION =
  'ok: legible enough to transcribe, in whatever language. Otherwise the main reason the page cannot be used: handwritten (the values are written by hand), blurry, dark, cropped (the part with the values is cut off), not_insurance_document (not about an insurance policy), foreign_jurisdiction (a policy under the law of another country; never because of its language), unknown_format (about an insurance policy, but no kind of document you know).';
export const INSURANCE_PAGE_KIND_DESCRIPTION =
  'insurance_policy: an insurance policy (póliza), its particular, general or special conditions, certificate or premium receipt. insurance_renewal_notice: a notice that the policy renews or changes (aviso de renovación, de modificación de la prima o de las condiciones). other: anything else, such as an ID card, a claim report or a payslip.';

export const INSURANCE_SCHEMA: ReviewSchema = {
  pageKinds: INSURANCE_PAGE_KINDS,
  pageKindDescription: INSURANCE_PAGE_KIND_DESCRIPTION,
  readability: INSURANCE_READABILITY,
  readabilityDescription: INSURANCE_READABILITY_DESCRIPTION,
  monthDescription: 'Leave it out: no insurance page has a month of its own.',
  sections: INSURANCE_SECTIONS,
};
