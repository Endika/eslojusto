import type { Confidence, Readability } from '../../src/domain/extraction-schema';

export const f = (value: unknown, confidence: Confidence = 'high') => ({ value, confidence });

export const page = (
  n: number,
  kind: string,
  document = n,
  confidence: Confidence = 'high',
  month?: string,
  readability: Readability = 'ok',
) => ({
  page: n,
  kind,
  document,
  ...(month !== undefined && { month }),
  readability: f(readability),
  confidence,
});

// A fictitious settlement proposal whose items add up to the total.
export const proposal = (confidence: Confidence = 'high') => ({
  startDate: f('2022-03-01', confidence),
  endDate: f('2026-09-15'),
  cause: f('fixed_term_end'),
  pending_salary: f(1250),
  holiday_pay: f(640.5),
  extra_pay: f(980),
  totalGross: f(2870.5),
});

// The tool input for a one-page pack holding that proposal.
export const coherentSettlement = (confidence: Confidence = 'high') => ({
  pages: [page(1, 'settlement_proposal')],
  settlement_proposal: proposal(confidence),
});
