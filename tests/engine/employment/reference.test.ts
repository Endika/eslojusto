import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import { reviewModality } from '../../../src/engine/employment/modality';
import { permanentReference } from '../../../src/engine/employment/reference';
import type { Assessed, EmploymentInput } from '../../../src/engine/employment/types';
import { contract, finding } from './input';

const TODAY = parseDate('2026-10-07');
const deps = { norms: EMPLOYMENT_NORMS };
// 18.250 € a year: 50 € a day.
const SALARY = 18250;

const temporary = (
  modality: EmploymentInput['modality'],
  start: string,
  end: string | null,
): EmploymentInput =>
  contract({
    modality,
    startDate: parseDate(start),
    signedOn: parseDate(start),
    endDate: end === null ? null : parseDate(end),
    causeStated: true,
    circumstancesStated: true,
  });

const reviewed = (input: EmploymentInput): Assessed[] => [...reviewModality(input, TODAY, deps)];

describe('permanentReference', () => {
  it('a production contract of 13 months: its 12 days a year against an unfair dismissal', () => {
    const input = temporary('production', '2025-01-01', '2026-01-31');
    const reference = permanentReference(input, TODAY, reviewed(input), SALARY);
    expect(reference?.on).toEqual(parseDate('2026-01-31'));
    // 396 days × 12 / 365 = 13,02 days of 50 €.
    expect(reference?.fixedTermEnd.amount).toBe(650.96);
    // 13 months × 2,75 = 35,75 days of 50 €.
    expect(reference?.unfairDismissal.amount).toBe(1787.5);
  });

  it('a work-or-service contract with no end is valued today', () => {
    const input = temporary('work_or_service', '2023-05-02', null);
    expect(permanentReference(input, TODAY, reviewed(input), SALARY)?.on).toEqual(TODAY);
  });

  it('a replacement over its limit pays nothing at its end', () => {
    const input = temporary('replacement_selection', '2025-01-01', '2025-04-15');
    expect(permanentReference(input, TODAY, reviewed(input), SALARY)?.fixedTermEnd.amount).toBe(0);
  });

  it('never appears without a temporality finding that holds', () => {
    const within = temporary('production', '2025-01-01', '2025-05-31');
    expect(permanentReference(within, TODAY, reviewed(within), SALARY)).toBeNull();
    const agreement = temporary('production', '2025-01-01', '2025-07-31');
    expect(permanentReference(agreement, TODAY, reviewed(agreement), SALARY)).toBeNull();
    const other: Assessed[] = [
      { kind: 'single', finding: finding({ item: 'trial_period', status: 'over_legal_limit' }) },
    ];
    expect(permanentReference(within, TODAY, other, SALARY)).toBeNull();
  });

  it('never appears when the readings disagree', () => {
    const split: Assessed[] = [
      {
        kind: 'readings',
        question: 'chaining_cutoff',
        readings: [
          {
            when: 'cutoff_2021_12_31',
            finding: finding({
              id: 'chaining_18_in_24',
              item: 'chaining',
              status: 'becomes_permanent',
            }),
          },
          {
            when: 'cutoff_2022_03_30',
            finding: finding({ id: 'chaining_18_in_24', item: 'chaining', status: 'within_limit' }),
          },
        ],
      },
    ];
    const input = temporary('production', '2025-01-01', '2025-05-31');
    expect(permanentReference(input, TODAY, split, SALARY)).toBeNull();
  });

  it('needs the yearly salary', () => {
    const input = temporary('work_or_service', '2023-05-02', null);
    expect(permanentReference(input, TODAY, reviewed(input), null)).toBeNull();
  });

  it('stays out of the findings: none of them carries an amount', () => {
    const input = temporary('work_or_service', '2023-05-02', null);
    for (const a of reviewed(input)) {
      const all = a.kind === 'single' ? [a.finding] : a.readings.map((r) => r.finding);
      for (const f of all) expect(f.amount).toBeNull();
    }
  });
});
