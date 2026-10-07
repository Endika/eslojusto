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
import { contract } from './fixtures';

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

  it('a rise still pending validation gives both readings and counts the lower', () => {
    // Anniversary 20-10-2026, synthetic IRAV September 2026 2,5 %. Where RDL 29/2026 holds and
    // its 2 % cap (DF 6.ª) counts for charges: 600 × 1,04 = 624; otherwise 600 × 1,05 = 630.
    // 640 charged.
    const [r] = checkCharges(
      input([community({ charged: [{ year: 2026, amount: 640 }] })], {
        signedOn: f('2025-10-15'),
        startDate: f('2025-10-20'),
      }),
      FUTURE,
    );
    if (r?.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(r.outcome.reasons).toEqual(['pending_validation', 'extraordinary_cap_reach']);
    expect(countedAmount(r.outcome, itemAmount)).toBe(10);
    expect(highestAmount(r.outcome, itemAmount)).toBe(16);
  });

  it('a year whose index is not out yet is not checkable', () => {
    const [r] = checkCharges(
      input([community({ charged: [{ year: 2026, amount: 640 }] })], {
        signedOn: f('2025-10-15'),
        startDate: f('2025-10-20'),
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

  it('in a contract signed in November 2026 gives both readings, pending validation', () => {
    const [r] = checkCharges(
      input(
        [
          community({
            kind: 'property_tax',
            annualAgreed: 300,
            charged: [{ year: 2026, amount: 300 }],
          }),
        ],
        { signedOn: f('2026-11-02'), startDate: f('2026-11-02') },
      ),
      DEPS,
    );
    if (r?.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(r.outcome.reasons).toEqual(['pending_validation']);
    expect(r.outcome.low).toMatchObject({ status: 'not_checkable' });
    expect(r.outcome.high).toMatchObject({ status: 'paid_over', amount: 300 });
    expect(countedAmount(r.outcome, itemAmount)).toBe(0);
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
