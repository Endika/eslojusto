import { formatAmountInput } from '../calculator/number';
import {
  MORTGAGE_CHECKS,
  type Confidence,
  type ExtractedRow,
  type ExtractedValue,
  type FailedCheck,
  type MortgageCheck,
  type MortgageExtraction,
  type SourcedField,
} from '../documents/contract';
import type { ReadMark, ReadPrefill } from '../documents/ports';
import { MORTGAGE_CONFLICT_FIELDS, conflictLines } from '../documents/summary';
import { compareDates, parseDate, toIso, type CivilDate } from '../engine/date';
import { CLAUSE_LABELS, type ClauseLabel } from '../engine/mortgage/types';
import type { Translate } from '../i18n/client';
import {
  BORROWERS,
  LOAN_KINDS,
  OPERATION_KINDS,
  PREPAYMENT_OPTIONS,
  PURPOSES,
  RATE_TYPES,
  type MortgageFormField,
} from './form';

// The questions beside which the deed's clauses are shown word for word, so the person confirms
// each answer against the clause itself.
export const QUOTED = [
  'expensesClause',
  'floor',
  'irph',
  'defaultInterest',
  'earlyTermination',
  'openingFee',
  'roundingUp',
  'insuranceRequired',
  'operation',
] as const;
export type Quoted = (typeof QUOTED)[number];

export interface MortgagePrefill extends ReadPrefill {
  readonly quotes: Readonly<Partial<Record<Quoted, string>>>;
}

// Where each clause is quoted. An index clause, Euríbor or IRPH, goes beside the IRPH question; a
// fee for repaying early, beside the one on repaying early.
const QUOTE_OF: Readonly<Record<ClauseLabel, Quoted>> = {
  floor_clause: 'floor',
  irph: 'irph',
  euribor: 'irph',
  default_interest: 'defaultInterest',
  early_termination: 'earlyTermination',
  rounding_up: 'roundingUp',
  opening_fee: 'openingFee',
  prepayment_fee: 'operation',
  expenses_clause: 'expensesClause',
  insurance_required: 'insuranceRequired',
};

// The answer a clause found in the deed gives. A Euríbor clause or a fee for repaying early
// answers nothing: they are only shown.
const ANSWER_OF: Readonly<Partial<Record<ClauseLabel, readonly [MortgageFormField, string]>>> = {
  floor_clause: ['floor', 'yes'],
  irph: ['irph', 'yes'],
  default_interest: ['defaultInterest', 'yes'],
  early_termination: ['earlyTermination', 'yes'],
  rounding_up: ['roundingUp', 'yes'],
  opening_fee: ['openingFee', 'yes'],
  expenses_clause: ['expensesClause', 'present'],
  insurance_required: ['insuranceRequired', 'yes'],
};

const RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };
const lowest = (...cs: Confidence[]): Confidence =>
  cs.reduce((a, b) => (RANK[b] < RANK[a] ? b : a), 'high');

const isNumber = (v: ExtractedValue | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const amountOf = (v: ExtractedValue | undefined): number | null =>
  isNumber(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
const positiveOf = (v: ExtractedValue | undefined): number | null => {
  const n = amountOf(v);
  return n !== null && n > 0 ? n : null;
};
// A rate keeps the three decimals a deed may give (Euríbor + 0,875).
const rateOf = (v: ExtractedValue | undefined): number | null =>
  isNumber(v) && v >= 0 ? Math.round(v * 1000) / 1000 : null;
const wholeOf = (v: ExtractedValue | undefined): number | null =>
  isNumber(v) && Number.isInteger(v) && v > 0 ? v : null;
const textOf = (v: ExtractedValue | undefined): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
const oneOf = <T extends string>(v: ExtractedValue | undefined, options: readonly T[]): T | null =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : null;
const yesNo = (v: ExtractedValue | undefined): 'yes' | 'no' | null =>
  v === true ? 'yes' : v === false ? 'no' : null;

function dateOf(v: ExtractedValue | undefined): CivilDate | null {
  if (typeof v !== 'string') return null;
  try {
    return parseDate(v);
  } catch {
    return null;
  }
}

const cents = (n: number): number => Math.round(n * 100);
const sum = (ns: readonly number[]): number => cents(ns.reduce((s, n) => s + n, 0)) / 100;

// A rate as the form takes it: «2,875», keeping the decimals a deed may give.
const rateText = (n: number): string =>
  n.toLocaleString('es-ES', { maximumFractionDigits: 3, useGrouping: false });
const amountText = formatAmountInput;

class Answers {
  readonly entries: [string, string][] = [];
  readonly marks: ReadMark[] = [];
  readonly notes: string[] = [];
  private readonly given = new Set<MortgageFormField>();

  // An answer read, or worked out from what was read, marked as such; only the first one counts.
  read(name: MortgageFormField, value: string, confidence: Confidence, derived = false) {
    if (this.given.has(name)) return;
    this.given.add(name);
    this.entries.push([name, value]);
    this.marks.push({
      id: name,
      container: `[data-field="${name}"]`,
      confidence,
      ...(derived && { derived: true as const }),
    });
  }

  // An answer that only opens what was read, such as «Sí» above the figures it asks for.
  open(name: MortgageFormField, value: string) {
    if (this.given.has(name)) return;
    this.given.add(name);
    this.entries.push([name, value]);
  }

  field(name: MortgageFormField, f: SourcedField | undefined, value: string | null) {
    if (f && value !== null) this.read(name, value, f.confidence);
  }
}

type Fields = MortgageExtraction['fields'];

// A missing page is said with the pages set aside, by the upload; the rest, here.
const ownCheck = (c: MortgageCheck): c is Exclude<MortgageCheck, 'missing_key_page'> =>
  c !== 'missing_key_page';

// The deed's clauses in the order printed, each with its label.
function clausesOf(rows: readonly ExtractedRow[]) {
  return rows.flatMap((row) => {
    const label = oneOf(row.values['label'], CLAUSE_LABELS);
    const text = textOf(row.values['text']);
    return label && text ? [{ label, text, confidence: row.confidence }] : [];
  });
}

// Each clause answers its question, and its words go beside it: several under one question
// follow each other, none left out.
function clauses(a: Answers, e: MortgageExtraction, tr: Translate) {
  const read = clausesOf(e.clauses);
  const quotes: Partial<Record<Quoted, string>> = {};
  for (const { label, text, confidence } of read) {
    const answer = ANSWER_OF[label];
    if (answer) a.read(answer[0], answer[1], confidence);
    const question = QUOTE_OF[label];
    quotes[question] = quotes[question] ? `${quotes[question]}\n\n${text}` : text;
  }
  const labels = CLAUSE_LABELS.filter((l) => read.some((c) => c.label === l));
  if (labels.length > 0)
    a.notes.push(
      tr('client.mortgage.documents.clauses', {
        clausulas: labels.map((l) => tr(`client.mortgage.documents.clause.${l}`)).join(', '),
      }),
    );
  return quotes;
}

function loan(a: Answers, fields: Fields) {
  a.field('loanKind', fields.loanKind, oneOf(fields.loanKind?.value, LOAN_KINDS));
  a.field('borrower', fields.borrowerType, oneOf(fields.borrowerType?.value, BORROWERS));
  a.field('purpose', fields.purpose, oneOf(fields.purpose?.value, PURPOSES));
  const on = dateOf(fields.deedOn?.value);
  a.field('deedOn', fields.deedOn, on && toIso(on));
  const principal = positiveOf(fields.principal?.value);
  a.field('loanAmount', fields.principal, principal === null ? null : amountText(principal));
  a.field('rateType', fields.rateType, oneOf(fields.rateType?.value, RATE_TYPES));
  const months = wholeOf(fields.rateRevisionMonths?.value);
  a.field('revisionMonths', fields.rateRevisionMonths, months === null ? null : String(months));
}

// The figures of the clauses, each opening its clause when no clause was read to open it.
function figures(a: Answers, fields: Fields, tr: Translate) {
  const floor = rateOf(fields.floorPercent?.value);
  if (fields.floorPercent && floor !== null) {
    a.read('floor', 'yes', fields.floorPercent.confidence);
    a.read('floorPercent', rateText(floor), fields.floorPercent.confidence);
  }

  const initial = rateOf(fields.initialRate?.value);
  const fixed = fields.rateType?.value === 'fixed';
  const rate = rateOf(fields.defaultRate?.value);
  const points = rateOf(fields.defaultMarginPoints?.value);
  if (fields.defaultRate && rate !== null) {
    a.read('defaultInterest', 'yes', fields.defaultRate.confidence);
    a.read('defaultRate', rateText(rate), fields.defaultRate.confidence);
    // A fixed rate's initial rate is its ordinary one for the whole loan.
    if (fixed && fields.initialRate && initial !== null)
      a.read('ordinaryRate', rateText(initial), fields.initialRate.confidence);
  } else if (fields.defaultMarginPoints && points !== null) {
    a.read('defaultInterest', 'yes', fields.defaultMarginPoints.confidence);
    // Points over the ordinary rate: the two figures follow from the initial one.
    if (fields.initialRate && initial !== null) {
      const sure = lowest(fields.initialRate.confidence, fields.defaultMarginPoints.confidence);
      a.read('ordinaryRate', rateText(initial), fields.initialRate.confidence);
      a.read('defaultRate', rateText(Math.round((initial + points) * 1000) / 1000), sure, true);
      a.notes.push(tr('client.mortgage.documents.default_points'));
    }
  }

  const instalments = wholeOf(fields.earlyTerminationInstalments?.value);
  if (fields.earlyTerminationInstalments && instalments !== null) {
    a.read('earlyTermination', 'yes', fields.earlyTerminationInstalments.confidence);
    a.read('missedInstalments', String(instalments), fields.earlyTerminationInstalments.confidence);
  }

  const fee = amountOf(fields.openingFee?.value);
  const percent = rateOf(fields.openingFeePercent?.value);
  const principal = positiveOf(fields.principal?.value);
  if (fields.openingFee && fee !== null) {
    a.read('openingFee', fee > 0 ? 'yes' : 'no', fields.openingFee.confidence);
    if (fee > 0) a.read('openingFeeAmount', amountText(fee), fields.openingFee.confidence);
  } else if (fields.openingFeePercent && percent !== null && percent > 0) {
    a.read('openingFee', 'yes', fields.openingFeePercent.confidence);
    if (fields.principal && principal !== null) {
      const sure = lowest(fields.openingFeePercent.confidence, fields.principal.confidence);
      a.read('openingFeeAmount', amountText(cents((principal * percent) / 100) / 100), sure, true);
      a.notes.push(tr('client.mortgage.documents.opening_percent'));
    }
  }
  a.field('duplicateFee', fields.otherSetUpFee, yesNo(fields.otherSetUpFee?.value));
  a.field(
    'prepaymentOption',
    fields.prepaymentOption,
    oneOf(fields.prepaymentOption?.value, PREPAYMENT_OPTIONS),
  );
}

interface Pot {
  readonly amounts: number[];
  readonly confidences: Confidence[];
}

// Each invoice goes to the question of its concept: the notary's and the registry's for the loan,
// the agency's with the outlays it paid, the valuation's, the tax return for the loan and what the
// notarial act billed. What the purchase cost, a copy or a cancellation, this review does not
// count; a return the lender paid was not the person's to pay. Several of one concept add up.
function invoices(a: Answers, e: MortgageExtraction, tr: Translate) {
  const pots = new Map<MortgageFormField, Pot>();
  const put = (field: MortgageFormField, amount: number | null, confidence: Confidence) => {
    if (amount === null) return;
    const pot = pots.get(field) ?? { amounts: [], confidences: [] };
    pot.amounts.push(amount);
    pot.confidences.push(confidence);
    pots.set(field, pot);
  };
  let leftOut = false;
  const mixed = new Map<MortgageFormField, Confidence[]>();
  const unmixed = new Map<MortgageFormField, Confidence[]>();
  const both = (
    rows: readonly ExtractedRow[],
    loanConcept: string,
    field: MortgageFormField,
    mixedField: MortgageFormField,
  ) => {
    for (const row of rows) {
      const total = positiveOf(row.values['total']);
      if (total === null) continue;
      const together = row.values['mixed'] === true;
      if (!together && row.values['concept'] !== loanConcept) {
        leftOut = true;
        continue;
      }
      put(field, total, row.confidence);
      const marks = together ? mixed : unmixed;
      marks.set(mixedField, [...(marks.get(mixedField) ?? []), row.confidence]);
    }
  };
  both(e.notaryInvoices, 'loan', 'notaryLoan', 'notaryMixed');
  both(e.registryInvoices, 'mortgage', 'registryMortgage', 'registryMixed');
  for (const row of e.agencyInvoices)
    put('agency', positiveOf(row.values['total']), row.confidence);
  for (const row of e.agencySupplied) {
    const concept = row.values['concept'];
    const field =
      concept === 'ajd' ? 'agencyTax' : concept === 'registry' ? 'agencyRegistry' : null;
    if (field) put(field, positiveOf(row.values['amount']), row.confidence);
  }
  for (const row of e.valuationInvoices)
    put('valuation', positiveOf(row.values['total']), row.confidence);
  let lenderPaid = false;
  for (const row of e.ajdForms) {
    if (row.values['concept'] !== 'loan') continue;
    if (row.values['paidByLender'] === true) lenderPaid = true;
    else put('ajdLoan', positiveOf(row.values['amountPaid']), row.confidence);
  }
  const act = e.fields.transparencyActCharged;
  if (act) put('transparencyDeed', positiveOf(act.value), act.confidence);

  if (pots.size === 0) {
    if (leftOut) a.notes.push(tr('client.mortgage.documents.invoices_left_out'));
    if (lenderPaid) a.notes.push(tr('client.mortgage.documents.ajd_lender_paid'));
    return;
  }
  a.open('hasInvoices', 'yes');
  let added = false;
  for (const [field, pot] of pots) {
    added ||= pot.amounts.length > 1;
    a.read(field, amountText(sum(pot.amounts)), lowest(...pot.confidences), pot.amounts.length > 1);
  }
  for (const field of ['notaryMixed', 'registryMixed'] as const) {
    const together = mixed.get(field);
    const apart = unmixed.get(field);
    if (together) a.read(field, 'yes', lowest(...together));
    else if (apart) a.read(field, 'no', lowest(...apart));
  }
  a.notes.push(tr('client.mortgage.documents.invoices'));
  if (added) a.notes.push(tr('client.mortgage.documents.invoices_added'));
  if (leftOut) a.notes.push(tr('client.mortgage.documents.invoices_left_out'));
  if (lenderPaid) a.notes.push(tr('client.mortgage.documents.ajd_lender_paid'));
}

// The form asks for one operation: the latest a statement shows.
function operation(a: Answers, rows: readonly ExtractedRow[], tr: Translate) {
  const read = rows
    .flatMap((row) => {
      const on = dateOf(row.values['on']);
      const kind = oneOf(row.values['kind'], OPERATION_KINDS);
      return on && kind && kind !== 'none' ? [{ on, kind, row }] : [];
    })
    .sort((x, y) => compareDates(y.on, x.on));
  const [latest] = read;
  if (!latest) return;
  const { row } = latest;
  a.read('operation', latest.kind, row.confidence);
  a.read('operationOn', toIso(latest.on), row.confidence);
  const principal = amountOf(row.values['principal']);
  if (principal !== null) a.read('operationPrincipal', amountText(principal), row.confidence);
  const fee = amountOf(row.values['feeCharged']);
  if (fee !== null) a.read('operationFee', amountText(fee), row.confidence);
  if (read.length > 1) a.notes.push(tr('client.mortgage.documents.operations_many'));
}

// What a reading puts into the mortgage review's sheets. Nothing here reviews anything: it only
// fills answers, each marked as read and how surely, with every clause read shown word for word
// beside the question it answers, and the person confirms every sheet before the review runs.
// No share of a cost is worked out and no clause is judged.
export function mortgagePrefill(
  e: MortgageExtraction,
  tr: Translate,
  checks: readonly FailedCheck[] = [],
): MortgagePrefill {
  const a = new Answers();
  loan(a, e.fields);
  const quotes = clauses(a, e, tr);
  figures(a, e.fields, tr);
  invoices(a, e, tr);
  operation(a, e.operations, tr);

  const low = a.marks.some((m) => m.confidence === 'low');
  return {
    entries: a.entries,
    marks: a.marks,
    count: a.marks.length,
    lowConfidence: low,
    notes: [
      ...conflictLines(e.conflicts, tr, MORTGAGE_CONFLICT_FIELDS),
      ...(low ? [tr('client.documents.done_low')] : []),
      ...new Set(a.notes),
      ...(e.truncated ? [tr('client.mortgage.documents.rows_cut')] : []),
      ...MORTGAGE_CHECKS.filter(ownCheck)
        .filter((c) => checks.includes(c))
        .map((c) => tr(`client.mortgage.documents.check.${c}`)),
    ],
    quotes,
  };
}
