import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import {
  cite,
  longerThan,
  ruleStanding,
  settle,
  shorterThan,
  type Draft,
} from '../../../src/engine/employment/fixed-term';

describe('a span of months from a start day', () => {
  const start = parseDate('2025-01-15');

  it.each([
    ['2025-07-13', true, false],
    ['2025-07-14', false, false],
    ['2025-07-15', false, true],
  ])('an end on %s is shorter: %s, longer: %s than six months', (end, shorter, longer) => {
    expect(shorterThan(start, parseDate(end), 6)).toBe(shorter);
    expect(longerThan(start, parseDate(end), 6)).toBe(longer);
  });
});

describe('ruleStanding', () => {
  it.each([
    ['trial_limits', '2015-11-12', 'not_in_force'],
    ['trial_limits', '2015-11-13', 'in_force'],
    ['trial_limits', '2025-01-01', 'in_force'],
    ['trial_limits', '2026-11-18', 'in_force'],
    ['trial_limits', '2026-11-19', 'not_in_force'],
    ['weekly_40', '2015-11-12', 'not_in_force'],
    ['weekly_40', '2015-11-13', 'in_force'],
    ['weekly_40', '2099-01-01', 'in_force'],
  ] as const)('%s on %s: %s', (id, day, standing) => {
    expect(ruleStanding(id, parseDate(day), EMPLOYMENT_NORMS)).toBe(standing);
  });
});

describe('cite and settle', () => {
  const draft: Draft = {
    id: 'trial_limits',
    item: 'trial_period',
    status: 'within_limit',
    calculation: [],
  };

  it('cite defaults to not based on the answer, no agreement and no literal', () => {
    expect(cite(draft, EMPLOYMENT_NORMS)).toMatchObject({
      basedOnYourAnswer: false,
      agreementMaySetOther: false,
      literal: null,
    });
  });

  it('a rule out of force on the day does not apply', () => {
    expect(settle(draft, parseDate('2026-11-19'), EMPLOYMENT_NORMS).status).toBe(
      'not_applicable_to_date',
    );
  });

  it('a rule in force keeps its verdict', () => {
    expect(settle(draft, parseDate('2026-11-18'), EMPLOYMENT_NORMS).status).toBe('within_limit');
  });
});
