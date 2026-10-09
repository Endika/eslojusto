import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  HELP_TOPICS,
  HOUSEHOLD_ITEMS,
  HOUSEHOLD_TRACKABLE_FIELDS,
  SECTIONS,
  isValidEvent,
  type Track,
} from '../../src/analytics/events';
import { householdAnalytics, householdReviewProps } from '../../src/analytics/household';
import { HOUSEHOLD_FAQ_TOPICS } from '../../src/content/household-faq-topics';
import { parseDate } from '../../src/engine/date';
import { reviewHousehold } from '../../src/engine/household/review';
import type { HouseholdInput } from '../../src/engine/household/types';
import { SHEET_FIELDS, SHEETS } from '../../src/household/form';
import { STEPS } from '../../src/household/steps';
import { DEPS, TODAY, desistimiento, household } from '../engine/household/input';

type Ending = 'working' | 'desistimiento' | 'et_cause' | 'unknown';

const props = (input: HouseholdInput = household(), ending: Ending = 'working') => {
  const r = reviewHousehold(input, TODAY, DEPS);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return householdReviewProps({ review: r.review, input, ending, attempt: 1, seconds: 95 });
};

// A live-in desistimiento with no written notice, a short notice and a night notice.
const hardCase = household({
  liveIn: true,
  startDate: parseDate('2020-01-10'),
  termination: desistimiento({
    inWriting: false,
    severanceAvailable: false,
    noticeGivenOn: parseDate('2026-09-14'),
    effectiveOn: parseDate('2026-09-21'),
    noticeTime: '22:00',
  }),
});

describe('the catalogue follows the household form', () => {
  it('every sheet, and the result, is a trackable section', () => {
    for (const step of STEPS) expect(SECTIONS).toContain(step);
    expect(new Set(SECTIONS).size).toBe(SECTIONS.length);
  });
  it('every question is a trackable field', () => {
    for (const sheet of SHEETS)
      for (const field of SHEET_FIELDS[sheet]) expect(HOUSEHOLD_TRACKABLE_FIELDS).toContain(field);
  });
  it('every question on the page is a help topic', () => {
    for (const [, anchor] of HOUSEHOLD_FAQ_TOPICS) expect(HELP_TOPICS).toContain(anchor);
    expect(new Set(HELP_TOPICS).size).toBe(HELP_TOPICS.length);
  });
});

describe('household events', () => {
  it('accept the sheets, the fields, the reason and the items', () => {
    expect(isValidEvent('section_viewed', { section: 'escrito' })).toBe(true);
    expect(isValidEvent('went_back', { from: 'preaviso', to: 'trabajo' })).toBe(true);
    expect(isValidEvent('validation_error', { section: 'sueldo', field: 'monthlyPay' })).toBe(true);
    expect(isValidEvent('validation_error', { section: 'sueldo', field: 'IBAN' })).toBe(false);
    expect(isValidEvent('household_out_of_scope', { reason: 'before_reform' })).toBe(true);
    expect(isValidEvent('household_out_of_scope', { reason: 'before_2019' })).toBe(false);
    for (const item of HOUSEHOLD_ITEMS) expect(isValidEvent('detail_opened', { item })).toBe(true);
    expect(isValidEvent('help_opened', { topic: 'faq-hogar-desistimiento' })).toBe(true);
  });

  it('a whole review leaves as codes and buckets', () => {
    const p = props(hardCase, 'desistimiento');
    expect(isValidEvent('household_review_completed', p)).toBe(true);
    expect(p).toMatchObject({
      work: 'live_in',
      pay_period: '2026+',
      ending: 'desistimiento',
      extra_pays: 'apart',
      in_kind: false,
      written: 'no',
      severance_available: 'no',
      termination: 'dismissal_regime_presumed',
      attempt: '1',
      seconds: '60-180',
    });
    expect(Object.keys(p).toSorted()).toEqual(
      Object.keys(CATALOGUE.household_review_completed).toSorted(),
    );
  });

  it('reads a running relationship with nothing wrong as within the limits', () => {
    const p = props();
    expect(p).toMatchObject({
      work: 'monthly',
      ending: 'working',
      pay: 'within_limit',
      holidays: 'within_limit',
      severance: 'none',
      notice: 'none',
      written: 'unknown',
      difference: '0',
    });
  });

  it('sorts the pay year by the minimum wage decrees', () => {
    const period = (payYear: number) =>
      props(household({ payYear, startDate: parseDate('2022-09-20') })).pay_period;
    expect(period(2022)).toBe('2022-2023');
    expect(period(2023)).toBe('2022-2023');
    expect(period(2024)).toBe('2024-2025');
    expect(period(2025)).toBe('2024-2025');
    expect(period(2026)).toBe('2026+');
  });

  it('names how the extra payments are paid, with no amount', () => {
    const extra = (extraPays: HouseholdInput['extraPays'], regime: HouseholdInput['regime']) =>
      props(household({ extraPays, regime, hourlyRate: 10 })).extra_pays;
    expect(extra(null, 'hourly_external')).toBe('not_applicable');
    expect(
      extra({ count: 0, amount: null, prorated: false, accrual: 'semiannual' }, 'monthly'),
    ).toBe('none');
    expect(
      extra({ count: 2, amount: null, prorated: true, accrual: 'semiannual' }, 'monthly'),
    ).toBe('prorated');
    expect(extra({ count: 2, amount: 800, prorated: false, accrual: 'annual' }, 'monthly')).toBe(
      'apart',
    );
  });

  it('refuses euros, a date or free text in any key', () => {
    const p = props(hardCase, 'desistimiento');
    for (const key of Object.keys(p))
      for (const value of [
        994,
        '994,00 €',
        '1500',
        '2026-09-21',
        '21-09-2026',
        '22:00',
        'Familia Ficticia',
        ['2026'],
      ])
        expect(isValidEvent('household_review_completed', { ...p, [key]: value }), key).toBe(false);
    expect(isValidEvent('household_review_completed', { ...p, salary: '1500' })).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/1500|2026-|:00/);
  });

  it('householdAnalytics names each event as the catalogue does', () => {
    const sent: [string, Record<string, unknown>][] = [];
    let clock = 0;
    const events = householdAnalytics(
      ((name: string, p: Record<string, unknown>) => {
        expect(isValidEvent(name, p), name).toBe(true);
        sent.push([name, p]);
      }) as Track,
      () => clock,
    );
    const r = reviewHousehold(hardCase, TODAY, DEPS);
    if (!r.ok) throw new Error('invalid');
    const done = { review: r.review, input: hardCase, ending: 'desistimiento' } as const;
    events.stepShown('trabajo');
    events.stepShown('trabajo');
    clock = 12_000;
    events.fieldRejected('trabajo', 'work');
    events.stepCompleted('trabajo');
    events.stepShown('fechas');
    events.wentBack('fechas', 'trabajo');
    events.outOfScope('before_reform');
    events.helpOpened('faq-hogar-smi');
    events.detailOpened('severance');
    clock = 100_000;
    events.reviewCompleted(done);
    events.reviewCompleted(done);
    events.startedOver();
    expect(sent.map(([n]) => n)).toEqual([
      'section_viewed',
      'validation_error',
      'section_completed',
      'section_viewed',
      'went_back',
      'household_out_of_scope',
      'help_opened',
      'detail_opened',
      'household_review_completed',
      'household_review_completed',
      'started_over',
    ]);
    expect(sent[2]?.[1]).toEqual({ section: 'trabajo', seconds: '10-30' });
    expect(sent[5]?.[1]).toEqual({ reason: 'before_reform' });
    expect(sent[8]?.[1]).toMatchObject({ attempt: '1', seconds: '60-180' });
    expect(sent[9]?.[1]).toMatchObject({ attempt: '2' });
  });
});
