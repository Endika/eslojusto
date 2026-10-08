import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ContributionPeriod,
  FinalPayInput,
  FixedTermType,
  ItemId,
  StatedCause,
} from '../../src/engine/types';
import { CAUSES, FIXED_TERM_TYPES, ITEM_IDS, SECTIONS } from '../src/domain/extraction-schema';
import { MERGED_FIELDS } from '../src/domain/merge';

// The site prefills its form from these names; type:check fails if the engine drifts.
describe('engine contract', () => {
  it('mirrors the engine unions', () => {
    expectTypeOf<(typeof CAUSES)[number]>().toEqualTypeOf<StatedCause>();
    expectTypeOf<(typeof FIXED_TERM_TYPES)[number]>().toEqualTypeOf<FixedTermType>();
    expectTypeOf<(typeof ITEM_IDS)[number]>().toEqualTypeOf<ItemId>();
  });

  it('names merged fields after FinalPayInput keys, item ids or the payslip they come from', () => {
    const inputKeys: readonly (keyof FinalPayInput)[] = [
      'startDate',
      'endDate',
      'cause',
      'fixedTermType',
      'monthlySalary',
      'annualHolidayDays',
      'holidayDaysTaken',
      'noticeDaysReceived',
      'extraPayProrated',
      'extraPayAmount',
    ];
    const payslip = [
      'payslipPeriodStart',
      'payslipPeriodEnd',
      'payslipTotalAccrued',
      'extraPayProratedAmount',
      'extraPayPaid',
      'agreementSeveranceTotal',
      'noticeDaysPaid',
    ];
    expect([...MERGED_FIELDS].sort()).toEqual([...inputKeys, ...ITEM_IDS, ...payslip].sort());
  });

  it('names work-history rows after ContributionPeriod', () => {
    const keys: readonly (keyof ContributionPeriod)[] = ['startDate', 'endDate'];
    expect(Object.keys(SECTIONS.work_history.lists.contracts.item).sort()).toEqual(
      [...keys].sort(),
    );
  });
});
