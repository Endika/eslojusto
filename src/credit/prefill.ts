import { formatAmountInput } from '../calculator/number';
import {
  CREDIT_CHECKS,
  type Confidence,
  type CreditExtraction,
  type ExtractedRow,
  type ExtractedValue,
  type FailedCheck,
  type SourcedField,
} from '../documents/contract';
import type { ReadMark, ReadPrefill } from '../documents/ports';
import { conflictLines } from '../documents/summary';
import { compareDates, parseDate, toIso, type CivilDate } from '../engine/date';
import type { ChargeKind, ChargePayment } from '../engine/credit/types';
import type { Translate } from '../i18n/client';
import { CHARGE_PAYMENTS, RATE_TYPES, type CreditFormField } from './form';

// The questions beside which the contract's own words are shown, so the person can check the
// answer against them.
export const QUOTED = ['compensation', 'infoReceived'] as const;
export type Quoted = (typeof QUOTED)[number];

export interface CreditPrefill extends ReadPrefill {
  readonly quotes: Readonly<Partial<Record<Quoted, string>>>;
}

// The fields more than one kind of credit document can state, among those the form takes.
export const CREDIT_CONFLICT_FIELDS = [
  'agreedOn',
  'principal',
  'nominalRate',
  'declaredApr',
  'declaredTotalPayable',
  'instalmentCount',
  'instalmentAmount',
  'agreedEndOn',
] as const;

const LOANS = ['personal_loan', 'car_loan'] as const;
const PRODUCTS = [...LOANS, 'revolving'] as const;

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

// A rate as the form takes it: «7,99», keeping the decimals a contract may give.
const rateText = (n: number): string =>
  n.toLocaleString('es-ES', { maximumFractionDigits: 4, useGrouping: false });
const amountText = formatAmountInput;

class Answers {
  readonly entries: [string, string][] = [];
  readonly marks: ReadMark[] = [];
  readonly notes: string[] = [];

  // An answer read, or worked out from what was read, marked as such.
  read(name: CreditFormField, value: string, confidence: Confidence, derived = false) {
    this.entries.push([name, value]);
    this.marks.push({
      id: name,
      container: `[data-field="${name}"]`,
      confidence,
      ...(derived && { derived: true as const }),
    });
  }

  // An answer that only opens what was read, such as «Sí» above the figures it asks for.
  open(name: CreditFormField, value: string) {
    this.entries.push([name, value]);
  }

  field(name: CreditFormField, f: SourcedField | undefined, value: string | null) {
    if (f && value !== null) this.read(name, value, f.confidence);
  }
}

type Fields = CreditExtraction['fields'];

const LOAN_DOCUMENTS: readonly string[] = [
  'credit_agreement',
  'credit_precontract_info',
  'amortization_schedule',
  'early_repayment_statement',
];

// What the credit is: the contract says it, or a card's own contract or statements show it.
function product(a: Answers, e: CreditExtraction): string | null {
  const stated = oneOf(e.fields.product?.value, PRODUCTS);
  if (e.fields.product && stated) {
    a.read('product', stated, e.fields.product.confidence);
    return stated;
  }
  const kinds = new Set(e.documents.map((d) => d.kind));
  const card = kinds.has('revolving_agreement') || kinds.has('card_statement');
  const loan = [...kinds].some((k) => LOAN_DOCUMENTS.includes(k));
  if (card && !loan) {
    a.read('product', 'revolving', 'medium', true);
    return 'revolving';
  }
  return null;
}

function terms(a: Answers, fields: Fields, revolving: boolean) {
  a.field('agreedOn', fields.agreedOn, map(dateOf(fields.agreedOn?.value), toIso));
  if (revolving)
    a.field(
      'cardLimit',
      fields.creditLimit,
      map(positiveOf(fields.creditLimit?.value), amountText),
    );
  else a.field('principal', fields.principal, map(positiveOf(fields.principal?.value), amountText));
  a.field('nominalRate', fields.nominalRate, map(amountOf(fields.nominalRate?.value), rateText));
  if (!revolving) a.field('rateType', fields.rateType, oneOf(fields.rateType?.value, RATE_TYPES));
  // A stated APR says the contract states one; one not read says nothing either way.
  const apr = amountOf(fields.declaredApr?.value);
  if (fields.declaredApr && apr !== null) {
    a.open('aprStated', 'yes');
    a.read('declaredApr', rateText(apr), fields.declaredApr.confidence);
  }
  if (!revolving)
    a.field(
      'declaredTotalPayable',
      fields.declaredTotalPayable,
      map(positiveOf(fields.declaredTotalPayable?.value), amountText),
    );
}

function map<T, U>(v: T | null, f: (v: T) => U): U | null {
  return v === null ? null : f(v);
}

// The schedule's rows in date order, those with a date.
function scheduleRows(rows: readonly ExtractedRow[]) {
  return rows
    .flatMap((row) => {
      const on = dateOf(row.values['dueOn']);
      return on ? [{ on, row }] : [];
    })
    .sort((x, y) => compareDates(x.on, y.on));
}

// The instalments the contract states; what it leaves out, worked out from a whole schedule: how
// many rows, the first one's day and, when every row but the last is the same, their amount. A
// last row larger than the rest is the final instalment.
function instalments(a: Answers, e: CreditExtraction, tr: Translate) {
  const { fields } = e;
  const count = fields.instalmentCount;
  const n = count && isNumber(count.value) && Number.isInteger(count.value) ? count.value : null;
  if (count && n !== null && n > 0) a.read('instalmentCount', String(n), count.confidence);
  const amount = positiveOf(fields.instalmentAmount?.value);
  if (fields.instalmentAmount && amount !== null)
    a.read('instalmentAmount', amountText(amount), fields.instalmentAmount.confidence);
  const first = dateOf(fields.firstDueOn?.value);
  if (fields.firstDueOn && first) a.read('firstDueOn', toIso(first), fields.firstDueOn.confidence);
  const balloon = positiveOf(fields.balloonAmount?.value);
  if (fields.balloonAmount && balloon !== null) {
    a.open('hasBalloon', 'yes');
    a.read('balloonAmount', amountText(balloon), fields.balloonAmount.confidence);
    const due = dateOf(fields.balloonDueOn?.value);
    if (fields.balloonDueOn && due)
      a.read('balloonDueOn', toIso(due), fields.balloonDueOn.confidence);
  }

  // A schedule cut at its maximum has more rows than were read: it counts nothing.
  const rows = scheduleRows(e.schedule);
  const head = rows[0];
  if (!head || e.truncated) return;
  const sure = lowest(...rows.map((r) => r.row.confidence));
  let worked = false;
  if (n === null) {
    a.read('instalmentCount', String(rows.length), sure, true);
    worked = true;
  }
  if (!first) {
    a.read('firstDueOn', toIso(head.on), head.row.confidence, true);
    worked = true;
  }
  if (amount === null) {
    const amounts = rows.map((r) => positiveOf(r.row.values['amount']));
    const regular = amounts.slice(0, -1);
    const last = amounts.at(-1) ?? null;
    const usual = regular[0] ?? last;
    const even =
      usual !== null &&
      regular.every((x) => x !== null && cents(x) === cents(usual)) &&
      last !== null &&
      cents(last) >= cents(usual);
    if (even) {
      a.read('instalmentAmount', amountText(usual), sure, true);
      worked = true;
    } else a.notes.push(tr('client.credit.documents.schedule_uneven'));
  }
  if (worked) a.notes.push(tr('client.credit.documents.schedule'));
}

type ChargeTarget = 'opening' | 'other';
const targetOf = (kind: ChargeKind): ChargeTarget => (kind === 'opening' ? 'opening' : 'other');

// The charges on their two sheets: the opening fee, and every other one added up. Charges of one
// sheet paid in different ways can't share its single answer, so they are left to the person.
function charges(a: Answers, rows: readonly ExtractedRow[], tr: Translate) {
  const KINDS: readonly ChargeKind[] = ['opening', 'study', 'management', 'other'];
  for (const target of ['opening', 'other'] as const) {
    const read = rows.flatMap((row) => {
      const kind = oneOf(row.values['kind'], KINDS);
      const amount = positiveOf(row.values['amount']);
      if (!kind || targetOf(kind) !== target || amount === null) return [];
      return [
        { amount, how: oneOf(row.values['how'], CHARGE_PAYMENTS), confidence: row.confidence },
      ];
    });
    if (read.length === 0) continue;
    const hows = new Set<ChargePayment | null>(read.map((r) => r.how));
    if (hows.size > 1) {
      a.notes.push(tr('client.credit.documents.charges_apart'));
      continue;
    }
    const [fee, how] =
      target === 'opening' ? ['openingFee', 'openingHow'] : ['otherFee', 'otherHow'];
    const confidence = lowest(...read.map((r) => r.confidence));
    a.read(
      fee as CreditFormField,
      amountText(sum(read.map((r) => r.amount))),
      confidence,
      read.length > 1,
    );
    const [only] = hows;
    if (only) a.read(how as CreditFormField, only, confidence);
  }
}

function insurance(a: Answers, fields: Fields, tr: Translate) {
  const premium = positiveOf(fields.insurancePremium?.value);
  if (!fields.insurancePremium || premium === null) return;
  a.open('hasInsurance', 'yes');
  const single = fields.insuranceSingle;
  const kind = single?.value === true ? 'single' : single?.value === false ? 'periodic' : null;
  // A premium paid in instalments may be read as a year's: the sheet asks for each one's.
  a.read(
    'premium',
    amountText(premium),
    kind === 'periodic' ? 'low' : fields.insurancePremium.confidence,
  );
  if (kind === 'periodic') a.notes.push(tr('client.credit.documents.premium_periodic'));
  if (single && kind) a.read('premiumKind', kind, single.confidence);
  if (kind === 'single')
    a.field('premiumFinanced', fields.insuranceFinanced, yesNo(fields.insuranceFinanced?.value));
  a.field('insuranceRequired', fields.insuranceRequired, yesNo(fields.insuranceRequired?.value));
}

// A card's fee from its contract; its balance and monthly payment from the latest statement, or
// the payment from the contract's minimum when no statement says it.
function card(a: Answers, e: CreditExtraction, tr: Translate) {
  const { fields } = e;
  a.field('annualFee', fields.annualFee, map(amountOf(fields.annualFee?.value), amountText));
  const latest = e.statements
    .flatMap((row) => {
      const on = dateOf(row.values['statementOn']);
      return on ? [{ on, row }] : [];
    })
    .sort((x, y) => compareDates(y.on, x.on))[0]?.row;
  const payment = positiveOf(latest?.values['payment']);
  const balance = amountOf(latest?.values['balance']);
  if (latest && balance !== null) a.read('balance', amountText(balance), latest.confidence, true);
  if (latest && payment !== null)
    a.read('monthlyPayment', amountText(payment), latest.confidence, true);
  if (latest && (payment !== null || balance !== null))
    a.notes.push(tr('client.credit.documents.card_statement'));
  const minimum = positiveOf(fields.minimumPayment?.value);
  if (payment === null && fields.minimumPayment && minimum !== null) {
    a.read(
      'monthlyPayment',
      amountText(minimum),
      lowest(fields.minimumPayment.confidence, 'medium'),
      true,
    );
    a.notes.push(tr('client.credit.documents.minimum_payment'));
  }
}

// What a statement of an early repayment says. The interest still due is worked out from a whole
// schedule: the interest of every row due after the repayment.
function repayment(a: Answers, e: CreditExtraction, product: string | null, tr: Translate) {
  const { fields } = e;
  const on = dateOf(fields.repaidOn?.value);
  const repaid = positiveOf(fields.principalRepaid?.value);
  const charged = amountOf(fields.compensationCharged?.value);
  if (!on && repaid === null && charged === null) return;
  a.open('repaid', 'yes');
  if (fields.repaidOn && on) a.read('repaidOn', toIso(on), fields.repaidOn.confidence);
  a.field('principalRepaid', fields.principalRepaid, map(repaid, amountText));
  a.field('compensation', fields.compensationCharged, map(charged, amountText));
  a.field(
    'interestSettled',
    fields.interestSettled,
    map(amountOf(fields.interestSettled?.value), amountText),
  );
  const end = dateOf(fields.agreedEndOn?.value);
  if (fields.agreedEndOn && end) a.read('agreedEndOn', toIso(end), fields.agreedEndOn.confidence);
  a.field('paidByInsurance', fields.paidByInsurance, yesNo(fields.paidByInsurance?.value));
  if (product === 'car_loan')
    a.field('discountLost', fields.discountLost, yesNo(fields.discountLost?.value));

  if (!on || e.truncated) return;
  const later = scheduleRows(e.schedule).filter((r) => compareDates(r.on, on) > 0);
  const interest = later.map((r) => amountOf(r.row.values['interest']));
  if (later.length === 0 || interest.some((x) => x === null)) return;
  a.read(
    'remainingInterest',
    amountText(sum(interest as number[])),
    lowest(...later.map((r) => r.row.confidence)),
    true,
  );
  a.notes.push(tr('client.credit.documents.remaining_interest'));
}

// What a reading puts into the credit review's sheets. Nothing here reviews anything: it only
// fills answers, each marked as read and how surely, and the person confirms every sheet before
// the review runs. No APR is worked out and nothing is compared with any rate.
export function creditPrefill(
  e: CreditExtraction,
  tr: Translate,
  checks: readonly FailedCheck[] = [],
): CreditPrefill {
  const a = new Answers();
  const kind = product(a, e);
  const revolving = kind === 'revolving';
  terms(a, e.fields, revolving);
  if (revolving) card(a, e, tr);
  else {
    instalments(a, e, tr);
    charges(a, e.charges, tr);
    insurance(a, e.fields, tr);
    repayment(a, e, kind, tr);
  }

  const quotes: Partial<Record<Quoted, string>> = {};
  const early = textOf(e.fields.earlyRepaymentClauseText?.value);
  if (early && !revolving) quotes.compensation = early;
  const withdrawal = textOf(e.fields.withdrawalClauseText?.value);
  if (withdrawal) quotes.infoReceived = withdrawal;

  const low = a.marks.some((m) => m.confidence === 'low');
  return {
    entries: a.entries,
    marks: a.marks,
    count: a.marks.length,
    lowConfidence: low,
    notes: [
      ...conflictLines(e.conflicts, tr, CREDIT_CONFLICT_FIELDS),
      ...(low ? [tr('client.documents.done_low')] : []),
      ...new Set(a.notes),
      ...(e.truncated ? [tr('client.credit.documents.rows_cut')] : []),
      ...CREDIT_CHECKS.filter((c) => checks.includes(c)).map((c) =>
        tr(`client.credit.documents.check.${c}`),
      ),
    ],
    quotes,
  };
}
