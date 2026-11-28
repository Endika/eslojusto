import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { scope } from '../../../src/engine/employment/scope';
import { contract } from './input';

describe('scope', () => {
  it('a contract signed before the reform but started after it is reviewed in part', () => {
    expect(
      scope(contract({ signedOn: parseDate('2022-03-20'), startDate: parseDate('2022-04-01') })),
    ).toEqual({ inScope: true, partial: true, reason: 'before_reform' });
  });

  it('without a signing day the start decides', () => {
    expect(scope(contract({ signedOn: null, startDate: parseDate('2022-03-30') }))).toEqual({
      inScope: true,
      partial: false,
    });
  });

  it.each([
    [{ relationship: 'public_servant' as const }, 'public_servant'],
    [{ viaTempAgency: true }, 'temp_agency'],
    [{ relief: true }, 'relief'],
  ])('leaves out %o', (change, reason) => {
    expect(scope(contract(change))).toEqual({ inScope: false, reason });
  });
});
