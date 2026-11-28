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
  it('lets the start come up to a year before the signing, not more', () => {
    expect(codes(contract({ signedOn: f('2021-03-15'), startDate: f('2020-03-15') }))).toEqual([]);
    expect(codes(contract({ signedOn: f('2021-03-15'), startDate: f('2020-03-14') }))).toEqual([
      ['startDate', 'start_too_early'],
    ]);
  });

  it('rejects a rent over a million', () => {
    expect(codes(contract({ initialRent: 1_000_000.01 }))).toEqual([
      ['initialRent', 'amount_out_of_range'],
    ]);
  });

  it('accepts amounts up to a million', () => {
    expect(codes(contract({ initialRent: 1_000_000, deposit: 0.01 }))).toEqual([]);
  });

  it('rejects 0 agreed months', () => {
    expect(codes(contract({ agreedMonths: 0 }))).toEqual([['agreedMonths', 'months_out_of_range']]);
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

describe('what each bad entry is reported as', () => {
  const BAD_DATE = { y: 2022, m: 2, d: 30 };
  const charge = (change: Partial<RentalInput['charges'][number]>) => ({
    kind: 'community' as const,
    inContract: true,
    annualAgreed: 600,
    charged: [],
    ...change,
  });
  const moveOut = (change: Partial<NonNullable<RentalInput['moveOut']>>) => ({
    keysReturnedOn: f('2026-09-30'),
    returns: [],
    deductions: [],
    ...change,
  });
  const dated = (y: number, m = 1, d = 1) => ({ signedOn: { y, m, d }, startDate: { y, m, d } });

  it.each<[string, () => RentalInput, unknown[]]>([
    [
      'an advance of 601 months',
      () => contract({ advanceMonths: 601 }),
      [['advanceMonths', 'months_out_of_range']],
    ],
    ['an advance of no months', () => contract({ advanceMonths: 0 }), []],
    [
      'a negative fixed percentage',
      () => contract({ fixedPercent: -1 }),
      [['fixedPercent', 'percent_out_of_range']],
    ],
    ['a fixed percentage of 100', () => contract({ fixedPercent: 100 }), []],
    [
      'the year 1899',
      () => contract(dated(1899, 12, 31)),
      [
        ['signedOn', 'invalid_date'],
        ['startDate', 'invalid_date'],
      ],
    ],
    ['the year 1900', () => contract(dated(1900)), []],
    ['a start in the year 2200', () => contract({ startDate: f('2200-12-31') }), []],
    [
      'a start in the year 2201',
      () => contract({ startDate: f('2201-01-01') }),
      [['startDate', 'invalid_date']],
    ],
    [
      'a rent of nothing before a rise',
      () => contract({ updates: [update('2022-03-20', 0, 1020)] }),
      [['updates', 0, 'amount_out_of_range']],
    ],
    [
      'a new rent of nothing',
      () => contract({ updates: [update('2022-03-20', 1000, 0)] }),
      [['updates', 0, 'amount_out_of_range']],
    ],
    [
      'a rise on an impossible anniversary',
      () => contract({ updates: [update('2022-03-20', 1000, 1020, { anniversary: BAD_DATE })] }),
      [['updates', 0, 'invalid_date']],
    ],
    [
      'a notice dated on an impossible day',
      () => contract({ updates: [update('2022-03-20', 1000, 1020, { noticeOn: BAD_DATE })] }),
      [['updates', 0, 'invalid_date']],
    ],
    [
      'a notice given today',
      () => contract({ updates: [update('2022-03-20', 1000, 1020, { noticeOn: TODAY })] }),
      [],
    ],
    [
      'a rise applied today',
      () => contract({ updates: [update('2026-03-20', 1000, 1020, { effectiveOn: TODAY })] }),
      [],
    ],
    [
      'a rise charged from an earlier month of a later year',
      () =>
        contract({ updates: [update('2022-03-20', 1000, 1020, { chargedFrom: f('2022-02-01') })] }),
      [],
    ],
    [
      'a start that does not exist, with a rise',
      () => contract({ startDate: BAD_DATE, updates: [update('2022-03-20', 1000, 1020)] }),
      [['startDate', 'invalid_date']],
    ],
    [
      'a yearly amount of nothing',
      () => contract({ charges: [charge({ annualAgreed: 0 })] }),
      [['charges', 0, 'amount_out_of_range']],
    ],
    [
      'a charged amount of nothing',
      () => contract({ charges: [charge({ charged: [{ year: 2022, amount: 0 }] })] }),
      [['charges', 0, 'amount_out_of_range']],
    ],
    [
      'keys returned on an impossible day',
      () => contract({ moveOut: moveOut({ keysReturnedOn: BAD_DATE }) }),
      [['moveOut', 'invalid_date']],
    ],
    [
      'keys returned on the start day',
      () => contract({ moveOut: moveOut({ keysReturnedOn: f('2021-03-20') }) }),
      [],
    ],
    ['keys returned today', () => contract({ moveOut: moveOut({ keysReturnedOn: TODAY }) }), []],
    [
      'a return on an impossible day',
      () => contract({ moveOut: moveOut({ returns: [{ on: BAD_DATE, amount: 500 }] }) }),
      [['moveOut', 0, 'invalid_date']],
    ],
    [
      'a return of nothing',
      () => contract({ moveOut: moveOut({ returns: [{ on: f('2026-10-01'), amount: 0 }] }) }),
      [['moveOut', 0, 'amount_out_of_range']],
    ],
    [
      'a deduction of nothing',
      () => contract({ moveOut: moveOut({ deductions: [{ kind: 'cleaning', amount: 0 }] }) }),
      [['moveOut', 0, 'amount_out_of_range']],
    ],
  ])('%s', (_, input, expected) => {
    expect(codes(input())).toEqual(expected);
  });

  it('leaves out the index of an error that has none', () => {
    expect(validateRental(contract({ initialRent: 0, deposit: 0 }), TODAY)).toStrictEqual([
      { field: 'initialRent', code: 'amount_out_of_range' },
      { field: 'deposit', code: 'amount_out_of_range' },
    ]);
  });
});
