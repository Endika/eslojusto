import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { scope, scopePhrases } from '../../../src/engine/credit/scope';
import { loan } from './input';

describe('credit scope', () => {
  it.each([
    ['2011-09-24', { inScope: false, reason: 'before_lcc' }],
    ['2011-09-25', { inScope: true, indicatorOnly: false }],
  ])('a loan concluded on %s', (day, expected) => {
    expect(scope(loan({ agreedOn: parseDate(day) }))).toEqual(expected);
  });

  it.each([
    [199.99, { inScope: false, reason: 'under_200' }],
    [200, { inScope: true, indicatorOnly: false }],
  ])('a credit of %s €', (principal, expected) => {
    expect(scope(loan({ principal }))).toEqual(expected);
  });

  it.each([['business', loan({ purpose: 'business' })]])(
    'stops a credit at the door: %s',
    (reason, input) => {
      expect(scope(input)).toEqual({ inScope: false, reason });
      expect(scopePhrases(scope(input))).toEqual([{ key: `scope.${reason}` }]);
    },
  );
});
