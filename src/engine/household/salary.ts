import { minimumWageFor, type MinimumWageTable } from '../law/minimum-wage';
import { annualSalary } from '../settlement';
import type { HouseholdInput } from './types';

// The year's pay in money, by the final-pay engine's own sum; null when it cannot be known: no
// monthly pay, or extra payments apart of an unknown amount.
function annualPay(input: Pick<HouseholdInput, 'monthlyCash' | 'extraPays'>): number | null {
  const { monthlyCash, extraPays } = input;
  if (monthlyCash === null) return null;
  const apart = extraPays !== null && !extraPays.prorated;
  if (apart && extraPays.count > 0 && extraPays.amount === null) return null;
  return annualSalary({
    monthlySalary: monthlyCash,
    extraPayProrated: !apart,
    extraPayCount: apart ? extraPays.count : 0,
    extraPayAmount: apart ? (extraPays.amount ?? 0) : 0,
  });
}

// Art. 9: forty hours of effective work make a full week; fewer hours get the minimum in proportion.
const FULL_WEEK = 40;
const MONTHS_IN_YEAR = 12;

export interface BasePay {
  readonly annual: number;
  // The pay was below the minimum wage for its hours, so the minimum is the base.
  readonly raisedToMinimum: boolean;
}

// The base of the severance and the notice: the year's pay in money, or, when money and pay in kind
// fall below the minimum wage for those hours, the money that reaches it. The norm does not spell
// this out; it is a reading.
export function basePay(input: HouseholdInput, table: MinimumWageTable): BasePay | null {
  const annual = annualPay(input);
  if (annual === null) return null;
  const lookup = minimumWageFor(input.payYear, table);
  if (lookup.kind !== 'published' || input.weeklyHours === null)
    return { annual, raisedToMinimum: false };
  const minimum = lookup.row.annual * (Math.min(input.weeklyHours, FULL_WEEK) / FULL_WEEK);
  // Pay in kind is salary too, though it stays out of the base: only the money is raised, to what
  // the minimum leaves once the pay in kind is counted.
  const inKind = (input.inKindMonthly ?? 0) * MONTHS_IN_YEAR;
  return annual + inKind < minimum
    ? { annual: minimum - inKind, raisedToMinimum: true }
    : { annual, raisedToMinimum: false };
}
