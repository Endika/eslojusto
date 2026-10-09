import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { electricityScope, scopePhrases, telecomScope } from '../../../src/engine/bills/scope';
import { juneBill, telecom } from './input';

describe('electricity scope', () => {
  it('takes a 2.0TD household bill of the Peninsula issued under the 2026 billing rules', () => {
    expect(electricityScope(juneBill())).toEqual({ inScope: true });
    expect(scopePhrases(electricityScope(juneBill()))).toEqual([]);
  });

  it.each([
    ['2026-06-11', { inScope: false, reason: 'issued_before_2026_06_12' }],
    ['2026-06-12', { inScope: true }],
  ])('a bill issued on %s', (day, expected) => {
    expect(electricityScope(juneBill({ issuedOn: parseDate(day) }))).toEqual(expected);
  });

  it.each(['35001', '38001', '51001', '52001'])(
    'stops a bill with postcode %s: other taxes and hours',
    (postcode) => {
      const reach = electricityScope(juneBill({ postcode }));
      expect(reach).toEqual({ inScope: false, reason: 'canary_ceuta_melilla' });
      expect(scopePhrases(reach)).toEqual([{ key: 'scope.canary_ceuta_melilla' }]);
    },
  );

  it.each(['07001', '28001', '50001'])(
    'takes the Balearic Islands and the rest of the Peninsula: %s',
    (postcode) => {
      expect(electricityScope(juneBill({ postcode }))).toEqual({ inScope: true });
    },
  );

  it.each([
    [{ p1: 15, p2: 15 }, { inScope: true }],
    [
      { p1: 15.01, p2: 4.6 },
      { inScope: false, reason: 'over_15kw' },
    ],
    [
      { p1: 4.6, p2: 15.01 },
      { inScope: false, reason: 'over_15kw' },
    ],
  ])('power %j', (contractedPower, expected) => {
    expect(electricityScope(juneBill({ contractedPower }))).toEqual(expected);
  });

  it('stops other access tariffs and self-consumption with surplus', () => {
    expect(electricityScope(juneBill({ accessTariff: '3.0TD' }))).toEqual({
      inScope: false,
      reason: 'not_2_0td',
    });
    expect(electricityScope(juneBill({ selfConsumption: 'with_surplus' }))).toEqual({
      inScope: false,
      reason: 'self_consumption_surplus',
    });
    expect(electricityScope(juneBill({ selfConsumption: 'without_surplus' }))).toEqual({
      inScope: true,
    });
  });
});

describe('telecom scope', () => {
  it.each([
    ['2021-12-31', { inScope: false, reason: 'exit_before_2022' }],
    ['2022-01-01', { inScope: true }],
  ])('an exit requested on %s', (day, expected) => {
    expect(telecomScope(telecom({ exitRequestedOn: parseDate(day) }))).toEqual(expected);
  });

  it('says why it stops', () => {
    const reach = telecomScope(telecom({ exitRequestedOn: parseDate('2020-05-01') }));
    expect(scopePhrases(reach)).toEqual([{ key: 'scope.exit_before_2022' }]);
  });
});
