import { formatAmountInput } from '../calculator/number';
import {
  INSURANCE_CHECKS,
  type Confidence,
  type ExtractedValue,
  type FailedCheck,
  type InsuranceExtraction,
  type SourcedField,
} from '../documents/contract';
import type { ReadMark, ReadPrefill } from '../documents/ports';
import { conflictLines } from '../documents/summary';
import { parseDate, toIso, type CivilDate } from '../engine/date';
import type { Translate } from '../i18n/client';
import { CAR_COVERS, LINES, type InsuranceFormField } from './form';

// The questions beside which the documents' own words are shown, so the person can check the
// answer against them.
export const QUOTED = ['renews', 'changes'] as const;
export type Quoted = (typeof QUOTED)[number];

export interface InsurancePrefill extends ReadPrefill {
  readonly quotes: Readonly<Partial<Record<Quoted, string>>>;
}

// Of the insurance documents, only the policy and the renewal notice both state the end date.
export const INSURANCE_CONFLICT_FIELDS = ['expiresOn'] as const;

const RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };
const lowest = (...cs: Confidence[]): Confidence =>
  cs.reduce((a, b) => (RANK[b] < RANK[a] ? b : a), 'high');

const amountOf = (v: ExtractedValue | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
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

class Answers {
  readonly entries: [string, string][] = [];
  readonly marks: ReadMark[] = [];

  // An answer read, or worked out from what was read, marked as such.
  read(name: InsuranceFormField, value: string, confidence: Confidence, derived = false) {
    this.entries.push([name, value]);
    this.marks.push({
      id: name,
      container: `[data-field="${name}"]`,
      confidence,
      ...(derived && { derived: true as const }),
    });
  }

  // An answer that only opens what was read, such as «Sí» above the figures it asks for.
  open(name: InsuranceFormField, value: string) {
    this.entries.push([name, value]);
  }

  field(name: InsuranceFormField, f: SourcedField | undefined, value: string | null) {
    if (f && value !== null) this.read(name, value, f.confidence);
  }
}

const dateText = (f: SourcedField | undefined): string | null => {
  const d = dateOf(f?.value);
  return d ? toIso(d) : null;
};

// How the policy was taken out says whether it was at a distance: by internet or by phone, or
// face to face. What the person remembers is still theirs to confirm.
const DISTANCE = { online: 'yes', phone: 'yes', in_person: 'no' } as const;

// What a reading puts into the insurance review's sheets. Nothing here reviews anything: it only
// fills answers, each marked as read and how surely, and the person confirms every sheet before
// the review works out any date.
export function insurancePrefill(
  e: InsuranceExtraction,
  tr: Translate,
  checks: readonly FailedCheck[] = [],
): InsurancePrefill {
  const a = new Answers();
  const { fields } = e;
  const notes: string[] = [];
  const line = oneOf(fields.line?.value, LINES);
  a.field('line', fields.line, line);
  if (line === 'car')
    a.field('carCover', fields.carCover, oneOf(fields.carCover?.value, CAR_COVERS));
  a.field('renews', fields.renews, yesNo(fields.renews?.value));
  a.field('expiresOn', fields.expiresOn, dateText(fields.expiresOn));

  const channel = fields.channel;
  const distance = oneOf(channel?.value, ['online', 'phone', 'in_person'] as const);
  if (channel && distance)
    a.read('distance', DISTANCE[distance], lowest(channel.confidence, 'medium'), true);
  a.field('concludedOn', fields.concludedOn, dateText(fields.concludedOn));

  const noticeOn = dateText(fields.noticeOn);
  const previous = amountOf(fields.previousPremium?.value);
  const next = amountOf(fields.newPremium?.value);
  const changes = yesNo(fields.coverChanges?.value);
  if (noticeOn !== null || previous !== null || next !== null || changes !== null) {
    a.open('hasNotice', 'yes');
    // The notice's own date, which is not always the day it arrived: always to be checked.
    if (noticeOn !== null) {
      a.read('noticeReceivedOn', noticeOn, 'low', true);
      notes.push(tr('client.insurance.documents.notice_date'));
    }
    a.field(
      'previousPremium',
      fields.previousPremium,
      previous === null ? null : formatAmountInput(previous),
    );
    a.field('newPremium', fields.newPremium, next === null ? null : formatAmountInput(next));
    a.field('changes', fields.coverChanges, changes);
  }

  const quotes: Partial<Record<Quoted, string>> = {};
  const clause = textOf(fields.nonRenewalClauseText?.value);
  if (clause) quotes.renews = clause;
  const changed = textOf(fields.changesText?.value);
  if (changed) quotes.changes = changed;

  const low = a.marks.some((m) => m.confidence === 'low');
  return {
    entries: a.entries,
    marks: a.marks,
    count: a.marks.length,
    lowConfidence: low,
    notes: [
      ...conflictLines(e.conflicts, tr, INSURANCE_CONFLICT_FIELDS),
      ...(low ? [tr('client.documents.done_low')] : []),
      ...notes,
      ...INSURANCE_CHECKS.filter((c) => checks.includes(c)).map((c) =>
        tr(`client.insurance.documents.check.${c}`),
      ),
    ],
    quotes,
  };
}
