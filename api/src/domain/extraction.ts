import { LIMITS, type PageKind } from './documents';
import {
  CONFIDENCES,
  CREDIT_ITEM_IDS,
  type LineCategory,
  MAX_DAYS,
  MAX_MONEY,
  REVIEW_SCHEMAS,
  sectionsOf,
  type Confidence,
  type FieldType,
  type Readability,
  type SectionKind,
  type ReviewSchema,
  type SectionSchema,
} from './extraction-schema';
import type { ReviewKind } from './reviews';

export type ExtractedValue = string | number | boolean;

export interface ExtractedField {
  readonly value: ExtractedValue;
  readonly confidence: Confidence;
}

export interface ExtractedRow {
  readonly values: Readonly<Record<string, ExtractedValue>>;
  readonly confidence: Confidence;
}

export interface Section {
  readonly fields: Readonly<Record<string, ExtractedField>>;
  readonly lists: Readonly<Record<string, readonly ExtractedRow[]>>;
}

export interface PageReading {
  // 1-based, in the order the files were attached.
  readonly page: number;
  readonly kind: PageKind;
  // Pages of one document share it.
  readonly document: number;
  // A payslip's pay period, YYYY-MM.
  readonly month?: string;
  readonly readability: { readonly value: Readability; readonly confidence: Confidence };
  readonly confidence: Confidence;
}

// What one model read recorded, validated: the kind of every page and one section per document kind.
export interface Reading {
  readonly pages: readonly PageReading[];
  readonly sections: Readonly<Partial<Record<SectionKind, Section>>>;
  // How many pages, fields or rows failed validation and were left out.
  readonly dropped: number;
  // Attached pages the model gave no valid kind for.
  readonly unclassified: number;
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

const isMonth = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) && isCalendarDate(`${v}-01`);

const hasAtMostTwoDecimals = (n: number): boolean => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

const isWhole = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function isValidValue(type: FieldType, v: unknown): v is ExtractedValue {
  switch (type.type) {
    case 'date':
      return typeof v === 'string' && isCalendarDate(v);
    case 'text':
      return (
        typeof v === 'string' &&
        v.length > 0 &&
        v.length <= type.maxLength &&
        (type.pattern === undefined || new RegExp(type.pattern).test(v))
      );
    case 'money':
      return (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        v >= 0 &&
        v <= MAX_MONEY &&
        hasAtMostTwoDecimals(v)
      );
    case 'days':
      return isWhole(v, 0, MAX_DAYS);
    case 'integer':
      return isWhole(v, type.min, type.max);
    case 'percent':
      return (
        typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 && hasAtMostTwoDecimals(v)
      );
    case 'month':
      return isMonth(v);
    case 'boolean':
      return typeof v === 'boolean';
    case 'enum':
      return typeof v === 'string' && type.values.includes(v);
  }
}

// Keeps only what the schema allows; anything else the model returned is ignored, never repaired.
export function parseSection(
  schema: SectionSchema,
  input: Record<string, unknown>,
): { readonly section: Section; readonly dropped: number } {
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

  return { section: { fields, lists }, dropped };
}

const PAGE_KEYS = ['page', 'kind', 'document', 'month', 'readability', 'confidence'];

function parseReadability(
  raw: unknown,
  allowed: readonly Readability[],
): PageReading['readability'] | null {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ['value', 'confidence'])) return null;
  const { value, confidence } = raw;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) return null;
  return isConfidence(confidence) ? { value: value as Readability, confidence } : null;
}

function parsePage(raw: unknown, pageCount: number, schema: ReviewSchema): PageReading | null {
  if (!isRecord(raw) || !hasOnlyKeys(raw, PAGE_KEYS)) return null;
  const { page, kind, document, month, confidence } = raw;
  const readability = parseReadability(raw['readability'], schema.readability);
  if (
    readability === null ||
    !isWhole(page, 1, pageCount) ||
    !isWhole(document, 1, LIMITS.maxImages) ||
    typeof kind !== 'string' ||
    !(schema.pageKinds as readonly string[]).includes(kind) ||
    !isConfidence(confidence) ||
    (month !== undefined && !isMonth(month))
  )
    return null;
  return {
    page,
    kind: kind as PageKind,
    document,
    ...(month !== undefined && { month }),
    readability,
    confidence,
  };
}

export const isReadable = (p: PageReading): boolean => p.readability.value === 'ok';

// `pageCount` is how many pages were attached: page numbers beyond it are invalid.
export function parseReading(
  toolInput: unknown,
  pageCount: number,
  review: ReviewKind = 'final_pay',
): Reading {
  const schema = REVIEW_SCHEMAS[review];
  const input = isRecord(toolInput) ? toolInput : {};
  let dropped = 0;

  const byPage = new Map<number, PageReading>();
  const rawPages = Array.isArray(input['pages']) ? input['pages'] : [];
  if (Object.hasOwn(input, 'pages') && !Array.isArray(input['pages'])) dropped += 1;
  for (const raw of rawPages) {
    const page = parsePage(raw, pageCount, schema);
    // A page classified twice is as unreliable as one classified wrongly.
    if (page === null || byPage.has(page.page)) dropped += 1;
    else byPage.set(page.page, page);
  }
  const pages = [...byPage.values()].sort((a, b) => a.page - b.page);

  const sections: Partial<Record<SectionKind, Section>> = {};
  // Only a page that can be read backs a section: one set aside as blurry, handwritten or
  // foreign is never transcribed.
  const kinds = new Set(pages.filter(isReadable).map((p) => p.kind));
  for (const [kind, section] of sectionsOf(review)) {
    if (!Object.hasOwn(input, kind)) continue;
    const raw = input[kind];
    // A section is a document's transcription: without a page of that kind, it came from nowhere.
    if (!isRecord(raw) || !kinds.has(section.source)) {
      dropped += 1;
      continue;
    }
    const parsed = parseSection(section, raw);
    sections[kind] = parsed.section;
    dropped += parsed.dropped;
  }

  return { pages, sections, dropped, unclassified: pageCount - pages.length };
}

const TOLERANCE_EUROS = 1;
const cents = (n: number): number => Math.round(n * 100);

function num(s: Section | undefined, name: string): number | null {
  const v = s?.fields[name]?.value;
  return typeof v === 'number' ? v : null;
}

function str(s: Section | undefined, name: string): string | null {
  const v = s?.fields[name]?.value;
  return typeof v === 'string' ? v : null;
}

const listSum = (rows: readonly ExtractedRow[] | undefined, field: string): number =>
  (rows ?? []).reduce((sum, r) => {
    const v = r.values[field];
    return sum + (typeof v === 'number' ? cents(v) : 0);
  }, 0);

export const withinTolerance = (a: number, b: number): boolean =>
  Math.abs(cents(a) - cents(b)) <= TOLERANCE_EUROS * 100;

const withinCents = (aCents: number, bCents: number): boolean =>
  Math.abs(aCents - bCents) <= TOLERANCE_EUROS * 100;

// ISO dates compare correctly as strings.
const before = (a: string | null, b: string | null): boolean => a !== null && b !== null && a < b;

// The items of a settlement, or of the payslip that settles it, against its total.
function itemsDoNotSum(s: Section | undefined): boolean {
  // Only a gross total can be checked against the items: a net one has deductions taken off
  // and may hold tax-exempt items besides.
  const total = num(s, 'totalGross');
  const credits = CREDIT_ITEM_IDS.map((id) => num(s, id)).filter((v) => v !== null);
  if (total === null || credits.length === 0) return false;
  const sum =
    credits.reduce((sum, v) => sum + cents(v), 0) + listSum(s?.lists['otherAccruals'], 'amount');
  const deduction = cents(num(s, 'notice_deduction') ?? 0);
  // Some documents print the notice deduction among the gross lines, others below the total.
  return !withinCents(sum, cents(total)) && !withinCents(sum - deduction, cents(total));
}

export function failedChecks(r: Reading): readonly CoherenceCheck[] {
  const failed = new Set<CoherenceCheck>();
  const {
    settlement_proposal: proposal,
    final_payslip: final,
    monthly_payslip: monthly,
  } = r.sections;
  for (const s of [proposal, r.sections.company_certificate])
    if (before(str(s, 'endDate'), str(s, 'startDate'))) failed.add('end_before_start');
  if (itemsDoNotSum(proposal)) failed.add('items_do_not_sum');
  for (const s of [final, monthly]) {
    if (before(str(s, 'periodEnd'), str(s, 'periodStart'))) failed.add('period_end_before_start');
    if (before(str(s, 'periodEnd'), str(s, 'startDate'))) failed.add('start_after_period_end');
    // A payslip's earnings lines add up to its gross total.
    const gross = num(s, 'totalAccrued');
    const lines = s?.lists['lines'] ?? [];
    if (gross !== null && lines.length > 0 && !withinCents(listSum(lines, 'amount'), cents(gross)))
      failed.add('items_do_not_sum');
  }
  const total = num(monthly, 'totalAccrued');
  const prorated = num(monthly, 'extraPayProratedAmount');
  if (total !== null && prorated !== null && prorated > total)
    failed.add('proration_exceeds_total');
  const rows = r.sections.work_history?.lists['contracts'] ?? [];
  if (
    rows.some((row) => {
      const { startDate, endDate } = row.values;
      return typeof startDate === 'string' && typeof endDate === 'string' && endDate < startDate;
    })
  )
    failed.add('contract_end_before_start');
  return [...failed];
}

export function hasLowConfidence(r: Reading): boolean {
  return (
    r.pages.some((p) => p.confidence === 'low' || p.readability.confidence === 'low') ||
    Object.values(r.sections).some(
      (s) =>
        Object.values(s.fields).some((f) => f.confidence === 'low') ||
        Object.values(s.lists).some((rows) => rows.some((row) => row.confidence === 'low')),
    )
  );
}

const RANK: Readonly<Record<Confidence, number>> = { high: 2, medium: 1, low: 0 };
const lowest = (rows: readonly ExtractedRow[]): Confidence =>
  rows.reduce<Confidence>((c, r) => (RANK[r.confidence] < RANK[c] ? r.confidence : c), 'high');

function linesOf(s: Section | undefined, category: LineCategory): readonly ExtractedRow[] {
  return (s?.lists['lines'] ?? []).filter((r) => r.values['category'] === category);
}

// The sum of a category's lines, as the field it fills; none when the payslip has no such line.
function sumOf(rows: readonly ExtractedRow[]): ExtractedField | null {
  if (rows.length === 0) return null;
  return { value: listSum(rows, 'amount') / 100, confidence: lowest(rows) };
}

// The liquidation items of the final payslip, by the category of the lines that make them up.
export const FINAL_PAYSLIP_ITEMS: Readonly<Partial<Record<LineCategory, string>>> = {
  salary: 'pending_salary',
  notice_compensation: 'employer_notice',
  severance: 'severance',
  holiday_pay: 'holiday_pay',
  extra_pay: 'extra_pay',
};

// Adds to the payslips what their lines add up to, in code: the model only copies the lines and
// says what each one pays for. The salary pending at the end is the sum of the final payslip's
// salary lines; notice, severance, holidays and a full extra payment come from their own lines.
export function withLineTotals(r: Reading): Reading {
  const { final_payslip: final, monthly_payslip: monthly } = r.sections;
  const sections = { ...r.sections };
  if (final) {
    const fields: Record<string, ExtractedField> = { ...final.fields };
    for (const [category, field] of Object.entries(FINAL_PAYSLIP_ITEMS)) {
      const sum = sumOf(linesOf(final, category as LineCategory));
      if (sum) fields[field] = sum;
    }
    sections.final_payslip = { ...final, fields };
  }
  const lines = monthly?.lists['lines'] ?? [];
  if (monthly && lines.length > 0) {
    const paid = sumOf(linesOf(monthly, 'extra_pay'));
    sections.monthly_payslip = {
      ...monthly,
      fields: {
        ...monthly.fields,
        extraPayPaid: { value: paid !== null, confidence: lowest(lines) },
        ...(paid && { extraPayAmount: paid }),
      },
    };
  }
  return { ...r, sections };
}
