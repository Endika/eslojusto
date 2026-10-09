import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  HELP_TOPICS,
  INSURANCE_TRACKABLE_FIELDS,
  SECTIONS,
  isValidEvent,
  type Track,
} from '../../src/analytics/events';
import { insuranceAnalytics, insuranceReviewProps } from '../../src/analytics/insurance';
import { INSURANCE_FAQ_TOPICS } from '../../src/content/insurance-faq-topics';
import { parseDate } from '../../src/engine/date';
import { INSURANCE_NORMS } from '../../src/engine/insurance/data/norms';
import { reviewInsurance } from '../../src/engine/insurance/review';
import type { InsuranceInput } from '../../src/engine/insurance/types';
import { SHEET_FIELDS, SHEETS } from '../../src/insurance/form';
import { STEPS } from '../../src/insurance/steps';
import { TODAY, notice, policy } from '../engine/insurance/input';

const completed = (input: InsuranceInput) => {
  const r = reviewInsurance(input, TODAY, { norms: INSURANCE_NORMS });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { review: r.review, input };
};

const props = (input: InsuranceInput = policy()) =>
  insuranceReviewProps({ ...completed(input), attempt: 1, seconds: 45 });

// A synthetic motor policy bought online, with voluntary covers and a renewal notice.
const carOnline = policy({
  line: 'car',
  carCover: 'with_voluntary',
  mortgageRequired: null,
  distance: true,
  concludedOn: parseDate('2026-10-01'),
  notice: notice(),
});

describe('the catalogue follows the insurance form', () => {
  it('every sheet, and the result, is a trackable section', () => {
    for (const step of STEPS) expect(SECTIONS).toContain(step);
    expect(new Set(SECTIONS).size).toBe(SECTIONS.length);
  });
  it('every question is a trackable field', () => {
    for (const sheet of SHEETS)
      for (const field of SHEET_FIELDS[sheet]) expect(INSURANCE_TRACKABLE_FIELDS).toContain(field);
  });
  it('every question on the page is a help topic', () => {
    for (const [, anchor] of INSURANCE_FAQ_TOPICS) expect(HELP_TOPICS).toContain(anchor);
    expect(new Set(HELP_TOPICS).size).toBe(HELP_TOPICS.length);
  });
});

describe('insurance events', () => {
  it('accept the sheets, the fields and the reasons', () => {
    expect(isValidEvent('section_viewed', { section: 'vencimiento' })).toBe(true);
    expect(isValidEvent('validation_error', { section: 'vencimiento', field: 'expiresOn' })).toBe(
      true,
    );
    expect(isValidEvent('validation_error', { section: 'poliza', field: 'policyNumber' })).toBe(
      false,
    );
    expect(isValidEvent('insurance_out_of_scope', { reason: 'life' })).toBe(true);
    expect(isValidEvent('insurance_out_of_scope', { reason: 'mortgage' })).toBe(false);
    expect(isValidEvent('help_opened', { topic: 'faq-seguro-no-renovar' })).toBe(true);
  });

  it('a whole review leaves as codes and buckets', () => {
    const p = props();
    expect(isValidEvent('insurance_review_completed', p)).toBe(true);
    expect(p).toEqual({
      line: 'home',
      distance: 'no',
      renewal: 'open',
      notice: 'not_entered',
      premium: 'not_entered',
      withdrawal: 'not_applicable',
      attempt: '1',
      seconds: '<60',
    });
    expect(Object.keys(p).toSorted()).toEqual(
      Object.keys(CATALOGUE.insurance_review_completed).toSorted(),
    );
  });

  it('reads a motor policy bought online by its voluntary covers', () => {
    expect(props(carOnline)).toMatchObject({
      line: 'car',
      distance: 'yes',
      premium: 'up',
      withdrawal: 'review_it',
    });
  });

  it('refuses a date, a premium or free text in any key', () => {
    const p = props(carOnline);
    for (const key of Object.keys(p))
      for (const value of [345, '345,00 €', '2027-03-01', '01-03-2027', 'Seguros Ficticios', []])
        expect(isValidEvent('insurance_review_completed', { ...p, [key]: value }), key).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/345|2027-/);
  });

  it('insuranceAnalytics names each event as the catalogue does', () => {
    const sent: [string, Record<string, unknown>][] = [];
    let clock = 0;
    const events = insuranceAnalytics(
      ((name: string, p: Record<string, unknown>) => {
        expect(isValidEvent(name, p), name).toBe(true);
        sent.push([name, p]);
      }) as Track,
      () => clock,
    );
    const done = completed(carOnline);
    events.stepShown('poliza');
    clock = 5_000;
    events.fieldRejected('vencimiento', 'expiresOn');
    events.stepCompleted('poliza');
    events.stepShown('cobertura');
    events.wentBack('cobertura', 'poliza');
    events.outOfScope('health');
    events.helpOpened('faq-seguro-aviso');
    clock = 70_000;
    events.reviewCompleted(done);
    events.startedOver();
    expect(sent.map(([n]) => n)).toEqual([
      'section_viewed',
      'validation_error',
      'section_completed',
      'section_viewed',
      'went_back',
      'insurance_out_of_scope',
      'help_opened',
      'insurance_review_completed',
      'started_over',
    ]);
    expect(sent[2]?.[1]).toEqual({ section: 'poliza', seconds: '<10' });
    expect(sent[7]?.[1]).toMatchObject({ line: 'car', attempt: '1', seconds: '60-180' });
  });
});
