import type { NormSource } from '../law/sources';
import { holidayPayItem, extraPayItem, pendingSalaryItem } from '../settlement';
import type { FinalPayInput, Item } from '../types';
import type { NormTable } from './norms';
import { ruleSource } from './rules';
import type { HouseholdInput } from './types';

// What the worker is still owed when the service ends.
export type HouseholdFinalPay =
  // Pending salary, holidays in calendar days and extra payments, by the final-pay engine's items.
  | {
      readonly kind: 'monthly';
      readonly items: readonly Item[];
      // The extra payments are apart but their amount is not known, so they are not worked out.
      readonly extraPayAmountMissing: boolean;
    }
  // An external worker's hourly price already includes holidays and extra payments (art. 8.5).
  | {
      readonly kind: 'hourly_external';
      readonly includedInHourlyPrice: readonly ('holiday_pay' | 'extra_pay')[];
      readonly source: NormSource;
      // Art. 8.5 says it of the minimum: above it, what was agreed decides.
      readonly agreementMaySetOther: boolean;
    }
  | { readonly kind: 'not_entered' };

const FULL_YEAR_HOLIDAYS = 30;

export function assessFinalPay(input: HouseholdInput, norms: NormTable): HouseholdFinalPay | null {
  const t = input.termination;
  if (t === null) return null;
  if (input.regime === 'hourly_external')
    return {
      kind: 'hourly_external',
      includedInHourlyPrice: ['holiday_pay', 'extra_pay'],
      source: ruleSource('smi_hourly_external', norms),
      agreementMaySetOther: true,
    };
  if (input.monthlyCash === null) return { kind: 'not_entered' };
  const extras = input.extraPays;
  const apart = extras !== null && !extras.prorated && extras.count > 0;
  const extraPayAmountMissing = apart && extras.amount === null;
  const e: FinalPayInput = {
    cause: 'unknown',
    startDate: input.startDate,
    endDate: t.effectiveOn,
    monthlySalary: input.monthlyCash,
    extraPayProrated: extras === null || extras.prorated,
    extraPayCount: extras?.count ?? 0,
    extraPayAmount: extras?.amount ?? 0,
    extraPayAccrual: extras?.accrual ?? 'semiannual',
    holidayUnit: 'calendar',
    annualHolidayDays: input.holidays?.days ?? FULL_YEAR_HOLIDAYS,
    holidayDaysTaken: input.holidays?.taken ?? null,
  };
  const sources = {
    pending_salary: [ruleSource('smi_monthly', norms)],
    holiday_pay: [ruleSource('holidays_30', norms)],
    extra_pay: [ruleSource('extra_pays', norms)],
  } as const;
  const items = [
    pendingSalaryItem(e),
    holidayPayItem(e),
    extraPayAmountMissing ? null : extraPayItem(e),
  ].flatMap((item) =>
    item === null ? [] : [{ ...item, sources: sources[item.id as keyof typeof sources] }],
  );
  return { kind: 'monthly', items, extraPayAmountMissing };
}
