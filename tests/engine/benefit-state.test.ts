import { describe, expect, it } from 'vitest';
import { benefitState } from '../../src/engine/benefit-state';
import { parseDate as f } from '../../src/engine/date';
import type { FinalPayInput } from '../../src/engine/types';
import { estimateBenefit } from '../../src/engine/unemployment';

const dismissal: FinalPayInput = {
  cause: 'objective_dismissal',
  startDate: f('2020-01-01'),
  endDate: f('2026-09-30'),
  monthlySalary: 2000,
  extraPayProrated: true,
  extraPayCount: 0,
  extraPayAmount: 0,
  extraPayAccrual: 'unknown',
  holidayUnit: 'calendar',
  annualHolidayDays: 30,
  holidayDaysTaken: 0,
};

describe('benefitState', () => {
  it.each([['a dismissal with the figures', {}, 'with_figures']] as const)(
    '%s: %s',
    (_, over, state) => {
      expect(benefitState(estimateBenefit({ ...dismissal, ...over }, 0))).toBe(state);
    },
  );
});
