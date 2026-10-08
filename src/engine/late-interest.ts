import { phrase, type Calculation } from './calculation';
import { addMonthsClamped, ordinal, type CivilDate } from './date';
import { round2 } from './money';
import { SOURCES, type Source } from './sources';
import type { Item, ItemId } from './types';

// Art. 29.3 ET: 10 % of what is owed, read by the courts as a yearly rate.
export const LATE_INTEREST_RATE = 0.1;

// Only salary carries it. Severance is not salary, and whether untaken holidays are is disputed,
// so neither counts.
const SALARY_ITEMS: readonly ItemId[] = ['pending_salary', 'extra_pay'];

export interface LateInterest {
  // The legal minimum of the salary items: what the interest is counted on.
  readonly base: number;
  readonly daysLate: number;
  // Days left to claim the final pay (art. 59.1 and 59.2 ET); below 0, the year has passed.
  readonly daysLeft: number;
  // Zero once the year has passed: it may have lapsed, so nothing is counted.
  readonly amount: number;
  readonly calculation: Calculation;
  readonly sources: readonly Source[];
}

// From the day of the termination, when the final pay is due and the year to claim it starts.
export function lateInterest(
  items: readonly Item[],
  endDate: CivilDate,
  today: CivilDate,
): LateInterest {
  const base = round2(
    items
      .filter((i) => SALARY_ITEMS.includes(i.id) && i.direction === 'credit')
      .reduce((sum, i) => sum + (i.range?.min ?? 0), 0),
  );
  const daysLate = Math.max(0, ordinal(today) - ordinal(endDate));
  const daysLeft = ordinal(addMonthsClamped(endDate, 12)) - ordinal(today);
  const amount = daysLeft < 0 ? 0 : round2((LATE_INTEREST_RATE * base * daysLate) / 365);
  return {
    base,
    daysLate,
    daysLeft,
    amount,
    calculation: [
      phrase('late_interest', {
        base: { euros: base },
        dias: { integer: daysLate },
        importe: { euros: amount },
      }),
      phrase('late_interest.scope'),
    ],
    sources: [SOURCES.et29, SOURCES.et59],
  };
}
