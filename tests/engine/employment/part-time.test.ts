import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { phrase } from '../../../src/engine/employment/calculation';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import { assessPartTime } from '../../../src/engine/employment/part-time';
import { offerPass } from '../../../src/engine/employment/readings';
import type { EmploymentInput, Finding, PartTime } from '../../../src/engine/employment/types';
import { contract } from './input';

const STATED: PartTime = {
  hoursStated: true,
  distributionStated: true,
  complementary: null,
  voluntaryPercent: null,
};

const partTime = (
  change: Partial<PartTime>,
  rest: Partial<EmploymentInput> = {},
): EmploymentInput =>
  contract({
    contractHours: { weekly: 20, annual: null },
    partTime: { ...STATED, ...change },
    ...rest,
  });

const findings = (input: EmploymentInput): Finding[] =>
  assessPartTime(input, EMPLOYMENT_NORMS).map((a) => {
    if (a.kind !== 'single') throw new Error('expected single findings');
    return a.finding;
  });

const findingFor = (input: EmploymentInput, id: Finding['id']): Finding => {
  const found = findings(input).find((f) => f.id === id);
  if (found === undefined) throw new Error(`no finding ${id}`);
  return found;
};

describe('part-time contents (art. 12.4.a ET)', () => {
  it('without the distribution of hours, full time is presumed', () => {
    expect(findingFor(partTime({ distributionStated: false }), 'part_time_contents')).toMatchObject(
      {
        status: 'missing_requirement',
        calculation: [
          phrase('part_time.distribution_missing'),
          phrase('part_time.full_time_presumed'),
        ],
      },
    );
  });

  it('hours and distribution stated are within the rule', () => {
    expect(findingFor(partTime({}), 'part_time_contents').status).toBe('within_limit');
  });

  it('a full-time contract has nothing to check here', () => {
    expect(findings(contract({ partTime: null }))).toEqual([]);
  });
});

describe('complementary hours (art. 12.5 ET)', () => {
  const pact = (percent: number, noticeDays: number | null = 3) =>
    partTime({ complementary: { percent, noticeDays } });

  it('40 % depends on the agreement, which may raise the cap to 60 %', () => {
    const finding = findingFor(pact(40), 'complementary_hours');
    expect(finding).toMatchObject({ status: 'depends_on_agreement', agreementMaySetOther: true });
    expect(finding.calculation[0]).toEqual(
      phrase('part_time.complementary_percent', { percent: 40, cap: 30, agreementMax: 60 }),
    );
    expect(offerPass([{ kind: 'single', finding }])).toBe(false);
  });

  it('70 % is over even what an agreement may set', () => {
    expect(findingFor(pact(70), 'complementary_hours')).toMatchObject({
      status: 'over_legal_limit',
      agreementMaySetOther: false,
    });
  });

  it('25 % with three days of notice is within the limits', () => {
    expect(findingFor(pact(25), 'complementary_hours').status).toBe('within_limit');
  });

  it('two days of notice depends on the agreement', () => {
    expect(findingFor(pact(25, 2), 'complementary_hours')).toMatchObject({
      status: 'depends_on_agreement',
      calculation: [
        phrase('part_time.complementary_percent', { percent: 25, cap: 30, agreementMax: 60 }),
        phrase('part_time.complementary_notice', { days: { integer: 2 }, minimum: { integer: 3 } }),
      ],
    });
  });

  it('a pact with eight hours a week is void (art. 12.5.b)', () => {
    const input = partTime(
      { complementary: { percent: 20, noticeDays: 3 } },
      { contractHours: { weekly: 8, annual: null } },
    );
    const finding = findingFor(input, 'complementary_hours');
    expect(finding.status).toBe('clause_void');
    expect(finding.calculation[0]).toEqual(
      phrase('part_time.complementary_under_10_hours', { hours: 8 }),
    );
  });

  it('counts the ten hours over the year when only yearly hours are known', () => {
    // 500 hours a year are 9.59 a week.
    const input = partTime(
      { complementary: { percent: 20, noticeDays: 3 } },
      { contractHours: { weekly: null, annual: 500 } },
    );
    expect(findingFor(input, 'complementary_hours').calculation[0]).toEqual(
      phrase('part_time.complementary_under_10_hours', { hours: 9.59 }),
    );
  });
});

describe('voluntary complementary hours (art. 12.5.g ET)', () => {
  const offered = (voluntaryPercent: number, rest: Partial<EmploymentInput> = {}) =>
    findingFor(partTime({ voluntaryPercent }, rest), 'voluntary_complementary');

  it('in an open-ended contract: 10 % within, 20 % depends on the agreement, 35 % over', () => {
    expect(offered(10).status).toBe('within_limit');
    expect(offered(20).status).toBe('depends_on_agreement');
    expect(offered(35).status).toBe('over_legal_limit');
  });

  it('in a fixed-term contract they are void', () => {
    expect(
      offered(10, {
        modality: 'production',
        startDate: parseDate('2026-01-01'),
        endDate: parseDate('2026-05-31'),
      }).status,
    ).toBe('clause_void');
  });

  it('with an unknown modality they are to review', () => {
    expect(offered(10, { modality: 'unknown' }).status).toBe('review_it');
  });
});
