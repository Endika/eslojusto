import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../../src/engine/date';
import { validateRental } from '../../../src/engine/rental/validate';
import type { RentalInput } from '../../../src/engine/rental/types';
import { contract, update } from './fixtures';

const TODAY = f('2026-10-07');
const codes = (input: RentalInput) =>
  validateRental(input, TODAY).map(({ field, index, code }) =>
    index === undefined ? [field, code] : [field, index, code],
  );

describe('rental input validation', () => {
  it('accepts a complete synthetic contract', () => {
    expect(
      codes(
        contract({
          updateClause: 'fixed_percent',
          fixedPercent: 2.5,
          fees: [
            { kind: 'agency_fee', amount: 500, deductedLater: false, requestedInWriting: null },
          ],
          guarantees: [{ kind: 'bank_guarantee', amount: null }],
          advanceMonths: 1,
          updates: [update('2022-03-20', 1000, 1025), update('2023-03-20', 1025, 1050)],
          charges: [
            {
              kind: 'community',
              inContract: true,
              annualAgreed: 600,
              charged: [{ year: 2022, amount: 600 }],
            },
          ],
          moveOut: {
            keysReturnedOn: f('2026-09-30'),
            returns: [{ on: f('2026-10-05'), amount: 900 }],
            deductions: [{ amount: 100, kind: 'cleaning' }],
          },
        }),
      ),
    ).toEqual([]);
  });

  it('rejects dates that do not exist', () => {
    expect(codes(contract({ signedOn: { y: 2023, m: 2, d: 29 } }))).toEqual([
      ['signedOn', 'invalid_date'],
    ]);
    expect(codes(contract({ startDate: { y: 2023, m: 13, d: 1 } }))).toEqual([
      ['startDate', 'invalid_date'],
    ]);
  });

  it('rejects a contract signed after today', () => {
    expect(codes(contract({ signedOn: f('2026-10-08'), startDate: f('2026-10-08') }))).toEqual([
      ['signedOn', 'signed_in_future'],
    ]);
  });

  it('lets the start come up to a year before the signing, not more', () => {
    expect(codes(contract({ signedOn: f('2021-03-15'), startDate: f('2020-03-15') }))).toEqual([]);
    expect(codes(contract({ signedOn: f('2021-03-15'), startDate: f('2020-03-14') }))).toEqual([
      ['startDate', 'start_too_early'],
    ]);
  });

  it.each([0, -1, 1_000_000.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a rent of %s',
    (initialRent) => {
      expect(codes(contract({ initialRent }))).toEqual([['initialRent', 'amount_out_of_range']]);
    },
  );

  it('accepts amounts up to a million', () => {
    expect(codes(contract({ initialRent: 1_000_000, deposit: 0.01 }))).toEqual([]);
  });

  it.each([0, 601, 12.5])('rejects %s agreed months', (agreedMonths) => {
    expect(codes(contract({ agreedMonths }))).toEqual([['agreedMonths', 'months_out_of_range']]);
  });

  it('bounds the fixed percentage and asks for it', () => {
    expect(codes(contract({ updateClause: 'fixed_percent' }))).toEqual([
      ['fixedPercent', 'percent_missing'],
    ]);
    expect(codes(contract({ updateClause: 'fixed_percent', fixedPercent: 100.5 }))).toEqual([
      ['fixedPercent', 'percent_out_of_range'],
    ]);
    expect(codes(contract({ updateClause: 'fixed_percent', fixedPercent: 0 }))).toEqual([]);
  });

  it('rejects a region outside the list', () => {
    expect(codes(contract({ region: 'XX' as RentalInput['region'] }))).toEqual([
      ['region', 'unknown_region'],
    ]);
  });

  it('points at the list entry that is wrong', () => {
    expect(
      codes(
        contract({
          fees: [
            { kind: 'agency_fee', amount: 300, deductedLater: false, requestedInWriting: null },
            { kind: 'reservation', amount: 0, deductedLater: false, requestedInWriting: null },
          ],
          guarantees: [{ kind: 'cash', amount: -5 }],
        }),
      ),
    ).toEqual([
      ['fees', 1, 'amount_out_of_range'],
      ['guarantees', 0, 'amount_out_of_range'],
    ]);
  });

  it('wants each rise tied to an anniversary, within its contract year, by today, once', () => {
    expect(
      codes(
        contract({
          updates: [
            update('2021-03-20', 1000, 1010),
            update('2022-03-20', 1000, 1020),
            update('2022-03-20', 1000, 1020),
            update('2022-03-21', 1000, 1020),
            update('2023-03-20', 1020, 1040, { effectiveOn: f('2024-03-20') }),
            update('2023-03-20', 1020, 1040, { effectiveOn: f('2022-03-20') }),
            update('2026-03-20', 1020, 1040, {
              effectiveOn: f('2026-10-08'),
              noticeOn: f('2026-10-09'),
            }),
          ],
        }),
      ),
    ).toEqual([
      ['updates', 0, 'not_an_anniversary'],
      ['updates', 2, 'update_repeated'],
      ['updates', 3, 'not_an_anniversary'],
      ['updates', 4, 'effective_outside_year'],
      ['updates', 5, 'effective_outside_year'],
      ['updates', 6, 'update_in_future'],
      ['updates', 6, 'notice_in_future'],
    ]);
  });

  it('takes a rise applied before or after its anniversary, and a second one that year', () => {
    expect(
      codes(
        contract({
          updates: [
            update('2022-03-20', 1000, 1020, { effectiveOn: f('2022-03-01') }),
            update('2023-03-20', 1020, 1040, { effectiveOn: f('2023-04-01') }),
            update('2023-03-20', 1040, 1060, { effectiveOn: f('2023-09-01') }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('wants the notice date for a notice given in writing or electronically', () => {
    expect(
      codes(contract({ updates: [update('2022-03-20', 1000, 1020, { noticeOn: null })] })),
    ).toEqual([['updates', 0, 'notice_date_missing']]);
    expect(
      codes(
        contract({
          updates: [
            update('2022-03-20', 1000, 1020, { notice: 'messaging', noticeOn: null }),
            update('2023-03-20', 1020, 1040, { notice: 'verbal', noticeOn: null }),
          ],
        }),
      ),
    ).toEqual([['updates', 0, 'notice_date_missing']]);
  });

  it('wants the first month charged within the contract', () => {
    expect(
      codes(
        contract({
          updates: [update('2022-03-20', 1000, 1020, { chargedFrom: f('2021-02-01') })],
        }),
      ),
    ).toEqual([['updates', 0, 'charged_before_start']]);
  });

  it('bounds the years of the charges', () => {
    expect(
      codes(
        contract({
          charges: [
            {
              kind: 'waste',
              inContract: true,
              annualAgreed: null,
              charged: [{ year: 2027, amount: 80 }],
            },
          ],
        }),
      ),
    ).toEqual([['charges', 0, 'year_out_of_range']]);
  });

  it('wants the keys back after the start and not after today', () => {
    const moveOut = (keys: string) => ({ keysReturnedOn: f(keys), returns: [], deductions: [] });
    expect(codes(contract({ moveOut: moveOut('2021-03-19') }))).toEqual([
      ['moveOut', 'keys_before_start'],
    ]);
    expect(codes(contract({ moveOut: moveOut('2026-10-08') }))).toEqual([
      ['moveOut', 'keys_in_future'],
    ]);
  });

  it('wants each return between the keys and today', () => {
    const moveOut = (on: string) => ({
      keysReturnedOn: f('2026-06-30'),
      returns: [{ on: f(on), amount: 500 }],
      deductions: [],
    });
    expect(codes(contract({ moveOut: moveOut('2026-06-30') }))).toEqual([]);
    expect(codes(contract({ moveOut: moveOut('2026-10-07') }))).toEqual([]);
    expect(codes(contract({ moveOut: moveOut('2026-06-29') }))).toEqual([
      ['moveOut', 0, 'return_before_keys'],
    ]);
    expect(codes(contract({ moveOut: moveOut('2026-10-08') }))).toEqual([
      ['moveOut', 0, 'return_in_future'],
    ]);
  });
});
