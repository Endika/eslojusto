import { formatAmountInput } from '../../calculator/number';
import {
  TELECOM_CHECKS,
  type Confidence,
  type ExtractedValue,
  type FailedCheck,
  type SourcedField,
  type TelecomExtraction,
} from '../../documents/contract';
import type { ReadMark, ReadPrefill } from '../../documents/ports';
import { parseDate, toIso } from '../../engine/date';
import type { Translate } from '../../i18n/client';
import { PRICE_INDEXES, type TelecomFormField } from './form';

// The questions beside which the contract's own words are shown, to check the answer against them.
export const QUOTED = ['agreedPenalty', 'priceIndex'] as const;
export type Quoted = (typeof QUOTED)[number];

export interface TelecomPrefill extends ReadPrefill {
  readonly quotes: Readonly<Partial<Record<Quoted, string>>>;
}

const RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };
const lowest = (...cs: Confidence[]): Confidence =>
  cs.reduce((a, b) => (RANK[b] < RANK[a] ? b : a), 'high');

const amountOf = (v: ExtractedValue | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
const textOf = (v: ExtractedValue | undefined): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

function isoOf(v: ExtractedValue | undefined): string | null {
  if (typeof v !== 'string') return null;
  try {
    return toIso(parseDate(v));
  } catch {
    return null;
  }
}

class Answers {
  readonly entries: [string, string][] = [];
  readonly marks: ReadMark[] = [];

  read(name: TelecomFormField, value: string, confidence: Confidence, derived = false) {
    this.entries.push([name, value]);
    this.marks.push({
      id: name,
      container: `[data-field="${name}"]`,
      confidence,
      ...(derived && { derived: true as const }),
    });
  }

  open(name: TelecomFormField, value: string) {
    this.entries.push([name, value]);
  }

  field(name: TelecomFormField, f: SourcedField | undefined, value: string | null) {
    if (f && value !== null) this.read(name, value, f.confidence);
  }
}

// What a reading puts into the review of leaving a phone or internet contract: the commitment and
// its penalty from the contract, and what the bills charged as a penalty. The day the exit was
// asked for, and whether the conditions changed before it, are the person's to say.
export function telecomPrefill(
  e: TelecomExtraction,
  tr: Translate,
  checks: readonly FailedCheck[] = [],
): TelecomPrefill {
  const a = new Answers();
  const { fields } = e;
  const notes: string[] = [];

  const months = amountOf(fields.commitmentMonths?.value);
  if (months !== null && Number.isInteger(months)) {
    a.open('hasCommitment', 'yes');
    a.field('months', fields.commitmentMonths, String(months));
    const starts = isoOf(fields.commitmentStartsOn?.value);
    const signed = isoOf(fields.signedOn?.value);
    if (starts !== null) a.field('startedOn', fields.commitmentStartsOn, starts);
    else if (signed !== null && fields.signedOn) {
      // The contract's date, which is not always the day the commitment started: to be checked.
      a.read('startedOn', signed, 'low', true);
      notes.push(tr('client.bills.documents.telecom.started_on'));
    }
    const penalty = amountOf(fields.agreedPenalty?.value);
    a.field(
      'agreedPenalty',
      fields.agreedPenalty,
      penalty === null ? null : formatAmountInput(penalty),
    );
  }

  const subsidised = fields.handsetSubsidised?.value;
  if (typeof subsidised === 'boolean' && fields.handsetSubsidised) {
    a.read('hasHandset', subsidised ? 'yes' : 'no', fields.handsetSubsidised.confidence);
    const value = amountOf(fields.handsetValue?.value);
    if (subsidised)
      a.field(
        'handsetValue',
        fields.handsetValue,
        value === null ? null : formatAmountInput(value),
      );
  }
  const index = fields.priceReviewIndex?.value;
  if (typeof index === 'string' && (PRICE_INDEXES as readonly string[]).includes(index))
    a.field('priceIndex', fields.priceReviewIndex, index);

  // What the bills charged as a penalty for leaving, added up when it comes in several lines.
  const penalties = e.lines.filter((l) => l.values['kind'] === 'penalty');
  const charged = penalties.reduce((sum, l) => sum + (amountOf(l.values['amount']) ?? 0), 0);
  if (penalties.length > 0)
    a.read(
      'penaltyCharged',
      formatAmountInput(Math.round(charged * 100) / 100),
      lowest(...penalties.map((l) => l.confidence)),
      penalties.length > 1,
    );

  const quotes: Partial<Record<Quoted, string>> = {};
  const penaltyText = textOf(fields.penaltyText?.value);
  if (penaltyText) quotes.agreedPenalty = penaltyText;
  const reviewText = textOf(fields.priceReviewText?.value);
  if (reviewText) quotes.priceIndex = reviewText;

  const low = a.marks.some((m) => m.confidence === 'low');
  return {
    entries: a.entries,
    marks: a.marks,
    count: a.marks.length,
    lowConfidence: low,
    notes: [
      ...(low ? [tr('client.documents.done_low')] : []),
      ...notes,
      ...(e.truncated ? [tr('client.bills.documents.truncated')] : []),
      ...TELECOM_CHECKS.filter((c) => checks.includes(c)).map((c) =>
        tr(`client.bills.documents.telecom.check.${c}`),
      ),
    ],
    quotes,
  };
}
