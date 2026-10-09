import { annualSalary } from '../settlement';
import { dailySalary } from '../severance';
import type { HouseholdInput } from './types';

// The year's pay in money, by the final-pay engine's own sum; null when it cannot be known: no
// monthly pay, or extra payments apart of an unknown amount.
export function annualPay(input: Pick<HouseholdInput, 'monthlyCash' | 'extraPays'>): number | null {
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

// The daily salary every household figure uses, the final-pay engine's: the year over 365 days.
export const dailyPay = (
  input: Pick<HouseholdInput, 'monthlyCash' | 'extraPays'>,
): number | null => {
  const annual = annualPay(input);
  return annual === null ? null : dailySalary(annual);
};
