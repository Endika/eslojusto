import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { scope, scopePhrases } from '../../../src/engine/credit/scope';
import { loan } from './input';

describe('credit scope', () => {
  it('takes a personal loan under the consumer credit law', () => {
    expect(scope(loan())).toEqual({ inScope: true, indicatorOnly: false });
    expect(scopePhrases(scope(loan()))).toEqual([]);
  });

  it.each([
    ['2011-09-24', { inScope: false, reason: 'before_lcc' }],
    ['2011-09-25', { inScope: true, indicatorOnly: false }],
  ])('a loan concluded on %s', (day, expected) => {
    expect(scope(loan({ agreedOn: parseDate(day) }))).toEqual(expected);
  });

  it.each([
    ['2008-05-10', { inScope: true, indicatorOnly: true }],
    ['2011-09-24', { inScope: true, indicatorOnly: true }],
    ['2011-09-25', { inScope: true, indicatorOnly: false }],
  ])('a revolving card concluded on %s', (day, expected) => {
    const card = loan({ product: 'revolving', agreedOn: parseDate(day), instalments: null });
    expect(scope(card)).toEqual(expected);
  });

  it('a revolving card before the law gets only the indicator, and says so', () => {
    const card = loan({ product: 'revolving', agreedOn: parseDate('2009-01-01') });
    expect(scopePhrases(scope(card))).toEqual([{ key: 'scope.indicator_only' }]);
  });

  it.each([
    [199.99, { inScope: false, reason: 'under_200' }],
    [200, { inScope: true, indicatorOnly: false }],
  ])('a credit of %s €', (principal, expected) => {
    expect(scope(loan({ principal }))).toEqual(expected);
  });

  it.each([
    ['mortgage', loan({ secured: 'mortgage' })],
    ['lease_without_purchase', loan({ product: 'car_loan', leaseWithoutPurchase: true })],
    ['business', loan({ purpose: 'business' })],
  ])('stops a credit at the door: %s', (reason, input) => {
    expect(scope(input)).toEqual({ inScope: false, reason });
    expect(scopePhrases(scope(input))).toEqual([{ key: `scope.${reason}` }]);
  });

  it('a mortgage stops even a revolving card concluded before the law', () => {
    const input = loan({
      product: 'revolving',
      secured: 'mortgage',
      agreedOn: parseDate('2009-01-01'),
    });
    expect(scope(input)).toEqual({ inScope: false, reason: 'mortgage' });
  });
});
