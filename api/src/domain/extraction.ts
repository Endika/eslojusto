import {
  CONFIDENCES,
  CREDIT_ITEM_IDS,
  MAX_MONEY,
  SCHEMAS,
  type Confidence,
  type FieldType,
} from './extraction-schema';
import type { DocumentKind } from './documents';

export type ExtractedValue = string | number | boolean;

export interface ExtractedField {
  readonly value: ExtractedValue;
  readonly confidence: Confidence;
}

export interface ExtractedRow {
  readonly values: Readonly<Record<string, ExtractedValue>>;
  readonly confidence: Confidence;
}

export interface Extraction {
  readonly kind: DocumentKind;
  readonly fields: Readonly<Record<string, ExtractedField>>;
  readonly lists: Readonly<Record<string, readonly ExtractedRow[]>>;
  // How many fields or rows failed validation and were left out.
  readonly dropped: number;
}

export type CoherenceCheck =
  | 'end_before_start'
  | 'items_do_not_sum'
  | 'period_end_before_start'
  | 'start_after_period_end'
  | 'proration_exceeds_total'
  | 'contract_end_before_start';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Closed objects only: an extra key means the model wandered off the schema.
const hasOnlyKeys = (v: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(v).every((k) => allowed.includes(k));

const isConfidence = (v: unknown): v is Confidence =>
  typeof v === 'string' && (CONFIDENCES as readonly string[]).includes(v);

function isCalendarDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1950 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

const hasAtMostTwoDecimals = (n: number): boolean => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

function isValidValue(type: FieldType, v: unknown): v is ExtractedValue {
  switch (type.type) {
    case 'date':
      return typeof v === 'string' && isCalendarDate(v);
    case 'money':
      return (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        v >= 0 &&
        v <= MAX_MONEY &&
        hasAtMostTwoDecimals(v)
      );
    case 'boolean':
      return typeof v === 'boolean';
    case 'enum':
      return typeof v === 'string' && type.values.includes(v);
  }
}

// Keeps only what the schema allows; anything else the model returned is ignored, never repaired.
export function parseExtraction(kind: DocumentKind, toolInput: unknown): Extraction {
  const schema = SCHEMAS[kind];
  const input = isRecord(toolInput) ? toolInput : {};
  const fields: Record<string, ExtractedField> = {};
  const lists: Record<string, ExtractedRow[]> = {};
  let dropped = 0;

  for (const [name, spec] of Object.entries(schema.fields)) {
    if (!Object.hasOwn(input, name)) continue;
    const raw = input[name];
    if (
      isRecord(raw) &&
      hasOnlyKeys(raw, ['value', 'confidence']) &&
      isConfidence(raw['confidence']) &&
      isValidValue(spec.type, raw['value'])
    )
      fields[name] = { value: raw['value'], confidence: raw['confidence'] };
    else dropped += 1;
  }

  for (const [name, list] of Object.entries(schema.lists)) {
    if (!Object.hasOwn(input, name)) continue;
    const raw = input[name];
    if (!Array.isArray(raw)) {
      dropped += 1;
      continue;
    }
    const rows: ExtractedRow[] = [];
    for (const rawRow of raw.slice(0, list.maxItems)) {
      if (
        !isRecord(rawRow) ||
        !hasOnlyKeys(rawRow, [...Object.keys(list.item), 'confidence']) ||
        !isConfidence(rawRow['confidence'])
      ) {
        dropped += 1;
        continue;
      }
      const values: Record<string, ExtractedValue> = {};
      let rowValid = true;
      for (const [field, spec] of Object.entries(list.item)) {
        const v = rawRow[field];
        if (v === undefined || v === null) {
          if (list.required.includes(field)) rowValid = false;
        } else if (isValidValue(spec.type, v)) values[field] = v;
        else rowValid = false;
      }
      if (rowValid) rows.push({ values, confidence: rawRow['confidence'] });
      else dropped += 1;
    }
    dropped += Math.max(0, raw.length - list.maxItems);
    lists[name] = rows;
  }

  return { kind, fields, lists, dropped };
}

const TOLERANCE_EUROS = 1;
const cents = (n: number): number => Math.round(n * 100);

function num(e: Extraction, name: string): number | null {
  const v = e.fields[name]?.value;
  return typeof v === 'number' ? v : null;
}

function str(e: Extraction, name: string): string | null {
  const v = e.fields[name]?.value;
  return typeof v === 'string' ? v : null;
}

const listSum = (rows: readonly ExtractedRow[] | undefined, field: string): number =>
  (rows ?? []).reduce((sum, r) => {
    const v = r.values[field];
    return sum + (typeof v === 'number' ? cents(v) : 0);
  }, 0);

const within = (aCents: number, bCents: number): boolean =>
  Math.abs(aCents - bCents) <= TOLERANCE_EUROS * 100;

// ISO dates compare correctly as strings.
const before = (a: string | null, b: string | null): boolean => a !== null && b !== null && a < b;

export function failedChecks(e: Extraction): readonly CoherenceCheck[] {
  const failed: CoherenceCheck[] = [];
  if (e.kind === 'settlement') {
    if (before(str(e, 'endDate'), str(e, 'startDate'))) failed.push('end_before_start');
    const total = num(e, 'totalAccrued');
    const credits = CREDIT_ITEM_IDS.map((id) => num(e, id)).filter((v) => v !== null);
    if (total !== null && credits.length > 0) {
      const sum =
        credits.reduce((s, v) => s + cents(v), 0) + listSum(e.lists['otherAccruals'], 'amount');
      const deduction = cents(num(e, 'notice_deduction') ?? 0);
      // Some documents print the notice deduction among the gross lines, others below the total.
      if (!within(sum, cents(total)) && !within(sum - deduction, cents(total)))
        failed.push('items_do_not_sum');
    }
  }
  if (e.kind === 'payslip') {
    if (before(str(e, 'periodEnd'), str(e, 'periodStart'))) failed.push('period_end_before_start');
    if (before(str(e, 'periodEnd'), str(e, 'startDate'))) failed.push('start_after_period_end');
    const total = num(e, 'totalAccrued');
    const accruals = e.lists['accruals'] ?? [];
    if (total !== null && accruals.length > 0 && !within(listSum(accruals, 'amount'), cents(total)))
      failed.push('items_do_not_sum');
    const prorated = num(e, 'extraPayProratedAmount');
    if (total !== null && prorated !== null && prorated > total)
      failed.push('proration_exceeds_total');
  }
  if (e.kind === 'work_history') {
    const rows = e.lists['contracts'] ?? [];
    if (
      rows.some((r) => {
        const { startDate, endDate } = r.values;
        return typeof startDate === 'string' && typeof endDate === 'string' && endDate < startDate;
      })
    )
      failed.push('contract_end_before_start');
  }
  return failed;
}

export function hasLowConfidence(e: Extraction): boolean {
  return (
    Object.values(e.fields).some((f) => f.confidence === 'low') ||
    Object.values(e.lists).some((rows) => rows.some((r) => r.confidence === 'low'))
  );
}
