import { DOCUMENT_KINDS, type DocumentKind } from './documents';

// Mirrors of the site's engine unions (src/engine/types.ts); test/engine-contract.test.ts keeps them equal.
export const CAUSES = [
  'resignation',
  'fixed_term_end',
  'objective_dismissal',
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
  | { readonly type: 'money' }
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
}

export interface DocumentSchema {
  readonly description: string;
  readonly fields: Readonly<Record<string, FieldSpec>>;
  readonly lists: Readonly<Record<string, ListSpec>>;
}

const date = (description: string): FieldSpec => ({ type: { type: 'date' }, description });
const money = (description: string): FieldSpec => ({ type: { type: 'money' }, description });

export const MAX_MONEY = 1_000_000;

const amountList = (description: string): ListSpec => ({
  description,
  maxItems: 30,
  item: { amount: money('Gross amount of the line, in euros.') },
  required: ['amount'],
});

const DETECTED_KIND: FieldSpec = {
  type: { type: 'enum', values: [...DOCUMENT_KINDS, 'other'] },
  description:
    'What the document actually is: settlement (propuesta de liquidación, finiquito), payslip (nómina), work_history (informe de vida laboral) or other.',
};

const SETTLEMENT: DocumentSchema = {
  description: 'Settlement proposal (propuesta de liquidación / finiquito).',
  fields: {
    detectedKind: DETECTED_KIND,
    startDate: date('Employment start or seniority date (fecha de alta, antigüedad).'),
    endDate: date('Employment end date (fecha de baja, fecha de efectos).'),
    cause: {
      type: { type: 'enum', values: CAUSES },
      description:
        'Termination cause only if the document states it: resignation (baja voluntaria), fixed_term_end (fin de contrato), objective_dismissal (despido objetivo), unfair_dismissal (despido improcedente), disciplinary_dismissal (despido disciplinario).',
    },
    fixedTermType: {
      type: { type: 'enum', values: FIXED_TERM_TYPES },
      description:
        'Type of fixed-term contract only if stated: production_circumstances (circunstancias de la producción), replacement (sustitución), training (formativo).',
    },
    monthlySalary: money('Gross monthly salary, only if printed as such.'),
    pending_salary: money('Salary for the days worked in the last month (salario pendiente).'),
    holiday_pay: money('Untaken holidays paid out (vacaciones no disfrutadas).'),
    extra_pay: money('Accrued share of extra payments (parte proporcional de pagas extra).'),
    severance: money('Severance pay (indemnización por fin de contrato o despido).'),
    employer_notice: money('Pay in lieu of notice owed by the employer (falta de preaviso).'),
    notice_deduction: money(
      'Deduction for notice the worker did not give (descuento por preaviso).',
    ),
    totalAccrued: money('Total gross amount (total devengado, total bruto).'),
  },
  lists: {
    otherAccruals: amountList(
      'Every other gross line (devengo) not recorded in an item field above, one entry per line.',
    ),
  },
};

const PAYSLIP: DocumentSchema = {
  description: 'Payslip (nómina). If several payslips are attached, record the most recent one.',
  fields: {
    detectedKind: DETECTED_KIND,
    periodStart: date('First day of the pay period (periodo de liquidación).'),
    periodEnd: date('Last day of the pay period.'),
    startDate: date('Seniority date (fecha de antigüedad).'),
    totalAccrued: money('Total gross amount of the period (total devengado).'),
    extraPayProrated: {
      type: { type: 'boolean' },
      description: 'Whether a prorated extra payment line (prorrata de pagas extra) is printed.',
    },
    extraPayProratedAmount: money('Amount of the prorated extra payment line.'),
    extraPayPaid: {
      type: { type: 'boolean' },
      description: 'Whether a full extra payment (paga extra) is paid in this period.',
    },
    extraPayAmount: money('Amount of that full extra payment.'),
  },
  lists: {
    accruals: amountList('Every gross line (devengo) of the period, one entry per line.'),
  },
};

const WORK_HISTORY: DocumentSchema = {
  description: 'Social Security work history report (informe de vida laboral).',
  fields: { detectedKind: DETECTED_KIND },
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
};

export const SCHEMAS: Readonly<Record<DocumentKind, DocumentSchema>> = {
  settlement: SETTLEMENT,
  payslip: PAYSLIP,
  work_history: WORK_HISTORY,
};

export const TOOL_NAME = 'record_extraction';

type JsonSchema = Readonly<Record<string, unknown>>;

function valueSchema(type: FieldType): JsonSchema {
  switch (type.type) {
    case 'date':
      return { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' };
    case 'money':
      return { type: 'number', minimum: 0, maximum: MAX_MONEY };
    case 'boolean':
      return { type: 'boolean' };
    case 'enum':
      return { type: 'string', enum: type.values };
  }
}

const confidenceSchema: JsonSchema = { type: 'string', enum: CONFIDENCES };

// The closed JSON schema of the tool input for one document kind.
export function toolInputSchema(kind: DocumentKind): JsonSchema {
  const schema = SCHEMAS[kind];
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
    description: schema.description,
    properties,
    required: ['detectedKind'],
    additionalProperties: false,
  };
}
