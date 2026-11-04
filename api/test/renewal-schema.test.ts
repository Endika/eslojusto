import { describe, expect, it } from 'vitest';
import { RENEWAL_PAGE_KINDS } from '../src/domain/documents';
import { ELECTRICITY_SECTIONS } from '../src/domain/electricity-schema';
import { parseReading } from '../src/domain/extraction';
import { REVIEW_SCHEMAS, toolInputSchema } from '../src/domain/extraction-schema';
import { RENEWAL_SECTIONS } from '../src/domain/renewal-schema';
import { CHECKOUT_REVIEWS, isReview } from '../src/domain/reviews';
import { f, page } from './support/fields';

const letter = {
  sentOn: f('2026-10-31'),
  appliesFrom: f('2026-12-10'),
  separateFromBill: f(true),
  isRenewal: f(true),
  contractedPowerP1: f(5.75),
  annualConsumptionKwh: f(4190.2),
  estimatedCostNewWithoutTax: f(1071.15),
  priceChanges: [
    {
      term: 'power',
      period: 'p1',
      before: 0.110283,
      after: 0.12303,
      unit: 'per_kw_day',
      confidence: 'high',
    },
    {
      term: 'energy',
      period: 'all',
      before: 0.144972,
      after: 0.1678,
      unit: 'per_kwh',
      confidence: 'high',
    },
  ],
};

describe('the renewal schema', () => {
  it('is a review of its own that is never bought', () => {
    expect(isReview('renewal')).toBe(true);
    expect((CHECKOUT_REVIEWS as readonly string[]).includes('renewal')).toBe(false);
  });

  it('takes the letter or anything else as a page, and nothing more', () => {
    expect(REVIEW_SCHEMAS.renewal.pageKinds).toEqual(RENEWAL_PAGE_KINDS);
    expect(Object.keys(RENEWAL_SECTIONS)).toEqual(['price_change_notice']);
  });

  it('builds on the notice of the electricity review without changing it', () => {
    const base = ELECTRICITY_SECTIONS.price_change_notice;
    const renewal = RENEWAL_SECTIONS.price_change_notice;
    for (const name of Object.keys(base.fields)) expect(renewal.fields).toHaveProperty(name);
    expect(Object.keys(base.fields)).toEqual(['sentOn', 'appliesFrom', 'separateFromBill']);
    expect(Object.keys(renewal.lists)).toEqual(Object.keys(base.lists));
  });

  it('asks for the pages and the letter’s section only', () => {
    expect(Object.keys((toolInputSchema('renewal') as { properties: object }).properties)).toEqual([
      'pages',
      'price_change_notice',
    ]);
  });

  it('accepts a letter with an energy price for all the day', () => {
    const reading = parseReading(
      { pages: [page(1, 'price_change_notice')], price_change_notice: letter },
      1,
      'renewal',
    );
    expect(reading.dropped).toBe(0);
    expect(reading.sections.price_change_notice?.lists['priceChanges']).toHaveLength(2);
  });

  it('drops a section without a letter page and a page of a kind of another review', () => {
    const reading = parseReading(
      { pages: [page(1, 'electricity_bill')], price_change_notice: letter },
      1,
      'renewal',
    );
    expect(reading.sections).toEqual({});
    expect(reading.unclassified).toBe(1);
  });
});
