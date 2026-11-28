import { describe, expect, it } from 'vitest';
import { parseDate as f, type CivilDate } from '../../../src/engine/date';
import { IGC } from '../../../src/engine/rental/data/igc';
import { IPC } from '../../../src/engine/rental/data/ipc';
import { IRAV } from '../../../src/engine/rental/data/irav';
import { NORMS } from '../../../src/engine/rental/data/norms';
import type { IndexId, IndexSeries, IndexTables } from '../../../src/engine/rental/indices';
import type { Norm, NormTable } from '../../../src/engine/rental/norms';
import { countedAmount, letterAmount } from '../../../src/engine/rental/outcome';
import {
  allowedRise,
  checkRentUpdates,
  rentUpdateAmount,
  type RentUpdateReading,
  type RentUpdateResult,
} from '../../../src/engine/rental/rent-update';
import type { RentalDeps, RentalInput } from '../../../src/engine/rental/types';
import { contract, update } from './fixtures';
import { NORMS_BEFORE_VOTE } from './norms-before-vote';

const INDICES: IndexTables = { irav: IRAV, ipc: IPC, igc: IGC };
const DEPS: RentalDeps = { norms: NORMS, indices: INDICES };
// Paid by the 7th (LAU art. 17.2), so September 2026 is the last month due; five years back
// (arts. 1964.2 and 1966 CC) the first month that counts is October 2021.
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
const FUTURE_BEFORE_VOTE: RentalDeps = { norms: NORMS_BEFORE_VOTE, indices: FUTURE };

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
    // May 2020 to April 2021, up to the next update: all of it over five years old, 0 months.
    expect(y1 && figures(y1)).toEqual({
      status: 'within_limit',
      base: 800,
      maxRent: 800,
      monthly: 0,
      months: 0,
      accumulated: 0,
    });
    expect(y1?.calculation.map((p) => p.key)).toContain('rent_update.negative_rate');
    // 800 × 1,022 = 817,60; 12,40 a month from October 2021, five years back, to September 2026:
    // 60 months = 744 €.
    expect(y2 && figures(y2)).toEqual({
      status: 'paid_over',
      base: 800,
      maxRent: 817.6,
      monthly: 12.4,
      months: 60,
      accumulated: 744,
    });
    expect(y2?.calculation.map((p) => p.key)).toEqual(
      expect.arrayContaining(['rent_update.until_today', 'rent_update.five_years']),
    );
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
    // 2 %: 900 × 1,02 = 918; 73,80 a month from July 2022 to September 2026: 51 months =
    // 3.763,80 €.
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
      months: 51,
      accumulated: 3763.8,
    });
    expect(v.cap).toMatchObject({
      rule: 'cap_igc_2022_extended',
      rate: { figure: { index: 'igc', month: '2022-05', rate: 2, clampedFrom: 4.66 } },
    });
    expect(v.rules).toContain('igc_clamp');
    expect(r.sources.map((s) => s.id)).toContain('cap_igc_2022_extended');
  });

  it('2024: 3 % below a 3,6 % CPI', () => {
    // IPC May 2024 3,6 %; cap 3 %: 1.000 × 1,03 = 1.030; 6 a month from June 2024 to September
    // 2026: 28 months = 168 €.
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
    expect(figures(v)).toMatchObject({ maxRent: 1030, monthly: 6, months: 28, accumulated: 168 });
    expect(v.cap?.rule).toBe('cap_3_2024');
  });

  it('2025: the IRAV caps a contract signed from 26-05-2023, the CPI an earlier one', () => {
    // 20-03-2025: IRAV February 2,08 % and IPC February 3,0 % (both out 14-03-2025). Under the
    // IRAV, 9,20 a month from March 2025 to September 2026: 19 months = 174,80 €.
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
    expect(figures(after)).toMatchObject({ maxRent: 1020.8, monthly: 9.2, accumulated: 174.8 });
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

  describe('20-10-2026, under RDL 29/2026', () => {
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
      const r = first(check(input, today, FUTURE_BEFORE_VOTE));
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

    it('is a single reading with the 2 % cap under the norm table as it stands', () => {
      const v = single(first(check(input, today, FUTURE_DEPS)));
      expect(figures(v)).toMatchObject({ maxRent: 1020, accumulated: 60 });
      expect(v.cap?.rule).toBe('cap_2_rdl29');
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

  it('2028: a clause naming no index follows the IRAV even once the IRAV caps no more', () => {
    // RDL 29/2026 reads the clause as the IRAV whatever the cap: synthetic February 2028 2,30 %.
    const uncapped: RentalDeps = {
      norms: withNorm('ineIravResolution', { inForceUntil: '2027-12-31' }),
      indices: FUTURE,
    };
    const v = single(
      first(
        check(
          contract({
            signedOn: f('2024-03-15'),
            startDate: f('2024-03-20'),
            updateClause: 'unspecified_index',
            updates: [update('2028-03-20', 1050, 1080)],
          }),
          f('2028-06-10'),
          uncapped,
        ),
      ),
    );
    expect(v.agreed).toMatchObject({ kind: 'index', figure: { index: 'irav', rate: 2.3 } });
    expect(v.rules).toContain('update_clause_rdl29');
    expect(v.cap).toBeNull();
  });

  it('01-10-2026: RDL 26/2026 read a clause naming no index as the IRAV, cap or no cap', () => {
    const uncapped: RentalDeps = {
      norms: withNorm('ineIravResolution', { inForceUntil: '2026-09-30' }),
      indices: INDICES,
    };
    const r = first(
      check(
        contract({
          signedOn: f('2024-09-25'),
          startDate: f('2024-10-01'),
          updateClause: 'unspecified_index',
          updates: [update('2026-10-01', 1000, 1020)],
        }),
        f('2026-12-20'),
        uncapped,
      ),
    );
    const { low } = depends(r);
    expect(low.agreed).toMatchObject({ kind: 'index', figure: { index: 'irav' } });
    expect(low.rules).toContain('update_clause_rdl26');
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
    // 1.000 × 1,02 = 1.020; 30 a month from June 2023 to September 2026: 40 months = 1.200 €.
    const v = single(agreed(true));
    expect(figures(v)).toMatchObject({ status: 'paid_over', maxRent: 1020, accumulated: 1200 });
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
    // 30 a month from June 2023 to September 2026: 40 months = 1.200 €.
    expect(d.high.accumulated).toBe(1200);
    expect(counted(r)).toBe(0);
    expect(r.companyLandlordHint).toBe(true);
    expect(agreed(null, 'person').companyLandlordHint).toBe(false);
  });

  it('«No lo sé» changes nothing without an agreement', () => {
    // Without agreement the IGC (2 %) binds below the CPI and the 5 % clause: 1.020; 30 a month
    // from June 2023 to September 2026: 40 months = 1.200 €.
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
    expect(figures(single(r))).toMatchObject({ maxRent: 1020, monthly: 30, accumulated: 1200 });
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
    // IPC February 2022 7,6 %: 1.076; 24 a month from March 2022 to September 2026: 55 months =
    // 1.320 €.
    expect(figures(d.high)).toMatchObject({ maxRent: 1076, accumulated: 1320 });
  });
});

describe('when no rise fits', () => {
  it('without an update clause the whole rise is paid over', () => {
    const v = single(
      first(check(contract({ updateClause: 'none', updates: [update('2022-03-20', 1000, 1020)] }))),
    );
    // 20 a month from March 2022 to September 2026: 55 months = 1.100 €.
    expect(figures(v)).toMatchObject({ maxRent: 1000, monthly: 20, months: 55, accumulated: 1100 });
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
      // February 2025 at 1.020,80 over a 1.000 base: 20,80; March 2025 to September 2026, within
      // the cap. February 2025 to September 2026: 20 months.
      const v = early('2025-02-01');
      expect(figures(v)).toMatchObject({
        status: 'paid_over',
        maxRent: 1020.8,
        monthly: 0,
        months: 20,
        accumulated: 20.8,
      });
      expect(v.monthsBeforeDue).toBe(1);
      expect(v.calculation.map((p) => p.key)).toContain('rent_update.before_anniversary');
    });
  });

  it('a rise applied after the anniversary is that year’s update, due per art. 18.2', () => {
    // IPC February 2022 7,6 % on the anniversary 20-03-2022: 1.076. Applied from 01-04-2022 and
    // notified in March: 24 a month from April 2022 to September 2026: 54 months = 1.296 €.
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
    expect(figures(v)).toMatchObject({ maxRent: 1076, monthly: 24, months: 54, accumulated: 1296 });
    expect(v.monthsBeforeDue).toBe(0);
    expect(v.cap?.rule).toBe('cap_ipc');
  });

  it('a second rise in the same contract year is paid over in full', () => {
    // The first, within 1.076, runs March to August 2022, up to the second; the second, 24 a
    // month from September 2022 to September 2026: 49 months = 1.176 €.
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
      months: 49,
      accumulated: 1176,
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
    // 10-04-2025: IGC January 2025 −0,31 % (out 20-03-2025); the CPI cap does not lift it. 10 a
    // month from April 2025 to September 2026: 18 months = 180 €.
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
    expect(figures(v)).toMatchObject({ maxRent: 1000, monthly: 10, accumulated: 180 });
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
    // Notice 10-04-2025, due from May. March and April 2025: 30 each, 60; May 2025 to September
    // 2026: 17 months × 9,20 = 156,40; 19 months, 216,40 €.
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
      months: 19,
      accumulated: 216.4,
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
    // As if written, as with the letter: 216,40 €. As if never notified: 30 a month from March
    // 2025 to September 2026: 19 months = 570 €.
    expect(d.low.accumulated).toBe(216.4);
    expect(d.high.accumulated).toBe(570);
    expect(counted(r)).toBe(216.4);
  });

  it('a verbal notice over the cap: only what passes the cap counts, the whole rise is «y hasta»', () => {
    const r = first(
      check(
        contract({
          ...base,
          updates: [update('2025-03-20', 1000, 1030, { notice: 'verbal', noticeOn: null })],
        }),
      ),
    );
    const d = depends(r);
    expect(d.reasons).toEqual(['notice_missing_paid']);
    // Paying accepted the rise up to 1.020,80: 9,20 a month over it from March 2025 to September
    // 2026: 19 months = 174,80 €.
    expect(figures(d.low)).toMatchObject({ status: 'paid_over', monthly: 9.2, accumulated: 174.8 });
    expect(d.low.calculation.map((p) => p.key)).toContain(
      'rent_update.accepted_by_paying_up_to_max',
    );
    // Not accepted: the whole rise, 30 a month for the same 19 months = 570 €.
    expect(d.high.accumulated).toBe(570);
    expect(d.high.calculation.map((p) => p.key)).toContain('rent_update.notice_not_written');
    expect(counted(r)).toBe(174.8);
    expect(letterAmount(r.outcome, rentUpdateAmount)).toBe(174.8);
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
      // 30 a month from June 2024 to September 2026: 28 months = 840 €.
      expect(d.high.accumulated).toBe(840);
      expect(counted(r)).toBe(0);
      expect(letterAmount(r.outcome, rentUpdateAmount)).toBeNull();
    },
  );

  it('over the cap, counts only what passes it; the rest of the rise is the higher reading', () => {
    const over = first(
      check(
        contract({
          ...june,
          updates: [update('2024-06-01', 1000, 1040, { notice: 'verbal', noticeOn: null })],
        }),
      ),
    );
    const d = depends(over);
    // June 2024 to September 2026, 28 months: 10 a month over the cap = 280 €; the whole rise, 40
    // a month = 1.120 €.
    expect(figures(d.low)).toMatchObject({ monthly: 10, accumulated: 280 });
    expect(d.high.accumulated).toBe(1120);
    expect(counted(over)).toBe(280);
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
    // Without the agreement: 1.050 against 1.030 allowed, 20 a month from June 2024 to September
    // 2026: 28 months = 560 €.
    expect(d.high.accumulated).toBe(560);
    expect(d.low.status).toBe('not_checkable');
    expect(d.low.calculation.map((p) => p.key)).toContain('rent_update.agreed_verbally');
    expect(counted(r)).toBe(0);
  });

  it('«No lo sé» is a doubt as before', () => {
    expect(depends(accepted({ agreedInWriting: null })).reasons).toEqual(['agreement_unknown']);
  });

  it('«No» compares the rise with the clause and the cap', () => {
    // 20 a month from June 2024 to September 2026: 28 months = 560 €.
    expect(figures(single(accepted({ agreedInWriting: false })))).toMatchObject({
      status: 'paid_over',
      accumulated: 560,
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
    // 2022: IPC Feb 2022 7,6 % → 1.076,00, charged 1.100 (24/month), March 2022 to February
    //       2023, up to the next update: 12 months = 288 €.
    // 2023: IGC Dec 2022 7,19 %, read as 2 %, below IPC Feb 2023 6,0 % → 1.076 × 1,02 =
    //       1.097,52; charged 1.100 × 1,06 = 1.166 (68,48/month), March 2023 to February 2024:
    //       12 months = 821,76 €.
    // 2024: IPC Feb 2024 2,8 % below 3 % → 1.097,52 × 1,028 = 1.128,25; charged
    //       1.166 × 1,028 = 1.198,65 (70,40/month), March 2024 to September 2026: 31 months =
    //       2.182,40 €.
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
      [1097.52, 1128.25, 70.4, 2182.4],
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
      FUTURE_BEFORE_VOTE,
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

  it('a validated RDL 29/2026 leaves 2027 with the 2 % cap on either base of 2026', () => {
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
    const y2027 = depends(results[1] as RentUpdateResult);
    expect(y2027.reasons).toEqual(['repealed_window']);
    expect(y2027.readings.map((r) => [r.value.base, r.value.maxRent]).sort()).toEqual([
      [1020, 1040.4],
      [1024.7, 1045.19],
    ]);
  });
});

describe('the months a rise paid over counts', () => {
  const keys = (v: RentUpdateReading) => v.calculation.map((p) => p.key);

  it('without a later update, run until today and say so', () => {
    // 20-03-2025, contract from 2024: IRAV February 2,08 % allows 1.020,80; 9,20 a month from
    // March 2025, past the next anniversary in March 2026, to September 2026: 19 months =
    // 174,80 €.
    const v = single(
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
    expect(figures(v)).toMatchObject({ months: 19, accumulated: 174.8 });
    expect(keys(v)).toContain('rent_update.until_today');
    expect(keys(v)).not.toContain('rent_update.five_years');
  });

  it('stop at a later update', () => {
    // 9,20 a month from March 2025 to February 2026, the month before the next update was
    // charged: 12 months = 110,40 €.
    const v = single(
      first(
        check(
          contract({
            signedOn: f('2024-03-15'),
            startDate: f('2024-03-20'),
            updates: [update('2025-03-20', 1000, 1030), update('2026-03-20', 1030, 1050)],
          }),
        ),
      ),
    );
    expect(figures(v)).toMatchObject({ months: 12, accumulated: 110.4 });
    expect(keys(v)).not.toContain('rent_update.until_today');
  });

  it('stopped by the keys past the anniversary, never say «hasta hoy»', () => {
    // Keys back on 15-06-2026, past the March 2026 anniversary: the count stops at May 2026.
    const v = single(
      first(
        check(
          contract({
            signedOn: f('2024-03-15'),
            startDate: f('2024-03-20'),
            updates: [update('2025-03-20', 1000, 1030)],
            moveOut: { keysReturnedOn: f('2026-06-15'), returns: [], deductions: [] },
          }),
        ),
      ),
    );
    expect(keys(v)).not.toContain('rent_update.until_today');
  });

  it('stop at the keys and count only months already due', () => {
    const input = contract({
      updates: [update('2025-03-20', 1000, 1040)],
      moveOut: { keysReturnedOn: f('2025-08-15'), returns: [], deductions: [] },
    });
    // March to July 2025, the month before the keys: 5 months × 10 = 50 €.
    const v = single(first(check(input)));
    expect(figures(v)).toMatchObject({ months: 5, accumulated: 50 });
    expect(keys(v)).not.toContain('rent_update.until_today');
    const open = contract({ updates: [update('2025-03-20', 1000, 1040)] });
    // Paid by the 7th: on 07-05-2025 March and April are due, on 08-05-2025 May too.
    expect(single(first(check(open, f('2025-05-07')))).months).toBe(2);
    expect(single(first(check(open, f('2025-05-08')))).months).toBe(3);
  });

  it('leave out the months over five years old and say so', () => {
    // No clause, so the whole 20 € rise is paid over. Charged from March 2021; five years back
    // from 07-10-2026 the first month is October 2021: October 2021 to September 2026, 60 months
    // = 1.200 €, not the 67 months from March 2021 (1.340 €).
    const v = single(
      first(
        check(
          contract({
            signedOn: f('2020-03-15'),
            startDate: f('2020-03-20'),
            updateClause: 'none',
            updates: [update('2021-03-20', 1000, 1020)],
          }),
        ),
      ),
    );
    expect(figures(v)).toMatchObject({ monthly: 20, months: 60, accumulated: 1200 });
    expect(v.calculation.find((p) => p.key === 'rent_update.months')?.vars).toEqual({
      months: { integer: 60 },
      from: { month: '2021-10' },
      to: { month: '2026-09' },
    });
    expect(keys(v)).toEqual(
      expect.arrayContaining(['rent_update.until_today', 'rent_update.five_years']),
    );
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
    const results = check(input, f('2027-06-10'), FUTURE_BEFORE_VOTE);
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
    const [bounded, next] = checkRentUpdates(input, TODAY, DEPS, 4);
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

// What each reading says, word for word, and which doubt each world takes the other side of.
describe('how each rent update is worded and sourced', () => {
  const E = (euros: number) => ({ euros });
  const P = (percent: number) => ({ percent });
  const I = (integer: number) => ({ integer });
  const M = (month: string) => ({ month });
  const D = (date: string) => ({ date });
  const ph = (name: string, vars?: object) => ({
    key: `rent_update.${name}`,
    ...(vars === undefined ? {} : { vars }),
  });
  const index = (id: string, month: string, rate: number, published: string, kind = 'index') => ({
    key: `rent_update.figure.${kind}`,
    vars: { index: { index: id }, month: M(month), rate: P(rate), published: D(published) },
  });
  const fixed = (rate: number) => ({ key: 'rent_update.figure.fixed', vars: { rate: P(rate) } });
  const rent = (name: string, euros: number) => ph(name, { rent: E(euros) });
  const maxRent = (base: number, rate: number, max: number) =>
    ph('max_rent', { base: E(base), rate: P(rate), max: E(max) });
  const months = (n: number, from: string, to: string) =>
    ph('months', { months: I(n), from: M(from), to: M(to) });
  const over = (monthly: number) => ph('monthly_over', { monthly: E(monthly) });
  const words = (v: RentUpdateReading) => ({
    status: v.status,
    unchecked: v.unchecked,
    base: v.base,
    maxRent: v.maxRent,
    monthly: v.monthly,
    accumulated: v.accumulated,
    months: v.months,
    monthsBeforeDue: v.monthsBeforeDue,
    calculation: v.calculation,
    rules: v.rules,
  });
  // Each reading with the doubts it took the side of.
  const readings = (r: RentUpdateResult) =>
    depends(r).readings.map((x) => ({ ...words(x.value), worlds: x.worlds }));

  const from2024 = { signedOn: f('2024-03-15'), startDate: f('2024-03-20') };
  const from2023 = { signedOn: f('2023-06-01'), startDate: f('2023-06-01') };
  const IPC_2025 = index('ipc', '2025-02', 3, '2025-03-14');
  const IRAV_2025 = index('irav', '2025-02', 2.08, '2025-03-14');
  const CAP_2025 = ph('cap', { rate: IRAV_2025 });
  const MAX_2025 = maxRent(1000, 2.08, 1020.8);
  const TO_SEPTEMBER = months(19, '2025-03', '2026-09');

  it('a rise applied a month before the anniversary is paid over for that month', () => {
    const v = single(
      first(
        check(
          contract({
            ...from2024,
            updateClause: 'irav',
            updates: [
              update('2025-03-20', 1000, 1020.8, {
                effectiveOn: f('2025-02-01'),
                chargedFrom: f('2025-02-01'),
                noticeOn: f('2025-02-10'),
              }),
            ],
          }),
        ),
      ),
    );
    expect(v.calculation).toEqual([
      rent('base_initial', 1000),
      ph('agreed', { rate: IRAV_2025 }),
      CAP_2025,
      MAX_2025,
      ph('before_anniversary', { months: I(1), anniversary: D('2025-03-20'), base: E(1000) }),
      months(20, '2025-02', '2026-09'),
      ph('until_today'),
      over(0),
    ]);
    expect(v).toMatchObject({ monthsBeforeDue: 1, accumulated: 20.8, monthly: 0 });
  });

  it('an email notice: as if never notified, and as if written, each with its world', () => {
    const r = first(
      check(
        contract({
          ...from2024,
          updates: [
            update('2025-03-20', 1000, 1030, { notice: 'email', noticeOn: f('2025-04-10') }),
          ],
        }),
      ),
    );
    const [unwritten, written] = readings(r);
    expect(unwritten).toMatchObject({
      accumulated: 570,
      monthsBeforeDue: 19,
      worlds: [{ 'notice:2025-03-20': false }],
      calculation: [
        rent('base_initial', 1000),
        ph('agreed', { rate: IPC_2025 }),
        CAP_2025,
        MAX_2025,
        ph('notice_not_written', { months: I(19), base: E(1000) }),
        TO_SEPTEMBER,
        ph('until_today'),
        over(9.2),
      ],
    });
    expect(written).toMatchObject({
      accumulated: 216.4,
      monthsBeforeDue: 2,
      worlds: [{ 'notice:2025-03-20': true }],
    });
    expect(written?.calculation[4]).toEqual(
      ph('charged_before_notice', { months: I(2), base: E(1000) }),
    );
  });

  it('paying a rise inside the cap is accepting it, and a rise a cent over the cap is not within it', () => {
    const rise = (newRent: number) =>
      readings(
        first(
          check(
            contract({
              ...from2023,
              updates: [update('2024-06-01', 1000, newRent, { notice: 'none', noticeOn: null })],
            }),
          ),
        ),
      );
    const [, accepted] = rise(1030);
    expect(accepted).toMatchObject({ status: 'within_limit', accumulated: 0, months: 28 });
    expect(accepted?.calculation.map((p) => p.key)).toEqual([
      'rent_update.base_initial',
      'rent_update.agreed',
      'rent_update.cap',
      'rent_update.max_rent',
      'rent_update.accepted_by_paying',
      'rent_update.months',
      'rent_update.until_today',
      'rent_update.within_limit',
    ]);
    expect(rise(1030.01)[1]?.calculation[4]).toEqual(ph('accepted_by_paying'));
    expect(rise(1030.02)[1]?.calculation[4]).toEqual(ph('accepted_by_paying_up_to_max'));
  });

  it('an agreement in writing or by word of mouth, each worded and with its world', () => {
    const accepted = (change: Parameters<typeof update>[3]) =>
      readings(
        first(
          check(contract({ ...from2023, updates: [update('2024-06-01', 1000, 1050, change)] })),
        ),
      );
    const verbal = accepted({ agreedInWriting: false, agreedVerbally: true });
    expect(verbal[1]).toMatchObject({
      status: 'not_checkable',
      unchecked: 'agreed_in_writing',
      maxRent: null,
      accumulated: 0,
      calculation: [rent('base_initial', 1000), ph('agreed_verbally')],
      rules: ['update_clause'],
      worlds: [
        { 'index:ipc:2024-06-01': false, 'agreement:2024-06-01': true },
        { 'index:ipc:2024-06-01': true, 'agreement:2024-06-01': true },
      ],
    });
    expect(verbal[0]?.worlds).toEqual([
      { 'index:ipc:2024-06-01': false, 'agreement:2024-06-01': false },
      { 'index:ipc:2024-06-01': true, 'agreement:2024-06-01': false },
    ]);
    const unknown = accepted({ agreedInWriting: null });
    expect(unknown[1]?.calculation).toEqual([rent('base_initial', 1000), ph('agreed_in_writing')]);
    const written = single(
      first(
        check(
          contract({
            ...from2023,
            updates: [update('2024-06-01', 1000, 1050, { agreedInWriting: true })],
          }),
        ),
      ),
    );
    expect(written.calculation).toEqual([rent('base_initial', 1000), ph('agreed_in_writing')]);
    expect(written.rules).toEqual(['update_clause']);
  });

  it('a large landlord keeps its cap beside the agreement, and it is a world when unknown', () => {
    const agreed = (
      largeLandlord: boolean | null,
      change: Parameters<typeof update>[3] = {},
      fixedPercent = 5,
    ) =>
      first(
        check(
          contract({
            signedOn: f('2020-06-20'),
            startDate: f('2020-06-25'),
            landlordType: 'company',
            largeLandlord,
            updateClause: 'fixed_percent',
            fixedPercent,
            updates: [update('2023-06-25', 1000, 1050, { agreedInWriting: true, ...change })],
          }),
        ),
      );
    const igc = index('igc', '2023-04', 2, '2023-06-19');
    expect(words(single(agreed(true)))).toMatchObject({
      calculation: [
        rent('base_from_answer', 1000),
        ph('agreed_in_writing'),
        ph('large_landlord_cap'),
        ph('cap', { rate: igc }),
        maxRent(1000, 2, 1020),
        months(40, '2023-06', '2026-09'),
        ph('until_today'),
        over(30),
      ],
      rules: ['igc_clamp', 'cap_igc_2023', 'update_notice'],
    });
    const verbal = readings(agreed(true, { agreedInWriting: false, agreedVerbally: true }, 1));
    expect(verbal[1]?.calculation.slice(1, 3)).toEqual([
      ph('agreed_verbally'),
      ph('large_landlord_cap'),
    ]);
    const [no, yes] = readings(agreed(null));
    expect(no).toMatchObject({
      unchecked: 'agreed_in_writing',
      worlds: [{ large_landlord: false }],
    });
    expect(yes).toMatchObject({ status: 'paid_over', worlds: [{ large_landlord: true }] });
    expect(agreed(null).sources.map((x) => x.id)).toEqual([
      'update_clause',
      'igc_clamp',
      'cap_igc_2023',
      'update_notice',
    ]);
  });

  it('a negative IGC counts as nothing, and a second rise and a clause-less one allow nothing', () => {
    const neg = single(
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
    expect(neg.calculation.slice(0, 4)).toEqual([
      rent('base_from_answer', 1000),
      ph('agreed', { rate: index('igc', '2025-01', 0, '2025-03-20') }),
      ph('cap', { rate: index('ipc', '2025-02', 3, '2025-03-14') }),
      maxRent(1000, 0, 1000),
    ]);
    expect(neg.rules).toEqual(['update_clause', 'igc_clamp', 'cap_ipc', 'update_notice']);

    const [rise, second] = check(
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
    ).map(single);
    expect(rise?.calculation.at(-1)).toEqual(ph('within_limit'));
    expect(second?.calculation).toEqual([
      rent('base_previous_max', 1076),
      ph('second_rise', { anniversary: D('2022-03-20'), date: D('2022-09-01') }),
      months(49, '2022-09', '2026-09'),
      ph('until_today'),
      over(24),
    ]);
    expect(second?.rules).toEqual(['update_clause', 'update_notice']);

    const none = single(
      first(check(contract({ updateClause: 'none', updates: [update('2025-03-20', 1000, 1100)] }))),
    );
    expect(none.calculation).toEqual([
      rent('base_from_answer', 1000),
      ph('no_clause'),
      months(19, '2025-03', '2026-09'),
      ph('until_today'),
      over(100),
    ]);
    expect(none.rules).toEqual(['update_clause', 'update_notice']);
  });

  it('an `other` clause shows only the cap, and a fixed percentage its own rate', () => {
    const other = single(
      first(
        check(contract({ updateClause: 'other', updates: [update('2025-03-20', 1000, 1025)] })),
      ),
    );
    expect(other.calculation).toEqual([
      rent('base_from_answer', 1000),
      ph('agreed_other'),
      ph('cap', { rate: IPC_2025 }),
      maxRent(1000, 3, 1030),
      months(19, '2025-03', '2026-09'),
      ph('until_today'),
      ph('other_clause_within_cap'),
    ]);
    const percent = single(
      first(
        check(
          contract({
            updateClause: 'fixed_percent',
            fixedPercent: 1,
            updates: [update('2025-03-20', 1000, 1100)],
          }),
        ),
      ),
    );
    expect(percent.calculation.slice(1, 3)).toEqual([
      ph('agreed', { rate: fixed(1) }),
      ph('cap', { rate: IPC_2025 }),
    ]);
    expect(percent.agreed).toEqual({ kind: 'fixed', rate: 1 });
  });

  it('the CPI flash and the definitive figure, each with its world', () => {
    const r = first(
      check(
        contract({
          signedOn: f('2021-03-15'),
          startDate: f('2021-03-20'),
          updateClause: 'ipc',
          updates: [update('2025-04-05', 1000, 1100)],
        }),
      ),
    );
    const [definitive, flash] = readings(r);
    expect(definitive?.worlds).toEqual([{ 'index:ipc:2025-04-05': false }]);
    expect(flash?.worlds).toEqual([{ 'index:ipc:2025-04-05': true }]);
    expect(flash?.calculation.slice(1, 3)).toEqual([
      ph('agreed', { rate: index('ipc', '2025-03', 2.3, '2025-03-28', 'flash') }),
      ph('cap', { rate: index('ipc', '2025-03', 2.3, '2025-03-28', 'flash') }),
    ]);
  });
});

describe('the doubts each update opens', () => {
  const day = (iso: string) => f(iso);
  const publishedOn = (series: IndexSeries, iso: string): IndexSeries => ({
    ...series,
    coveredUntil: '2031-12-31',
    loadedFromStart: true,
    pendingFlash: null,
    values: [{ month: '2019-01', rate: 1, publishedOn: iso, publishedUrl: SYNTHETIC }],
  });
  // The indices named come out on `iso`, the others as they are.
  const comingOut = (
    iso: string,
    ids: readonly IndexId[],
    norms: NormTable = NORMS,
  ): RentalDeps => ({
    norms,
    indices: Object.fromEntries(
      (['irav', 'ipc', 'igc'] as const).map((id) => [
        id,
        ids.includes(id) ? publishedOn(INDICES[id], iso) : INDICES[id],
      ]),
    ) as IndexTables,
  });
  const risesOpen = (input: RentalInput, iso: string, deps: RentalDeps) =>
    [...new Set(allowedRise(input, day(iso), deps).doubts.map((d) => d.id))].sort();
  const signed = (iso: string, change: Partial<RentalInput>) =>
    contract({ signedOn: f(iso), startDate: f(iso), ...change });

  it.each<[string, () => string[], string[]]>([
    [
      'a CPI clause on a contract from before Ley 12/2023 reads no IRAV cap',
      () =>
        risesOpen(
          signed('2019-03-15', { updateClause: 'ipc' }),
          '2025-03-20',
          comingOut('2025-03-20', ['ipc', 'irav', 'igc']),
        ),
      ['index:ipc:2025-03-20'],
    ],
    [
      'a fixed percentage under the RDL 29/2026 wording reads the IRAV, not the CPI',
      () =>
        risesOpen(
          contract({
            signedOn: f('2024-03-15'),
            startDate: f('2024-10-20'),
            updateClause: 'fixed_percent',
            fixedPercent: 1,
          }),
          '2026-10-20',
          comingOut('2026-10-20', ['ipc', 'irav', 'igc']),
        ),
      ['extraordinary_caps', 'index:irav:2026-10-20'],
    ],
    [
      'a norm still pending on the day of a rise, but not RDL 28/2026 for a term it never touches',
      () =>
        risesOpen(signed('2021-03-15', { updateClause: 'ipc' }), '2026-11-20', {
          ...DEPS,
          norms: NORMS_BEFORE_VOTE,
        }),
      ['extraordinary_caps', 'norm:rdl29_2026'],
    ],
  ])('%s', (_, actual, expected) => {
    expect(actual()).toEqual(expected);
  });

  // The smallest bound that still works the first update out tells how many doubts it opens.
  const openDoubts = (input: RentalInput, k = 0, deps: RentalDeps = DEPS): number => {
    for (let n = 0; n < 8; n++) {
      const r = checkRentUpdates(input, TODAY, deps, 2 ** n)[k];
      if (r?.outcome.kind !== 'single' || r.outcome.value.unchecked !== 'too_many_readings')
        return n;
    }
    throw new Error('too many doubts');
  };
  const june = {
    signedOn: f('2023-06-15'),
    startDate: f('2023-06-20'),
    updateClause: 'ipc',
  } as const;
  const rise = (change: Parameters<typeof update>[3], input: Partial<RentalInput> = {}) =>
    openDoubts(
      contract({
        ...june,
        landlordType: 'company',
        largeLandlord: null,
        ...input,
        updates: [update('2024-06-20', 1000, 1050, change)],
      }),
    );

  it.each<[string, () => number, number]>([
    [
      'a letter and a verbal agreement',
      () => rise({ agreedInWriting: false, agreedVerbally: true }),
      2,
    ],
    [
      'a written agreement said to be verbal too',
      () => rise({ agreedInWriting: true, agreedVerbally: true }),
      1,
    ],
    ['no notice', () => rise({ notice: 'none', noticeOn: null }), 1],
    [
      'no clause: nothing is read',
      () => rise({ notice: 'email', agreedInWriting: null }, { updateClause: 'none' }),
      0,
    ],
    [
      'a second rise in a year opens none of its own',
      () =>
        openDoubts(
          contract({
            ...june,
            updates: [
              update('2024-06-20', 1000, 1030, { notice: 'email', agreedInWriting: null }),
              update('2024-06-20', 1030, 1040, { notice: 'email', agreedInWriting: null }),
            ],
          }),
          1,
        ),
      0,
    ],
  ])('%s', (_, actual, expected) => {
    expect(actual()).toBe(expected);
  });
});

describe('the months a rise counts, at the edges', () => {
  const from2024 = {
    signedOn: f('2024-03-15'),
    startDate: f('2024-03-20'),
    updateClause: 'irav',
  } as const;
  const keys = (v: RentUpdateReading) =>
    v.calculation.map((p) => p.key.replace('rent_update.', ''));

  it.each([
    ['2026-03-05', false],
    ['2026-03-10', true],
  ])(
    'says the rent stayed as charged only from the next anniversary month: today %s → %s',
    (today, said) => {
      const v = single(
        first(
          check(contract({ ...from2024, updates: [update('2025-03-20', 1000, 1030)] }), f(today)),
        ),
      );
      expect(keys(v).includes('until_today')).toBe(said);
    },
  );

  it('keeps counting past a later update that is charged no later than it', () => {
    const [a] = check(
      contract({
        ...from2024,
        updates: [
          update('2025-03-20', 1000, 1030, { chargedFrom: f('2025-04-01') }),
          update('2026-03-20', 1020.8, 1040, { chargedFrom: f('2025-04-01') }),
        ],
      }),
    );
    expect(a && single(a).months).toBe(18);
  });

  it('counts nothing and says nothing of the months for a rent charged from the future', () => {
    const v = single(
      first(
        check(
          contract({
            ...from2024,
            updates: [update('2025-03-20', 1000, 1030, { chargedFrom: f('2027-01-01') })],
          }),
        ),
      ),
    );
    expect(v.months).toBe(0);
    expect(keys(v)).toEqual(['base_initial', 'agreed', 'cap', 'max_rent', 'monthly_over']);
  });

  it('counts nothing and says nothing of the five years when the keys went back before them', () => {
    const v = single(
      first(
        check(
          contract({
            signedOn: f('2019-03-15'),
            startDate: f('2019-03-20'),
            updateClause: 'ipc',
            updates: [update('2020-03-20', 1000, 1100)],
            moveOut: { keysReturnedOn: f('2021-05-01'), returns: [], deductions: [] },
          }),
        ),
      ),
    );
    expect(v.months).toBe(0);
    expect(keys(v)).not.toContain('five_years');
    expect(keys(v)).not.toContain('months');
  });

  it('a letter with no date is never due', () => {
    const v = single(
      first(
        check(
          contract({
            ...from2024,
            updates: [update('2025-03-20', 1000, 1030, { noticeOn: null })],
          }),
        ),
      ),
    );
    expect(v).toMatchObject({ months: 19, monthsBeforeDue: 19, accumulated: 570 });
    expect(v.calculation[4]).toEqual({
      key: 'rent_update.charged_before_notice',
      vars: { months: { integer: 19 }, base: { euros: 1000 } },
    });
  });

  it('is not charged before it is due when the rent did not rise, or when nothing allowed a rise', () => {
    const late = { noticeOn: f('2025-04-10') };
    const same = single(
      first(check(contract({ ...from2024, updates: [update('2025-03-20', 1000, 1000, late)] }))),
    );
    expect(same).toMatchObject({ status: 'within_limit', monthsBeforeDue: 0 });
    expect(keys(same)).not.toContain('charged_before_notice');
    const none = single(
      first(
        check(
          contract({
            ...from2024,
            updateClause: 'none',
            updates: [update('2025-03-20', 1000, 1030, late)],
          }),
        ),
      ),
    );
    expect(none).toMatchObject({ status: 'paid_over', monthsBeforeDue: 0 });
    expect(keys(none)).not.toContain('charged_before_notice');
  });

  it('a cent over the highest rent is rounding; two are not', () => {
    const rise = (newRent: number) =>
      single(
        first(check(contract({ ...from2024, updates: [update('2025-03-20', 1000, newRent)] }))),
      );
    expect(rise(1020.81)).toMatchObject({ status: 'within_limit', monthly: 0, accumulated: 0 });
    expect(rise(1020.82)).toMatchObject({ status: 'paid_over', monthly: 0.02, accumulated: 0.38 });
  });

  it('a rise paid by accepting it counts from the anniversary month even if applied before it', () => {
    const v = readings(
      first(
        check(
          contract({
            ...from2024,
            updates: [
              update('2025-03-20', 1000, 1030, {
                notice: 'verbal',
                noticeOn: null,
                effectiveOn: f('2025-02-01'),
                chargedFrom: f('2025-02-01'),
              }),
            ],
          }),
        ),
      ),
    );
    expect(v[1]).toMatchObject({ accumulated: 204.8, monthsBeforeDue: 1 });
  });

  // The readings of one update, with the doubts each took the side of.
  function readings(r: RentUpdateResult) {
    return depends(r).readings.map((x) => ({ ...x.value, worlds: x.worlds }));
  }
});

describe('what an index that cannot be read says', () => {
  const series = (values: IndexSeries['values'], loadedFromStart = false): IndexSeries => ({
    ...IRAV,
    coveredUntil: '2031-12-31',
    loadedFromStart,
    pendingFlash: null,
    values,
  });
  const value = (month: string, publishedOn: string | null) => ({
    month,
    rate: 2,
    publishedOn,
    publishedUrl: publishedOn === null ? null : SYNTHETIC,
  });
  const readIn = (irav: IndexSeries, anniversary: string, base: Partial<RentalInput> = {}) =>
    check(
      contract({
        signedOn: f('2023-06-01'),
        startDate: f('2023-06-01'),
        updateClause: 'irav',
        updates: [update(anniversary, 1000, 1030)],
        ...base,
      }),
      TODAY,
      { norms: NORMS, indices: { ...INDICES, irav } },
    );
  const unchecked = (v: RentUpdateReading) => [v.unchecked, v.calculation[1]?.key, v.rules];

  it.each<[string, () => RentUpdateReading[], string]>([
    [
      'the figure of the month has no known publication day',
      () => [single(first(readIn(series([value('2024-04', null)]), '2024-06-01')))],
      'index_publication_unknown',
    ],
    [
      'the figure before the one out today has no known publication day',
      () => {
        const o = depends(
          first(
            readIn(series([value('2024-03', null), value('2024-04', '2024-06-01')]), '2024-06-01'),
          ),
        );
        return [o.low, o.high];
      },
      'index_publication_unknown',
    ],
    [
      'nothing was out before the one out today',
      () => {
        const o = depends(
          first(readIn(series([value('2024-04', '2024-06-01')], true), '2024-06-01')),
        );
        return [o.low, o.high];
      },
      'index_none_published',
    ],
    [
      'a CPI flash was out and is not loaded',
      () => [
        single(
          first(
            check(
              contract({
                signedOn: f('2018-02-01'),
                startDate: f('2018-02-05'),
                updateClause: 'ipc',
                updates: [update('2019-02-05', 1000, 1030)],
              }),
            ),
          ),
        ),
      ],
      'flash_not_loaded',
    ],
  ])('%s', (_, readings, kind) => {
    const checked = readings().filter((v) => v.unchecked !== null);
    expect(checked.length).toBeGreaterThan(0);
    for (const v of checked)
      expect(unchecked(v)).toEqual([kind, `rent_update.${kind}`, expect.anything()]);
  });
});

describe('which caps bind, and what they cite', () => {
  const rules = (input: RentalInput, today = f('2026-12-20'), deps: RentalDeps = DEPS) =>
    single(first(check(input, today, deps))).rules;
  const ipcRise = (signed: string, anniversary: string, change: Partial<RentalInput> = {}) =>
    contract({
      signedOn: f(signed),
      startDate: f(signed.slice(0, 8) + '20'),
      updateClause: 'ipc',
      updates: [update(anniversary, 1000, 1100)],
      ...change,
    });
  const flat = (series: IndexSeries, rate: number): IndexSeries => ({
    ...series,
    values: series.values.map((v) => ({ ...v, rate })),
  });

  it('under the RDL 29/2026 wording the CPI cap goes, and the IRAV for every contract is cited only for an older one', () => {
    expect(rules(ipcRise('2024-10-15', '2026-10-20'))).toEqual([
      'update_clause',
      'cap_irav',
      'cap_2_rdl29',
      'update_notice',
    ]);
    expect(rules(ipcRise('2021-10-15', '2026-10-20'))).toEqual([
      'update_clause',
      'irav_all_contracts',
      'cap_irav',
      'cap_2_rdl29',
      'update_notice',
    ]);
  });

  it('of equal caps, the first one binds', () => {
    const tied: RentalDeps = {
      norms: NORMS,
      indices: { ...INDICES, irav: flat(IRAV, 2), ipc: flat(IPC, 2) },
    };
    const v = single(first(check(ipcRise('2024-03-15', '2025-03-20'), TODAY, tied)));
    expect(v.cap?.rule).toBe('cap_irav');
    expect(v.maxRent).toBe(1020);
  });

  it('with no cap in force the clause alone decides, and an `other` clause cannot be checked', () => {
    const noCaps: RentalDeps = {
      norms: { ...NORMS, rdl7_2019: { ...NORMS.rdl7_2019, inForceUntil: '2020-12-31' } },
      indices: INDICES,
    };
    const rise = (updateClause: RentalInput['updateClause']) =>
      single(first(check(ipcRise('2021-03-15', '2025-03-20', { updateClause }), TODAY, noCaps)));
    expect(rise('ipc')).toMatchObject({ status: 'paid_over', maxRent: 1030, cap: null });
    const other = rise('other');
    expect(other).toMatchObject({ status: 'not_checkable', unchecked: 'other_clause_within_cap' });
    expect(other.calculation.map((p) => p.key)).toEqual([
      'rent_update.base_from_answer',
      'rent_update.other_clause_within_cap',
    ]);
    expect(other.rules).toEqual(['update_clause']);
  });

  it('says the agreement was verbal only where that is why the rise cannot be checked', () => {
    const stale: RentalDeps = {
      norms: NORMS,
      indices: { ...INDICES, ipc: { ...IPC, coveredUntil: '2025-01-01' } },
    };
    const r = first(
      check(
        contract({
          updateClause: 'fixed_percent',
          fixedPercent: 1,
          updates: [
            update('2025-03-20', 1000, 1100, { agreedInWriting: false, agreedVerbally: true }),
          ],
        }),
        TODAY,
        stale,
      ),
    );
    const [noAgreement, agreement] = depends(r).readings.map((x) => x.value.calculation[1]?.key);
    expect(noAgreement).toBe('rent_update.index_not_loaded');
    expect(agreement).toBe('rent_update.agreed_verbally');
  });

  it('a large landlord is bound only by the caps that bind one, even with a written agreement', () => {
    for (const [signed, anniversary] of [
      ['2021-09-25', '2026-10-01'],
      ['2021-10-15', '2026-10-20'],
    ] as const) {
      const v = single(
        first(
          check(
            ipcRise(signed, anniversary, {
              largeLandlord: true,
              updates: [update(anniversary, 1000, 1100, { agreedInWriting: true })],
            }),
            f('2026-12-20'),
          ),
        ),
      );
      expect(v).toMatchObject({ status: 'not_checkable', unchecked: 'agreed_in_writing' });
    }
  });

  it('a negative index gives no rise, and an index at nothing is not called negative', () => {
    const negative: RentalDeps = {
      norms: NORMS,
      indices: {
        ...INDICES,
        ipc: {
          ...IPC,
          values: IPC.values.map((v) => (v.month === '2025-02' ? { ...v, rate: -0.5 } : v)),
        },
      },
    };
    const v = single(first(check(ipcRise('2021-03-15', '2025-03-20'), TODAY, negative)));
    expect(v.maxRent).toBe(1000);
    expect(v.calculation[3]).toEqual({
      key: 'rent_update.negative_rate',
      vars: { rate: { percent: -0.5 } },
    });
    const zero: RentalDeps = {
      norms: NORMS,
      indices: { ...INDICES, ipc: flat(IPC, 0), irav: flat(IRAV, 0) },
    };
    const none = single(first(check(ipcRise('2021-03-15', '2025-03-20'), TODAY, zero)));
    expect(none.maxRent).toBe(1000);
    expect(none.calculation.map((p) => p.key)).not.toContain('rent_update.negative_rate');
  });

  it('the rise a cap allows depends on whether the extraordinary caps count', () => {
    const rise = allowedRise(
      contract({
        signedOn: f('2019-03-15'),
        startDate: f('2019-06-10'),
        updateClause: 'fixed_percent',
        fixedPercent: 5,
      }),
      f('2022-06-10'),
      DEPS,
    );
    expect(rise.rateIn({})).toMatchObject({ ok: true, rate: 5 });
    expect(rise.rateIn({ extraordinary_caps: true })).toMatchObject({ ok: true, rate: 2 });
    expect(rise.rateIn({ extraordinary_caps: false })).toMatchObject({ ok: true, rate: 5 });
  });
});

describe('years that build on each other', () => {
  const years: [string, number, number][] = [
    ['2019-03-20', 0.5, 1.7],
    ['2020-03-20', 0.9, 1.3],
    ['2021-03-20', 0.6, 1.9],
    ['2022-03-20', 0.8, 1.1],
  ];
  // The CPI of each anniversary comes out that same day: the month before it, and the one before.
  const synthetic = (rows: typeof years): IndexSeries => ({
    ...IPC,
    coveredUntil: '2031-12-31',
    loadedFromStart: true,
    pendingFlash: null,
    values: rows.flatMap(([day, earlier, latest]) => [
      {
        month: `${day.slice(0, 4)}-01`,
        rate: earlier,
        publishedOn: `${day.slice(0, 4)}-02-14`,
        publishedUrl: SYNTHETIC,
      },
      { month: `${day.slice(0, 4)}-02`, rate: latest, publishedOn: day, publishedUrl: SYNTHETIC },
    ]),
  });
  const deps: RentalDeps = { norms: NORMS, indices: { ...INDICES, ipc: synthetic(years) } };
  const input = (days: readonly string[]) =>
    contract({
      signedOn: f('2018-03-15'),
      startDate: f('2018-03-20'),
      updateClause: 'ipc',
      updates: days.map((d, i) => update(d, 1000 + i * 40, 1040 + i * 40)),
    });
  const all = years.map(([day]) => day);

  it('keep every rent a year could leave until there are more than four, then only the lowest and the highest', () => {
    const results = check(input(all), TODAY, deps);
    const [y1, y2, y3, y4] = results.map(depends);
    expect([y1, y2, y3, y4].map((d) => d?.readings.length)).toEqual([2, 4, 8, 4]);
    expect(y4?.readings.map((r) => r.value.base)).toEqual([1020.13, 1020.13, 1049.79, 1049.79]);
    expect(y3?.readings.map((r) => r.value.base)).toEqual([
      1014.05, 1014.05, 1018.07, 1018.07, 1026.15, 1026.15, 1030.22, 1030.22,
    ]);
  });

  it('start again from the rent given after a year with no update, whatever the years before left', () => {
    const results = checkRentUpdates(input([all[0] as string, all[2] as string]), TODAY, deps, 2);
    const [, y3] = results.map(depends);
    expect(y3?.readings.map((r) => r.value.base)).toEqual([1040, 1040]);
    expect(y3?.readings.map((r) => r.value.calculation[0]?.key)).toEqual([
      'rent_update.base_from_answer',
      'rent_update.base_from_answer',
    ]);
  });

  it('keep the side taken on a doubt that comes back, and name its reason in every year', () => {
    const company = (largeLandlord: boolean | null) =>
      contract({
        signedOn: f('2020-06-20'),
        startDate: f('2020-06-25'),
        landlordType: 'company',
        largeLandlord,
        updateClause: 'fixed_percent',
        fixedPercent: 5,
        updates: [
          update('2023-06-25', 1000, 1050, { agreedInWriting: true }),
          update('2024-06-25', 1050, 1060, { agreedInWriting: true }),
          update('2025-06-25', 1060, 1070, { agreedInWriting: true }),
        ],
      });
    const [y1, y2, y3] = check(company(null)).map(depends);
    const summary = (d: ReturnType<typeof depends> | undefined) =>
      d?.readings.map((r) => [r.value.status, r.value.base, r.worlds]);
    expect(summary(y1)).toEqual([
      ['not_checkable', 1000, [{ large_landlord: false }]],
      ['paid_over', 1000, [{ large_landlord: true }]],
    ]);
    expect(summary(y2)).toEqual([
      ['not_checkable', 1050, [{ large_landlord: false }]],
      ['paid_over', 1020, [{ large_landlord: true }]],
    ]);
    expect(summary(y3)).toEqual([
      ['not_checkable', 1050.6, [{}]],
      ['not_checkable', 1060, [{}]],
    ]);
    expect([y1, y2, y3].map((d) => d?.reasons)).toEqual([
      ['large_landlord_unknown'],
      ['large_landlord_unknown'],
      ['large_landlord_unknown'],
    ]);
  });
});

describe('the reasons of a year that builds on doubts of the years before', () => {
  const reasons = (input: RentalInput, today: CivilDate = TODAY) =>
    check(input, today).map((r) => (r.outcome.kind === 'depends' ? r.outcome.reasons : []));

  it('leave out a doubt of an earlier year that left every base alike', () => {
    // An `other` clause leaves no rent to carry, so the large landlord of 2024 moves nothing in 2025.
    const input = contract({
      signedOn: f('2019-05-10'),
      startDate: f('2019-05-19'),
      landlordType: 'company',
      largeLandlord: null,
      updateClause: 'other',
      initialRent: 1458,
      updates: [
        update('2024-05-19', 877.76, 890.93, {
          notice: 'annex',
          noticeOn: f('2024-05-30'),
          agreedInWriting: null,
        }),
        update('2025-05-19', 890.93, 909.64, {
          notice: 'verbal',
          noticeOn: null,
          agreedInWriting: null,
        }),
      ],
    });
    expect(reasons(input)).toEqual([
      ['large_landlord_unknown', 'agreement_unknown'],
      ['agreement_unknown', 'notice_missing_paid'],
    ]);
  });
});

describe('what a bounded update says, and the few paths left', () => {
  it('says an update was not worked out, and cites the clause', () => {
    const input = contract({
      signedOn: f('2020-02-20'),
      startDate: f('2020-02-29'),
      initialRent: 700,
      updates: [update('2021-02-28', 700, 710, { notice: 'email', agreedInWriting: null })],
    });
    const v = single(first(checkRentUpdates(input, TODAY, DEPS, 2)));
    expect(v.calculation).toEqual([{ key: 'rent_update.too_many_readings' }]);
    expect(v.rules).toEqual(['update_clause']);
  });

  it('does not say the rent stayed as charged when a later update is charged only from the future', () => {
    const v = single(
      first(
        check(
          contract({
            signedOn: f('2024-03-15'),
            startDate: f('2024-03-20'),
            updateClause: 'irav',
            updates: [
              update('2025-03-20', 1000, 1030),
              update('2026-03-20', 1020.8, 1040, { chargedFrom: f('2027-01-01') }),
            ],
          }),
        ),
      ),
    );
    expect(v.calculation.map((p) => p.key)).not.toContain('rent_update.until_today');
  });

  it('weighs the flash of a CPI month against its definitive figure on the day that comes out', () => {
    const r = first(
      check(
        contract({
          signedOn: f('2021-03-11'),
          startDate: f('2021-03-11'),
          updateClause: 'ipc',
          updates: [update('2022-03-11', 1000, 1100)],
        }),
      ),
    );
    const [flash, definitive] = depends(r).readings;
    expect(flash?.value.calculation[1]).toEqual({
      key: 'rent_update.agreed',
      vars: {
        rate: {
          key: 'rent_update.figure.flash',
          vars: {
            index: { index: 'ipc' },
            month: { month: '2022-02' },
            rate: { percent: 7.4 },
            published: { date: '2022-02-28' },
          },
        },
      },
    });
    expect(definitive?.value.agreed).toMatchObject({
      kind: 'index',
      figure: { rate: 7.6, flash: false },
    });
  });

  it('cannot check a clause naming no index when that index is not loaded', () => {
    const stale: RentalDeps = {
      norms: NORMS,
      indices: { ...INDICES, igc: { ...IGC, coveredUntil: '2020-01-01' } },
    };
    const v = single(
      first(
        check(
          contract({
            signedOn: f('2019-03-15'),
            startDate: f('2019-03-20'),
            updateClause: 'unspecified_index',
            updates: [update('2021-03-20', 1000, 1100)],
          }),
          TODAY,
          stale,
        ),
      ),
    );
    expect(v).toMatchObject({ status: 'not_checkable', unchecked: 'index_not_loaded' });
    expect(v.rules).toEqual(['update_clause', 'igc_clamp']);
  });

  it('starts a second rise of the first year from the rent given when nothing was carried', () => {
    const [, second] = check(
      contract({
        updateClause: 'other',
        updates: [update('2022-03-20', 1000, 1030), update('2022-03-20', 1030, 1040)],
      }),
    ).map(single);
    expect(second?.base).toBe(1030);
    expect(second?.calculation[0]?.key).toBe('rent_update.base_from_answer');
  });
});

describe('five years of doubts that come back', () => {
  const series = (base: IndexSeries, rows: readonly [string, number, string][]): IndexSeries => ({
    ...base,
    coveredUntil: '2031-12-31',
    loadedFromStart: true,
    pendingFlash: null,
    values: rows.map(([month, rate, publishedOn]) => ({
      month,
      rate,
      publishedOn,
      publishedUrl: SYNTHETIC,
    })),
  });
  // Each CPI and IRAV month comes out the day of some anniversary, the others the day before.
  const deps: RentalDeps = {
    norms: NORMS_BEFORE_VOTE,
    indices: {
      ...INDICES,
      ipc: series(IPC, [
        ['2023-09', 2.2, '2023-10-10'],
        ['2023-10', 0.2, '2023-11-20'],
        ['2024-09', 1.6, '2024-10-10'],
        ['2024-10', 0.1, '2024-11-20'],
        ['2025-09', 2.2, '2025-10-10'],
        ['2025-10', 2.4, '2025-11-20'],
        ['2026-09', 1.8, '2026-10-10'],
        ['2026-10', 3.5, '2026-11-20'],
        ['2027-09', 3.2, '2027-10-10'],
        ['2027-10', 3.1, '2027-11-20'],
      ]),
      irav: series(IRAV, [
        ['2023-09', 0.1, '2023-10-10'],
        ['2023-10', 1.8, '2023-11-20'],
        ['2024-10', 1.3, '2024-11-05'],
        ['2025-09', 1, '2025-10-10'],
        ['2025-10', 0.1, '2025-11-20'],
        ['2026-09', 0.8, '2026-10-10'],
        ['2026-10', 0.7, '2026-11-20'],
        ['2027-09', 1.8, '2027-10-10'],
        ['2027-10', 1.5, '2027-11-20'],
      ]),
    },
  };

  it('keep naming a norm still pending in the last year, with the doubts of the years before', () => {
    const results = check(
      contract({
        signedOn: f('2022-11-10'),
        startDate: f('2022-11-20'),
        landlordType: 'company',
        largeLandlord: true,
        updateClause: 'fixed_percent',
        fixedPercent: 0.41,
        updates: [
          update('2023-11-20', 1000, 1030, { agreedInWriting: null }),
          update('2024-11-20', 1030, 1060.9, { agreedInWriting: null }),
          update('2025-11-20', 1060.9, 1092.73, {
            notice: 'verbal',
            agreedInWriting: null,
            agreedVerbally: true,
          }),
          update('2026-11-20', 1092.73, 1125.51, { notice: 'email', agreedInWriting: false }),
          update('2027-11-20', 1125.51, 1159.28, { agreedInWriting: true, agreedVerbally: true }),
        ],
      }),
      f('2031-01-01'),
      deps,
    );
    expect(results.map((r) => depends(r).reasons)).toEqual([
      ['index_month_doubtful', 'agreement_unknown'],
      ['index_month_doubtful', 'agreement_unknown'],
      ['index_month_doubtful', 'agreement_unknown', 'notice_missing_paid'],
      ['index_month_doubtful', 'agreement_unknown', 'notice_form_doubtful'],
      ['pending_validation', 'index_month_doubtful', 'agreement_unknown'],
    ]);
  });
});
