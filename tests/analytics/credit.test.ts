import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  CREDIT_TRACKABLE_FIELDS,
  HELP_TOPICS,
  SECTIONS,
  isValidEvent,
  type Track,
} from '../../src/analytics/events';
import { creditAnalytics, creditReviewProps } from '../../src/analytics/credit';
import { CREDIT_FAQ_TOPICS } from '../../src/content/credit-faq-topics';
import { BE1904 } from '../../src/engine/credit/data/be1904';
import { CREDIT_NORMS } from '../../src/engine/credit/data/norms';
import { CREDIT_SOURCES } from '../../src/engine/credit/data/sources';
import { reviewCredit, type CreditDeps } from '../../src/engine/credit/review';
import type { CreditInput } from '../../src/engine/credit/types';
import { parseDate } from '../../src/engine/date';
import { SHEET_FIELDS, SHEETS } from '../../src/credit/form';
import { STEPS } from '../../src/credit/steps';
import { TODAY, loan, repayment } from '../engine/credit/input';

const DEPS: CreditDeps = { norms: CREDIT_NORMS, sources: CREDIT_SOURCES, rates: BE1904 };

const completed = (input: CreditInput) => {
  const r = reviewCredit(input, TODAY, DEPS);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { review: r.review, input };
};

const props = (input: CreditInput = loan()) =>
  creditReviewProps({ ...completed(input), attempt: 1, seconds: 95 });

// A synthetic revolving card concluded before the 2011 law: it gets only the indicator.
const oldCard = loan({
  product: 'revolving',
  agreedOn: parseDate('2008-05-10'),
  drawnOn: parseDate('2008-05-10'),
  instalments: null,
  netDisbursed: null,
  charges: [],
  declaredApr: 26.82,
  card: { limit: 3_000, nominalRate: 24, annualFee: 0, minimumPayment: 90, balance: 3_000 },
});

describe('the catalogue follows the credit form', () => {
  it('every sheet, and the result, is a trackable section', () => {
    for (const step of STEPS) expect(SECTIONS).toContain(step);
    expect(new Set(SECTIONS).size).toBe(SECTIONS.length);
  });
  it('every question is a trackable field', () => {
    for (const sheet of SHEETS)
      for (const field of SHEET_FIELDS[sheet]) expect(CREDIT_TRACKABLE_FIELDS).toContain(field);
  });
  it('every question on the page is a help topic', () => {
    for (const [, anchor] of CREDIT_FAQ_TOPICS) expect(HELP_TOPICS).toContain(anchor);
    expect(new Set(HELP_TOPICS).size).toBe(HELP_TOPICS.length);
  });
});

describe('credit events', () => {
  it('accept the sheets, the fields and the reasons', () => {
    expect(isValidEvent('section_viewed', { section: 'cuota-final' })).toBe(true);
    expect(isValidEvent('went_back', { from: 'tae', to: 'producto' })).toBe(true);
    expect(isValidEvent('validation_error', { section: 'contrato', field: 'agreedOn' })).toBe(true);
    expect(isValidEvent('validation_error', { section: 'importe', field: 'IBAN' })).toBe(false);
    expect(isValidEvent('credit_out_of_scope', { reason: 'before_lcc' })).toBe(true);
    expect(isValidEvent('credit_out_of_scope', { reason: 'before_2019' })).toBe(false);
    expect(isValidEvent('help_opened', { topic: 'faq-credito-tipo-medio' })).toBe(true);
  });

  it('a whole review leaves as codes and buckets', () => {
    const p = props();
    expect(isValidEvent('credit_review_completed', p)).toBe(true);
    expect(p).toEqual({
      product: 'personal_loan',
      period: '2016-2020',
      apr: 'contract_lower',
      early_repayment: 'not_entered',
      dealer_discount: 'none',
      withdrawal: 'ended',
      indicator: 'distance_only',
      compared_apr: 'declared',
      attempt: '1',
      seconds: '60-180',
    });
    expect(Object.keys(p).toSorted()).toEqual(
      Object.keys(CATALOGUE.credit_review_completed).toSorted(),
    );
  });

  it('names a split «No lo sé» as readings and a repayment over the cap by its status', () => {
    expect(
      props(
        loan({
          declaredApr: 16.6,
          insurance: { premium: 400, single: true, financed: false, required: null },
        }),
      ).apr,
    ).toBe('readings');
    expect(
      props(
        loan({
          declaredApr: 16.6,
          earlyRepayment: repayment({ on: parseDate('2022-02-15'), interestSettled: null }),
        }),
      ).early_repayment,
    ).toBe('above_general_cap');
  });

  it('puts a card from before the law in its own period, with only the indicator', () => {
    expect(props(oldCard)).toMatchObject({
      product: 'revolving',
      period: 'before_2011',
      apr: 'none',
      withdrawal: 'none',
      indicator: 'above',
    });
  });

  it('sorts the contract day by blocks of years', () => {
    const period = (day: string) =>
      props(loan({ agreedOn: parseDate(day), drawnOn: parseDate(day) })).period;
    expect(period('2015-12-31')).toBe('2011-2015');
    expect(period('2016-01-01')).toBe('2016-2020');
    expect(period('2021-01-01')).toBe('2021+');
  });

  it('refuses euros, a rate, a date or free text in any key', () => {
    const p = props();
    for (const key of Object.keys(p))
      for (const value of [
        10_500,
        '10.500,00 €',
        '16,61',
        '16.61',
        '2019-02-15',
        '15-02-2019',
        'Banco Ficticio',
        ['2019'],
      ])
        expect(isValidEvent('credit_review_completed', { ...p, [key]: value }), key).toBe(false);
    expect(isValidEvent('credit_review_completed', { ...p, apr_value: '16,61' })).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/10500|16[.,]6|2019-/);
  });

  it('creditAnalytics names each event as the catalogue does', () => {
    const sent: [string, Record<string, unknown>][] = [];
    let clock = 0;
    const events = creditAnalytics(
      ((name: string, p: Record<string, unknown>) => {
        expect(isValidEvent(name, p), name).toBe(true);
        sent.push([name, p]);
      }) as Track,
      () => clock,
    );
    const done = completed(loan());
    events.stepShown('producto');
    events.stepShown('producto');
    clock = 12_000;
    events.fieldRejected('importe', 'principal');
    events.stepCompleted('producto');
    events.stepShown('uso');
    events.wentBack('uso', 'producto');
    events.outOfScope('mortgage');
    events.helpOpened('faq-credito-tae');
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
      'credit_out_of_scope',
      'help_opened',
      'credit_review_completed',
      'credit_review_completed',
      'started_over',
    ]);
    expect(sent[2]?.[1]).toEqual({ section: 'producto', seconds: '10-30' });
    expect(sent[5]?.[1]).toEqual({ reason: 'mortgage' });
    expect(sent[7]?.[1]).toMatchObject({ attempt: '1', seconds: '60-180' });
    expect(sent[8]?.[1]).toMatchObject({ attempt: '2' });
  });
});
