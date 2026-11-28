import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import {
  validateElectricity,
  validateRenewal,
  validateTelecom,
} from '../../../src/engine/bills/validate';
import type { RenewalInput } from '../../../src/engine/bills/renewal-types';
import type { ElectricityBillInput, TelecomInput } from '../../../src/engine/bills/types';
import { juneBill, meter, telecom, TODAY } from './input';

const codes = (errors: readonly { field: string; code: string }[]) =>
  errors.map((e) => `${e.field}:${e.code}`);

describe('validating an electricity bill', () => {
  it('refuses dates that do not exist or have not come', () => {
    const errors = validateElectricity(
      juneBill({ issuedOn: { y: 2026, m: 2, d: 30 }, readingTo: parseDate('2026-10-10') }),
      TODAY,
    );
    expect(codes(errors)).toEqual(['issuedOn:invalid_date', 'readingTo:in_future']);
  });

  it.each([['2026-06-30', 'readingTo:not_after_start']])('a first reading on %s', (from, error) => {
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
});

describe('validating a telecom exit', () => {
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
    separateFromBill: true,
    ...change,
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

  it('refuses a price of zero, current or new, of the power or the energy', () => {
    expect(
      codes(
        validateRenewal(
          letter({
            current: { power: { p1: 0, p2: 0.033469 }, energy: { p1: 0.2, p2: 0, p3: 0.1 } },
            next: { power: { p1: 0.12303, p2: 0 }, energy: { all: 0 } },
          }),
          TODAY,
        ),
      ),
    ).toEqual([
      'current.power.p1:price_range',
      'current.energy.p2:price_range',
      'next.power.p2:price_range',
      'next.energy.all:price_range',
    ]);
  });
});

describe('the bounds of an electricity bill', () => {
  const [power] = juneBill().power;
  const [energy] = juneBill().energy;
  if (power === undefined || energy === undefined) throw new Error('lines expected');
  const invalidDay = { y: 2026, m: 2, d: 30 };
  const bonus = {
    category: 'vulnerable',
    members: 2,
    discountedKwh: null,
    kwhSoFar: null,
    amount: 5,
  } as const;
  const errorsOf = (change: Partial<ElectricityBillInput>) =>
    codes(validateElectricity(juneBill(change), TODAY));

  it('takes', () => {
    const cases: [string, Partial<ElectricityBillInput>][] = [
      ['a period of one day', { readingFrom: parseDate('2026-06-29'), billedDays: 1 }],
      ['billed days up to 62', { billedDays: 62 }],

      ['an energy line of no kWh', { energy: [{ ...energy, kwh: 0 }] }],

      ['no tolls and charges', { tollsAndCharges: null }],
      [
        'no funding, tax, meter, VAT or social bonus',
        {
          socialBonusFunding: null,
          electricityTax: null,
          meter: null,
          vat: null,
          socialBonus: null,
        },
      ],

      ['twenty members', { socialBonus: { ...bonus, members: 20 } }],
      ['a bonus with no members', { socialBonus: { ...bonus, members: null } }],
      [
        'kWh of the bonus up to 240.000',
        { socialBonus: { ...bonus, discountedKwh: 240_000, kwhSoFar: 240_000 } },
      ],
    ];
    for (const [label, change] of cases) {
      expect(errorsOf(change), label).toEqual([]);
    }
  });

  it('refuses', () => {
    const cases: [string, Partial<ElectricityBillInput>, string][] = [
      ['a due date that is not a day', { dueOn: invalidDay }, 'dueOn:invalid_date'],
      [
        'a first reading that is not a day',
        { readingFrom: invalidDay },
        'readingFrom:invalid_date',
      ],

      ['a postcode of six digits', { postcode: '280011' }, 'postcode:postcode'],
      ['a postcode with a letter before', { postcode: 'a28001' }, 'postcode:postcode'],

      [
        'a highest power used over 100 kW',
        { maxPowerUsed: { p1: 100.1, p2: null } },
        'maxPowerUsed:power_range',
      ],
      [
        'a highest power used under 0 in the second period',
        { maxPowerUsed: { p1: 1, p2: -1 } },
        'maxPowerUsed:power_range',
      ],
      ['a power line of no kW', { power: [{ ...power, kw: 0 }] }, 'power:power_range'],

      ['a power line of 0 days', { power: [{ ...power, days: 0 }] }, 'power:days_range'],

      [
        'a power line over 100.000 €',
        { power: [{ ...power, amount: 100_001 }] },
        'power:amount_range',
      ],
      ['an energy line under 0 kWh', { energy: [{ ...energy, kwh: -1 }] }, 'energy:kwh_range'],
      [
        'an energy line under 0 €',
        { energy: [{ ...energy, amount: -0.01 }] },
        'energy:amount_range',
      ],

      [
        'a power from tolls and charges under 0',
        { tollsAndCharges: { power: -1, energy: null } },
        'tollsAndCharges:amount_range',
      ],
      [
        'an energy from tolls and charges over the bound',
        { tollsAndCharges: { power: 1, energy: 100_001 } },
        'tollsAndCharges:amount_range',
      ],
      ['a funding under 0', { socialBonusFunding: -0.01 }, 'socialBonusFunding:amount_range'],
      ['a bonus under 0', { socialBonus: { ...bonus, amount: -1 } }, 'socialBonus:amount_range'],
      [
        'no member in the bonus',
        { socialBonus: { ...bonus, members: 0 } },
        'socialBonus:count_range',
      ],
      [
        'twenty-one members in the bonus',
        { socialBonus: { ...bonus, members: 21 } },
        'socialBonus:count_range',
      ],

      [
        'a bonus with kWh so far under 0',
        { socialBonus: { ...bonus, kwhSoFar: -1 } },
        'socialBonus:kwh_range',
      ],
      [
        'an excess under 0',
        { excessPower: { amount: -1, maximeter: true } },
        'excessPower:amount_range',
      ],
      [
        'a tax under 0',
        { electricityTax: { base: null, percent: null, amount: -1 } },
        'electricityTax:amount_range',
      ],
      [
        'a tax base under 0',
        { electricityTax: { base: -1, percent: null, amount: 1 } },
        'electricityTax:amount_range',
      ],
      [
        'a tax rate over 100',
        { electricityTax: { base: null, percent: 100.01, amount: 1 } },
        'electricityTax:price_range',
      ],

      [
        'a service under 0',
        { services: [{ label: 'maintenance', amount: -1, requested: 'yes' }] },
        'services:amount_range',
      ],
      [
        'an exit penalty under 0',
        { exitPenalty: { amount: -1, priceType: null, firstRenewalPassed: null } },
        'exitPenalty:amount_range',
      ],
      [
        'a regularization under the bound',
        { regularizations: [-100_001] },
        'regularizations:amount_range',
      ],
      ['a VAT under 0', { vat: { base: null, percent: null, amount: -1 } }, 'vat:amount_range'],
      ['a VAT base under 0', { vat: { base: -1, percent: null, amount: 1 } }, 'vat:amount_range'],

      ['a VAT rate under 0', { vat: { base: null, percent: -1, amount: 1 } }, 'vat:price_range'],
      ['a total under the bound', { total: -100_001 }, 'total:amount_range'],
    ];
    for (const [label, change, error] of cases) {
      expect(errorsOf(change), label).toEqual([error]);
    }
  });
});

describe('the bounds of a telecom exit', () => {
  const invalidDay = { y: 2026, m: 2, d: 30 };
  const commitment = { startedOn: parseDate('2025-03-01'), months: 18, agreedPenalty: 180 };
  const notice = {
    sentOn: parseDate('2026-02-10'),
    appliesOn: parseDate('2026-03-10'),
    change: 'price_up',
    index: 'none',
  } as const;
  const line = { from: parseDate('2026-02-01'), to: parseDate('2026-02-28'), amount: 30 };
  const errorsOf = (change: Partial<TelecomInput>) =>
    codes(validateTelecom(telecom(change), TODAY));

  it('takes', () => {
    const cases: [string, Partial<TelecomInput>][] = [
      ['a commitment of one month', { commitment: { ...commitment, months: 1 } }],
      ['a commitment of 120 months', { commitment: { ...commitment, months: 120 } }],

      [
        'a notice sent today and applied the same day',
        { changeNotice: { ...notice, sentOn: TODAY, appliesOn: TODAY } },
      ],

      ['a line of one day', { lines: [{ ...line, to: line.from }] }],
      ['a refund as a line', { lines: [{ ...line, amount: -100_000 }] }],
    ];
    for (const [label, change] of cases) {
      expect(errorsOf(change), label).toEqual([]);
    }
  });

  it('refuses', () => {
    const cases: [string, Partial<TelecomInput>, string[]][] = [
      [
        'a commitment that starts the day of the exit',
        { commitment: { ...commitment, startedOn: parseDate('2026-03-01') } },
        ['commitment.startedOn:not_after_start'],
      ],
      [
        'a commitment that is not a day',
        { commitment: { ...commitment, startedOn: invalidDay } },
        ['commitment.startedOn:invalid_date'],
      ],

      [
        'a commitment of 121 months',
        { commitment: { ...commitment, months: 121 } },
        ['commitment.months:count_range'],
      ],

      [
        'an agreed penalty under 0',
        { commitment: { ...commitment, agreedPenalty: -1 } },
        ['commitment.agreedPenalty:amount_range'],
      ],
      ['a penalty charged under 0', { penaltyCharged: -1 }, ['penaltyCharged:amount_range']],
      ['a handset under 0', { handset: { value: -1, kept: true } }, ['handset.value:amount_range']],

      [
        'a notice sent to come',
        { changeNotice: { ...notice, sentOn: parseDate('2026-10-10'), appliesOn: null } },
        ['changeNotice.sentOn:in_future'],
      ],
      [
        'a notice applied that is not a day',
        { changeNotice: { ...notice, appliesOn: invalidDay } },
        ['changeNotice.appliesOn:invalid_date'],
      ],

      [
        'a line that ends with no day',
        { lines: [{ ...line, to: invalidDay }] },
        ['lines:invalid_date'],
      ],
      [
        'a line with neither day',
        { lines: [{ ...line, from: invalidDay, to: invalidDay }] },
        ['lines:invalid_date'],
      ],

      [
        'a line under the bound',
        { lines: [{ ...line, amount: -100_001 }] },
        ['lines:amount_range'],
      ],
    ];
    for (const [label, change, errors] of cases) {
      expect(errorsOf(change), label).toEqual(errors);
    }
  });
});

describe('the bounds of a renewal letter', () => {
  const letter = (change: Partial<RenewalInput> = {}): RenewalInput => ({
    letterDate: '2026-10-01',
    renewalDate: '2026-11-10',
    powerKw: { p1: 5.75, p2: 5.75 },
    powerUnit: 'per_kw_day',
    current: { power: { p1: 0.110283, p2: 0.033469 }, energy: { all: 0.144972 } },
    next: { power: { p1: 0.12303, p2: 0.052329 }, energy: { all: 0.1678 } },
    annualKwh: 4190.2,
    declared: { withoutTax: 1071.15, withTax: 1362.36 },
    separateFromBill: true,
    ...change,
  });
  const errorsOf = (change: Partial<RenewalInput>) => codes(validateRenewal(letter(change), TODAY));

  it('takes', () => {
    const cases: [string, Partial<RenewalInput>][] = [
      [
        'a letter of today renewed the same day',
        { letterDate: '2026-10-09', renewalDate: '2026-10-09' },
      ],
      [
        'the dearest prices a day and a kWh may have',
        { next: { power: { p1: 5, p2: 5 }, energy: { all: 5 } } },
      ],
      ['a consumption of 240.000 kWh', { annualKwh: 240_000 }],
    ];
    for (const [label, change] of cases) {
      expect(errorsOf(change), label).toEqual([]);
    }
  });

  it('refuses', () => {
    const cases: [string, Partial<RenewalInput>, string[]][] = [
      ['a renewal that is no day', { renewalDate: '2026-13-01' }, ['renewalDate:invalid_date']],

      ['a consumption of nothing', { annualKwh: 0 }, ['annualKwh:kwh_range']],
    ];
    for (const [label, change, errors] of cases) {
      expect(errorsOf(change), label).toEqual(errors);
    }
  });
});
