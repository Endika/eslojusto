import {
  EMPLOYMENT_PAGE_KINDS,
  FINAL_PAY_PAGE_KINDS,
  LIMITS,
  type PageKind,
  type SourceKind,
} from './documents';
import {
  EMPLOYMENT_PAGE_KIND_DESCRIPTION,
  EMPLOYMENT_SECTIONS,
  type EmploymentSectionKind,
} from './employment-schema';
import {
  CREDIT_READABILITY,
  CREDIT_SCHEMA,
  CREDIT_SECTIONS,
  type CreditSectionKind,
} from './credit-schema';
import {
  INSURANCE_READABILITY,
  INSURANCE_SCHEMA,
  INSURANCE_SECTIONS,
  type InsuranceSectionKind,
} from './insurance-schema';
import {
  MORTGAGE_READABILITY,
  MORTGAGE_SCHEMA,
  MORTGAGE_SECTIONS,
  type MortgageSectionKind,
} from './mortgage-schema';
import {
  RENTAL_READABILITY,
  RENTAL_SCHEMA,
  RENTAL_SECTIONS,
  type RentalSectionKind,
} from './rental-schema';
import type { ReviewKind } from './reviews';

// Mirrors of the site's engine unions (src/engine/types.ts); test/engine-contract.test.ts keeps them equal.
export const CAUSES = [
  'resignation',
  'fixed_term_end',
  'objective_dismissal',
  'collective_dismissal',
  'unfair_dismissal',
  'disciplinary_dismissal',
] as const;
export const FIXED_TERM_TYPES = ['production_circumstances', 'replacement', 'training'] as const;
export const ITEM_IDS = [
  'pending_salary',
  'holiday_pay',
  'extra_pay',
  'severance',
  'employer_notice',
  'notice_deduction',
] as const;
export const CREDIT_ITEM_IDS = [
  'pending_salary',
  'holiday_pay',
  'extra_pay',
  'severance',
  'employer_notice',
] as const;

export const CONFIDENCES = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export type FieldType =
  | { readonly type: 'date' }
  | { readonly type: 'text'; readonly maxLength: number; readonly pattern?: string }
  | { readonly type: 'money' }
  | { readonly type: 'days' }
  | { readonly type: 'integer'; readonly min: number; readonly max: number }
  // At most two decimals.
  | { readonly type: 'decimal'; readonly min: number; readonly max: number }
  // 0 to 100, at most two decimals.
  | { readonly type: 'percent' }
  // An interest rate or its spread: 0 to 100, at most three decimals (Euríbor + 0,875 %).
  | { readonly type: 'rate' }
  // YYYY-MM.
  | { readonly type: 'month' }
  | { readonly type: 'boolean' }
  | { readonly type: 'enum'; readonly values: readonly string[] };

export interface FieldSpec {
  readonly type: FieldType;
  readonly description: string;
}

export interface ListSpec {
  readonly description: string;
  readonly maxItems: number;
  readonly item: Readonly<Record<string, FieldSpec>>;
  readonly required: readonly string[];
  // Past maxItems, the rows kept are those with the latest value of this date or month field,
  // not the first ones sent. Never part of the tool schema.
  readonly keepLatestBy?: string;
}

export interface SectionSchema {
  readonly description: string;
  // The kind of document the section's values come from.
  readonly source: SourceKind;
  readonly fields: Readonly<Record<string, FieldSpec>>;
  readonly lists: Readonly<Record<string, ListSpec>>;
}

const date = (description: string): FieldSpec => ({ type: { type: 'date' }, description });
const money = (description: string): FieldSpec => ({ type: { type: 'money' }, description });
const days = (description: string): FieldSpec => ({ type: { type: 'days' }, description });
const flag = (description: string): FieldSpec => ({ type: { type: 'boolean' }, description });

export const MAX_MONEY = 1_000_000;
export const MAX_DAYS = 366;

// What each earnings line of a payslip pays for. Only `salary` lines make up the salary of the
// period; the items of a liquidation come from the other categories, added up in code.
export const LINE_CATEGORIES = [
  'salary',
  'notice_compensation',
  'severance',
  'holiday_pay',
  'extra_pay',
  'one_off',
  'other',
] as const;
export type LineCategory = (typeof LINE_CATEGORIES)[number];

export const MAX_CONCEPT_LENGTH = 80;

const payslipLines: ListSpec = {
  description:
    'Every earnings line (devengo) of the payslip, one entry per line, in the order printed. Never deductions (IRPF, Seguridad Social, anticipos).',
  maxItems: 30,
  item: {
    concept: {
      type: { type: 'text', maxLength: MAX_CONCEPT_LENGTH },
      description: 'The concept exactly as printed, for example «PLUS TRANSPORTE».',
    },
    amount: money('Amount of the line, in euros.'),
    category: {
      type: { type: 'enum', values: LINE_CATEGORIES },
      description:
        'salary: base salary, pluses and allowances paid for the days of the period, prorated extra pay (PP PAGAS EXTRAS, prorrata pagas extra), teleworking or transport if paid as earnings. notice_compensation: falta de preaviso, indemnización por falta de preaviso. severance: indemnización por despido o fin de contrato. holiday_pay: vacaciones no disfrutadas, vacaciones pendientes. extra_pay: a full extra payment or its liquidation (paga extra de verano, de Navidad, liquidación pagas extras). one_off: a payment that is not for the period, such as a bonus, study aid (ayuda estudios) or backpay (atrasos). other: anything else.',
    },
  },
  required: ['concept', 'amount', 'category'],
};

const amountList = (description: string): ListSpec => ({
  description,
  maxItems: 30,
  item: { amount: money('Gross amount of the line, in euros.') },
  required: ['amount'],
});

const START = date('Employment start or seniority date (fecha de alta, antigüedad).');
const END = date('Employment end date (fecha de baja, fecha de efectos del despido o del cese).');
const CAUSE: FieldSpec = {
  type: { type: 'enum', values: CAUSES },
  description:
    'Termination cause only if the document states it: resignation (baja voluntaria), fixed_term_end (fin de contrato), objective_dismissal (despido objetivo), collective_dismissal (despido colectivo, ERE, expediente de regulación de empleo), unfair_dismissal (despido improcedente, also when the company acknowledges it), disciplinary_dismissal (despido disciplinario).',
};
const FIXED_TERM: FieldSpec = {
  type: { type: 'enum', values: FIXED_TERM_TYPES },
  description:
    'Type of fixed-term contract only if stated: production_circumstances (circunstancias de la producción), replacement (sustitución), training (formativo).',
};
const ITEMS: Readonly<Record<(typeof ITEM_IDS)[number], FieldSpec>> = {
  pending_salary: money('Salary for the days worked in the last month (salario pendiente).'),
  holiday_pay: money('Untaken holidays paid out (vacaciones no disfrutadas).'),
  extra_pay: money('Accrued share of extra payments (parte proporcional de pagas extra).'),
  severance: money('Severance pay (indemnización por fin de contrato o despido).'),
  employer_notice: money('Pay in lieu of notice owed by the employer (falta de preaviso).'),
  notice_deduction: money('Deduction for notice the worker did not give (descuento por preaviso).'),
};
// A settlement often names a concept without its amount, or prints only a net total: an amount
// borrowed from the next line, or a total, is worse than none.
const OWN_AMOUNT =
  ' Only the amount printed next to this very concept; leave the field out when the concept has no amount of its own. Never another line’s amount, never a total.';
const PRINTED_ITEMS = Object.fromEntries(
  Object.entries(ITEMS).map(([id, spec]) => [
    id,
    { ...spec, description: spec.description + OWN_AMOUNT },
  ]),
) as typeof ITEMS;

const HOLIDAYS = {
  annualHolidayDays: days('Holiday days per year, only if printed (días de vacaciones al año).'),
  holidayDaysTaken: days('Holiday days already taken this year, only if printed.'),
};
const PERIOD = {
  periodStart: date('First day of the pay period (periodo de liquidación).'),
  periodEnd: date('Last day of the pay period.'),
};

// One section per kind of document; a document of each kind is transcribed into its section, so
// every value keeps the document it came from. Which one wins is decided after the read.
export const SECTIONS = {
  settlement_proposal: {
    description:
      'Settlement proposal or notification (propuesta o notificación de finiquito, «liquidación, saldo y finiquito»), with or without amounts per concept.',
    source: 'settlement_proposal',
    fields: {
      startDate: START,
      endDate: END,
      cause: CAUSE,
      fixedTermType: FIXED_TERM,
      monthlySalary: money('Gross monthly salary, only if printed as such.'),
      ...PRINTED_ITEMS,
      ...HOLIDAYS,
      totalGross: money(
        'Total GROSS amount, before deductions (total devengado, total bruto), only if printed as such.',
      ),
      totalNet: money(
        'Total NET amount to be paid, after deductions (líquido a percibir, total neto, a percibir).',
      ),
    },
    lists: {
      otherAccruals: amountList(
        'Every other gross line (devengo) not recorded in an item field above, one entry per line.',
      ),
    },
  },
  final_payslip: {
    description:
      'The final payslip that settles the employment (nómina de liquidación, nómina del finiquito): its items are worked out from its lines.',
    source: 'payslip',
    fields: {
      ...PERIOD,
      startDate: date('Seniority date (fecha de antigüedad).'),
      ...HOLIDAYS,
      totalAccrued: money('Total gross amount (total devengado).'),
    },
    lists: { lines: payslipLines },
  },
  monthly_payslip: {
    description:
      'The most recent ordinary payslip (nómina) whose period is one whole calendar month, from its first to its last day.',
    source: 'payslip',
    fields: {
      ...PERIOD,
      startDate: date('Seniority date (fecha de antigüedad).'),
      totalAccrued: money('Total gross amount of the period (total devengado).'),
      extraPayProrated: flag(
        'true when a line prorates the extra payments, such as «PP PAGAS EXTRAS», «P.P. EXTRAS» or «prorrata pagas extra»; false when the payslip has no such line. Required whenever the payslip has lines.',
      ),
      extraPayProratedAmount: money('Amount of that prorated extra payment line.'),
    },
    lists: { lines: payslipLines },
  },
  dismissal_letter: {
    description: 'Dismissal letter or termination notice (carta de despido, comunicación de cese).',
    source: 'dismissal_letter',
    fields: {
      endDate: END,
      cause: CAUSE,
      fixedTermType: FIXED_TERM,
      severance: ITEMS.severance,
      employer_notice: ITEMS.employer_notice,
      noticeDaysReceived: days(
        'Days of notice actually GIVEN: days the worker kept working between being notified and the end date (fecha de efectos). 0 when the dismissal takes effect the same day as the notification and the notice is paid instead. Never the days of notice paid as compensation.',
      ),
      noticeDaysPaid: days(
        'Days of notice PAID instead of given (indemnización por falta de preaviso, «se le abonan 15 días de preaviso»), only if stated as a number of days.',
      ),
    },
    lists: {},
  },
  company_certificate: {
    description:
      'Company certificate for the public employment service (certificado de empresa, SEPE header, bases de cotización de los últimos 180 días).',
    source: 'company_certificate',
    fields: { startDate: START, endDate: END, cause: CAUSE, fixedTermType: FIXED_TERM },
    lists: {},
  },
  settlement_agreement: {
    description:
      'Agreement or conciliation record ending the dispute (acuerdo, acta de conciliación).',
    source: 'settlement_agreement',
    fields: {
      endDate: END,
      cause: CAUSE,
      severanceTotal: money(
        'Total amount the agreement gives as severance (indemnización total pactada), only if stated as one figure.',
      ),
    },
    lists: {},
  },
  work_history: {
    description: 'Social Security work history report (informe de vida laboral).',
    source: 'work_history',
    fields: {},
    lists: {
      contracts: {
        description: 'Every employment period listed, one entry per row.',
        maxItems: 60,
        item: {
          startDate: date('Start date of the period (fecha de alta).'),
          endDate: date('End date of the period (fecha de baja); omit while still active.'),
        },
        required: ['startDate'],
      },
    },
  },
} as const satisfies Readonly<Record<string, SectionSchema>>;

export type FinalPaySectionKind = keyof typeof SECTIONS;
export type SectionKind =
  | FinalPaySectionKind
  | RentalSectionKind
  | EmploymentSectionKind
  | CreditSectionKind
  | InsuranceSectionKind
  | MortgageSectionKind;
export const SECTION_KINDS = Object.keys(SECTIONS) as readonly FinalPaySectionKind[];

export const PAGES_DESCRIPTION =
  'One entry per attached page, in order: its kind, the number of its document and its readability.';

// Why a page can't be used, or `ok`. Its language is never a reason.
export const FINAL_PAY_READABILITY = [
  'ok',
  'handwritten',
  'blurry',
  'dark',
  'cropped',
  'not_labour_document',
  'foreign_jurisdiction',
  'unknown_format',
] as const;
// Every reason the final pay, the rental and the employment review can give.
export const READABILITY = [
  'ok',
  'handwritten',
  'blurry',
  'dark',
  'cropped',
  'not_labour_document',
  'not_rental_document',
  'foreign_jurisdiction',
  'unknown_format',
] as const satisfies readonly (
  (typeof FINAL_PAY_READABILITY)[number] | (typeof RENTAL_READABILITY)[number]
)[];
// Every reason any review can give: the credit and the insurance review's too. The site's
// documents client mirrors this list (src/documents/contract.ts).
export const ALL_READABILITY = [
  ...READABILITY,
  'not_credit_document',
  'not_insurance_document',
] as const satisfies readonly (
  | (typeof READABILITY)[number]
  | (typeof CREDIT_READABILITY)[number]
  | (typeof INSURANCE_READABILITY)[number]
)[];
// The mortgage review's reason joins that list once the site reads its documents.
export type Readability = (typeof ALL_READABILITY)[number] | (typeof MORTGAGE_READABILITY)[number];

export const READABILITY_DESCRIPTION =
  'ok: legible enough to transcribe, in whatever language. Otherwise the main reason the page cannot be used: handwritten (the values are written by hand), blurry, dark, cropped (the part with the values is cut off), not_labour_document (not about a job), foreign_jurisdiction (an employment document from another country, where Spanish law does not apply; never because of its language), unknown_format (about a job, but no kind of document you know).';
export const PAGE_KIND_DESCRIPTION =
  'settlement_proposal: a settlement proposal or notification (propuesta o notificación de finiquito, «liquidación, saldo y finiquito»), listing the liquidation concepts (salario del mes, vacaciones, partes proporcionales, indemnización, preaviso), with or without amounts, and a total, often net. payslip: a nómina with the earnings and deductions of a pay period, the final liquidation payslip included. dismissal_letter: a dismissal letter or termination notice (carta de despido). company_certificate: the company certificate for the public employment service (certificado de empresa): a Ministerio de Trabajo or SEPE header and a table of «bases de cotización de los últimos 180 días»; never a payslip, despite its monthly amounts. settlement_agreement: an agreement or conciliation record (acuerdo, acta de conciliación). work_history: the Social Security work history (vida laboral). other: anything else, such as a tax withholding certificate (certificado de retenciones del IRPF).';

const FINAL_PAY_MONTH_DESCRIPTION =
  'For a payslip page only: the month of its pay period, as YYYY-MM.';

// What a review asks the model for: its page kinds, its reasons to set a page aside and one
// section per kind of document.
export interface ReviewSchema {
  readonly pageKinds: readonly PageKind[];
  readonly pageKindDescription: string;
  readonly readability: readonly Readability[];
  readonly readabilityDescription: string;
  readonly monthDescription: string;
  readonly sections: Readonly<Partial<Record<SectionKind, SectionSchema>>>;
}

export const REVIEW_SCHEMAS: Readonly<Record<ReviewKind, ReviewSchema>> = {
  final_pay: {
    pageKinds: FINAL_PAY_PAGE_KINDS,
    pageKindDescription: PAGE_KIND_DESCRIPTION,
    readability: FINAL_PAY_READABILITY,
    readabilityDescription: READABILITY_DESCRIPTION,
    monthDescription: FINAL_PAY_MONTH_DESCRIPTION,
    sections: SECTIONS,
  },
  rental: RENTAL_SCHEMA,
  // Its readability is the final pay's: every page of the pack is about a job.
  employment: {
    pageKinds: EMPLOYMENT_PAGE_KINDS,
    pageKindDescription: EMPLOYMENT_PAGE_KIND_DESCRIPTION,
    readability: FINAL_PAY_READABILITY,
    readabilityDescription: READABILITY_DESCRIPTION,
    monthDescription: FINAL_PAY_MONTH_DESCRIPTION,
    sections: EMPLOYMENT_SECTIONS,
  },
  credit: CREDIT_SCHEMA,
  insurance: INSURANCE_SCHEMA,
  mortgage: MORTGAGE_SCHEMA,
};

// Every review's sections, by kind.
export const ALL_SECTIONS: Readonly<Record<SectionKind, SectionSchema>> = {
  ...SECTIONS,
  ...RENTAL_SECTIONS,
  ...EMPLOYMENT_SECTIONS,
  ...CREDIT_SECTIONS,
  ...INSURANCE_SECTIONS,
  ...MORTGAGE_SECTIONS,
};

export const sectionsOf = (review: ReviewKind): readonly [SectionKind, SectionSchema][] =>
  Object.entries(REVIEW_SCHEMAS[review].sections) as [SectionKind, SectionSchema][];

export const TOOL_NAME = 'record_extraction';

type JsonSchema = Readonly<Record<string, unknown>>;

function valueSchema(type: FieldType): JsonSchema {
  switch (type.type) {
    case 'date':
      return { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' };
    case 'text':
      return {
        type: 'string',
        minLength: 1,
        maxLength: type.maxLength,
        ...(type.pattern !== undefined && { pattern: type.pattern }),
      };
    case 'money':
      return { type: 'number', minimum: 0, maximum: MAX_MONEY };
    case 'days':
      return { type: 'integer', minimum: 0, maximum: MAX_DAYS };
    case 'integer':
      return { type: 'integer', minimum: type.min, maximum: type.max };
    case 'decimal':
      return { type: 'number', minimum: type.min, maximum: type.max };
    case 'percent':
    case 'rate':
      return { type: 'number', minimum: 0, maximum: 100 };
    case 'month':
      return { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' };
    case 'boolean':
      return { type: 'boolean' };
    case 'enum':
      return { type: 'string', enum: type.values };
  }
}

const confidenceSchema: JsonSchema = { type: 'string', enum: CONFIDENCES };

function sectionSchema(schema: SectionSchema): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const [name, spec] of Object.entries(schema.fields)) {
    properties[name] = {
      type: 'object',
      description: spec.description,
      properties: { value: valueSchema(spec.type), confidence: confidenceSchema },
      required: ['value', 'confidence'],
      additionalProperties: false,
    };
  }
  for (const [name, list] of Object.entries(schema.lists)) {
    const itemProperties: Record<string, JsonSchema> = { confidence: confidenceSchema };
    for (const [field, spec] of Object.entries(list.item)) {
      itemProperties[field] = { ...valueSchema(spec.type), description: spec.description };
    }
    properties[name] = {
      type: 'array',
      description: list.description,
      maxItems: list.maxItems,
      items: {
        type: 'object',
        properties: itemProperties,
        required: [...list.required, 'confidence'],
        additionalProperties: false,
      },
    };
  }
  return {
    type: 'object',
    description: `${schema.description} Leave the section out when no attached document is one.`,
    properties,
    additionalProperties: false,
  };
}

// The closed JSON schema of the tool input: every page's kind, then one section per document kind.
export function toolInputSchema(review: ReviewKind): JsonSchema {
  const schema = REVIEW_SCHEMAS[review];
  const page = {
    type: 'integer',
    minimum: 1,
    maximum: LIMITS.maxImages,
  };
  const properties: Record<string, JsonSchema> = {
    pages: {
      type: 'array',
      description: PAGES_DESCRIPTION,
      maxItems: LIMITS.maxImages,
      items: {
        type: 'object',
        properties: {
          page: { ...page, description: 'The number given before the page.' },
          kind: { type: 'string', enum: schema.pageKinds, description: schema.pageKindDescription },
          document: {
            ...page,
            description:
              'Number the documents in order of appearance; all pages of one document get the same number.',
          },
          readability: {
            type: 'object',
            description: schema.readabilityDescription,
            properties: {
              value: { type: 'string', enum: schema.readability },
              confidence: confidenceSchema,
            },
            required: ['value', 'confidence'],
            additionalProperties: false,
          },
          month: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}$',
            description: schema.monthDescription,
          },
          confidence: confidenceSchema,
        },
        required: ['page', 'kind', 'document', 'readability', 'confidence'],
        additionalProperties: false,
      },
    },
  };
  for (const [kind, section] of sectionsOf(review)) properties[kind] = sectionSchema(section);
  return {
    type: 'object',
    properties,
    required: ['pages'],
    additionalProperties: false,
  };
}
