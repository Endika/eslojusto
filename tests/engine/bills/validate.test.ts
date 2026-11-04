import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import {
  validateElectricity,
  validateRenewal,
  validateTelecom,
} from '../../../src/engine/bills/validate';
import type { RenewalInput } from '../../../src/engine/bills/renewal-types';
import { juneBill, meter, telecom, TODAY } from './input';

const codes = (errors: readonly { field: string; code: string }[]) =>
  errors.map((e) => `${e.field}:${e.code}`);

describe('validating an electricity bill', () => {
  it('takes a whole June bill', () => {
    expect(validateElectricity(juneBill(), TODAY)).toEqual([]);
  });

  it('refuses dates that do not exist or have not come', () => {
    const errors = validateElectricity(
      juneBill({ issuedOn: { y: 2026, m: 2, d: 30 }, readingTo: parseDate('2026-10-10') }),
      TODAY,
    );
    expect(codes(errors)).toEqual(['issuedOn:invalid_date', 'readingTo:in_future']);
  });

  it.each([
    ['2026-06-30', 'readingTo:not_after_start'],
    ['2026-04-28', 'readingTo:days_range'],
  ])('a first reading on %s', (from, error) => {
    expect(codes(validateElectricity(juneBill({ readingFrom: parseDate(from) }), TODAY))).toEqual(
      expect.arrayContaining([error]),
    );
  });

  it('takes up to 62 days, 20.000 kWh and 5 € per kWh', () => {
    expect(
      validateElectricity(
        juneBill({
          readingFrom: parseDate('2026-04-29'),
          energy: [{ period: 'p1', kwh: 20_000, price: 5, amount: 100_000 }],
        }),
        TODAY,
      ),
    ).toEqual([]);
    expect(
      codes(
        validateElectricity(
          juneBill({
            readingFrom: parseDate('2026-04-28'),
            billedDays: 63,
            energy: [{ period: 'p1', kwh: 20_001, price: 5.01, amount: 12 }],
          }),
          TODAY,
        ),
      ),
    ).toEqual([
      'readingTo:days_range',
      'billedDays:days_range',
      'energy:kwh_range',
      'energy:price_range',
    ]);
  });

  it('takes contracted power from 0,1 kW; the gate turns away power over 15 kW first', () => {
    expect(
      codes(validateElectricity(juneBill({ contractedPower: { p1: 0.05, p2: 4.6 } }), TODAY)),
    ).toEqual(['contractedPower:power_range']);
    expect(validateElectricity(juneBill({ contractedPower: { p1: 0.1, p2: 15 } }), TODAY)).toEqual(
      [],
    );
  });

  it('reads a power price per kW and day or per kW and year with its own bound', () => {
    const line = { period: 'p1', kw: 4.6, days: null, amount: 1 } as const;
    expect(
      codes(
        validateElectricity(
          juneBill({
            power: [
              { ...line, unit: 'per_kw_day', price: 5.01 },
              { ...line, unit: 'per_kw_year', price: 999 },
            ],
          }),
          TODAY,
        ),
      ),
    ).toEqual(['power:price_range']);
  });

  it('refuses a postcode that is not Spanish, negative amounts and a broken meter line', () => {
    expect(
      codes(
        validateElectricity(
          juneBill({
            postcode: '53001',
            discounts: [-1],
            meter: meter({ amount: -0.8, days: 0 }),
          }),
          TODAY,
        ),
      ),
    ).toEqual([
      'postcode:postcode',
      'discounts:amount_range',
      'meter:amount_range',
      'meter:days_range',
    ]);
  });

  it('takes a regularization either way', () => {
    expect(validateElectricity(juneBill({ regularizations: [-12.5, 3] }), TODAY)).toEqual([]);
  });
});

describe('validating a telecom exit', () => {
  it('takes a commitment left early', () => {
    expect(validateTelecom(telecom(), TODAY)).toEqual([]);
  });

  it('refuses a commitment starting after the exit, and zero months', () => {
    const errors = validateTelecom(
      telecom({
        commitment: { startedOn: parseDate('2026-03-02'), months: 0, agreedPenalty: null },
      }),
      TODAY,
    );
    expect(codes(errors)).toEqual([
      'commitment.startedOn:not_after_start',
      'commitment.months:count_range',
    ]);
  });

  it('refuses a change that applies before it was notified', () => {
    const errors = validateTelecom(
      telecom({
        changeNotice: {
          sentOn: parseDate('2026-02-10'),
          appliesOn: parseDate('2026-02-09'),
          change: 'price_up',
          index: 'none',
        },
      }),
      TODAY,
    );
    expect(codes(errors)).toEqual(['changeNotice.appliesOn:not_after_start']);
  });

  it('refuses a line that ends before it starts and an exit not yet asked for', () => {
    const errors = validateTelecom(
      telecom({
        exitRequestedOn: parseDate('2026-10-10'),
        lines: [{ from: parseDate('2026-02-28'), to: parseDate('2026-02-01'), amount: 30 }],
      }),
      TODAY,
    );
    expect(codes(errors)).toEqual(['exitRequestedOn:in_future', 'lines:not_after_start']);
  });
});

describe('validating a renewal letter', () => {
  const letter = (change: Partial<RenewalInput> = {}): RenewalInput => ({
    letterDate: '2026-10-01',
    renewalDate: '2026-11-10',
    powerKw: { p1: 5.75, p2: 5.75 },
    powerUnit: 'per_kw_day',
    current: { power: { p1: 0.110283, p2: 0.033469 }, energy: { all: 0.144972 } },
    next: { power: { p1: 0.12303, p2: 0.052329 }, energy: { all: 0.1678 } },
    annualKwh: 4190.2,
    declared: { withoutTax: 1071.15, withTax: 1362.36 },
    fixedPrice: false,
    firstRenewal: null,
    separateFromBill: true,
    ...change,
  });

  it('takes the Naturgy letter', () => {
    expect(validateRenewal(letter(), TODAY)).toEqual([]);
  });

  it('refuses dates that do not exist, a letter not yet sent and a renewal before it', () => {
    expect(codes(validateRenewal(letter({ letterDate: '2026-02-30' }), TODAY))).toEqual([
      'letterDate:invalid_date',
    ]);
    expect(codes(validateRenewal(letter({ letterDate: '2026-10-20' }), TODAY))).toEqual([
      'letterDate:in_future',
    ]);
    expect(codes(validateRenewal(letter({ renewalDate: '2026-09-30' }), TODAY))).toEqual([
      'renewalDate:not_after_start',
    ]);
  });

  it('bounds the power, the prices in their unit, the consumption and the costs', () => {
    expect(
      codes(
        validateRenewal(
          letter({
            powerKw: { p1: 15.5, p2: 0 },
            next: { power: { p1: 6, p2: 0.05 }, energy: { all: 5.5 } },
            annualKwh: 300_000,
            declared: { withoutTax: -1, withTax: 200_000 },
          }),
          TODAY,
        ),
      ),
    ).toEqual([
      'powerKw.p1:power_range',
      'powerKw.p2:power_range',
      'next.power.p1:price_range',
      'next.energy.all:price_range',
      'annualKwh:kwh_range',
      'declared.withoutTax:amount_range',
      'declared.withTax:amount_range',
    ]);
    expect(
      validateRenewal(
        letter({
          powerUnit: 'per_kw_year',
          next: { power: { p1: 40, p2: 19 }, energy: { p1: 0.2, p2: 0.1, p3: 0.05 } },
        }),
        TODAY,
      ),
    ).toEqual([]);
  });
});
