import { TOLL_HOLIDAYS } from '../../src/engine/bills/data/holidays-20td';
import { BILLS_NORMS } from '../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../src/engine/bills/data/tables';
import type { OfficialDeps, PvpcHourly } from '../../src/engine/bills/electricity-official';
import type { RenewalReviewDeps } from '../../src/engine/bills/renewal-review';
import type { RenewalInput } from '../../src/engine/bills/renewal-types';
import { fromOrdinal, ordinal, parseDate, toIso } from '../../src/engine/date';

export const TODAY = parseDate('2026-11-25');

// The Naturgy letter of 31-10-2026 that renews on 10-12-2026, as a synthetic case.
export const naturgy = (change: Partial<RenewalInput> = {}): RenewalInput => ({
  letterDate: '2026-10-31',
  renewalDate: '2026-12-10',
  powerKw: { p1: 5.75, p2: 5.75 },
  powerUnit: 'per_kw_day',
  current: { power: { p1: 0.110283, p2: 0.033469 }, energy: { all: 0.144972 } },
  next: { power: { p1: 0.12303, p2: 0.052329 }, energy: { all: 0.1678 } },
  annualKwh: 4190.2,
  declared: { withoutTax: 1071.15, withTax: 1362.36 },
  fixedPrice: false,
  firstRenewal: false,
  separateFromBill: true,
  ...change,
});

// A year of PVPC hours at one price, ending on `lastDay`.
export function flatPvpc(lastDay: string, price: number, days = 366): PvpcHourly {
  const hours = Array.from({ length: 24 }, (_, h) => [h, price] as const);
  const end = ordinal(parseDate(lastDay));
  const series: Record<string, readonly (readonly [number, number])[]> = {};
  for (let n = end - days + 1; n <= end; n++) series[toIso(fromOrdinal(n))] = hours;
  return { coveredUntil: lastDay, days: series };
}

// The PVPC of the year before 02-11-2026, at one price in €/MWh.
export const official = (price = 100): OfficialDeps => ({
  pvpc: flatPvpc('2026-11-02', price),
  tollHolidays: TOLL_HOLIDAYS,
});

export const deps = (pvpc: OfficialDeps | null = official()): RenewalReviewDeps => ({
  tables: BILLS_TABLES,
  norms: BILLS_NORMS,
  official: pvpc,
});
