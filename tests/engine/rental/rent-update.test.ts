import { describe, expect, it } from 'vitest';
import { parseDate as f, type CivilDate } from '../../../src/engine/date';
import { IGC } from '../../../src/engine/rental/data/igc';
import { IPC } from '../../../src/engine/rental/data/ipc';
import { IRAV } from '../../../src/engine/rental/data/irav';
import { NORMS } from '../../../src/engine/rental/data/norms';
import type { IndexSeries, IndexTables } from '../../../src/engine/rental/indices';
import type { Norm, NormTable } from '../../../src/engine/rental/norms';
import { countedAmount, letterAmount } from '../../../src/engine/rental/outcome';
import {
  checkRentUpdates,
  rentUpdateAmount,
  type RentUpdateReading,
  type RentUpdateResult,
} from '../../../src/engine/rental/rent-update';
import type { RentalDeps, RentalInput } from '../../../src/engine/rental/types';
import { contract, update } from './fixtures';

const INDICES: IndexTables = { irav: IRAV, ipc: IPC, igc: IGC };
const DEPS: RentalDeps = { norms: NORMS, indices: INDICES };
const TODAY = f('2026-10-07');

const check = (input: RentalInput, today: CivilDate = TODAY, deps: RentalDeps = DEPS) =>
  checkRentUpdates(input, today, deps);
const first = (results: readonly RentUpdateResult[]): RentUpdateResult => {
  const r = results[0];
  if (r === undefined) throw new Error('no result');
  return r;
};
const single = (r: RentUpdateResult): RentUpdateReading => {
  if (r.outcome.kind !== 'single') throw new Error(`expected single, got ${r.outcome.kind}`);
  return r.outcome.value;
};
const depends = (r: RentUpdateResult) => {
  if (r.outcome.kind !== 'depends') throw new Error('expected depends');
  return r.outcome;
};
const counted = (r: RentUpdateResult) => countedAmount(r.outcome, rentUpdateAmount);
const figures = (v: RentUpdateReading) => ({
  status: v.status,
  base: v.base,
  maxRent: v.maxRent,
  monthly: v.monthly,
  months: v.months,
  accumulated: v.accumulated,
});

const withNorm = (id: keyof NormTable, change: Partial<Norm>): NormTable => ({
  ...NORMS,
  [id]: { ...NORMS[id], ...change },
});

// Synthetic figures past the loaded tables, so the windows from 08-10-2026 can be worked out.
// None of these is an INE figure.
const SYNTHETIC = 'https://example.test/synthetic';
const extend = (
  series: IndexSeries,
  values: readonly [string, number, string][],
  coveredUntil: string,
): IndexSeries => ({
  ...series,
  coveredUntil,
  values: [
    ...series.values,
    ...values.map(([month, rate, publishedOn]) => ({
      month,
      rate,
      publishedOn,
      publishedUrl: SYNTHETIC,
    })),
  ],
  pendingFlash: null,
});
const FUTURE: IndexTables = {
  irav: extend(
    IRAV,
    [
      ['2026-09', 2.5, '2026-10-15'],
      ['2027-03', 2.2, '2027-04-14'],
      ['2028-02', 2.3, '2028-03-14'],
    ],
    '2028-12-31',
  ),
  ipc: extend(
    IPC,
    [
      ['2026-09', 4.9, '2026-10-15'],
      ['2027-03', 3, '2027-04-14'],
      ['2028-02', 2.9, '2028-03-14'],
    ],
    '2028-12-31',
  ),
  igc: IGC,
};
const FUTURE_DEPS: RentalDeps = { norms: NORMS, indices: FUTURE };

describe('the cap in force on each anniversary', () => {
  it('2019-2022: the CPI, and a negative CPI allows no rise', () => {
    // IPC April 2020 −0,7 % (out 14-05-2020); April 2021 2,2 % (out 14-05-2021); no flash out yet.
    const results = check(
      contract({
        signedOn: f('2019-05-10'),
        startDate: f('2019-05-20'),
        initialRent: 800,
        updates: [update('2020-05-20', 800, 800), update('2021-05-20', 800, 830)],
      }),
    );
    const [y1, y2] = results.map(single);
    expect(y1 && figures(y1)).toEqual({
      status: 'within_limit',
      base: 800,
      maxRent: 800,
      monthly: 0,
      months: 12,
      accumulated: 0,
    });
    expect(y1?.calculation.map((p) => p.key)).toContain('rent_update.negative_rate');
    // 800 × 1,022 = 817,60; 12,40 a month from May 2021 to April 2022.
    expect(y2 && figures(y2)).toEqual({
      status: 'paid_over',
      base: 800,
      maxRent: 817.6,
      monthly: 12.4,
      months: 12,
      accumulated: 148.8,
    });
    expect(y2?.cap).toEqual({
      rule: 'cap_ipc',
      rate: {
        kind: 'index',
        figure: {
          index: 'ipc',
          month: '2021-04',
          rate: 2.2,
          publishedOn: '2021-05-14',
          flash: false,
          clampedFrom: null,
        },
      },
    });
  });

  it('31-03-2022 to 2023: the IGC, at most 2 %, below a CPI clause', () => {
    // IPC June 2022 10,2 %; IGC May 2022 4,66 % (out 20-07-2022), which Ley 2/2015 reads as
    // 2 %: 900 × 1,02 = 918.
    const r = first(
      check(
        contract({
          signedOn: f('2021-07-20'),
          startDate: f('2021-07-25'),
          initialRent: 900,
          updates: [update('2022-07-25', 900, 991.8)],
        }),
      ),
    );
    const v = single(r);
    expect(figures(v)).toEqual({
      status: 'paid_over',
      base: 900,
      maxRent: 918,
      monthly: 73.8,
      months: 12,
      accumulated: 885.6,
    });
    expect(v.cap).toMatchObject({
      rule: 'cap_igc_2022_extended',
      rate: { figure: { index: 'igc', month: '2022-05', rate: 2, clampedFrom: 4.66 } },
    });
    expect(v.rules).toContain('igc_clamp');
    expect(r.sources.map((s) => s.id)).toContain('cap_igc_2022_extended');
  });

  it('2024: 3 % below a 3,6 % CPI', () => {
    // IPC May 2024 3,6 %; cap 3 %: 1.000 × 1,03 = 1.030.
    const v = single(
      first(
        check(
          contract({
            signedOn: f('2023-06-15'),
            startDate: f('2023-06-20'),
            updates: [update('2024-06-20', 1000, 1036)],
          }),
        ),
      ),
    );
    expect(figures(v)).toMatchObject({ maxRent: 1030, monthly: 6, months: 12, accumulated: 72 });
    expect(v.cap?.rule).toBe('cap_3_2024');
  });

  it('2025: the IRAV caps a contract signed from 26-05-2023, the CPI an earlier one', () => {
    // 20-03-2025: IRAV February 2,08 % and IPC February 3,0 % (both out 14-03-2025).
    const after = single(
      first(
        check(
          contract({
            signedOn: f('2024-03-15'),
            startDate: f('2024-03-20'),
            updates: [update('2025-03-20', 1000, 1030)],
          }),
        ),
      ),
    );
    expect(figures(after)).toMatchObject({ maxRent: 1020.8, monthly: 9.2, accumulated: 110.4 });
    expect(after.cap?.rule).toBe('cap_irav');
    const before = single(first(check(contract({ updates: [update('2025-03-20', 1000, 1030)] }))));
    expect(figures(before)).toMatchObject({ status: 'within_limit', maxRent: 1030 });
    expect(before.cap?.rule).toBe('cap_ipc');
  });

  it('15-04-2026, inside RDL 8/2026: both readings, neither counted', () => {
    // IRAV March 2026 2,47 % (out 14-04-2026); with RDL 8/2026, 2 %.
    const r = first(
      check(
        contract({
          signedOn: f('2024-04-10'),
          startDate: f('2024-04-15'),
          updateClause: 'irav',
          updates: [update('2026-04-15', 1000, 1024.7)],
        }),
      ),
    );
    const d = depends(r);
    expect(d.reasons).toEqual(['repealed_window']);
    expect(figures(d.low)).toMatchObject({ status: 'within_limit', maxRent: 1024.7 });
    // April to September 2026: 6 months × 4,70.
    expect(figures(d.high)).toMatchObject({
      status: 'paid_over',
      maxRent: 1020,
      monthly: 4.7,
      months: 6,
      accumulated: 28.2,
    });
    expect(counted(r)).toBe(0);
    expect(letterAmount(r.outcome, rentUpdateAmount)).toBeNull();
    expect(r.sources.find((s) => s.id === 'cap_2_rdl8')).toMatchObject({ status: 'repealed' });
  });

  it('01-10-2026, the one day of RDL 26/2026: both readings, neither counted', () => {
    // IRAV August 2026 2,47 % (out 15-09-2026).
    const r = first(
      check(
        contract({
          signedOn: f('2024-09-25'),
          startDate: f('2024-10-01'),
          updateClause: 'irav',
          updates: [update('2026-10-01', 1000, 1024.7)],
        }),
        f('2026-12-20'),
      ),
    );
    const d = depends(r);
    expect(d.reasons).toEqual(['repealed_window']);
    expect(figures(d.high)).toMatchObject({ maxRent: 1020, months: 3, accumulated: 14.1 });
    expect(counted(r)).toBe(0);
  });

  it('01-10-2026: RDL 26/2026 also read a clause naming no index as the IRAV', () => {
    // With RDL 26/2026: IRAV August 2,47 %, capped at 2 %, allows 1.020. Without it: IGC July
    // −0,33 %, read as 0 %, allows no rise. October to December 2026: 3 months × 20.
    const r = first(
      check(
        contract({
          signedOn: f('2024-09-25'),
          startDate: f('2024-10-01'),
          updateClause: 'unspecified_index',
          updates: [update('2026-10-01', 1000, 1020)],
        }),
        f('2026-12-20'),
      ),
    );
    const d = depends(r);
    expect(d.reasons).toEqual(['repealed_window']);
    expect(d.low).toMatchObject({ status: 'within_limit', maxRent: 1020 });
    expect(d.low.rules).toContain('update_clause_rdl26');
    expect(d.high).toMatchObject({ maxRent: 1000, monthly: 20, accumulated: 60 });
    expect(counted(r)).toBe(0);
    expect(letterAmount(r.outcome, rentUpdateAmount)).toBeNull();
  });

  it('01-10-2026: under RDL 26/2026 the IRAV caps a contract from 2021 too', () => {
    // IPC: August 4,3 % and the September flash 4,9 % (out 29-09-2026), both above the 3 % clause;
    // with RDL 26/2026, the IRAV (2,47 %) and 2 %.
    const r = first(
      check(
        contract({
          signedOn: f('2021-09-25'),
          startDate: f('2021-10-01'),
          updateClause: 'fixed_percent',
          fixedPercent: 3,
          updates: [update('2026-10-01', 1000, 1030)],
        }),
        f('2026-12-20'),
      ),
    );
    const d = depends(r);
    expect(d.reasons).toEqual(['repealed_window']);
    expect(d.low).toMatchObject({ status: 'within_limit', maxRent: 1030 });
    expect(d.high).toMatchObject({ maxRent: 1020, accumulated: 30 });
    expect(d.high.rules).toContain('irav_all_contracts_rdl26');
  });

  it('until RDL 26 and 29/2026, a contract from 26-05-2023 is capped by the lower of IRAV and CPI', () => {
    // Synthetic CPI February 2025 of 1,50 %, below the IRAV (2,08 %): 1.000 × 1,015 = 1.015.
    const lowCpi: RentalDeps = {
      norms: NORMS,
      indices: {
        ...INDICES,
        ipc: {
          ...IPC,
          values: IPC.values.map((v) => (v.month === '2025-02' ? { ...v, rate: 1.5 } : v)),
        },
      },
    };
    const v = single(
      first(
        check(
          contract({
            signedOn: f('2024-03-15'),
            startDate: f('2024-03-20'),
            updates: [update('2025-03-20', 1000, 1030)],
          }),
          TODAY,
          lowCpi,
        ),
      ),
    );
    expect(v.cap?.rule).toBe('cap_ipc');
    expect(v.maxRent).toBe(1015);
  });

  describe('20-10-2026, under RDL 29/2026 pending validation', () => {
    // Synthetic: IRAV September 2026 2,50 % and IPC 4,90 %, out 15-10-2026. A 3 % clause on a
    // 2021 contract: with RDL 29/2026, IRAV and 2 % cap it at 2 %; without, the CPI leaves 3 %.
    const input = contract({
      signedOn: f('2021-10-15'),
      startDate: f('2021-10-20'),
      updateClause: 'fixed_percent',
      fixedPercent: 3,
      updates: [update('2026-10-20', 1000, 1040)],
    });
    const today = f('2026-12-20');

    it('gives both readings and counts the lower one', () => {
      const r = first(check(input, today, FUTURE_DEPS));
      const d = depends(r);
      expect(d.reasons).toEqual(['pending_validation']);
      expect(figures(d.low)).toMatchObject({ maxRent: 1030, monthly: 10, accumulated: 30 });
      expect(figures(d.high)).toMatchObject({ maxRent: 1020, monthly: 20, accumulated: 60 });
      expect(d.high.cap?.rule).toBe('cap_2_rdl29');
      expect(d.high.rules).toContain('irav_all_contracts');
      expect(counted(r)).toBe(30);
      expect(letterAmount(r.outcome, rentUpdateAmount)).toBe(30);
    });

    it('settles on one reading once validated', () => {
      const norms = withNorm('rdl29_2026', {
        status: 'in_force',
        statusSince: '2026-11-05',
        statusUrl: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-99998',
      });
      const r = first(check(input, today, { ...FUTURE_DEPS, norms }));
      expect(figures(single(r))).toMatchObject({ maxRent: 1020, accumulated: 60 });
    });

    it('falls in a repealed window if the Congress repeals it', () => {
      const norms = withNorm('rdl29_2026', {
        status: 'repealed',
        inForceUntil: '2026-11-05',
        statusSince: '2026-11-05',
        statusUrl: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-99999',
      });
      const r = first(check(input, today, { ...FUTURE_DEPS, norms }));
      expect(depends(r).reasons).toEqual(['repealed_window']);
      expect(counted(r)).toBe(0);
    });
  });

  it('2028: the IRAV alone, the same in every reading for a contract from 2024', () => {
    // Synthetic IRAV February 2028 2,30 %: 1.050 × 1,023 = 1.074,15.
    const v = single(
      first(
        check(
          contract({
            signedOn: f('2024-03-15'),
            startDate: f('2024-03-20'),
            updateClause: 'irav',
            updates: [update('2028-03-20', 1050, 1080)],
          }),
          f('2028-06-10'),
          FUTURE_DEPS,
        ),
      ),
    );
    expect(figures(v)).toMatchObject({
      base: 1050,
      maxRent: 1074.15,
      monthly: 5.85,
      months: 4,
      accumulated: 23.4,
    });
    expect(v.cap?.rule).toBe('cap_irav');
    expect(v.calculation[0]?.key).toBe('rent_update.base_from_answer');
  });
});

describe('large landlord', () => {
  // 25-06-2023: IGC April 2023 4,65 % (out 19-06-2023), read as 2 % (Ley 2/2015); IPC May 2023
  // 3,2 %. A 5 % rise agreed in writing.
  const agreed = (largeLandlord: boolean | null, landlordType: 'person' | 'company' = 'person') =>
    first(
      check(
        contract({
          signedOn: f('2020-06-20'),
          startDate: f('2020-06-25'),
          landlordType,
          largeLandlord,
          updateClause: 'fixed_percent',
          fixedPercent: 5,
          updates: [update('2023-06-25', 1000, 1050, { agreedInWriting: true })],
        }),
      ),
    );

  it('yes: the IGC binds even with a written agreement', () => {
    // 1.000 × 1,02 = 1.020; 30 a month for 12 months.
    const v = single(agreed(true));
    expect(figures(v)).toMatchObject({ status: 'paid_over', maxRent: 1020, accumulated: 360 });
    expect(v.cap?.rule).toBe('cap_igc_2023');
  });

  it('no: a written agreement leaves nothing to check', () => {
    expect(single(agreed(false))).toMatchObject({
      status: 'not_checkable',
      unchecked: 'agreed_in_writing',
    });
  });

  it('«No lo sé»: both readings, the lower counted, and the company hint', () => {
    const r = agreed(null, 'company');
    const d = depends(r);
    expect(d.reasons).toEqual(['large_landlord_unknown']);
    expect(d.low.status).toBe('not_checkable');
    expect(d.high.accumulated).toBe(360);
    expect(counted(r)).toBe(0);
    expect(r.companyLandlordHint).toBe(true);
    expect(agreed(null, 'person').companyLandlordHint).toBe(false);
  });

  it('«No lo sé» changes nothing without an agreement', () => {
    // Without agreement the IGC (2 %) binds below the CPI and the 5 % clause: 1.020.
    const r = first(
      check(
        contract({
          signedOn: f('2020-06-20'),
          startDate: f('2020-06-25'),
          landlordType: 'company',
          largeLandlord: null,
          updateClause: 'fixed_percent',
          fixedPercent: 5,
          updates: [update('2023-06-25', 1000, 1050)],
        }),
      ),
    );
    expect(figures(single(r))).toMatchObject({ maxRent: 1020, monthly: 30, accumulated: 360 });
    expect(r.companyLandlordHint).toBe(false);
  });

  it('outside the windows with a large-landlord rule, an agreement is not checked', () => {
    const r = first(
      check(
        contract({
          largeLandlord: true,
          updates: [update('2025-03-20', 1000, 1100, { agreedInWriting: true })],
        }),
      ),
    );
    expect(single(r).unchecked).toBe('agreed_in_writing');
  });

  it('«No lo sé» on the agreement gives both readings', () => {
    const r = first(
      check(
        contract({
          largeLandlord: false,
          updates: [update('2022-03-20', 1000, 1100, { agreedInWriting: null })],
        }),
      ),
    );
    const d = depends(r);
    expect(d.reasons).toEqual(['agreement_unknown']);
    expect(d.low.unchecked).toBe('agreed_in_writing');
    // IPC February 2022 7,6 %: 1.076; 24 a month for 12 months.
    expect(figures(d.high)).toMatchObject({ maxRent: 1076, accumulated: 288 });
  });
});

describe('when no rise fits', () => {
  it('without an update clause the whole rise is paid over', () => {
    const v = single(
      first(check(contract({ updateClause: 'none', updates: [update('2022-03-20', 1000, 1020)] }))),
    );
    expect(figures(v)).toMatchObject({ maxRent: 1000, monthly: 20, months: 12, accumulated: 240 });
    expect(v.calculation.map((p) => p.key)).toContain('rent_update.no_clause');
  });

  describe('a rise applied before the anniversary is still that anniversary’s update', () => {
    // 20-03-2025, contract from 2024: IRAV February 2,08 % allows 1.020,80; notice in February.
    const early = (effectiveOn: string) =>
      single(
        first(
          check(
            contract({
              signedOn: f('2024-03-15'),
              startDate: f('2024-03-20'),
              updateClause: 'irav',
              updates: [
                update('2025-03-20', 1000, 1020.8, {
                  effectiveOn: f(effectiveOn),
                  chargedFrom: f(effectiveOn),
                  noticeOn: f('2025-02-10'),
                }),
              ],
            }),
          ),
        ),
      );

    it('applied from the 1st of the anniversary month, it matches applying it on the day', () => {
      // Checked by the month, March is the anniversary month: nothing above 1.020,80, never the
      // whole year (12 × 20,80 = 249,60).
      const first1 = early('2025-03-01');
      const onDay = early('2025-03-20');
      expect(figures(first1)).toEqual(figures(onDay));
      expect(figures(first1)).toMatchObject({ status: 'within_limit', maxRent: 1020.8 });
      expect(first1.accumulated).toBeLessThanOrEqual(20.8);
      expect(first1.cap?.rule).toBe('cap_irav');
    });

    it('months charged before the anniversary month are paid over in full', () => {
      // February 2025 at 1.020,80 over a 1.000 base: 20,80; March on, within the cap.
      const v = early('2025-02-01');
      expect(figures(v)).toMatchObject({
        status: 'paid_over',
        maxRent: 1020.8,
        monthly: 0,
        months: 13,
        accumulated: 20.8,
      });
      expect(v.monthsBeforeDue).toBe(1);
      expect(v.calculation.map((p) => p.key)).toContain('rent_update.before_anniversary');
    });
  });

  it('a rise applied after the anniversary is that year’s update, due per art. 18.2', () => {
    // IPC February 2022 7,6 % on the anniversary 20-03-2022: 1.076. Applied from 01-04-2022 and
    // notified in March: April 2022 to February 2023, 11 months × 24.
    const v = single(
      first(
        check(
          contract({
            updates: [
              update('2022-03-20', 1000, 1100, {
                effectiveOn: f('2022-04-01'),
                chargedFrom: f('2022-04-01'),
                noticeOn: f('2022-03-01'),
              }),
            ],
          }),
        ),
      ),
    );
    expect(figures(v)).toMatchObject({ maxRent: 1076, monthly: 24, months: 11, accumulated: 264 });
    expect(v.monthsBeforeDue).toBe(0);
    expect(v.cap?.rule).toBe('cap_ipc');
  });

  it('a second rise in the same contract year is paid over in full', () => {
    // The first, within 1.076, runs March to August; the second, from September to February.
    const results = check(
      contract({
        updates: [
          update('2022-03-20', 1076, 1100, {
            effectiveOn: f('2022-09-01'),
            chargedFrom: f('2022-09-01'),
            noticeOn: f('2022-08-01'),
          }),
          update('2022-03-20', 1000, 1076),
        ],
      }),
    );
    const [rise, second] = results.map(single);
    expect(results.map((r) => r.index)).toEqual([1, 0]);
    expect(rise && figures(rise)).toMatchObject({ status: 'within_limit', months: 6 });
    expect(second && figures(second)).toMatchObject({
      base: 1076,
      maxRent: 1076,
      monthly: 24,
      months: 6,
      accumulated: 144,
    });
    expect(second?.calculation.map((p) => p.key)).toContain('rent_update.second_rise');
  });

  it('a 29 February start has its anniversary on 28 February in other years', () => {
    const input = (day: string, effectiveOn = day) =>
      contract({
        signedOn: f('2020-02-20'),
        startDate: f('2020-02-29'),
        initialRent: 700,
        updates: [update(day, 700, 703.5, { effectiveOn: f(effectiveOn) })],
      });
    // On 28-02-2021 the IPC January 0,5 % was out, and the February flash (0,0 %) too.
    const on28 = depends(first(check(input('2021-02-28'))));
    expect(on28.reasons).toEqual(['index_month_doubtful']);
    expect(on28.low.maxRent).toBe(703.5);
    expect(on28.high.maxRent).toBe(700);
    // Applied a day early, it is still the update of 28-02-2021.
    expect(depends(first(check(input('2021-02-28', '2021-02-27')))).reasons).toEqual(on28.reasons);
    // On 29-02-2024 the February flash came out that same day.
    const leap = depends(first(check(input('2024-02-29'))));
    for (const { value } of leap.readings)
      expect(value.calculation.map((p) => p.key)).not.toContain('rent_update.before_anniversary');
  });

  it('a negative IGC under a clause naming no index allows no rise', () => {
    // 10-04-2025: IGC January 2025 −0,31 % (out 20-03-2025); the CPI cap does not lift it.
    const v = single(
      first(
        check(
          contract({
            signedOn: f('2021-04-05'),
            startDate: f('2021-04-10'),
            updateClause: 'unspecified_index',
            updates: [update('2025-04-10', 1000, 1010)],
          }),
        ),
      ),
    );
    expect(figures(v)).toMatchObject({ maxRent: 1000, monthly: 10, accumulated: 120 });
    expect(v.agreed).toMatchObject({
      kind: 'index',
      figure: { index: 'igc', rate: 0, clampedFrom: -0.31 },
    });
  });
});

describe('when the new rent is due (LAU art. 18.2)', () => {
  const base = {
    signedOn: f('2024-03-15'),
    startDate: f('2024-03-20'),
  };

  it('a letter: months charged before the month after it are paid over in full', () => {
    // Notice 10-04-2025, due from May. March and April: 30 each; May to February: 9,20 each.
    const v = single(
      first(
        check(
          contract({
            ...base,
            updates: [update('2025-03-20', 1000, 1030, { noticeOn: f('2025-04-10') })],
          }),
        ),
      ),
    );
    expect(figures(v)).toMatchObject({
      maxRent: 1020.8,
      monthly: 9.2,
      months: 12,
      accumulated: 152,
    });
    expect(v.monthsBeforeDue).toBe(2);
  });

  it('an email: both readings, as if written and as if never notified', () => {
    const r = first(
      check(
        contract({
          ...base,
          updates: [
            update('2025-03-20', 1000, 1030, { notice: 'email', noticeOn: f('2025-04-10') }),
          ],
        }),
      ),
    );
    const d = depends(r);
    expect(d.reasons).toEqual(['notice_form_doubtful']);
    expect(d.low.accumulated).toBe(152);
    expect(d.high.accumulated).toBe(360);
    expect(counted(r)).toBe(152);
  });

  it('a verbal notice: the whole rise is paid over every month', () => {
    const v = single(
      first(
        check(
          contract({
            ...base,
            updates: [update('2025-03-20', 1000, 1030, { notice: 'verbal', noticeOn: null })],
          }),
        ),
      ),
    );
    expect(figures(v)).toMatchObject({ monthly: 9.2, accumulated: 360 });
    expect(v.calculation.map((p) => p.key)).toContain('rent_update.notice_not_written');
  });
});

describe('a rise paid without written notice, within the clause and the cap', () => {
  // Contract from June 2023; IPC of April 2024 3,3 %, capped at 3 % in 2024: 1.030,00 allowed.
  const june = { signedOn: f('2023-06-01'), startDate: f('2023-06-01') };
  const rise = (change: Parameters<typeof update>[3]) =>
    first(check(contract({ ...june, updates: [update('2024-06-01', 1000, 1030, change)] })));

  it.each(['verbal', 'none'] as const)(
    'with %s notice, counts only the lower reading',
    (notice) => {
      const r = rise({ notice, noticeOn: null });
      const d = depends(r);
      expect(d.reasons).toEqual(['notice_missing_paid']);
      expect(figures(d.low)).toMatchObject({
        status: 'within_limit',
        maxRent: 1030,
        accumulated: 0,
      });
      expect(d.low.calculation.map((p) => p.key)).toContain('rent_update.accepted_by_paying');
      // June 2024 to May 2025: 30 a month.
      expect(d.high.accumulated).toBe(360);
      expect(counted(r)).toBe(0);
      expect(letterAmount(r.outcome, rentUpdateAmount)).toBeNull();
    },
  );

  it('over the cap, the whole rise stays paid over in every reading', () => {
    const over = first(
      check(
        contract({
          ...june,
          updates: [update('2024-06-01', 1000, 1040, { notice: 'verbal', noticeOn: null })],
        }),
      ),
    );
    expect(figures(single(over))).toMatchObject({ monthly: 10, accumulated: 480 });
  });
});

describe('accepting the rise (LAU art. 18.1, RDL 6/2022 art. 46)', () => {
  const june = { signedOn: f('2023-06-01'), startDate: f('2023-06-01') };
  const accepted = (change: Parameters<typeof update>[3]) =>
    first(check(contract({ ...june, updates: [update('2024-06-01', 1000, 1050, change)] })));

  it('in writing, the agreement replaces the clause for a landlord who is not a large one', () => {
    expect(single(accepted({ agreedInWriting: true })).status).toBe('not_checkable');
  });

  it('by word of mouth, is a doubt, never «no agreement»', () => {
    const r = accepted({ agreedInWriting: false, agreedVerbally: true });
    const d = depends(r);
    expect(d.reasons).toEqual(['agreement_verbal']);
    // Without the agreement: 1.050 against 1.030 allowed, 20 a month for twelve months.
    expect(d.high.accumulated).toBe(240);
    expect(d.low.status).toBe('not_checkable');
    expect(d.low.calculation.map((p) => p.key)).toContain('rent_update.agreed_verbally');
    expect(counted(r)).toBe(0);
  });

  it('«No lo sé» is a doubt as before', () => {
    expect(depends(accepted({ agreedInWriting: null })).reasons).toEqual(['agreement_unknown']);
  });

  it('«No» compares the rise with the clause and the cap', () => {
    expect(figures(single(accepted({ agreedInWriting: false })))).toMatchObject({
      status: 'paid_over',
      accumulated: 240,
    });
  });
});

describe('a company landlord that is not a large landlord (Ley 12/2023, art. 3.k)', () => {
  // 25-06-2023: a 5 % rise agreed in writing; only a large landlord stays within the IGC (2 %).
  const agreed = (largeLandlord: boolean) =>
    first(
      check(
        contract({
          signedOn: f('2020-06-20'),
          startDate: f('2020-06-25'),
          landlordType: 'company',
          largeLandlord,
          updateClause: 'fixed_percent',
          fixedPercent: 5,
          updates: [update('2023-06-25', 1000, 1050, { agreedInWriting: true })],
        }),
      ),
    );

  it('takes no large-landlord cap', () => {
    const v = single(agreed(false));
    expect(v).toMatchObject({ status: 'not_checkable', cap: null });
    expect(v.rules).not.toContain('cap_igc_2023');
  });

  it('a large one keeps the IGC cap even with the agreement', () => {
    expect(single(agreed(true))).toMatchObject({ status: 'paid_over', maxRent: 1020 });
  });
});

describe('several years', () => {
  it('carry the allowed rent, not the charged one, as the next base', () => {
    // 2022: IPC Feb 2022 7,6 % → 1.076,00, charged 1.100 (24/month).
    // 2023: IGC Dec 2022 7,19 %, read as 2 %, below IPC Feb 2023 6,0 % → 1.076 × 1,02 =
    //       1.097,52; charged 1.100 × 1,06 = 1.166 (68,48/month).
    // 2024: IPC Feb 2024 2,8 % below 3 % → 1.097,52 × 1,028 = 1.128,25; charged
    //       1.166 × 1,028 = 1.198,65 (70,40/month).
    const results = check(
      contract({
        updates: [
          update('2024-03-20', 1166, 1198.65),
          update('2022-03-20', 1000, 1100),
          update('2023-03-20', 1100, 1166),
        ],
      }),
    );
    const readings = results.map(single);
    expect(results.map((r) => r.index)).toEqual([1, 2, 0]);
    expect(readings.map((v) => [v.base, v.maxRent, v.monthly, v.accumulated])).toEqual([
      [1000, 1076, 24, 288],
      [1076, 1097.52, 68.48, 821.76],
      [1097.52, 1128.25, 70.4, 844.8],
    ]);
    expect(readings.map((v) => v.calculation[0]?.key)).toEqual([
      'rent_update.base_initial',
      'rent_update.base_previous_max',
      'rent_update.base_previous_max',
    ]);
  });

  it('a missing year restarts from the rent the person gave', () => {
    const results = check(
      contract({
        updates: [update('2022-03-20', 1000, 1100), update('2024-03-20', 1166, 1198.65)],
      }),
    );
    expect(single(results[1] as RentUpdateResult).base).toBe(1166);
  });

  it('the first anniversary starts from the contract rent', () => {
    const v = single(
      first(check(contract({ initialRent: 990, updates: [update('2022-03-20', 1000, 1060)] }))),
    );
    expect(v.base).toBe(990);
    expect(v.calculation[0]?.key).toBe('rent_update.base_initial');
  });

  it('a doubt in one year carries into the years built on it', () => {
    // 2026 inside RDL 8/2026 (1.020 or 1.024,70); 2027 under RDL 29/2026 pending, with a
    // synthetic IRAV March 2027 of 2,20 % (2 % or 2,2 %) on whichever base the year before left.
    const results = check(
      contract({
        signedOn: f('2024-04-10'),
        startDate: f('2024-04-15'),
        updateClause: 'irav',
        updates: [update('2026-04-15', 1000, 1024.7), update('2027-04-15', 1024.7, 1050)],
      }),
      f('2027-06-10'),
      FUTURE_DEPS,
    );
    const [y2026, y2027] = results.map(depends);
    expect(y2026?.reasons).toEqual(['repealed_window']);
    expect(y2026?.low.months).toBe(12);
    expect(y2027?.reasons).toEqual(['pending_validation', 'repealed_window']);
    expect(y2027?.readings.map((r) => [r.value.base, r.value.maxRent]).sort()).toEqual([
      [1020, 1040.4],
      [1020, 1042.44],
      [1024.7, 1045.19],
      [1024.7, 1047.24],
    ]);
    expect(y2027 && [y2027.low.accumulated, y2027.high.accumulated]).toEqual([8.28, 28.8]);
    expect(counted(results[1] as RentUpdateResult)).toBe(0);
  });

  it('stop at the keys and count only months already due', () => {
    const input = contract({
      updates: [update('2025-03-20', 1000, 1040)],
      moveOut: { keysReturnedOn: f('2025-08-15'), returns: [], deductions: [] },
    });
    // March to July 2025: 5 months × 10.
    expect(figures(single(first(check(input))))).toMatchObject({ months: 5, accumulated: 50 });
    const open = contract({ updates: [update('2025-03-20', 1000, 1040)] });
    expect(single(first(check(open, f('2025-05-07')))).months).toBe(2);
    expect(single(first(check(open, f('2025-05-08')))).months).toBe(3);
  });
});

describe('index figures', () => {
  it('on the day the INE publishes one, both readings', () => {
    // 15-09-2026: IRAV August (2,47 %) out that day; July (2,49 %) the day before.
    const r = first(
      check(
        contract({
          signedOn: f('2024-09-10'),
          startDate: f('2024-09-15'),
          updateClause: 'irav',
          updates: [update('2026-09-15', 1000, 1024.9)],
        }),
      ),
    );
    const d = depends(r);
    expect(d.reasons).toEqual(['index_month_doubtful']);
    expect(d.low.maxRent).toBe(1024.9);
    expect(d.high).toMatchObject({ maxRent: 1024.7, monthly: 0.2 });
  });

  it('never uses a month the table does not cover', () => {
    const stale: RentalDeps = {
      norms: NORMS,
      indices: { ...INDICES, irav: { ...IRAV, coveredUntil: '2025-01-01' } },
    };
    const v = single(
      first(
        check(
          contract({
            signedOn: f('2024-03-15'),
            startDate: f('2024-03-20'),
            updates: [update('2025-03-20', 1000, 1030)],
          }),
          TODAY,
          stale,
        ),
      ),
    );
    expect(v).toMatchObject({ status: 'not_checkable', unchecked: 'index_not_loaded' });
    expect(v.accumulated).toBe(0);
  });

  it('an IRAV clause before the IRAV existed cannot be checked', () => {
    const v = single(
      first(
        check(
          contract({
            signedOn: f('2023-06-15'),
            startDate: f('2023-06-20'),
            updateClause: 'irav',
            updates: [update('2024-06-20', 1000, 1030)],
          }),
        ),
      ),
    );
    expect(v.unchecked).toBe('index_none_published');
  });

  it('an `other` clause is checked only against the cap', () => {
    const over = single(
      first(
        check(contract({ updateClause: 'other', updates: [update('2025-03-20', 1000, 1040)] })),
      ),
    );
    expect(figures(over)).toMatchObject({ status: 'paid_over', maxRent: 1030, monthly: 10 });
    const under = single(
      first(
        check(contract({ updateClause: 'other', updates: [update('2025-03-20', 1000, 1025)] })),
      ),
    );
    expect(under).toMatchObject({ status: 'not_checkable', unchecked: 'other_clause_within_cap' });
  });
});

// Each case worked out by hand: base × (1 + rate / 100), to the cent, ±0,01 €.
describe('maximum rent against hand calculations', () => {
  it.each([
    // [anniversary, signed, start, clause, base, rate cited, expected]
    ['2021-05-20', '2019-05-10', '2019-05-20', 'ipc', 800, 'IPC 2021-04 2,2 %', 817.6],
    ['2022-07-25', '2021-07-20', '2021-07-25', 'ipc', 900, 'IGC 2022-05 4,66 % → 2 %', 918],
    ['2024-06-20', '2023-06-15', '2023-06-20', 'ipc', 1000, '3 % (2024)', 1030],
    ['2025-03-20', '2024-03-15', '2024-03-20', 'ipc', 1000, 'IRAV 2025-02 2,08 %', 1020.8],
    ['2025-03-20', '2021-03-15', '2021-03-20', 'ipc', 1000, 'IPC 2025-02 3,0 %', 1030],
    ['2022-03-20', '2021-03-15', '2021-03-20', 'ipc', 1100, 'IPC 2022-02 7,6 %', 1183.6],
    ['2023-03-20', '2021-03-15', '2021-03-20', 'ipc', 1076, 'IGC 2022-12 7,19 % → 2 %', 1097.52],
    ['2024-03-20', '2021-03-15', '2021-03-20', 'ipc', 1140.56, 'IPC 2024-02 2,8 %', 1172.5],
    ['2023-06-25', '2020-06-20', '2020-06-25', 'ipc', 1000, 'IGC 2023-04 4,65 % → 2 %', 1020],
  ] as const)(
    '%s, signed %s: %s from %s',
    (anniversary, signed, start, clause, base, _cited, expected) => {
      const v = single(
        first(
          check(
            contract({
              signedOn: f(signed),
              startDate: f(start),
              updateClause: clause,
              initialRent: base,
              updates: [update(anniversary, base, base + 500)],
            }),
          ),
        ),
      );
      expect(v.base).toBe(base);
      expect(Math.abs((v.maxRent ?? 0) - expected)).toBeLessThanOrEqual(0.01);
    },
  );
});

describe('work bound', () => {
  it('eight years with every doubt open finish fast and never throw', () => {
    // An anniversary at the end of March falls inside the CPI flash window most years.
    const anniversaries = Array.from({ length: 8 }, (_, i) => `${2020 + i}-03-28`);
    let rent = 900;
    const input = contract({
      signedOn: f('2019-03-20'),
      startDate: f('2019-03-28'),
      landlordType: 'company',
      largeLandlord: null,
      updateClause: 'ipc',
      initialRent: rent,
      updates: anniversaries.map((day) => {
        const u = update(day, rent, rent + 30, {
          notice: 'email',
          agreedInWriting: null,
        });
        rent += 30;
        return u;
      }),
    });
    const startedAt = performance.now();
    const results = check(input, f('2027-06-10'), FUTURE_DEPS);
    const elapsed = performance.now() - startedAt;
    expect(results).toHaveLength(8);
    expect(elapsed).toBeLessThan(200);
    const reasons = new Set(
      results.flatMap((r) => (r.outcome.kind === 'depends' ? r.outcome.reasons : [])),
    );
    expect([...reasons].sort()).toEqual([
      'agreement_unknown',
      'index_month_doubtful',
      'large_landlord_unknown',
      'notice_form_doubtful',
      'pending_validation',
      'repealed_window',
    ]);
  });

  it('says an update cannot be checked rather than run past the bound', () => {
    // 2021-02-28 opens the flash doubt, the agreement and the email notice: 8 readings.
    const input = contract({
      signedOn: f('2020-02-20'),
      startDate: f('2020-02-29'),
      initialRent: 700,
      updates: [
        update('2021-02-28', 700, 710, { notice: 'email', agreedInWriting: null }),
        update('2022-02-28', 710, 720),
      ],
    });
    const [bounded, next] = checkRentUpdates(input, TODAY, DEPS, { maxReadings: 4 });
    expect(bounded && single(bounded)).toMatchObject({
      status: 'not_checkable',
      unchecked: 'too_many_readings',
    });
    // The year after starts again from the rent the person gave.
    const after = next?.outcome.kind === 'depends' ? next.outcome.low : next?.outcome.value;
    expect(after?.calculation[0]?.key).toBe('rent_update.base_from_answer');
    expect(depends(first(checkRentUpdates(input, TODAY, DEPS))).reasons.length).toBe(3);
  });
});
