import { formatAmountInput } from '../../calculator/number';
import {
  TELECOM_CHECKS,
  type FailedCheck,
  type SourcedField,
  type TelecomExtraction,
} from '../../documents/contract';
import type { ReadPrefill } from '../../documents/ports';
import type { Translate } from '../../i18n/client';
import { amountOf, isoOf, lowest, textOf } from '../../documents/read';
import { Answers } from '../read';
import { PRICE_INDEXES, type TelecomFormField } from './form';

// The questions beside which the contract's own words are shown, to check the answer against them.
export const QUOTED = ['agreedPenalty', 'priceIndex'] as const;
type Quoted = (typeof QUOTED)[number];

interface TelecomPrefill extends ReadPrefill {
  readonly quotes: Readonly<Partial<Record<Quoted, string>>>;
}

class TelecomAnswers extends Answers<TelecomFormField> {
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
  // Stryker disable next-line ArrayDeclaration: a stray entry names no check, so none is worded
  checks: readonly FailedCheck[] = [],
): TelecomPrefill {
  const a = new TelecomAnswers();
  const { fields } = e;
  const notes: string[] = [];

  const months = amountOf(fields.commitmentMonths?.value);
  if (Number.isInteger(months)) {
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
  // Stryker disable next-line ConditionalExpression: a non-string is in no list of strings; typeof only narrows
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

  const low = a.lowConfidence();
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
