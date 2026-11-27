import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../../src/engine/date';
import { checkCharges } from '../../../src/engine/rental/charges';
import { IGC } from '../../../src/engine/rental/data/igc';
import { IPC } from '../../../src/engine/rental/data/ipc';
import { IRAV } from '../../../src/engine/rental/data/irav';
import { NORMS } from '../../../src/engine/rental/data/norms';
import type { IndexSeries } from '../../../src/engine/rental/indices';
import { itemAmount, type ItemResult } from '../../../src/engine/rental/item';
import { countedAmount, highestAmount } from '../../../src/engine/rental/outcome';
import type { Charge, RentalDeps, RentalInput } from '../../../src/engine/rental/types';
import { contract, readingOf } from './fixtures';
import { NORMS_BEFORE_VOTE } from './norms-before-vote';

const DEPS: RentalDeps = { norms: NORMS, indices: { irav: IRAV, ipc: IPC, igc: IGC } };

// Synthetic September 2026 figures, past the loaded tables; neither is an INE figure.
const SYNTHETIC = 'https://example.test/synthetic';
const withSeptember = (series: IndexSeries, rate: number): IndexSeries => ({
  ...series,
  coveredUntil: '2026-12-31',
  values: [
    ...series.values,
    { month: '2026-09', rate, publishedOn: '2026-10-15', publishedUrl: SYNTHETIC },
  ],
  pendingFlash: null,
});
const FUTURE: RentalDeps = {
  norms: NORMS,
  indices: { irav: withSeptember(IRAV, 2.5), ipc: withSeptember(IPC, 4.9), igc: IGC },
};

const FUTURE_BEFORE_VOTE: RentalDeps = { ...FUTURE, norms: NORMS_BEFORE_VOTE };

const community = (change: Partial<Charge> = {}): Charge => ({
  kind: 'community',
  inContract: true,
  annualAgreed: 600,
  charged: [],
  ...change,
});

// Signed after 26-05-2023 with an IRAV clause; first anniversary 20-09-2026.
const input = (charges: readonly Charge[], change: Partial<RentalInput> = {}): RentalInput =>
  contract({
    signedOn: f('2025-09-15'),
    startDate: f('2025-09-20'),
    updateClause: 'irav',
    charges,
    ...change,
  });

const singleOf = (r: ItemResult | undefined) => {
  if (r?.outcome.kind !== 'single') throw new Error(`expected single, got ${r?.outcome.kind}`);
  return { status: r.outcome.value.status, amount: r.outcome.value.amount };
};

describe('a charge agreed with its yearly amount', () => {
  it('may rise at most twice the rent: 600 € and a 2,47 % rent cap allow 629,64 €', () => {
    // IRAV August 2026 2,47 % (out 15-09-2026), below the CPI 4,3 %: the rent may rise 2,47 %.
    // 600 × (1 + 2 × 2,47 / 100) = 629,64; 700 charged is 70,36 over.
    const [first, second] = checkCharges(
      input([
        community({
          charged: [
            { year: 2025, amount: 600 },
            { year: 2026, amount: 700 },
          ],
        }),
      ]),
      DEPS,
    );
    expect(singleOf(first)).toEqual({ status: 'within_limit', amount: null });
    expect(singleOf(second)).toEqual({ status: 'paid_over', amount: 70.36 });
    expect(second?.year).toBe(2026);
    expect(second?.outcome.kind === 'single' && second.outcome.value.calculation).toContainEqual({
      key: 'charges.year_cap',
      vars: {
        year: { integer: 2026 },
        previous: { euros: 600 },
        rise: { percent: 2.47 },
        cap: { euros: 629.64 },
      },
    });
    expect(second?.sources.map((s) => s.id)).toEqual(
      expect.arrayContaining(['charges_pact', 'charges_increase', 'cap_irav']),
    );
  });

  it('leaves to review a year with two yearly bills rather than count it', () => {
    // Two community bills of 600 € and 618 € paid in 2025: 1.218 €, over 1,5 × 600.
    const [r] = checkCharges(
      input([
        community({
          charged: [
            { year: 2025, amount: 600 },
            { year: 2025, amount: 618 },
          ],
        }),
      ]),
      DEPS,
    );
    expect(singleOf(r)).toEqual({ status: 'review_it', amount: null });
    expect(r && countedAmount(r.outcome, itemAmount)).toBe(0);
    expect(r?.outcome.kind === 'single' && r.outcome.value.calculation).toContainEqual({
      key: 'charges.year_unclear',
      vars: { year: { integer: 2025 }, charged: { euros: 1218 } },
    });
  });

  it('still counts a year over the cap but under 1,5 times the agreed amount', () => {
    const [r] = checkCharges(input([community({ charged: [{ year: 2025, amount: 900 }] })]), DEPS);
    expect(singleOf(r)).toEqual({ status: 'paid_over', amount: 300 });
  });

  it('cannot rise at all when the rent has no update clause', () => {
    const [r] = checkCharges(
      input([community({ charged: [{ year: 2026, amount: 612 }] })], { updateClause: 'none' }),
      DEPS,
    );
    expect(singleOf(r)).toEqual({ status: 'paid_over', amount: 12 });
  });

  it('past the first five years (seven for a company) the cap is not applicable', () => {
    const charged = [{ year: 2026, amount: 900 }];
    const start = { signedOn: f('2021-03-15'), startDate: f('2021-03-20') };
    const [person] = checkCharges(input([community({ charged })], start), DEPS);
    expect(singleOf(person).status).toBe('not_applicable_to_date');
    const [company] = checkCharges(
      input([community({ charged: [{ year: 2025, amount: 600 }] })], {
        ...start,
        landlordType: 'company',
        updateClause: 'none',
      }),
      DEPS,
    );
    expect(singleOf(company).status).toBe('within_limit');
  });

  // Anniversary 20-10-2026, synthetic IRAV September 2026 2,5 %. Where RDL 29/2026 holds and
  // its 2 % cap (DF 6.ª) counts for charges: 600 × 1,04 = 624; otherwise 600 × 1,05 = 630.
  // 640 charged.
  const risen = () =>
    input([community({ charged: [{ year: 2026, amount: 640 }] })], {
      signedOn: f('2025-10-15'),
      startDate: f('2025-10-20'),
    });

  it('a rise still pending validation gives both readings and counts the lower', () => {
    const [r] = checkCharges(risen(), FUTURE_BEFORE_VOTE);
    if (r?.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(r.outcome.reasons).toEqual(['pending_validation', 'extraordinary_cap_reach']);
    expect(countedAmount(r.outcome, itemAmount)).toBe(10);
    expect(highestAmount(r.outcome, itemAmount)).toBe(16);
  });

  it('a rise under the validated RDL 29/2026 no longer waits on its validation', () => {
    const [r] = checkCharges(risen(), FUTURE);
    if (r?.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(r.outcome.reasons).toEqual(['extraordinary_cap_reach']);
    expect(countedAmount(r.outcome, itemAmount)).toBe(10);
    expect(highestAmount(r.outcome, itemAmount)).toBe(16);
  });

  it('a year whose index is not out yet is not checkable', () => {
    const [r] = checkCharges(
      input([community({ charged: [{ year: 2030, amount: 640 }] })], {
        signedOn: f('2029-10-15'),
        startDate: f('2029-10-20'),
      }),
      DEPS,
    );
    expect(singleOf(r).status).toBe('not_checkable');
  });
});

describe('the extraordinary caps', () => {
  it('count for charges only in one reading, so the RDL 6/2022 IGC cap adds nothing to the total', () => {
    // Anniversary 01-06-2022: the CPI clause and art. 18.1 allow a rise far above 640 / 600, while
    // the IGC cap of RDL 6/2022 (at most 2 %) gives 600 × 1,04 = 624 at most.
    for (const largeLandlord of [false, true, null]) {
      const [r] = checkCharges(
        input([community({ charged: [{ year: 2022, amount: 640 }] })], {
          signedOn: f('2021-06-01'),
          startDate: f('2021-06-01'),
          updateClause: 'ipc',
          largeLandlord,
        }),
        DEPS,
      );
      if (r?.outcome.kind !== 'depends') throw new Error('expected depends');
      expect(r.outcome.reasons).toContain('extraordinary_cap_reach');
      expect(r.outcome.readings.map((x) => x.value.status)).toContain('paid_over');
      expect(countedAmount(r.outcome, itemAmount)).toBe(0);
    }
  });
});

describe('a charge with no basis to compare', () => {
  it('of another kind may be a metered supply or a tax: left to look at', () => {
    const [r] = checkCharges(
      input([
        community({ kind: 'other', annualAgreed: 300, charged: [{ year: 2026, amount: 500 }] }),
      ]),
      DEPS,
    );
    expect(singleOf(r)).toEqual({ status: 'review_it', amount: null });
  });

  it('missing from the contract is left to look at, with what was charged and no total', () => {
    const [r] = checkCharges(
      input([
        community({
          inContract: false,
          annualAgreed: null,
          charged: [
            { year: 2025, amount: 150 },
            { year: 2026, amount: 610 },
          ],
        }),
      ]),
      DEPS,
    );
    expect(singleOf(r)).toEqual({ status: 'review_it', amount: null });
    expect(r?.outcome.kind === 'single' && r.outcome.value.calculation).toEqual([
      { key: 'charges.not_in_contract', vars: { charged: { euros: 760 } } },
    ]);
  });

  it('in the contract with no yearly amount is left to look at', () => {
    const [r] = checkCharges(
      input([community({ annualAgreed: null, charged: [{ year: 2026, amount: 610 }] })]),
      DEPS,
    );
    expect(singleOf(r)).toEqual({ status: 'review_it', amount: null });
  });

  it('a waste fee may be a tax, so it is not capped', () => {
    const [r] = checkCharges(
      input([community({ kind: 'waste', charged: [{ year: 2026, amount: 900 }] })]),
      DEPS,
    );
    expect(singleOf(r).status).toBe('not_checkable');
  });
});

describe('property tax (IBI)', () => {
  it('in a 2024 contract stays out of every total', () => {
    const results = checkCharges(
      input(
        [
          community({
            kind: 'property_tax',
            annualAgreed: 300,
            charged: [{ year: 2025, amount: 450 }],
          }),
        ],
        { signedOn: f('2024-02-01'), startDate: f('2024-02-01') },
      ),
      DEPS,
    );
    for (const r of results) {
      expect(singleOf(r).status).toBe('not_checkable');
      expect(highestAmount(r.outcome, itemAmount)).toBe(0);
    }
  });

  const taxCharged = () =>
    input(
      [
        community({
          kind: 'property_tax',
          annualAgreed: 300,
          charged: [{ year: 2026, amount: 300 }],
        }),
      ],
      { signedOn: f('2026-11-02'), startDate: f('2026-11-02') },
    );

  it('in a contract signed in November 2026 gives both readings, pending validation', () => {
    const [r] = checkCharges(taxCharged(), { ...DEPS, norms: NORMS_BEFORE_VOTE });
    if (r?.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(r.outcome.reasons).toEqual(['pending_validation']);
    expect(r.outcome.low).toMatchObject({ status: 'not_checkable' });
    expect(r.outcome.high).toMatchObject({ status: 'paid_over', amount: 300 });
    expect(countedAmount(r.outcome, itemAmount)).toBe(0);
  });

  it('in a contract signed in November 2026 is paid over with a single reading once validated', () => {
    const [r] = checkCharges(taxCharged(), DEPS);
    expect(singleOf(r)).toEqual({ status: 'paid_over', amount: 300 });
  });
});

describe('what was charged in a year', () => {
  it('adds up however many receipts it came in', () => {
    const results = checkCharges(
      input([
        community({
          charged: [
            { year: 2026, amount: 400 },
            { year: 2025, amount: 600 },
            { year: 2026, amount: 300 },
          ],
        }),
      ]),
      DEPS,
    );
    expect(results.map((r) => r.year)).toEqual([2025, 2026]);
    // 700 in 2026 against 629,64.
    expect(singleOf(results[1])).toEqual({ status: 'paid_over', amount: 70.36 });
  });
});

const YEAR_CAP = (year: number, previous: number, rise: number, cap: number) => ({
  key: 'charges.year_cap',
  vars: {
    year: { integer: year },
    previous: { euros: previous },
    rise: { percent: rise },
    cap: { euros: cap },
  },
});
const AGREED_600 = { key: 'charges.agreed', vars: { amount: { euros: 600 } } };
const OLD_CONTRACT = { signedOn: f('2024-02-01'), startDate: f('2024-02-01') };
const NOVEMBER_2026 = { signedOn: f('2026-11-02'), startDate: f('2026-11-02') };
const IRAV_RULES = ['charges_pact', 'charges_increase', 'update_clause', 'cap_irav', 'cap_ipc'];

describe('how each charge is worded and sourced', () => {
  type Words = {
    index: number;
    year: number | null;
    status: string;
    calculation: readonly object[];
    rules: readonly string[];
  };
  const words = (r: ItemResult | undefined): Words => {
    if (r?.outcome.kind !== 'single') throw new Error('expected single');
    const { status, calculation, rules } = r.outcome.value;
    expect(r.sources.map((x) => x.id)).toEqual(rules);
    return { index: r.index ?? -1, year: r.year, status, calculation, rules };
  };
  const one = (charge: Charge, change: Partial<RentalInput> = {}) =>
    words(checkCharges(input([charge], change), DEPS)[0]);

  it.each<[string, () => Words, Words]>([
    [
      'not in the contract, second in its list',
      () =>
        words(
          checkCharges(
            input([
              community(),
              community({
                inContract: false,
                annualAgreed: null,
                charged: [{ year: 2026, amount: 5 }],
              }),
            ]),
            DEPS,
          )[1],
        ),
      {
        index: 1,
        year: null,
        status: 'review_it',
        calculation: [{ key: 'charges.not_in_contract', vars: { charged: { euros: 5 } } }],
        rules: ['charges_pact'],
      },
    ],
    [
      'in the contract with no yearly amount',
      () => one(community({ annualAgreed: null, charged: [{ year: 2026, amount: 5 }] })),
      {
        index: 0,
        year: null,
        status: 'review_it',
        calculation: [{ key: 'charges.no_annual_amount' }],
        rules: ['charges_pact'],
      },
    ],
    [
      'nothing charged',
      () => one(community()),
      {
        index: 0,
        year: null,
        status: 'not_entered',
        calculation: [{ key: 'item.not_entered' }],
        rules: ['charges_pact'],
      },
    ],
    [
      'a cent over the cap is rounding',
      () => one(community({ charged: [{ year: 2026, amount: 629.65 }] })),
      {
        index: 0,
        year: 2026,
        status: 'within_limit',
        calculation: [
          AGREED_600,
          YEAR_CAP(2026, 600, 2.47, 629.64),
          {
            key: 'charges.within_cap',
            vars: { charged: { euros: 629.65 }, cap: { euros: 629.64 } },
          },
        ],
        rules: IRAV_RULES,
      },
    ],
    [
      'two cents over the cap',
      () => one(community({ charged: [{ year: 2026, amount: 629.66 }] })),
      {
        index: 0,
        year: 2026,
        status: 'paid_over',
        calculation: [
          AGREED_600,
          YEAR_CAP(2026, 600, 2.47, 629.64),
          {
            key: 'charges.over_cap',
            vars: { charged: { euros: 629.66 }, cap: { euros: 629.64 }, amount: { euros: 0.02 } },
          },
        ],
        rules: IRAV_RULES,
      },
    ],
    [
      'under a clause naming no index, below the bound nothing can be told',
      () => one(community({ charged: [{ year: 2026, amount: 610 }] }), { updateClause: 'other' }),
      {
        index: 0,
        year: 2026,
        status: 'not_checkable',
        calculation: [
          AGREED_600,
          YEAR_CAP(2026, 600, 2.47, 629.64),
          { key: 'charges.rise_upper_bound' },
        ],
        rules: IRAV_RULES,
      },
    ],
    [
      'a year whose index is not out',
      () =>
        one(community({ charged: [{ year: 2030, amount: 640 }] }), {
          signedOn: f('2029-10-15'),
          startDate: f('2029-10-20'),
        }),
      {
        index: 0,
        year: 2030,
        status: 'not_checkable',
        calculation: [
          AGREED_600,
          { key: 'charges.rise_not_checkable', vars: { year: { integer: 2030 } } },
        ],
        rules: ['charges_pact', 'charges_increase', 'update_clause'],
      },
    ],
    [
      'two yearly bills',
      () =>
        one(
          community({
            charged: [
              { year: 2025, amount: 600 },
              { year: 2025, amount: 618 },
            ],
          }),
        ),
      {
        index: 0,
        year: 2025,
        status: 'review_it',
        calculation: [
          AGREED_600,
          {
            key: 'charges.year_unclear',
            vars: { year: { integer: 2025 }, charged: { euros: 1218 } },
          },
        ],
        rules: ['charges_pact', 'charges_increase'],
      },
    ],
    [
      'a tax with nothing charged',
      () => one(community({ kind: 'property_tax' }), OLD_CONTRACT),
      {
        index: 0,
        year: null,
        status: 'not_checkable',
        calculation: [{ key: 'charges.tax_outside_cap' }],
        rules: ['charges_increase'],
      },
    ],
    [
      'a waste fee',
      () => one(community({ kind: 'waste', charged: [{ year: 2026, amount: 900 }] })),
      {
        index: 0,
        year: null,
        status: 'not_checkable',
        calculation: [{ key: 'charges.waste_may_be_tax' }],
        rules: ['charges_increase'],
      },
    ],
    [
      'a tax the tenant may not bear',
      () =>
        one(
          community({
            kind: 'property_tax',
            annualAgreed: 300,
            charged: [{ year: 2026, amount: 300 }],
          }),
          NOVEMBER_2026,
        ),
      {
        index: 0,
        year: 2026,
        status: 'paid_over',
        calculation: [{ key: 'charges.tax_banned', vars: { charged: { euros: 300 } } }],
        rules: ['taxes_ban'],
      },
    ],
    [
      'another kind',
      () =>
        one(community({ kind: 'other', annualAgreed: 300, charged: [{ year: 2026, amount: 5 }] })),
      {
        index: 0,
        year: null,
        status: 'review_it',
        calculation: [{ key: 'charges.other_kind' }],
        rules: ['charges_meters'],
      },
    ],
    [
      'past the first seven years of a company',
      () =>
        one(community({ charged: [{ year: 2028, amount: 900 }] }), {
          signedOn: f('2021-03-15'),
          startDate: f('2021-03-20'),
          landlordType: 'company',
        }),
      {
        index: 0,
        year: 2028,
        status: 'not_applicable_to_date',
        calculation: [{ key: 'charges.past_first_years', vars: { years: { integer: 7 } } }],
        rules: ['charges_increase'],
      },
    ],
  ])('%s', (_, actual, expected) => {
    expect(actual()).toEqual(expected);
  });
});

describe('a year charged far over the agreed amount', () => {
  const STARTED = {
    signedOn: f('2019-06-01'),
    startDate: f('2019-06-01'),
    updateClause: 'ipc',
  } as const;
  const month = (n: number): string =>
    `${2018 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
  // Every month of the CPI is out on the first day of the next one, the day of each anniversary.
  const synthetic = (
    rateOf: (month: string) => number,
    series: IndexSeries = IPC,
  ): IndexSeries => ({
    ...series,
    coveredUntil: '2031-12-31',
    loadedFromStart: true,
    pendingFlash: null,
    values: Array.from({ length: 14 * 12 }, (_, n) => ({
      month: month(n),
      rate: rateOf(month(n)),
      publishedOn: `${month(n + 1)}-01`,
      publishedUrl: SYNTHETIC,
    })),
  });
  const deps = (rateOf: (month: string) => number): RentalDeps => ({
    ...DEPS,
    indices: { ...DEPS.indices, ipc: synthetic(rateOf) },
  });
  const in2021 = (amount: number) =>
    input([community({ charged: [{ year: 2021, amount }] })], STARTED);

  it('is counted when the cap allows it in every reading', () => {
    // 600 × 1,3 × 1,3 = 1.014.
    const [r] = checkCharges(
      in2021(1000),
      deps(() => 15),
    );
    expect(singleOf(r).status).toBe('within_limit');
  });

  it('is left to review when only some readings allow it', () => {
    // The CPI is 15 % in odd months and 5 % in even ones, and the day each month comes out the
    // reading before it is the other candidate.
    const [r] = checkCharges(
      in2021(1000),
      deps((m) => (Number(m.slice(5)) % 2 === 1 ? 15 : 5)),
    );
    expect(singleOf(r).status).toBe('review_it');
  });
});

describe('a year with many open doubts', () => {
  const SIGNED = {
    signedOn: f('2023-06-01'),
    startDate: f('2023-06-01'),
    landlordType: 'company',
  } as const;
  // Both the CPI and the IRAV come out on every anniversary: two doubts a year.
  const month = (n: number): string =>
    `${2023 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
  const synthetic = (series: IndexSeries): IndexSeries => ({
    ...series,
    coveredUntil: '2031-12-31',
    pendingFlash: null,
    values: Array.from({ length: 9 * 12 }, (_, n) => ({
      month: month(n),
      rate: n % 2 === 0 ? 1 : 2,
      publishedOn: `${month(n + 1)}-01`,
      publishedUrl: SYNTHETIC,
    })),
  });
  const deps: RentalDeps = {
    ...DEPS,
    indices: { ...DEPS.indices, irav: synthetic(IRAV), ipc: synthetic(IPC) },
  };
  const inYear = (year: number) =>
    readingOf(
      checkCharges(
        input([community({ charged: [{ year, amount: 640 }] })], {
          ...SIGNED,
          updateClause: 'ipc',
        }),
        deps,
      )[0],
    );

  it('is worked out with ten', () => {
    expect(inYear(2028).status).not.toBe('not_checkable');
  });

  it('is not worked out with more than ten', () => {
    expect(inYear(2029)).toEqual({
      status: 'not_checkable',
      amount: null,
      calculation: [{ key: 'charges.too_many_readings' }],
      rules: ['charges_pact', 'charges_increase'],
    });
  });
});
