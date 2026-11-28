import { describe, expect, it } from 'vitest';
import { telecomPrefill } from '../../../src/bills/telecom/prefill';
import type {
  Confidence,
  ExtractedValue,
  SourcedField,
  TelecomExtraction,
} from '../../../src/documents/contract';
import type { Translate } from '../../../src/i18n/client';

const tr: Translate = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

const field = (value: ExtractedValue, confidence: Confidence = 'high'): SourcedField => ({
  value,
  confidence,
  source: 'telecom_contract',
});

const extraction = (e: Partial<TelecomExtraction> = {}): TelecomExtraction => ({
  pages: [],
  documents: [],
  fields: {},
  conflicts: [],
  bills: [],
  lines: [],
  ...e,
});
const fieldsOf = (fields: TelecomExtraction['fields']) => extraction({ fields });
const penaltyLine = (amount: ExtractedValue, confidence: Confidence = 'high') => ({
  values: { document: 1, kind: 'penalty', amount },
  confidence,
});

describe('a read of a phone contract', () => {
  it('fills what the contract states, each answer as sure as the contract', () => {
    const p = telecomPrefill(
      fieldsOf({
        commitmentMonths: field(18, 'medium'),
        commitmentStartsOn: field('2025-03-01', 'medium'),
        agreedPenalty: field(180.5, 'medium'),
        handsetSubsidised: field(true, 'medium'),
        handsetValue: field(300, 'medium'),
        priceReviewIndex: field('ipc', 'medium'),
      }),
      tr,
    );
    expect(p.entries).toEqual([
      ['hasCommitment', 'yes'],
      ['months', '18'],
      ['startedOn', '2025-03-01'],
      ['agreedPenalty', '180,50'],
      ['hasHandset', 'yes'],
      ['handsetValue', '300,00'],
      ['priceIndex', 'ipc'],
    ]);
    expect(p.marks.map((m) => [m.id, m.container, m.confidence])).toEqual([
      ['months', '[data-field="months"]', 'medium'],
      ['startedOn', '[data-field="startedOn"]', 'medium'],
      ['agreedPenalty', '[data-field="agreedPenalty"]', 'medium'],
      ['hasHandset', '[data-field="hasHandset"]', 'medium'],
      ['handsetValue', '[data-field="handsetValue"]', 'medium'],
      ['priceIndex', '[data-field="priceIndex"]', 'medium'],
    ]);
    expect(p).toMatchObject({ count: 6, lowConfidence: false, notes: [], quotes: {} });
  });

  it('leaves a figure it cannot read to the person', () => {
    const p = telecomPrefill(
      fieldsOf({ commitmentMonths: field(12), agreedPenalty: field(-5), signedOn: field('x') }),
      tr,
    );
    expect(p.entries).toEqual([
      ['hasCommitment', 'yes'],
      ['months', '12'],
    ]);
  });

  it('takes the date of the contract for the start only without a start, and words it', () => {
    const signed = { commitmentMonths: field(12), signedOn: field('2025-02-20') };
    const p = telecomPrefill(fieldsOf(signed), tr);
    expect(p.entries).toContainEqual(['startedOn', '2025-02-20']);
    expect(p.marks.find((m) => m.id === 'startedOn')).toEqual({
      id: 'startedOn',
      container: '[data-field="startedOn"]',
      confidence: 'low',
      derived: true,
    });
    expect(p.notes).toEqual([
      'client.documents.done_low',
      'client.bills.documents.telecom.started_on',
    ]);
    const both = telecomPrefill(
      fieldsOf({ ...signed, commitmentStartsOn: field('2025-03-01') }),
      tr,
    );
    expect(both.entries).toContainEqual(['startedOn', '2025-03-01']);
    expect(both.notes).toEqual([]);
    expect(telecomPrefill(fieldsOf({ commitmentMonths: field(12) }), tr).notes).toEqual([]);
  });

  it('reads a handset subsidised only from a field that says so with a yes or a no', () => {
    expect(telecomPrefill(fieldsOf({ handsetSubsidised: field('yes') }), tr).entries).toEqual([]);
    expect(telecomPrefill(fieldsOf({ handsetValue: field(300) }), tr).entries).toEqual([]);
    const no = telecomPrefill(
      fieldsOf({ handsetSubsidised: field(false), handsetValue: field(300) }),
      tr,
    );
    expect(no.entries).toEqual([['hasHandset', 'no']]);
    const unread = telecomPrefill(
      fieldsOf({ handsetSubsidised: field(true), handsetValue: field('x') }),
      tr,
    );
    expect(unread.entries).toEqual([['hasHandset', 'yes']]);
    const yes = telecomPrefill(fieldsOf({ handsetSubsidised: field(true) }), tr);
    expect(yes.entries).toEqual([['hasHandset', 'yes']]);
  });

  it('reads a price index only from one the form knows', () => {
    expect(telecomPrefill(fieldsOf({ priceReviewIndex: field('x') }), tr).entries).toEqual([]);
    expect(telecomPrefill(fieldsOf({ priceReviewIndex: field(3) }), tr).entries).toEqual([]);
  });

  it('keeps the contract’s words beside the questions they answer, when it has some', () => {
    expect(
      telecomPrefill(
        fieldsOf({ penaltyText: field(' Pagarás 180 '), priceReviewText: field('IPC') }),
        tr,
      ).quotes,
    ).toEqual({ agreedPenalty: 'Pagarás 180', priceIndex: 'IPC' });
    expect(
      telecomPrefill(fieldsOf({ penaltyText: field('  '), priceReviewText: field('  ') }), tr)
        .quotes,
    ).toEqual({});
  });
});

describe('a read of the penalty a bill charged', () => {
  it('reads one line as it is, and several added up and derived, as sure as the least', () => {
    const one = telecomPrefill(extraction({ lines: [penaltyLine(100, 'low')] }), tr);
    expect(one.entries).toEqual([['penaltyCharged', '100,00']]);
    expect(one.marks[0]).toEqual({
      id: 'penaltyCharged',
      container: '[data-field="penaltyCharged"]',
      confidence: 'low',
    });
    const several = telecomPrefill(
      extraction({ lines: [penaltyLine(100.5), penaltyLine(20, 'medium'), penaltyLine('x')] }),
      tr,
    );
    expect(several.entries).toEqual([['penaltyCharged', '120,50']]);
    expect(several.marks[0]).toMatchObject({ confidence: 'medium', derived: true });
  });
});

describe('what a read says of itself', () => {
  it('says what was cut off, then the checks that failed, in the order the checks have', () => {
    const p = telecomPrefill(extraction({ truncated: true }), tr, [
      'lines_above_total',
      'period_end_before_start',
    ]);
    expect(p.notes).toEqual([
      'client.bills.documents.truncated',
      'client.bills.documents.telecom.check.period_end_before_start',
      'client.bills.documents.telecom.check.lines_above_total',
    ]);
    expect(telecomPrefill(extraction(), tr, []).notes).toEqual([]);
  });
});
