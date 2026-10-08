import { formatAmountInput } from '../calculator/number';
import type {
  Confidence,
  ExtractedRow,
  ExtractedValue,
  RentalExtraction,
  SourcedField,
} from '../documents/contract';
import type { ReadMark, ReadPrefill } from '../documents/ports';
import { conflictLines, RENTAL_CONFLICT_FIELDS } from '../documents/summary';
import { compareDates, ordinal, parseDate, toIso, type CivilDate } from '../engine/date';
import { anniversaryIn } from '../engine/rental/anniversary';
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

// The anniversary year a rise belongs to: the one whose anniversary falls nearest the day it was
// charged from, as a rise charged a little early or late still belongs to it.
export function riseYear(start: CivilDate, chargedFrom: CivilDate): number {
  const candidates = [chargedFrom.y - 1, chargedFrom.y, chargedFrom.y + 1].filter(
    (y) => y > start.y,
  );
  const distance = (y: number) => Math.abs(ordinal(anniversaryIn(start, y)) - ordinal(chargedFrom));
  return candidates.reduce(
    (best, y) => (distance(y) < distance(best) ? y : best),
    candidates[0] ?? start.y + 1,
  );
}

// A change of rent seen in the receipts: the first month at the new rent, and the rent before it.
interface RentChange {
  readonly month: string;
  readonly previous: number;
  readonly next: number;
  readonly confidence: Confidence;
}

// The rent charged month by month, in order, and every month it changed. A change after a gap in
// the receipts may have come in any month of the gap, so it is less sure.
export function rentChanges(receipts: readonly ExtractedRow[]): RentChange[] {
  const months = new Map<string, { rent: number; confidence: Confidence }>();
  for (const row of receipts) {
    const month = monthOf(row.values['month']);
    const rent = amountOf(row.values['rent']);
    if (month && rent !== null && !months.has(month))
      months.set(month, { rent, confidence: row.confidence });
  }
  const sorted = [...months.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  return sorted.flatMap(([month, { rent, confidence }], i): RentChange[] => {
    const before = sorted[i - 1];
    if (!before || Math.abs(before[1].rent - rent) < 0.005) return [];
    const gap = monthIndex(month) - monthIndex(before[0]) > 1;
    return [
      {
        month,
        previous: before[1].rent,
        next: rent,
        confidence: gap ? 'low' : lowest(confidence, before[1].confidence),
      },
    ];
  });
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
  // The contract counts the months paid beyond the first; the form counts the first too.
  const advance = field('advanceMonths');
  const advanceMonths = wholeOf(advance?.value);
  if (advance && advanceMonths !== null && advanceMonths >= 0)
    a.read('advanceMonths', String(advanceMonths + 1), advance.confidence, true);

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

// Each invoice is a fee paid on moving in, for what it says it charges in total.
function fees(a: Answers, invoices: readonly ExtractedRow[]) {
  const read = a.rows('fees', invoices);
  if (read.length === 0) return;
  a.open('hasFees', 'yes');
  read.forEach((row, i) => {
    const field = (key: string) => rowField('fees', i, key);
    const kind = oneOf(row.values['conceptKind'], FEE_KINDS);
    if (kind) a.read(field('kind'), kind, row.confidence);
    const total = amountOf(row.values['total']);
    const base = amountOf(row.values['base']);
    const vat = amountOf(row.values['vat']) ?? 0;
    if (total !== null) a.read(field('amount'), amountText(total), row.confidence);
    else if (base !== null) a.read(field('amount'), amountText(base + vat), row.confidence, true);
  });
}

interface Rise {
  readonly chargedFrom: CivilDate | null;
  readonly chargedFromDerived: boolean;
  readonly previous: number | null;
  readonly previousDerived: boolean;
  readonly next: number | null;
  readonly nextDerived: boolean;
  readonly notice: (typeof DATED_NOTICES)[number] | null;
  readonly noticeOn: CivilDate | null;
  readonly confidence: Confidence;
  // How sure what was worked out from the receipts is.
  readonly worked: Confidence;
}

const firstOfMonth = (month: string): CivilDate => parseDate(`${month}-01`);
const toMonth = (d: CivilDate) => `${d.y}-${String(d.m).padStart(2, '0')}`;
const sameRent = (a: number, b: number) => Math.abs(a - b) < 0.005;

// Each notice, with the first receipt at its new rent as the month it was charged from; a change
// in the receipts no notice speaks of is a rise of its own.
function rises(notices: readonly ExtractedRow[], changes: readonly RentChange[]): Rise[] {
  const unmatched = [...changes];
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
    const at = unmatched.findIndex((c) =>
      next !== null ? sameRent(c.next, next) : applies !== null && c.month === toMonth(applies),
    );
    const change = at >= 0 ? unmatched.splice(at, 1)[0] : undefined;
    return {
      chargedFrom: change ? firstOfMonth(change.month) : applies,
      chargedFromDerived: true,
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
    chargedFromDerived: true,
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

function updates(a: Answers, all: readonly Rise[], start: CivilDate | null) {
  const read = a.rows('updates', all);
  if (read.length === 0) return;
  a.open('hasUpdates', 'yes');
  read.forEach((r, i) => {
    const field = (key: string) => rowField('updates', i, key);
    const when = r.chargedFrom ?? r.noticeOn;
    if (when)
      a.read(
        field('year'),
        String(start ? riseYear(start, when) : when.y),
        start ? r.worked : 'low',
        true,
      );
    if (r.chargedFrom)
      a.read(field('chargedFrom'), toIso(r.chargedFrom), r.worked, r.chargedFromDerived);
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
}

interface ChargeYear {
  readonly year: number;
  readonly amount: number;
  readonly confidence: Confidence;
}

// What the receipts charged each calendar year, concept by concept; whether they carry lines
// that are no charge of the review's.
function receiptCharges(receipts: readonly ExtractedRow[]) {
  const sums = new Map<string, Map<number, ChargeYear>>();
  let otherLines = false;
  for (const row of receipts) {
    const month = monthOf(row.values['month']);
    if (!month) continue;
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

// One row per concept and year. What the contract says of a concept goes on its first row: that
// it is in the contract, and for how much a year when it says so.
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

function charges(a: Answers, lease: readonly ExtractedRow[], receipts: readonly ExtractedRow[]) {
  const { sums, otherLines } = receiptCharges(receipts);
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
): RentalPrefill {
  const a = new Answers();
  contract(a, e.fields);
  guarantees(a, e.guarantees, amountOf(e.fields.initialRent?.value));
  fees(a, e.invoices);
  const start = dateOf(e.fields.startDate?.value) ?? dateOf(answers['startDate']);
  updates(a, rises(e.notices, rentChanges(e.receipts)), start);
  const charged = charges(a, e.charges, e.receipts);
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
      ...(a.cut ? [tr('client.rental.documents.rows_cut')] : []),
    ],
    quotes,
  };
}
