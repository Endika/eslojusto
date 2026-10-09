import { parseDate } from '../../../src/engine/date';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { HOUSEHOLD_NORMS } from '../../../src/engine/household/data/norms';
import type { HouseholdDeps } from '../../../src/engine/household/review';
import type {
  Assessed,
  Finding,
  HouseholdInput,
  HouseholdTermination,
} from '../../../src/engine/household/types';

export const TODAY = parseDate('2026-10-08');
export const DEPS: HouseholdDeps = { norms: HOUSEHOLD_NORMS, minimumWage: MINIMUM_WAGE };

// A synthetic full-time live-out worker paid monthly, with nothing wrong; tests override what they
// check. Two extra payments of a monthly pay each: 1.500 × 14 = 21.000 € a year.
export const household = (change: Partial<HouseholdInput> = {}): HouseholdInput => ({
  startDate: parseDate('2024-03-01'),
  payYear: 2026,
  liveIn: false,
  regime: 'monthly',
  weeklyHours: 40,
  monthlyCash: 1500,
  inKindMonthly: null,
  extraPays: { count: 2, amount: 1500, prorated: false, accrual: 'semiannual' },
  hourlyRate: null,
  shortestRestHours: 12,
  restMadeUpWithinFourWeeks: null,
  weeklyRestHours: 36,
  holidays: { days: 30, longestStretch: 15, taken: 10 },
  termination: null,
  ...change,
});

// A desistimiento done by the book: written, with a legal cause, severance made available and
// the notice given in full.
export const desistimiento = (
  change: Partial<HouseholdTermination> = {},
): HouseholdTermination => ({
  route: 'desistimiento',
  noticeGivenOn: parseDate('2026-09-01'),
  effectiveOn: parseDate('2026-09-21'),
  noticeTime: '12:00',
  inWriting: true,
  cause: 'family_needs_change',
  severanceAvailable: true,
  severanceOffered: 100_000,
  substitutePaid: null,
  seriousBreachAlleged: null,
  ...change,
});

export const singles = (items: readonly Assessed[]): readonly Finding[] =>
  items.flatMap((a) => (a.kind === 'single' ? [a.finding] : []));

// The one finding of a rule among the assessed points, whatever its reading.
export function findingOf(items: readonly Assessed[], id: Finding['id']): Assessed {
  const found = items.find((a) =>
    a.kind === 'single' ? a.finding.id === id : a.readings.some((r) => r.finding.id === id),
  );
  if (found === undefined) throw new Error(`No finding for ${id}`);
  return found;
}

export const statusOf = (items: readonly Assessed[], id: Finding['id']): string => {
  const a = findingOf(items, id);
  return a.kind === 'single' ? a.finding.status : 'readings';
};

export const single = (items: readonly Assessed[], id: Finding['id']): Finding => {
  const a = findingOf(items, id);
  if (a.kind !== 'single') throw new Error(`${id} has readings`);
  return a.finding;
};
