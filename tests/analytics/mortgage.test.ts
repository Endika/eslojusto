import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  HELP_TOPICS,
  MORTGAGE_TRACKABLE_FIELDS,
  SECTIONS,
  isValidEvent,
  type Track,
} from '../../src/analytics/events';
import { mortgageAnalytics, mortgageReviewProps } from '../../src/analytics/mortgage';
import { MORTGAGE_FAQ_TOPICS } from '../../src/content/mortgage-faq-topics';
import { parseDate } from '../../src/engine/date';
import { reviewMortgage } from '../../src/engine/mortgage/review';
import type { MortgageInput, Operation } from '../../src/engine/mortgage/types';
import { SHEET_FIELDS, SHEETS } from '../../src/mortgage/form';
import { STEPS } from '../../src/mortgage/steps';
import { DEPS, TODAY, invoice, mortgage } from '../engine/mortgage/input';

const completed = (input: MortgageInput) => {
  const r = reviewMortgage(input, TODAY, DEPS);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { review: r.review, input };
};

const props = (input: MortgageInput = mortgage()) =>
  mortgageReviewProps({ ...completed(input), attempt: 1, seconds: 95, detail: 'locked' });

const repayment = (change: Partial<Operation> = {}): Operation => ({
  on: parseDate('2021-03-01'),
  kind: 'partial_prepayment',
  principal: 20_000,
  feeCharged: 400,
  hadInsurance: null,
  ...change,
});

// A synthetic 2021 deed: the costs by law, a fee over its cap and a floor in the deed.
const deed2021 = mortgage({
  deedOn: parseDate('2021-05-10'),
  prepaymentOption: 'a_015_5y',
  invoices: [
    invoice('notary_loan', 700, { paidOn: parseDate('2021-05-10') }),
    invoice('registry_mortgage', 450, { paidOn: parseDate('2021-05-10') }),
    invoice('valuation', 400, { paidOn: parseDate('2021-05-10') }),
  ],
  operations: [repayment({ on: parseDate('2022-03-01') })],
  clauses: [{ label: 'floor_clause', present: true, floorPercent: 1 }],
});

describe('the catalogue follows the mortgage form', () => {
  it('every sheet, and the result, is a trackable section', () => {
    for (const step of STEPS) expect(SECTIONS).toContain(step);
    expect(new Set(SECTIONS).size).toBe(SECTIONS.length);
  });
  it('every question is a trackable field', () => {
    for (const sheet of SHEETS)
      for (const field of SHEET_FIELDS[sheet]) expect(MORTGAGE_TRACKABLE_FIELDS).toContain(field);
  });
  it('every question on the page is a help topic', () => {
    for (const [, anchor] of MORTGAGE_FAQ_TOPICS) expect(HELP_TOPICS).toContain(anchor);
    expect(new Set(HELP_TOPICS).size).toBe(HELP_TOPICS.length);
  });
});

describe('mortgage events', () => {
  it('accept the sheets, the fields and the reasons', () => {
    expect(isValidEvent('section_viewed', { section: 'clausula-gastos' })).toBe(true);
    expect(isValidEvent('went_back', { from: 'suelo', to: 'escritura' })).toBe(true);
    expect(isValidEvent('validation_error', { section: 'escritura', field: 'deedOn' })).toBe(true);
    expect(isValidEvent('validation_error', { section: 'escritura', field: 'IBAN' })).toBe(false);
    expect(isValidEvent('mortgage_out_of_scope', { reason: 'company' })).toBe(true);
    expect(isValidEvent('mortgage_out_of_scope', { reason: 'before_2019' })).toBe(false);
    expect(isValidEvent('help_opened', { topic: 'faq-hipoteca-suelo' })).toBe(true);
  });

  it('a whole review leaves as codes and buckets', () => {
    const p = props(deed2021);
    expect(isValidEvent('mortgage_review_completed', p)).toBe(true);
    expect(p).toEqual({
      deed_period: '2019_plus',
      consumer: 'yes',
      expenses_statute: 'lender_bears',
      expenses_case_law: 'none',
      invoices: '3+',
      fees: 'above_cap',
      flags: ['floor_clause'],
      difference: '500-2000',
      offered: true,
      detail: 'locked',
      attempt: '1',
      seconds: '60-180',
    });
    expect(Object.keys(p).toSorted()).toEqual(
      Object.keys(CATALOGUE.mortgage_review_completed).toSorted(),
    );
  });

  it('keeps the split before 2019 on its own basis, and flags alone offer no pass', () => {
    expect(
      props(mortgage({ invoices: [invoice('notary_loan', 800)], consumer: null })),
    ).toMatchObject({
      deed_period: '2007_2013',
      consumer: 'unknown',
      expenses_statute: 'none',
      invoices: '1-2',
      fees: 'none',
      flags: [],
      difference: '0',
      offered: false,
    });
    expect(props(mortgage({ invoices: [invoice('notary_loan', 800)] }))).toMatchObject({
      expenses_case_law: 'split_explained',
      offered: false,
    });
  });

  it('sorts the deed by the days that change the review', () => {
    const period = (day: string) => props(mortgage({ deedOn: parseDate(day) })).deed_period;
    expect(period('2007-12-08')).toBe('before_2007');
    expect(period('2007-12-09')).toBe('2007_2013');
    expect(period('2013-05-15')).toBe('2013_2018');
    expect(period('2018-11-10')).toBe('2018_2019');
    expect(period('2019-06-15')).toBe('2018_2019');
    expect(period('2019-06-16')).toBe('2019_plus');
  });

  it('refuses euros, a rate, a date, a bank or free text in any key', () => {
    const p = props(deed2021);
    for (const key of Object.keys(p))
      for (const value of [
        700,
        '1.550,00 €',
        '1550',
        '0,15',
        '2021-05-10',
        '10-05-2021',
        'Banco Ficticio',
        'Caja Inventada',
        ['2021'],
      ])
        expect(isValidEvent('mortgage_review_completed', { ...p, [key]: value }), key).toBe(false);
    expect(isValidEvent('mortgage_review_completed', { ...p, bank: 'Banco Ficticio' })).toBe(false);
    expect(
      isValidEvent('mortgage_review_completed', { ...p, flags: ['floor_clause', 'Banco'] }),
    ).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/700|1550|2021-|Banco/);
  });

  it('mortgageAnalytics names each event as the catalogue does', () => {
    const sent: [string, Record<string, unknown>][] = [];
    let clock = 0;
    let detail: 'locked' | 'unlocked' = 'locked';
    const events = mortgageAnalytics(
      ((name: string, p: Record<string, unknown>) => {
        expect(isValidEvent(name, p), name).toBe(true);
        sent.push([name, p]);
      }) as Track,
      () => clock,
      () => detail,
    );
    const done = completed(deed2021);
    events.stepShown('hipoteca');
    events.stepShown('hipoteca');
    clock = 12_000;
    events.fieldRejected('escritura', 'deedOn');
    events.stepCompleted('hipoteca');
    events.stepShown('titular');
    events.wentBack('titular', 'hipoteca');
    events.outOfScope('company');
    events.helpOpened('faq-hipoteca-gastos');
    clock = 100_000;
    events.reviewCompleted(done);
    detail = 'unlocked';
    events.reviewCompleted(done);
    events.startedOver();
    expect(sent.map(([n]) => n)).toEqual([
      'section_viewed',
      'validation_error',
      'section_completed',
      'section_viewed',
      'went_back',
      'mortgage_out_of_scope',
      'help_opened',
      'mortgage_review_completed',
      'mortgage_review_completed',
      'started_over',
    ]);
    expect(sent[2]?.[1]).toEqual({ section: 'hipoteca', seconds: '10-30' });
    expect(sent[5]?.[1]).toEqual({ reason: 'company' });
    expect(sent[7]?.[1]).toMatchObject({ attempt: '1', seconds: '60-180', detail: 'locked' });
    expect(sent[8]?.[1]).toMatchObject({ attempt: '2', detail: 'unlocked' });
  });
});
