import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { scope } from '../../../src/engine/employment/scope';
import type { Relationship } from '../../../src/engine/employment/types';
import { contract } from './input';

describe('scope', () => {
  it('reviews a common contract in full', () => {
    expect(scope(contract())).toEqual({ inScope: true, partial: false });
  });

  it.each([
    ['2022-03-29', { inScope: true, partial: true, reason: 'before_reform' }],
    ['2022-03-30', { inScope: true, partial: false }],
  ])('a contract signed and started on %s', (day, expected) => {
    expect(scope(contract({ signedOn: parseDate(day), startDate: parseDate(day) }))).toEqual(
      expected,
    );
  });

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

  it.each<Relationship>([
    'household',
    'senior_management',
    'sport',
    'artist',
    'law_firm',
    'medical_resident',
    'special_employment_centre',
    'other_special',
  ])('leaves out the special relationship %s', (relationship) => {
    expect(scope(contract({ relationship }))).toEqual({
      inScope: false,
      reason: 'special_relationship',
    });
  });

  it.each([
    [{ relationship: 'public_servant' as const }, 'public_servant'],
    [{ viaTempAgency: true }, 'temp_agency'],
    [{ relief: true }, 'relief'],
    [{ under18: true }, 'minor'],
  ])('leaves out %o', (change, reason) => {
    expect(scope(contract(change))).toEqual({ inScope: false, reason });
  });

  it('an out-of-scope reason wins over a partial review', () => {
    expect(scope(contract({ under18: true, startDate: parseDate('2021-06-01') }))).toEqual({
      inScope: false,
      reason: 'minor',
    });
  });
});
