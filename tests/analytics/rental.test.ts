import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  HELP_TOPICS,
  RENTAL_ITEMS,
  RENTAL_TRACKABLE_FIELDS,
  SECTIONS,
  isValidEvent,
  type Track,
} from '../../src/analytics/events';
import { documentsAnalytics } from '../../src/analytics/documents';
import { rentalAnalytics, rentalReviewProps } from '../../src/analytics/rental';
import { RENTAL_FAQ_TOPICS } from '../../src/content/rental-faq-topics';
import { parseDate as f } from '../../src/engine/date';
import { SHEET_FIELDS, SHEETS } from '../../src/rental/form';
import { STEPS } from '../../src/rental/steps';
import {
  contract,
  repealedWindow,
  review,
  riseAboveIrav,
  unknownLargeLandlord,
  update,
} from '../rental/fixtures';

const props = (input = riseAboveIrav, detail: 'locked' | 'unlocked' = 'unlocked') =>
  rentalReviewProps({ review: review(input), input, attempt: 1, seconds: 95, detail });

describe('the catalogue follows the rental form', () => {
  it('every sheet, and the result, is a trackable section', () => {
    for (const step of STEPS) expect(SECTIONS).toContain(step);
  });
  it('every question is a trackable field', () => {
    for (const sheet of SHEETS)
      for (const field of SHEET_FIELDS[sheet]) expect(RENTAL_TRACKABLE_FIELDS).toContain(field);
  });
  it('every question on the page is a help topic', () => {
    for (const [, anchor] of RENTAL_FAQ_TOPICS) expect(HELP_TOPICS).toContain(anchor);
  });
});

describe('rental events', () => {
  it('accept the sheets, the fields, the reasons and the items', () => {
    expect(isValidEvent('section_viewed', { section: 'subidas' })).toBe(true);
    expect(isValidEvent('went_back', { from: 'salida', to: 'casero' })).toBe(true);
    expect(isValidEvent('validation_error', { section: 'contrato', field: 'signedOn' })).toBe(true);
    expect(isValidEvent('validation_error', { section: 'subidas', field: 'updates' })).toBe(true);
    expect(
      isValidEvent('validation_error', { section: 'subidas', field: 'updates.0.newRent' }),
    ).toBe(false);
    for (const reason of ['before_2019', 'seasonal', 'room', 'other_use', 'protected', 'old_rent'])
      expect(isValidEvent('rental_out_of_scope', { reason })).toBe(true);
    expect(isValidEvent('rental_out_of_scope', { reason: '2018-05-02' })).toBe(false);
    for (const item of RENTAL_ITEMS) expect(isValidEvent('detail_opened', { item })).toBe(true);
    expect(isValidEvent('help_opened', { topic: 'faq-alquiler-subida' })).toBe(true);
    expect(isValidEvent('detail_opened', { item: 'Estudio de solvencia' })).toBe(false);
  });

  it('a whole review leaves as codes and buckets', () => {
    const p = props();
    expect(isValidEvent('rental_review_completed', p)).toBe(true);
    expect(p).toEqual({
      signed_period: '2023-2026',
      landlord: 'person',
      large_landlord: 'no',
      clause: 'ipc',
      updates: '1',
      fees: 'none',
      guarantees: expect.any(String),
      rent_update: 'paid_over',
      charges: 'none',
      deposit_return: 'none',
      depends: [],
      difference: '100-500',
      offered: true,
      detail: 'unlocked',
      attempt: '1',
      seconds: '60-180',
    });
    expect(Object.keys(p).toSorted()).toEqual(
      Object.keys(CATALOGUE.rental_review_completed).toSorted(),
    );
  });

  it('names the doubts, each once, and counts a repealed window out of the difference', () => {
    expect(props(unknownLargeLandlord).large_landlord).toBe('unknown');
    const repealed = props(repealedWindow);
    expect(repealed.depends).toContain('repealed_window');
    expect(repealed.difference).toBe('0');
    expect(isValidEvent('rental_review_completed', repealed)).toBe(true);
  });

  it('sorts the lease by the norms on agency fees', () => {
    const signed = (day: string) =>
      props(contract({ signedOn: f(day), startDate: f(day), updates: [] })).signed_period;
    expect(signed('2019-03-06')).toBe('2019-2023');
    expect(signed('2023-05-25')).toBe('2019-2023');
    expect(signed('2023-05-26')).toBe('2023-2026');
    expect(signed('2026-10-07')).toBe('2023-2026');
    expect(signed('2026-10-08')).toBe('2026+');
  });

  it('counts rises in a bucket', () => {
    const rises = (n: number) =>
      props(
        contract({
          signedOn: f('2019-06-01'),
          startDate: f('2019-06-01'),
          updates: Array.from({ length: n }, (_, i) =>
            update(`${2020 + i}-06-01`, 1000, 1000, { agreedInWriting: true }),
          ),
        }),
      ).updates;
    expect([0, 1, 2, 3, 5].map(rises)).toEqual(['0', '1', '2', '3+', '3+']);
  });

  it('refuses euros or a date in any key', () => {
    const p = props();
    for (const key of Object.keys(p))
      for (const value of [
        412.5,
        '412,50 €',
        '412.5',
        '1030',
        '2025-03-20',
        '20-03-2025',
        ['2025'],
      ])
        expect(isValidEvent('rental_review_completed', { ...p, [key]: value }), key).toBe(false);
    expect(isValidEvent('rental_review_completed', { ...p, rent: '1030' })).toBe(false);
  });

  it('rentalAnalytics names each event as the catalogue does', () => {
    const sent: [string, Record<string, unknown>][] = [];
    let clock = 0;
    const events = rentalAnalytics(
      ((name: string, p: Record<string, unknown>) => {
        expect(isValidEvent(name, p), name).toBe(true);
        sent.push([name, p]);
      }) as Track,
      () => clock,
    );
    events.stepShown('contrato');
    events.stepShown('contrato');
    clock = 12_000;
    events.fieldRejected('contrato', 'signedOn');
    events.stepCompleted('contrato');
    events.stepShown('casero');
    events.wentBack('casero', 'contrato');
    events.outOfScope('seasonal');
    events.helpOpened('faq-alquiler-fianza');
    events.detailOpened('rent_update');
    clock = 100_000;
    events.reviewCompleted({
      review: review(riseAboveIrav),
      input: riseAboveIrav,
      detail: 'locked',
    });
    events.reviewCompleted({
      review: review(riseAboveIrav),
      input: riseAboveIrav,
      detail: 'locked',
    });
    events.startedOver();
    expect(sent.map(([n]) => n)).toEqual([
      'section_viewed',
      'validation_error',
      'section_completed',
      'section_viewed',
      'went_back',
      'rental_out_of_scope',
      'help_opened',
      'detail_opened',
      'rental_review_completed',
      'rental_review_completed',
      'started_over',
    ]);
    expect(sent[2]?.[1]).toEqual({ section: 'contrato', seconds: '10-30' });
    expect(sent[5]?.[1]).toEqual({ reason: 'seasonal' });
    expect(sent[8]?.[1]).toMatchObject({ attempt: '1', seconds: '60-180', detail: 'locked' });
    expect(sent[9]?.[1]).toMatchObject({ attempt: '2' });
  });

  it('a download names the rental letter by its kind', () => {
    for (const kind of ['deposit_return', 'rent_review'])
      expect(
        isValidEvent('report_downloaded', {
          document: 'letter',
          letter_prefilled: 'some',
          letter_kind: kind,
        }),
      ).toBe(true);
    expect(
      isValidEvent('report_downloaded', {
        document: 'letter',
        letter_prefilled: 'some',
        letter_kind: 'ES0000000000000000000000',
      }),
    ).toBe(false);
  });

  it('the rental page measures its reads with the same document events', () => {
    const sent: string[] = [];
    const events = documentsAnalytics(((name: string, p: unknown) => {
      expect(isValidEvent(name, p), name).toBe(true);
      sent.push(name);
    }) as Track);
    events.extractionCompleted({
      kinds: ['lease', 'rent_update_notice', 'rent_receipt', 'agency_invoice', 'deposit_return'],
      fields: 9,
      lowConfidence: false,
      failedChecks: false,
      conflicts: false,
      escalated: false,
      skippedReasons: ['not_rental_document'],
    });
    events.nothingRead(['not_rental_document'], '1', 0);
    expect(sent).toEqual(['extraction_completed', 'nothing_read']);
  });
});
