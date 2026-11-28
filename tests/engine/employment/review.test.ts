import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import {
  reviewEmployment,
  type EmploymentDeps,
  type EmploymentReview,
} from '../../../src/engine/employment/review';
import type { EmploymentInput } from '../../../src/engine/employment/types';
import { contract } from './input';

const TODAY = parseDate('2026-10-08');
const DEPS: EmploymentDeps = { norms: EMPLOYMENT_NORMS, minimumWage: MINIMUM_WAGE };

const reviewed = (
  input: EmploymentInput,
  today = TODAY,
  deps: EmploymentDeps = DEPS,
): EmploymentReview => {
  const result = reviewEmployment(input, today, deps);
  if (!result.ok) throw new Error(`invalid input: ${JSON.stringify(result.errors)}`);
  return result.review;
};

const ALL_UNCHECKED = [
  'agreement_tables',
  'bonuses',
  'real_hours',
  'equal_pay',
  'contributions',
  'net_pay',
  'later_agreements',
];

describe('reviewEmployment', () => {
  it('returns the input errors and nothing else', () => {
    const result = reviewEmployment(contract({ endDate: parseDate('2024-01-01') }), TODAY, DEPS);
    expect(result).toEqual({
      ok: false,
      errors: [{ field: 'endDate', index: null, code: 'before_start' }],
    });
  });

  it('a void clause opens the pass', () => {
    const review = reviewed(
      contract({
        clauses: [
          {
            label: 'waiver',
            months: null,
            compensationStated: null,
            trainingDescribed: null,
            waivedRight: 'holidays',
            costsOnWorker: null,
            literal: { text: 'Cláusula sintética de prueba.' },
          },
        ],
      }),
    );
    expect(review.clauses[0]?.assessed).toEqual(
      expect.objectContaining({ finding: expect.objectContaining({ status: 'clause_void' }) }),
    );
    expect(review.offerPass).toBe(true);
  });

  it.each([['minor', { under18: true }, 'minors']] as const)(
    'outside the review (%s): no items, only the reason',
    (_, change, block) => {
      const review = reviewed(
        contract({
          ...change,
          clauses: [
            {
              label: 'waiver',
              months: null,
              compensationStated: null,
              trainingDescribed: null,
              waivedRight: 'holidays',
              costsOnWorker: null,
              literal: { text: 'Cláusula sintética de prueba.' },
            },
          ],
          offer: { grossAnnual: 30000, net: false, weeklyHours: 40, modality: null, remote: null },
        }),
      );
      expect(review.items).toEqual([]);
      expect(review.clauses).toEqual([]);
      expect(review.informationDuty).toBeNull();
      expect(review.offer).toBeNull();
      expect(review.information.map((b) => b.id)).toEqual([block]);
      expect(review.offerPass).toBe(false);
      expect(review.unchecked).toEqual(ALL_UNCHECKED);
    },
  );

  it('always lists what it did not check; real hours only until the person gives them', () => {
    expect(reviewed(contract()).unchecked).toEqual(ALL_UNCHECKED);
    expect(reviewed(contract({ realWeeklyHours: 42 })).unchecked).not.toContain('real_hours');
  });
});
