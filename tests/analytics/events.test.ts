import { describe, expect, it } from 'vitest';
import { SHEET_FIELDS, SHEETS, ITEM_IDS } from '../../src/calculator/form';
import { FAQ_TOPICS } from '../../src/content/faq-topics';
import {
  CATALOGUE,
  SECTIONS,
  TRACKABLE_FIELDS,
  HELP_TOPICS,
  changedFields,
  differenceBucket,
  attemptBucket,
  reviewSecondsBucket,
  sectionSecondsBucket,
  isValidEvent,
  snapshot,
  reviewProps,
  outcomeOf,
  fieldsBucket,
  type Track,
} from '../../src/analytics/events';
import { documentsAnalytics } from '../../src/analytics/documents';
import { cleanEvent } from '../../src/analytics/sanitize';
import { POSTHOG_OPTIONS } from '../../src/analytics/posthog';
import type { Status, ItemResult } from '../../src/engine/compare';
import { estimateBenefit } from '../../src/engine/unemployment';
import { reviewFinalPay, type Review } from '../../src/engine/review';
import type { FinalPayInput, ItemId } from '../../src/engine/types';

const input: FinalPayInput = {
  cause: 'fixed_term_end',
  fixedTermType: 'production_circumstances',
  startDate: { y: 2010, m: 3, d: 1 },
  endDate: { y: 2026, m: 9, d: 15 },
  monthlySalary: 1500,
  extraPayProrated: false,
  extraPayCount: 2,
  extraPayAmount: 1500,
  extraPayAccrual: 'semiannual',
  holidayUnit: 'calendar',
  annualHolidayDays: 30,
  holidayDaysTaken: 10,
};
const today = { y: 2026, m: 10, d: 6 };
const benefit = estimateBenefit(input, 1);

function review(...statuses: [ItemId, Status, number | null, number | null][]): Review {
  const items: ItemResult[] = statuses.map(([id, status, employerFigure, difference]) => ({
    item: {
      id,
      direction: id === 'notice_deduction' ? 'deduction' : 'credit',
      range: status === 'not_checkable' ? null : { min: 1, max: 1 },
      calculation: [],
      dependsOnAgreement: false,
      basedOnYourAnswer: false,
      sources: [],
    },
    employerFigure,
    status,
    difference,
  }));
  return { items, unfairReference: null, uncheckedCodes: [], lateInterest: null };
}

describe('buckets', () => {
  it('difference, at each edge', () => {
    expect(differenceBucket(0)).toBe('0');
    expect(differenceBucket(0.01)).toBe('<100');
    expect(differenceBucket(99.99)).toBe('<100');
    expect(differenceBucket(100)).toBe('100-500');
    expect(differenceBucket(500)).toBe('100-500');
    expect(differenceBucket(500.01)).toBe('500-2000');
    expect(differenceBucket(2000)).toBe('500-2000');
    expect(differenceBucket(2000.01)).toBe('>2000');
  });
  it('seconds in a section', () => {
    expect(sectionSecondsBucket(0)).toBe('<10');
    expect(sectionSecondsBucket(9.99)).toBe('<10');
    expect(sectionSecondsBucket(10)).toBe('10-30');
    expect(sectionSecondsBucket(30)).toBe('10-30');
    expect(sectionSecondsBucket(30.5)).toBe('30-60');
    expect(sectionSecondsBucket(60)).toBe('30-60');
    expect(sectionSecondsBucket(180)).toBe('60-180');
    expect(sectionSecondsBucket(180.1)).toBe('>180');
  });
  it('seconds until the review', () => {
    expect(reviewSecondsBucket(59.9)).toBe('<60');
    expect(reviewSecondsBucket(60)).toBe('60-180');
    expect(reviewSecondsBucket(180)).toBe('60-180');
    expect(reviewSecondsBucket(600)).toBe('180-600');
    expect(reviewSecondsBucket(600.1)).toBe('>600');
  });
  it('attempt', () => {
    expect([1, 2, 3, 9].map(attemptBucket)).toEqual(['1', '2', '3+', '3+']);
  });
});

describe('the catalogue guard', () => {
  it('accepts a well-formed event of each kind', () => {
    expect(isValidEvent('browser_language', { lang: 'ja' })).toBe(true);
    expect(isValidEvent('page_translated', { lang: 'unknown' })).toBe(true);
    expect(isValidEvent('section_viewed', { section: 'salario' })).toBe(true);
    expect(isValidEvent('section_completed', { section: 'fechas', seconds: '10-30' })).toBe(true);
    expect(isValidEvent('went_back', { from: 'salario', to: 'causa' })).toBe(true);
    expect(isValidEvent('section_viewed', { section: 'temporal' })).toBe(true);
    expect(isValidEvent('section_completed', { section: 'pagas', seconds: '<10' })).toBe(true);
    expect(isValidEvent('went_back', { from: 'pagas', to: 'salario' })).toBe(true);
    expect(isValidEvent('section_viewed', { section: 'prorrateo' })).toBe(true);
    expect(isValidEvent('went_back', { from: 'resultado', to: 'prorrateo' })).toBe(true);
    expect(
      isValidEvent('validation_error', { section: 'prorrateo', field: 'extraPayProrated' }),
    ).toBe(true);
    // The «No lo sé» checkbox is a form control, not an engine field: it is never a tracked name.
    expect(
      isValidEvent('validation_error', {
        section: 'vacaciones',
        field: 'holidayDaysTakenUnknown',
      }),
    ).toBe(false);
    expect(isValidEvent('validation_error', { section: 'pagas', field: 'extraPayAmount' })).toBe(
      true,
    );
    expect(isValidEvent('validation_error', { section: 'salario', field: 'monthlySalary' })).toBe(
      true,
    );
    expect(isValidEvent('help_opened', { topic: 'faq-datos' })).toBe(true);
    expect(isValidEvent('detail_opened', { item: 'holiday_pay' })).toBe(true);
    expect(isValidEvent('started_over', {})).toBe(true);
    expect(isValidEvent('js_error', { kind: 'TypeError', source: 'main.CzX1-a.js:1' })).toBe(true);
  });

  it('rejects a figure in place of its bucket', () => {
    const props = reviewProps({
      review: review(['pending_salary', 'below_minimum', 100, 412.5]),
      input,
      attempt: 1,
      changedFields: [],
      seconds: 90,
      benefit,
      otherContracts: 0,
      detail: 'unlocked',
    });
    expect(isValidEvent('review_completed', props)).toBe(true);
    expect(isValidEvent('review_completed', { ...props, difference: 412.5 })).toBe(false);
    expect(isValidEvent('review_completed', { ...props, seconds: 90 })).toBe(false);
    expect(isValidEvent('review_completed', { ...props, below_minimum: 7 })).toBe(false);
    expect(isValidEvent('review_completed', { ...props, below_minimum: 1.5 })).toBe(false);
    expect(isValidEvent('review_completed', { ...props, changed_fields: ['1500'] })).toBe(false);
    expect(isValidEvent('review_completed', { ...props, changed_fields: 'monthlySalary' })).toBe(
      false,
    );
  });

  it('rejects a value that is not a field name', () => {
    expect(isValidEvent('validation_error', { section: 'salario', field: '1500' })).toBe(false);
    expect(isValidEvent('validation_error', { section: 'salario', field: '2010-03-01' })).toBe(
      false,
    );
    expect(isValidEvent('section_viewed', { section: 'sheet' })).toBe(false);
    expect(isValidEvent('browser_language', { lang: '1500' })).toBe(false);
    expect(isValidEvent('browser_language', { lang: 'ja-JP' })).toBe(false);
    expect(isValidEvent('js_error', { kind: 'No hay 1.500 €', source: 'main.js:1' })).toBe(false);
    expect(isValidEvent('js_error', { kind: 'TypeError', source: '1500' })).toBe(false);
    expect(isValidEvent('help_opened', { topic: 'faq-other' })).toBe(false);
  });

  it('rejects extra or missing properties and unknown events', () => {
    expect(isValidEvent('section_viewed', { section: 'causa', salary: 'causa' })).toBe(false);
    expect(isValidEvent('section_completed', { section: 'causa' })).toBe(false);
    expect(isValidEvent('started_over', { amount: '0' })).toBe(false);
    expect(isValidEvent('salary', { section: 'causa' })).toBe(false);
    expect(isValidEvent('toString', {})).toBe(false);
    expect(isValidEvent('section_viewed', null)).toBe(false);
    expect(isValidEvent('section_viewed', ['causa'])).toBe(false);
  });

  it('covers every event in the catalogue', () => {
    expect(Object.keys(CATALOGUE).toSorted()).toEqual(
      [
        'went_back',
        'help_opened',
        'detail_opened',
        'started_over',
        'js_error',
        'validation_error',
        'browser_language',
        'page_translated',
        'review_completed',
        'rental_out_of_scope',
        'rental_review_completed',
        'employment_out_of_scope',
        'employment_review_completed',
        'household_out_of_scope',
        'household_review_completed',
        'section_completed',
        'section_viewed',
        'start_chosen',
        'upload_started',
        'extraction_completed',
        'extraction_failed',
        'nothing_read',
        'quality_warned',
        'quality_overridden',
        'checkout_started',
        'pass_issued',
        'pass_failed',
        'pass_verified',
        'report_downloaded',
      ].toSorted(),
    );
  });
});

describe('document and pass events', () => {
  it('accept kinds, codes and buckets', () => {
    expect(isValidEvent('start_chosen', { path: 'upload' })).toBe(true);
    expect(isValidEvent('upload_started', { files_bucket: '10-15', pdfs: 2 })).toBe(true);
    expect(isValidEvent('upload_started', { files_bucket: '16-25', pdfs: 25 })).toBe(true);
    expect(
      isValidEvent('extraction_completed', {
        doc_types: ['dismissal_letter', 'payslip', 'other'],
        fields_bucket: '4-8',
        low_confidence: false,
        failed_checks: true,
        conflicts: true,
        escalated: 'yes',
        skipped_reasons: [],
      }),
    ).toBe(true);
    expect(
      isValidEvent('nothing_read', {
        reasons: ['blurry', 'handwritten', 'unread'],
        files_bucket: '2-4',
        pdfs: 1,
      }),
    ).toBe(true);
    for (const kind of ['dark', 'blurry', 'small'])
      expect(isValidEvent('quality_warned', { kind })).toBe(true);
    expect(isValidEvent('quality_overridden', {})).toBe(true);
    expect(isValidEvent('extraction_failed', { code: 'network_error' })).toBe(true);
    expect(isValidEvent('checkout_started', {})).toBe(true);
    expect(isValidEvent('pass_issued', { via: 'recovery' })).toBe(true);
    expect(isValidEvent('pass_failed', { code: 'session_mismatch' })).toBe(true);
    for (const result of ['ok', 'invalid', 'expired', 'revoked', 'unavailable'])
      expect(isValidEvent('pass_verified', { result })).toBe(true);
    expect(isValidEvent('pass_verified', { result: 'v1.pass.token' })).toBe(false);
    expect(
      isValidEvent('report_downloaded', {
        document: 'letter',
        letter_prefilled: 'some',
        letter_kind: 'general',
      }),
    ).toBe(true);
    expect(
      isValidEvent('report_downloaded', {
        document: 'report',
        letter_prefilled: 'not_applicable',
        letter_kind: 'not_applicable',
      }),
    ).toBe(true);
  });
  it('refuse anything read from a document or a payment', () => {
    expect(isValidEvent('upload_started', { files_bucket: '7', pdfs: 0 })).toBe(false);
    expect(isValidEvent('upload_started', { files_bucket: '26', pdfs: 0 })).toBe(false);
    expect(isValidEvent('upload_started', { files_bucket: '1', pdfs: 26 })).toBe(false);
    const completed = {
      doc_types: ['payslip'],
      fields_bucket: '1-3',
      low_confidence: false,
      failed_checks: false,
      conflicts: false,
      escalated: 'no',
      skipped_reasons: ['dark'],
    };
    expect(isValidEvent('extraction_completed', completed)).toBe(true);
    expect(
      isValidEvent('extraction_completed', { ...completed, skipped_reasons: ['Foto 3'] }),
    ).toBe(false);
    expect(
      isValidEvent('extraction_completed', { ...completed, skipped_reasons: ['dark', 'dark'] }),
    ).toBe(false);
    expect(isValidEvent('nothing_read', { reasons: ['ok'], files_bucket: '1', pdfs: 0 })).toBe(
      false,
    );
    expect(isValidEvent('quality_warned', { kind: 'too_dark_42' })).toBe(false);
    expect(isValidEvent('quality_overridden', { kind: 'dark' })).toBe(false);
    expect(isValidEvent('extraction_completed', { ...completed, doc_types: ['nómina'] })).toBe(
      false,
    );
    expect(isValidEvent('extraction_completed', { ...completed, fields_bucket: '7' })).toBe(false);
    expect(isValidEvent('extraction_completed', { ...completed, escalated: true })).toBe(false);
    expect(isValidEvent('extraction_completed', { ...completed, conflicts: 'endDate' })).toBe(
      false,
    );
    expect(isValidEvent('extraction_failed', { code: '1.850,00' })).toBe(false);
    expect(isValidEvent('pass_issued', { via: 'cs_test_123' })).toBe(false);
    expect(isValidEvent('checkout_started', { session: 'cs_test_123' })).toBe(false);
    expect(isValidEvent('report_downloaded', { document: 'letter' })).toBe(false);
    expect(
      isValidEvent('report_downloaded', {
        document: 'letter',
        letter_prefilled: 'Alex Ejemplo',
        letter_kind: 'items',
      }),
    ).toBe(false);
  });
  it('fields_bucket', () => {
    expect([0, 1, 3, 4, 8, 9, 40].map(fieldsBucket)).toEqual([
      '0',
      '1-3',
      '1-3',
      '4-8',
      '4-8',
      '9+',
      '9+',
    ]);
  });
  it('documentsAnalytics names each event as the catalogue does', () => {
    const sent: [string, unknown][] = [];
    const events = documentsAnalytics(((name: string, props: unknown) => {
      expect(isValidEvent(name, props), name).toBe(true);
      sent.push([name, props]);
    }) as Track);
    events.startChosen('manual');
    events.uploadStarted('2-4', 1);
    const result = {
      kinds: ['payslip', 'other'] as const,
      fields: 5,
      lowConfidence: true,
      failedChecks: false,
      conflicts: true,
      escalated: null,
      skippedReasons: ['blurry', 'foreign_jurisdiction'] as const,
    };
    events.extractionCompleted(result);
    events.extractionCompleted({ ...result, escalated: true });
    events.extractionFailed('captcha_failed');
    events.nothingRead(['dark', 'no_data'], '1', 0);
    events.qualityWarned('blurry');
    events.qualityOverridden();
    events.checkoutStarted();
    events.passIssued('return');
    events.passFailed('price_mismatch');
    events.downloaded('report');
    events.downloaded('letter', 'all', 'items');
    expect(sent.slice(-2).map(([, p]) => p)).toEqual([
      { document: 'report', letter_prefilled: 'not_applicable', letter_kind: 'not_applicable' },
      { document: 'letter', letter_prefilled: 'all', letter_kind: 'items' },
    ]);
    expect(sent.map(([n]) => n)).toEqual([
      'start_chosen',
      'upload_started',
      'extraction_completed',
      'extraction_completed',
      'extraction_failed',
      'nothing_read',
      'quality_warned',
      'quality_overridden',
      'checkout_started',
      'pass_issued',
      'pass_failed',
      'report_downloaded',
      'report_downloaded',
    ]);
    expect(sent[1]?.[1]).toEqual({ files_bucket: '2-4', pdfs: 1 });
    expect(sent[2]?.[1]).toEqual({
      doc_types: ['payslip', 'other'],
      fields_bucket: '4-8',
      low_confidence: true,
      failed_checks: false,
      conflicts: true,
      escalated: 'unknown',
      skipped_reasons: ['blurry', 'foreign_jurisdiction'],
    });
    expect(sent[3]?.[1]).toMatchObject({ escalated: 'yes' });
    expect(sent[5]?.[1]).toEqual({ reasons: ['dark', 'no_data'], files_bucket: '1', pdfs: 0 });
    expect(sent[6]?.[1]).toEqual({ kind: 'blurry' });
    expect(sent[7]?.[1]).toEqual({});
  });
});

describe('the catalogue follows the form', () => {
  it('every form field is a trackable field', () => {
    for (const sheet of SHEETS)
      for (const field of SHEET_FIELDS[sheet]) expect(TRACKABLE_FIELDS).toContain(field);
  });
  it('every item has its trackable figure', () => {
    for (const id of ITEM_IDS) expect(TRACKABLE_FIELDS).toContain(`figure_${id}`);
  });
  it('every form sheet, and the result, is a trackable section', () => {
    expect(SECTIONS.slice(0, SHEETS.length + 1)).toEqual([...SHEETS, 'resultado']);
  });
  it('every frequently asked question is a help topic', () => {
    expect(HELP_TOPICS.slice(0, FAQ_TOPICS.length)).toEqual(FAQ_TOPICS.map(([, anchor]) => anchor));
  });
});

describe('review_completed', () => {
  it('outcome: shortfall', () => {
    expect(outcomeOf(review(['holiday_pay', 'below_minimum', 10, 50]))).toBe('shortfall');
    expect(outcomeOf(review(['notice_deduction', 'deduction_too_high', 900, 300]))).toBe(
      'shortfall',
    );
  });
  it('outcome: all_match', () => {
    expect(
      outcomeOf(
        review(
          ['pending_salary', 'matches', 1, null],
          ['holiday_pay', 'above_minimum', 9, null],
          ['extra_pay', 'not_checkable', null, null],
        ),
      ),
    ).toBe('all_match');
  });
  it('outcome: only_not_checkable', () => {
    expect(
      outcomeOf(
        review(
          ['holiday_pay', 'not_checkable', 300, null],
          ['severance', 'no_employer_figure', null, null],
        ),
      ),
    ).toBe('only_not_checkable');
  });
  it('outcome: no_figures', () => {
    expect(
      outcomeOf(
        review(
          ['pending_salary', 'no_employer_figure', null, null],
          ['holiday_pay', 'not_checkable', null, null],
        ),
      ),
    ).toBe('no_figures');
  });

  it('says whether the unfair-dismissal reference was shown, never its figure', () => {
    const props = (unfairReference: number | null) =>
      reviewProps({
        review: { ...review(['severance', 'matches', 1000, null]), unfairReference },
        input,
        attempt: 1,
        changedFields: [],
        seconds: 30,
        benefit,
        otherContracts: 0,
        detail: 'unlocked',
      });
    expect(props(8136.99).unfair_reference).toBe('shown');
    expect(props(null).unfair_reference).toBe('none');
    expect(JSON.stringify(props(8136.99))).not.toContain('8136');
  });

  it('counts statuses and adds up only the shortfall', () => {
    const props = reviewProps({
      review: review(
        ['pending_salary', 'below_minimum', 100, 60],
        ['holiday_pay', 'below_minimum', 100, 50],
        ['extra_pay', 'matches', 300, null],
        ['severance', 'above_minimum', 40000, null],
        ['employer_notice', 'not_checkable', null, null],
        ['notice_deduction', 'deduction_too_high', 500, 3000],
      ),
      input,
      attempt: 2,
      changedFields: ['monthlySalary'],
      seconds: 200,
      benefit,
      otherContracts: 0,
      detail: 'locked',
    });
    expect(props).toEqual({
      cause: 'fixed_term_end',
      fixed_term_type: 'production_circumstances',
      extra_pay: 'semiannual',
      holiday_unit: 'calendar',
      work_week: 'not_applicable',
      figures_entered: 5,
      below_minimum: 2,
      matching: 1,
      above_minimum: 1,
      not_checkable: 1,
      deduction_too_high: true,
      difference: '100-500',
      result: 'shortfall',
      attempt: '2',
      changed_fields: ['monthlySalary'],
      seconds: '180-600',
      benefit: 'with_figures',
      other_contracts: '0',
      unfair_reference: 'none',
      detail: 'locked',
    });
    expect(isValidEvent('review_completed', props)).toBe(true);
  });

  it('extra pay and fixed-term type come from the input, never from a text', () => {
    const base = {
      review: review(),
      attempt: 1,
      changedFields: [],
      seconds: 1,
      benefit,
      otherContracts: 0,
      detail: 'unlocked',
    } as const;
    const withInput = (e: Partial<FinalPayInput>) =>
      reviewProps({ ...base, input: { ...input, ...e } });
    expect(withInput({ extraPayProrated: true }).extra_pay).toBe('prorated');
    expect(withInput({ extraPayCount: 0 }).extra_pay).toBe('no_extra_pay');
    expect(withInput({ extraPayAccrual: 'annual' }).extra_pay).toBe('annual');
    expect(withInput({ extraPayAccrual: 'unknown' }).extra_pay).toBe('unknown');
    expect(withInput({ cause: 'resignation' }).fixed_term_type).toBe('not_applicable');
    expect(withInput({}).work_week).toBe('not_applicable');
    expect(withInput({ holidayUnit: 'working' }).work_week).toBe('5');
    expect(withInput({ holidayUnit: 'working', workDaysPerWeek: 6 }).work_week).toBe('6');
    expect(withInput({ holidayUnit: 'working', workDaysPerWeek: 3 }).work_week).toBe('other');
  });

  it('unknown holiday days taken (null) show as a change, without their value', () => {
    const before = snapshot(input, {});
    const now = snapshot({ ...input, holidayDaysTaken: null }, {});
    expect(changedFields(before, now)).toEqual(['holidayDaysTaken']);
  });

  it('a real engine review passes the guard', () => {
    const r = reviewFinalPay(input, { severance: 40000 }, today);
    if (!r.ok) throw new Error('invalid input');
    const props = reviewProps({
      review: r.review,
      input,
      attempt: 1,
      changedFields: [],
      seconds: 30,
      benefit,
      otherContracts: 0,
      detail: 'unlocked',
    });
    expect(isValidEvent('review_completed', props)).toBe(true);
    expect(JSON.stringify(props)).not.toMatch(/1500|40000|2010|2026/);
  });
});

describe('review_completed: the benefit', () => {
  const base = { review: review(), input, attempt: 1, changedFields: [], seconds: 1 } as const;
  const props = (p: ReturnType<typeof estimateBenefit>, otherContracts = 0) =>
    reviewProps({ ...base, benefit: p, otherContracts, detail: 'unlocked' });

  it('says whether there were figures, none, or it does not apply, and nothing else', () => {
    expect(props(benefit).benefit).toBe('with_figures');
    expect(props(estimateBenefit({ ...input, cause: 'resignation' }, null)).benefit).toBe(
      'not_applicable',
    );
    const shortContract = { ...input, startDate: { y: 2026, m: 6, d: 1 } };
    expect(props(estimateBenefit(shortContract, 2)).benefit).toBe('no_figures');
  });

  it('counts the other contracts in a bucket, never their dates', () => {
    expect([0, 1, 2, 3, 7].map((n) => props(benefit, n).other_contracts)).toEqual([
      '0',
      '1',
      '2',
      '3+',
      '3+',
    ]);
  });

  it('the number of children fits in no property', () => {
    const p = props(benefit, 1);
    expect(isValidEvent('review_completed', p)).toBe(true);
    expect(isValidEvent('review_completed', { ...p, children: 1 })).toBe(false);
    expect(isValidEvent('review_completed', { ...p, benefit: 1 })).toBe(false);
    expect(isValidEvent('review_completed', { ...p, other_contracts: 3 })).toBe(false);
    expect(isValidEvent('review_completed', { ...p, other_contracts: '2025-01-01' })).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/children|20\d\d/);
  });

  it('an error in an other-contracts row is tracked by the list name', () => {
    expect(isValidEvent('validation_error', { section: 'otros', field: 'otherContracts' })).toBe(
      true,
    );
    expect(
      isValidEvent('validation_error', { section: 'otros', field: 'otherContracts.0.startDate' }),
    ).toBe(false);
    expect(isValidEvent('validation_error', { section: 'hijos', field: 'children' })).toBe(true);
  });
});

describe('changed_fields', () => {
  it('lists only the names of what changed', () => {
    const before = snapshot(input, { severance: 40000 });
    const now = snapshot(
      { ...input, monthlySalary: 1600, endDate: { y: 2026, m: 9, d: 16 } },
      { severance: 40000, holiday_pay: 12 },
    );
    const changed = changedFields(before, now);
    expect(changed).toEqual(['endDate', 'monthlySalary', 'figure_holiday_pay']);
    expect(JSON.stringify(changed)).not.toMatch(/\d/);
  });
  it('the first review has no changes, and an identical one neither', () => {
    const a = snapshot(input, {});
    expect(changedFields(null, a)).toEqual([]);
    expect(changedFields(a, snapshot({ ...input }, {}))).toEqual([]);
  });
});

describe('PostHog options', () => {
  it('no cookies, no profiles, no recording and nothing loaded from outside', () => {
    expect(POSTHOG_OPTIONS).toMatchObject({
      api_host: 'https://eu.i.posthog.com',
      persistence: 'memory',
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      person_profiles: 'never',
      advanced_disable_flags: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      capture_exceptions: false,
      before_send: cleanEvent,
    });
  });
});
