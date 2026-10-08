import { formatAmountInput } from '../calculator/number';
import {
  RENTAL_CHECKS,
  type Confidence,
  type ExtractedRow,
  type ExtractedValue,
  type FailedCheck,
  type RentalExtraction,
  type SourcedField,
} from '../documents/contract';
import type { ReadMark, ReadPrefill } from '../documents/ports';
import { conflictLines, RENTAL_CONFLICT_FIELDS } from '../documents/summary';
import { compareDates, parseDate, toIso, type CivilDate } from '../engine/date';
import type { RegionCode } from '../engine/rental/types';
import type { Translate } from '../i18n/client';
import {
  CHARGE_KINDS,
  CONTRACT_TYPES,
  DATED_NOTICES,
  DEDUCTION_KINDS,
  FEE_KINDS,
  GUARANTEE_KINDS,
  UPDATE_CLAUSES,
} from './form';
import { ROW_MAX, rowField, type RowList } from './rows';

// The questions beside which the contract's own words are shown, so the person can check the
// answer against them.
export const QUOTED = ['updateClause', 'hasFees', 'hasCharges'] as const;
export type Quoted = (typeof QUOTED)[number];

export interface RentalPrefill extends ReadPrefill {
  readonly quotes: Readonly<Partial<Record<Quoted, string>>>;
}

const RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };
const lowest = (...cs: Confidence[]): Confidence =>
  cs.reduce((a, b) => (RANK[b] < RANK[a] ? b : a), 'high');

const isNumber = (v: ExtractedValue | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const amountOf = (v: ExtractedValue | undefined): number | null =>
  isNumber(v) && v > 0 ? Math.round(v * 100) / 100 : null;
const wholeOf = (v: ExtractedValue | undefined): number | null =>
  isNumber(v) && Number.isInteger(v) ? v : null;
const textOf = (v: ExtractedValue | undefined): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
const oneOf = <T extends string>(v: ExtractedValue | undefined, options: readonly T[]): T | null =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : null;

function dateOf(v: ExtractedValue | undefined): CivilDate | null {
  if (typeof v !== 'string') return null;
  try {
    return parseDate(v);
  } catch {
    return null;
  }
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthOf = (v: ExtractedValue | undefined): string | null =>
  typeof v === 'string' && MONTH.test(v) ? v : null;
const monthIndex = (month: string): number =>
  Number(month.slice(0, 4)) * 12 + Number(month.slice(5));

// The provinces of each autonomous community, by the first two digits of their postcodes (INE
// province codes).
const REGION_PROVINCES: Readonly<Record<RegionCode, readonly number[]>> = {
  AN: [4, 11, 14, 18, 21, 23, 29, 41],
  AR: [22, 44, 50],
  AS: [33],
  IB: [7],
  CN: [35, 38],
  CB: [39],
  CL: [5, 9, 24, 34, 37, 40, 42, 47, 49],
  CM: [2, 13, 16, 19, 45],
  CT: [8, 17, 25, 43],
  VC: [3, 12, 46],
  EX: [6, 10],
  GA: [15, 27, 32, 36],
  MD: [28],
  MC: [30],
  NC: [31],
  PV: [1, 20, 48],
  RI: [26],
  CE: [51],
  ML: [52],
};

export function regionOfPostcode(postcode: string): RegionCode | null {
  if (!/^\d{5}$/.test(postcode)) return null;
  const province = Number(postcode.slice(0, 2));
  const found = Object.entries(REGION_PROVINCES).find(([, provinces]) =>
    provinces.includes(province),
  );
  return found ? (found[0] as RegionCode) : null;
}

// A rise first charged in the month before an anniversary belongs to it; one within this many
// months before it may still, so its year is to be checked.
export const EARLY_MONTHS = 1;
export const DOUBT_MONTHS = 3;

// The anniversary year a rise belongs to, counted in months: the latest anniversary month on or
// before the month it applies from (the notice's when it gives one, otherwise the first month
// charged). In the month just before the next anniversary it belongs to that one, and in the
// months before that it keeps the latest one; either way the year is in doubt.
export function riseYear(
  start: CivilDate,
  from: CivilDate,
): { readonly year: number; readonly doubtful: boolean } {
  const month = from.y * 12 + from.m;
  const anniversary = (y: number) => y * 12 + start.m;
  const latest = anniversary(from.y) <= month ? from.y : from.y - 1;
  const ahead = anniversary(latest + 1) - month;
  if (latest <= start.y || ahead <= EARLY_MONTHS)
    return { year: Math.max(latest + 1, start.y + 1), doubtful: true };
  return { year: latest, doubtful: ahead <= DOUBT_MONTHS };
}

// One receipt per month. Two that state the same month differently leave the month in doubt:
// the receipt document's row is kept over any other, at low confidence.
export function receiptsByMonth(receipts: readonly ExtractedRow[]): {
  readonly months: ReadonlyMap<string, ExtractedRow>;
  readonly disagree: boolean;
} {
  const ordered = [...receipts].sort(
    (a, b) => Number(b.source === 'rent_receipt') - Number(a.source === 'rent_receipt'),
  );
  const months = new Map<string, ExtractedRow>();
  let disagree = false;
  for (const row of ordered) {
    const month = monthOf(row.values['month']);
    if (!month) continue;
    const kept = months.get(month);
    if (!kept) months.set(month, row);
    else if (JSON.stringify(kept.values) !== JSON.stringify(row.values)) {
      disagree = true;
      months.set(month, { ...kept, confidence: 'low' });
    }
  }
  return { months, disagree };
}

// A change of rent seen in the receipts: the first month at the new rent, and the rent before it.
interface RentChange {
  readonly month: string;
  readonly previous: number;
  readonly next: number;
  readonly confidence: Confidence;
  // The month of the receipt before it, when months between them are missing.
  readonly gapAfter: string | null;
}

const sameRent = (a: number, b: number) => Math.abs(a - b) < 0.005;
const toMonth = (d: CivilDate) => `${d.y}-${String(d.m).padStart(2, '0')}`;

// Every month the rent charged changed. A month whose very next month is back at the rent before
// it is a one-off, no change; a gap between receipts never hides one. The month the contract
// started, when it did not start on the 1st, is prorated and left out, as is any before it. A
// change after a gap in the receipts may have come in any month of the gap, so it is less sure.
export function rentChanges(
  months: ReadonlyMap<string, ExtractedRow>,
  start: CivilDate | null = null,
): RentChange[] {
  const first = start ? (start.d > 1 ? toMonth(start) : null) : null;
  const sorted = [...months.entries()]
    .flatMap(([month, row]) => {
      const rent = amountOf(row.values['rent']);
      const before = start !== null && month < toMonth(start);
      return rent === null || before || month === first
        ? []
        : [{ month, rent, confidence: row.confidence }];
    })
    .sort((a, b) => (a.month < b.month ? -1 : 1));
  const changes: RentChange[] = [];
  let current = sorted[0];
  sorted.forEach((r, i) => {
    if (!current || sameRent(current.rent, r.rent)) return;
    // A one-off month: the very next month is back at the rent before it.
    const after = sorted[i + 1];
    const oneOff =
      after !== undefined &&
      monthIndex(after.month) === monthIndex(r.month) + 1 &&
      sameRent(after.rent, current.rent);
    if (oneOff) return;
    const gap = monthIndex(r.month) - monthIndex(sorted[i - 1]?.month ?? r.month) > 1;
    changes.push({
      month: r.month,
      previous: current.rent,
      next: r.rent,
      confidence: gap ? 'low' : lowest(r.confidence, current.confidence),
      gapAfter: gap ? (sorted[i - 1]?.month ?? null) : null,
    });
    current = r;
  });
  return changes;
}

// What a receipt line is called on the charges sheet; utilities and other lines are not charges.
const RECEIPT_CHARGES = {
  community: 'community',
  propertyTax: 'property_tax',
  waste: 'waste',
} as const;

class Answers {
  readonly entries: [string, string][] = [];
  readonly marks: ReadMark[] = [];
  cut = false;

  // An answer read, or worked out from what was read, marked as such.
  read(name: string, value: string, confidence: Confidence, derived = false) {
    this.entries.push([name, value]);
    this.marks.push({
      id: name,
      container: `[data-field="${name}"]`,
      confidence,
      ...(derived && { derived: true as const }),
    });
  }

  // An answer that only opens what was read, such as «Sí, añadirlas» above its rows.
  open(name: string, value: string) {
    this.entries.push([name, value]);
  }

  // At most as many rows as the list holds; the rest is said, never dropped quietly.
  rows<T>(list: RowList, items: readonly T[]): readonly T[] {
    if (items.length > ROW_MAX[list]) this.cut = true;
    return items.slice(0, ROW_MAX[list]);
  }
}

const amountText = formatAmountInput;

function contract(a: Answers, fields: RentalExtraction['fields']) {
  const field = (name: keyof RentalExtraction['fields']): SourcedField | undefined => fields[name];
  const use = field('use');
  const type = oneOf(use?.value, CONTRACT_TYPES);
  if (use && type) a.read('contractType', type, use.confidence);
  for (const name of ['signedOn', 'startDate'] as const) {
    const f = field(name);
    if (f && dateOf(f.value)) a.read(name, String(f.value), f.confidence);
  }
  const landlord = field('landlordType');
  const landlordType = oneOf(landlord?.value, ['person', 'company'] as const);
  if (landlord && landlordType) a.read('landlordType', landlordType, landlord.confidence);
  const postcode = field('postcode');
  const region = typeof postcode?.value === 'string' ? regionOfPostcode(postcode.value) : null;
  if (postcode && region) a.read('region', region, postcode.confidence, true);

  const deposit = field('deposit');
  const depositAmount = amountOf(deposit?.value);
  if (deposit && depositAmount !== null)
    a.read('deposit', amountText(depositAmount), deposit.confidence);
  // The contract counts the months paid beyond the first; the form counts the first too. Whether
  // the contract meant the first is not always plain, so this is never more than fairly sure.
  const advance = field('advanceMonths');
  const advanceMonths = wholeOf(advance?.value);
  if (advance && advanceMonths !== null && advanceMonths >= 0)
    a.read('advanceMonths', String(advanceMonths + 1), lowest(advance.confidence, 'medium'), true);

  const rent = field('initialRent');
  const rentAmount = amountOf(rent?.value);
  if (rent && rentAmount !== null) a.read('initialRent', amountText(rentAmount), rent.confidence);
  const months = field('agreedMonths');
  const agreed = wholeOf(months?.value);
  if (months && agreed !== null && agreed > 0)
    a.read('agreedMonths', String(agreed), months.confidence);
  const clause = field('updateClauseIndex');
  const clauseValue = oneOf(clause?.value, UPDATE_CLAUSES);
  if (clause && clauseValue) a.read('updateClause', clauseValue, clause.confidence);
  const percent = field('updateFixedPercent');
  if (clauseValue === 'fixed_percent' && percent && isNumber(percent.value))
    a.read('fixedPercent', amountText(percent.value), percent.confidence);
}

function guarantees(a: Answers, rows: readonly ExtractedRow[], rent: number | null) {
  const read = a.rows(
    'guarantees',
    rows.filter((r) => oneOf(r.values['kind'], GUARANTEE_KINDS)),
  );
  if (read.length === 0) return;
  a.open('hasGuarantees', 'yes');
  read.forEach((row, i) => {
    const field = (key: string) => rowField('guarantees', i, key);
    a.read(field('kind'), String(row.values['kind']), row.confidence);
    const amount = amountOf(row.values['amount']);
    const months = wholeOf(row.values['months']);
    if (amount !== null) a.read(field('amount'), amountText(amount), row.confidence);
    else if (months !== null && rent !== null)
      a.read(field('amount'), amountText(months * rent), row.confidence, true);
  });
}

// An invoice whose base and VAT do not add up to its total, as the API checks it.
const INVOICE_TOLERANCE = 0.05;
function totalMismatch(row: ExtractedRow): boolean {
  const [base, vat, total] = ['base', 'vat', 'total'].map((k) => row.values[k]);
  return (
    isNumber(base) &&
    isNumber(vat) &&
    isNumber(total) &&
    Math.abs(base + vat - total) > INVOICE_TOLERANCE
  );
}

// Each invoice is a fee paid on moving in, for what it says it charges in total. When the API
// found an invoice that does not add up, its amount is to be checked.
function fees(a: Answers, invoices: readonly ExtractedRow[], mismatch: boolean) {
  const read = a.rows('fees', invoices);
  if (read.length === 0) return;
  a.open('hasFees', 'yes');
  const located = read.some(totalMismatch);
  read.forEach((row, i) => {
    const field = (key: string) => rowField('fees', i, key);
    const kind = oneOf(row.values['conceptKind'], FEE_KINDS);
    if (kind) a.read(field('kind'), kind, row.confidence);
    const doubtful = mismatch && (!located || totalMismatch(row));
    const confidence = doubtful ? 'low' : row.confidence;
    const total = amountOf(row.values['total']);
    const base = amountOf(row.values['base']);
    const vat = amountOf(row.values['vat']) ?? 0;
    if (total !== null) a.read(field('amount'), amountText(total), confidence);
    else if (base !== null) a.read(field('amount'), amountText(base + vat), confidence, true);
  });
}

interface Rise {
  readonly chargedFrom: CivilDate | null;
  // The day the rise applies from, as the notice says it.
  readonly appliesFrom: CivilDate | null;
  readonly previous: number | null;
  readonly previousDerived: boolean;
  readonly next: number | null;
  readonly nextDerived: boolean;
  readonly notice: (typeof DATED_NOTICES)[number] | null;
  readonly noticeOn: CivilDate | null;
  readonly confidence: Confidence;
  // How sure what was worked out from the receipts is.
  readonly worked: Confidence;
  // When the receipts skip months before it: the last month read at the earlier rent.
  readonly gapAfter: string | null;
}

// In months missing between two receipts, the rise may have come with any anniversary among
// them: the latest one, which is still only a guess.
function anniversaryInGap(start: CivilDate, after: string, month: string): number | null {
  for (let y = Number(month.slice(0, 4)); y > start.y; y -= 1) {
    const at = y * 12 + start.m;
    if (at <= monthIndex(after)) return null;
    if (at <= monthIndex(month)) return y;
  }
  return null;
}

const firstOfMonth = (month: string): CivilDate => parseDate(`${month}-01`);
// The API's own tolerance between a notice's rent and the rent it works out.
const NOTICE_TOLERANCE = 1;

const isDecrease = (r: Rise) => r.previous !== null && r.next !== null && r.next < r.previous;

// Each notice, with the first receipt at its new rent (within a euro, or else in the month it
// applies from) as the month it was charged from; a change in the receipts no notice speaks of is
// a rise of its own.
function rises(notices: readonly ExtractedRow[], changes: readonly RentChange[]): Rise[] {
  const unmatched = [...changes];
  const take = (found: (c: RentChange) => boolean) => {
    const at = unmatched.findIndex(found);
    return at >= 0 ? unmatched.splice(at, 1)[0] : undefined;
  };
  const fromNotices = notices.map((row): Rise => {
    const v = row.values;
    const previousRead = amountOf(v['previousRent']);
    const percent = isNumber(v['percent']) ? v['percent'] : null;
    const nextRead = amountOf(v['newRent']);
    const next =
      nextRead ??
      (previousRead !== null && percent !== null
        ? Math.round(previousRead * (1 + percent / 100) * 100) / 100
        : null);
    const applies = dateOf(v['appliesFrom']);
    const change =
      (next !== null ? take((c) => Math.abs(c.next - next) <= NOTICE_TOLERANCE) : undefined) ??
      (applies !== null ? take((c) => c.month === toMonth(applies)) : undefined);
    return {
      chargedFrom: change ? firstOfMonth(change.month) : applies,
      appliesFrom: applies,
      gapAfter: change?.gapAfter ?? null,
      previous: previousRead ?? change?.previous ?? null,
      previousDerived: previousRead === null,
      next: next ?? change?.next ?? null,
      nextDerived: nextRead === null,
      notice: oneOf(v['medium'], DATED_NOTICES),
      noticeOn: dateOf(v['noticeOn']),
      confidence: row.confidence,
      // Without a receipt at the new rent, the notice's own date is all there is to go by.
      worked: change ? lowest(change.confidence, row.confidence) : 'low',
    };
  });
  const fromReceipts = unmatched.map((c): Rise => ({
    chargedFrom: firstOfMonth(c.month),
    appliesFrom: null,
    gapAfter: c.gapAfter,
    previous: c.previous,
    previousDerived: true,
    next: c.next,
    nextDerived: true,
    notice: null,
    noticeOn: null,
    confidence: c.confidence,
    worked: c.confidence,
  }));
  const day = (r: Rise) => r.chargedFrom ?? r.noticeOn;
  return [...fromNotices, ...fromReceipts].sort((x, y) => {
    const [a, b] = [day(x), day(y)];
    return a && b ? compareDates(a, b) : a ? -1 : b ? 1 : 0;
  });
}

// The rises on their sheet; a rent that went down is no rise, and is only said.
function updates(a: Answers, all: readonly Rise[], start: CivilDate | null): boolean {
  const read = a.rows(
    'updates',
    all.filter((r) => !isDecrease(r)),
  );
  read.forEach((r, i) => {
    if (i === 0) a.open('hasUpdates', 'yes');
    const field = (key: string) => rowField('updates', i, key);
    const from = r.appliesFrom ?? r.chargedFrom ?? r.noticeOn;
    const inGap =
      start && !r.appliesFrom && r.chargedFrom && r.gapAfter
        ? anniversaryInGap(start, r.gapAfter, toMonth(r.chargedFrom))
        : null;
    if (from) {
      const belongs =
        inGap !== null ? { year: inGap, doubtful: true } : start ? riseYear(start, from) : null;
      a.read(
        field('year'),
        String(belongs ? belongs.year : from.y),
        belongs && !belongs.doubtful ? r.worked : 'low',
        true,
      );
    }
    if (r.chargedFrom) a.read(field('chargedFrom'), toIso(r.chargedFrom), r.worked, true);
    if (r.previous !== null)
      a.read(
        field('previousRent'),
        amountText(r.previous),
        r.previousDerived ? r.worked : r.confidence,
        r.previousDerived,
      );
    if (r.next !== null)
      a.read(
        field('newRent'),
        amountText(r.next),
        r.nextDerived ? lowest(r.worked, r.confidence) : r.confidence,
        r.nextDerived,
      );
    if (r.notice) a.read(field('notice'), r.notice, r.confidence);
    if (r.noticeOn) a.read(field('noticeOn'), toIso(r.noticeOn), r.confidence);
  });
  return all.some(isDecrease);
}

interface ChargeYear {
  readonly year: number;
  readonly amount: number;
  readonly confidence: Confidence;
}

// What the receipts charged each calendar year, concept by concept, one receipt per month;
// whether they carry lines that are no charge of the review's.
function receiptCharges(months: ReadonlyMap<string, ExtractedRow>) {
  const sums = new Map<string, Map<number, ChargeYear>>();
  let otherLines = false;
  for (const [month, row] of months) {
    const year = Number(month.slice(0, 4));
    if (amountOf(row.values['utilities']) !== null || amountOf(row.values['other']) !== null)
      otherLines = true;
    for (const [line, kind] of Object.entries(RECEIPT_CHARGES)) {
      const amount = amountOf(row.values[line]);
      if (amount === null) continue;
      const years = sums.get(kind) ?? new Map<number, ChargeYear>();
      const sum = years.get(year);
      years.set(year, {
        year,
        amount: Math.round(((sum?.amount ?? 0) + amount) * 100) / 100,
        confidence: lowest(sum?.confidence ?? 'high', row.confidence),
      });
      sums.set(kind, years);
    }
  }
  return { sums, otherLines };
}

interface ChargeTerms {
  readonly confidence: Confidence;
  readonly annual: number | null;
  // The contract names more than one amount for the concept, added up here.
  readonly summed: boolean;
}

interface ChargeRow {
  readonly kind: (typeof CHARGE_KINDS)[number];
  readonly terms: ChargeTerms | null;
  readonly year: ChargeYear | null;
}

// One row per concept and year. What the contract says of a concept goes on its first row: that
// it is in the contract, and for how much a year when it says so.
function charges(
  a: Answers,
  lease: readonly ExtractedRow[],
  months: ReadonlyMap<string, ExtractedRow>,
) {
  const { sums, otherLines } = receiptCharges(months);
  const rows = CHARGE_KINDS.flatMap((kind): ChargeRow[] => {
    const inLease = lease.filter((r) => r.values['kind'] === kind);
    const agreed = inLease
      .map((r) => amountOf(r.values['annualAmount']))
      .filter((n): n is number => n !== null);
    const terms: ChargeTerms | null =
      inLease.length > 0
        ? {
            confidence: lowest(...inLease.map((r) => r.confidence)),
            annual:
              agreed.length > 0 ? Math.round(agreed.reduce((s, n) => s + n, 0) * 100) / 100 : null,
            summed: agreed.length > 1,
          }
        : null;
    const years = [...(sums.get(kind)?.values() ?? [])].sort((x, y) => x.year - y.year);
    if (years.length === 0) return terms ? [{ kind, terms, year: null }] : [];
    return years.map((year, i) => ({ kind, terms: i === 0 ? terms : null, year }));
  });
  const read = a.rows('charges', rows);
  if (read.length === 0) return { fromReceipts: false, otherLines };
  a.open('hasCharges', 'yes');
  read.forEach(({ kind, terms, year }, i) => {
    const field = (key: string) => rowField('charges', i, key);
    a.read(field('kind'), kind, terms?.confidence ?? year?.confidence ?? 'high');
    if (terms) {
      a.read(field('inContract'), 'yes', terms.confidence);
      if (terms.annual !== null)
        a.read(field('annualAgreed'), amountText(terms.annual), terms.confidence, terms.summed);
    }
    if (year) {
      a.read(field('year'), String(year.year), year.confidence);
      a.read(field('amount'), amountText(year.amount), year.confidence, true);
    }
  });
  return { fromReceipts: read.some((r) => r.year !== null), otherLines };
}

function moveOut(
  a: Answers,
  keys: SourcedField | undefined,
  returns: readonly ExtractedRow[],
  deductions: readonly ExtractedRow[],
) {
  const keysOn = keys && dateOf(keys.value) ? keys : undefined;
  if (!keysOn && returns.length === 0 && deductions.length === 0) return;
  a.open('movedOut', 'yes');
  if (keysOn) a.read('keysReturnedOn', String(keysOn.value), keysOn.confidence);
  a.rows('returns', returns).forEach((row, i) => {
    const field = (key: string) => rowField('returns', i, key);
    const on = dateOf(row.values['on']);
    const amount = amountOf(row.values['amount']);
    if (on) a.read(field('on'), toIso(on), row.confidence);
    if (amount !== null) a.read(field('amount'), amountText(amount), row.confidence);
  });
  a.rows('deductions', deductions).forEach((row, i) => {
    const field = (key: string) => rowField('deductions', i, key);
    const kind = oneOf(row.values['kind'], DEDUCTION_KINDS);
    // The list has no blank choice: a deduction of no known kind is «Otro», to be checked.
    a.read(field('kind'), kind ?? 'other', kind ? row.confidence : 'low');
    const amount = amountOf(row.values['amount']);
    if (amount !== null) a.read(field('amount'), amountText(amount), row.confidence);
  });
}

// What a reading puts into the review's sheets. Nothing here reviews anything: it only fills
// answers, each marked as read and how surely, and the person confirms every sheet before the
// review runs. `answers` are the form's current ones, by name.
export function rentalPrefill(
  e: RentalExtraction,
  answers: Readonly<Record<string, string>>,
  tr: Translate,
  checks: readonly FailedCheck[] = [],
): RentalPrefill {
  const a = new Answers();
  contract(a, e.fields);
  guarantees(a, e.guarantees, amountOf(e.fields.initialRent?.value));
  fees(a, e.invoices, checks.includes('invoice_total_mismatch'));
  const start = dateOf(e.fields.startDate?.value) ?? dateOf(answers['startDate']);
  const receipts = receiptsByMonth(e.receipts);
  const decrease = updates(a, rises(e.notices, rentChanges(receipts.months, start)), start);
  const charged = charges(a, e.charges, receipts.months);
  moveOut(a, e.fields.keysReturnedOn, e.returns, e.deductions);

  const quotes: Partial<Record<Quoted, string>> = {};
  const quote = (q: Quoted, f: SourcedField | undefined) => {
    const text = textOf(f?.value);
    if (text) quotes[q] = text;
  };
  quote('updateClause', e.fields.updateClauseText);
  quote('hasFees', e.fields.feesText);
  quote('hasCharges', e.fields.chargesClauseText);

  const low = a.marks.some((m) => m.confidence === 'low');
  return {
    entries: a.entries,
    marks: a.marks,
    count: a.marks.length,
    lowConfidence: low,
    notes: [
      ...conflictLines(e.conflicts, tr, RENTAL_CONFLICT_FIELDS),
      ...(low ? [tr('client.documents.done_low')] : []),
      ...(charged.fromReceipts ? [tr('client.rental.documents.receipt_sums')] : []),
      ...(charged.otherLines ? [tr('client.rental.documents.receipt_other_lines')] : []),
      ...(receipts.disagree ? [tr('client.rental.documents.receipt_duplicate')] : []),
      ...(decrease ? [tr('client.rental.documents.decrease')] : []),
      ...(a.cut ? [tr('client.rental.documents.rows_cut')] : []),
      ...RENTAL_CHECKS.filter((c) => checks.includes(c)).map((c) =>
        tr(`client.rental.documents.check.${c}`),
      ),
    ],
    quotes,
  };
}
