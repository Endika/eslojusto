import type { Confidence } from '../../src/domain/extraction-schema';

export const f = (value: unknown, confidence: Confidence = 'high') => ({ value, confidence });

// A fictitious settlement whose items add up to the total.
export const coherentSettlement = (confidence: Confidence = 'high') => ({
  detectedKind: f('settlement'),
  startDate: f('2022-03-01', confidence),
  endDate: f('2026-09-15'),
  cause: f('fixed_term_end'),
  pending_salary: f(1250),
  holiday_pay: f(640.5),
  extra_pay: f(980),
  totalAccrued: f(2870.5),
});
