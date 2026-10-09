import {
  addMonthsClamped,
  compareDates,
  daysInMonth,
  ordinal,
  toIso,
  type CivilDate,
} from '../date';
import { insurancePhrase, type InsuranceCalculation, type InsurancePhraseKey } from './calculation';
import type { NormTable } from './norms';
import { ruleSource, type InsuranceRuleId } from './rules';
import type { Finding, FindingId, FindingStatus } from './types';

export interface MonthsBefore {
  // The day the months run back to; when that month has no equivalent day, its last day.
  readonly day: CivilDate;
  readonly monthEnd: boolean;
}

// Months run date to date (Código Civil, art. 5.1), and a month with no equivalent day ends on its
// last day. No norm settles that case when counting backwards, so the day is given with a note;
// there, counting forwards from the notice (notice + months ≤ end of the period) gives the same day.
export function monthsBefore(date: CivilDate, months: number): MonthsBefore {
  const day = addMonthsClamped(date, -months);
  return { day, monthEnd: date.d > daysInMonth(day.y, day.m) };
}

export const day = (date: CivilDate): { readonly date: string } => ({ date: toIso(date) });

export const daysBetween = (from: CivilDate, to: CivilDate): number => ordinal(to) - ordinal(from);

export const finding = (
  id: FindingId,
  status: FindingStatus,
  calculation: InsuranceCalculation,
  rules: readonly InsuranceRuleId[],
  norms: NormTable,
  deadline: { readonly lastDay: CivilDate; readonly today: CivilDate } | null = null,
): Finding => ({
  id,
  status,
  lastDay: deadline === null ? null : toIso(deadline.lastDay),
  daysLeft:
    deadline === null || status !== 'open' ? null : daysBetween(deadline.today, deadline.lastDay),
  calculation,
  sources: rules.map((rule) => ruleSource(rule, norms)),
});

// Whether a deadline is still open today, with the phrase that says so.
export function deadlineState(
  lastDay: CivilDate,
  today: CivilDate,
  keys: { readonly open: InsurancePhraseKey; readonly ended: InsurancePhraseKey },
): { readonly status: 'open' | 'ended'; readonly calculation: InsuranceCalculation } {
  if (compareDates(today, lastDay) <= 0)
    return {
      status: 'open',
      calculation: [
        insurancePhrase(keys.open, {
          days: { days: daysBetween(today, lastDay) },
          day: day(lastDay),
        }),
      ],
    };
  return { status: 'ended', calculation: [insurancePhrase(keys.ended, { day: day(lastDay) })] };
}
