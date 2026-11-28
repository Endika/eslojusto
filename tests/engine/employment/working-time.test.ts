import { describe, expect, it } from 'vitest';
import { phrase } from '../../../src/engine/employment/calculation';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import { offerPass } from '../../../src/engine/employment/readings';
import { workWeek } from '../../../src/engine/employment/schedule';
import type {
  Assessed,
  EmploymentInput,
  Finding,
  ScheduleDay,
  Weekday,
} from '../../../src/engine/employment/types';
import {
  assessOvertimePact,
  assessWorkingTime,
  workingTimeNotes,
} from '../../../src/engine/employment/working-time';
import { contract } from './input';

const findings = (change: Partial<EmploymentInput>): Finding[] =>
  assessWorkingTime(contract(change), EMPLOYMENT_NORMS).map((a) => {
    if (a.kind !== 'single') throw new Error('expected single findings');
    return a.finding;
  });

const findingFor = (change: Partial<EmploymentInput>, id: Finding['id']): Finding => {
  const found = findings(change).find((f) => f.id === id);
  if (found === undefined) throw new Error(`no finding ${id}`);
  return found;
};

const every = (days: readonly Weekday[], ...slots: [string, string][]): ScheduleDay[] =>
  days.map((day) => ({ day, slots: slots.map(([from, to]) => ({ from, to })) }));

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

describe('weekly schedule geometry', () => {
  it('a 22:00-06:00 slot counts eight hours and leaves sixteen until the next night', () => {
    const week = workWeek(every([1, 2], ['22:00', '06:00']));
    expect(week.days.map((d) => [d.minutes / 60, d.nightMinutes / 60])).toEqual([
      [8, 8],
      [8, 8],
    ]);
    expect(week.rests[0]).toBe(16 * 60);
    expect(week.rests[1]).toBe((6 * 24 - 8) * 60);
  });

  it('two slots of one day are one working day with a break between them', () => {
    const week = workWeek(every([1], ['08:00', '13:00'], ['14:00', '19:00']));
    expect(week.days).toEqual([
      expect.objectContaining({ minutes: 600, longestStretch: 300, start: 480, end: 1140 }),
    ]);
  });

  it.each([
    ['12:10', 7 * 60],
    ['12:15', 4 * 60],
  ])('a second slot from %s: the longest stretch is %s minutes', (from, stretch) => {
    const week = workWeek(every([1], ['08:00', '12:00'], [from, '15:00']));
    expect(week.days[0]?.longestStretch).toBe(stretch);
  });

  it('the slots of a day are read in time order, whatever order they are given in', () => {
    const week = workWeek(every([1], ['14:00', '18:00'], ['08:00', '10:30'], ['11:00', '13:00']));
    expect(week.days[0]).toMatchObject({ start: 480, end: 1080, minutes: 4 * 60 + 150 + 120 });
  });

  it('the days are read in week order, whatever order they are given in', () => {
    const week = workWeek([...every([3], ['09:00', '17:00']), ...every([1], ['09:00', '17:00'])]);
    expect(week.days.map((d) => d.day)).toEqual([1, 3]);
    expect(week.rests).toEqual([40 * 60, (4 * 24 + 16) * 60]);
  });

  it('a slot ending where it starts runs the whole day', () => {
    expect(workWeek(every([1], ['09:00', '09:00'])).days[0]?.minutes).toBe(24 * 60);
  });

  it('the small hours belong to the night that began the day before', () => {
    expect(workWeek(every([2], ['02:00', '05:00'])).days[0]?.nightMinutes).toBe(180);
  });
});

describe('weekly hours (art. 34.1 ET)', () => {
  it('42 scheduled hours are to review: slots are presence, effective work is what counts', () => {
    const schedule = every([1, 2, 3, 4, 5, 6], ['09:00', '16:00']);
    const finding = findingFor({ schedule }, 'weekly_40');
    expect(finding).toMatchObject({
      status: 'review_it',
      calculation: [
        phrase('working_time.weekly_hours_scheduled', { hours: 42 }),
        phrase('working_time.time_worked_counts'),
      ],
    });
    expect(offerPass([{ kind: 'single', finding }])).toBe(false);
  });

  it('42 scheduled hours in rotating shifts are to review too', () => {
    const schedule = every([1, 2, 3, 4, 5, 6], ['09:00', '16:00']);
    expect(findingFor({ schedule, shifts: true }, 'weekly_40').status).toBe('review_it');
  });

  it.each([42, 60, 65, 72])(
    '%s agreed hours are to review against the special regimes, never a verdict',
    (weekly) => {
      const finding = findingFor(
        { schedule: null, contractHours: { weekly, annual: null } },
        'weekly_40',
      );
      expect(finding).toMatchObject({
        status: 'review_it',
        calculation: [
          phrase('working_time.weekly_hours_agreed', { hours: weekly }),
          phrase('working_time.special_regimes'),
        ],
      });
      expect(finding.sources.map((s) => s.id)).toEqual(['weekly_40', 'special_working_time']);
    },
  );

  it('a long week in an irregular distribution says so', () => {
    const schedule = every([1, 2, 3, 4, 5, 6], ['09:00', '16:00']);
    const finding = findingFor({ schedule, irregular: true }, 'weekly_40');
    expect(finding.status).toBe('review_it');
    expect(finding.calculation).toContainEqual(phrase('working_time.irregular_distribution'));
  });

  it('40 hours is within the limit', () => {
    const schedule = every(WEEKDAYS, ['08:00', '12:00'], ['13:00', '17:00']);
    expect(findingFor({ schedule }, 'weekly_40').status).toBe('within_limit');
  });
});

describe('weekly hours, exactly', () => {
  const schedule = every(WEEKDAYS, ['08:00', '12:00'], ['13:00', '17:00']);

  it('40 scheduled hours say so, and cite no special regime', () => {
    const finding = findingFor({ schedule }, 'weekly_40');
    expect(finding.calculation).toEqual([
      phrase('working_time.weekly_hours_scheduled', { hours: 40 }),
    ]);
    expect(finding.sources.map((s) => s.id)).toEqual(['weekly_40']);
  });

  it('40 agreed hours without a schedule are within the limit', () => {
    expect(
      findingFor({ schedule: null, contractHours: { weekly: 40, annual: null } }, 'weekly_40'),
    ).toMatchObject({
      status: 'within_limit',
      calculation: [phrase('working_time.weekly_hours_agreed', { hours: 40 })],
    });
  });

  it('a schedule of days without slots is no schedule', () => {
    expect(
      findings({
        schedule: [{ day: 1, slots: [] }],
        contractHours: { weekly: 38, annual: null },
      }).map((f) => f.id),
    ).toEqual(['weekly_40']);
  });
});

describe('daily hours, rests and breaks', () => {
  it('reports the longest day, the first one on a tie', () => {
    const schedule = [
      ...every([1], ['08:00', '16:00']),
      ...every([2, 3], ['08:00', '18:00']),
      ...every([4], ['08:00', '17:00']),
    ];
    expect(findingFor({ schedule }, 'daily_9').calculation).toEqual([
      phrase('working_time.longest_day', { day: { integer: 2 }, hours: 10 }),
    ]);
  });

  it('nine hours exactly is within the limit', () => {
    expect(findingFor({ schedule: every([1], ['08:00', '17:00']) }, 'daily_9').status).toBe(
      'within_limit',
    );
  });

  it('twelve hours between shifts exactly is within the rest', () => {
    const schedule = [...every([1], ['08:00', '16:00']), ...every([2], ['04:00', '12:00'])];
    const finding = findingFor({ schedule, shifts: true }, 'rest_12');
    expect(finding.status).toBe('within_limit');
    expect(finding.calculation).toEqual([phrase('working_time.shortest_rest', { hours: 12 })]);
    expect(finding.sources.map((s) => s.id)).toEqual(['rest_12']);
  });

  it('a weekly rest of 36 hours exactly is within the rest', () => {
    const schedule = every([1, 2, 3, 4, 5, 6], ['08:00', '20:00']);
    const finding = findingFor({ schedule }, 'weekly_rest_36');
    expect(finding.status).toBe('within_limit');
    expect(finding.calculation).toEqual([phrase('working_time.longest_rest', { hours: 36 })]);
    expect(finding.sources.map((s) => s.id)).toEqual(['weekly_rest_36']);
  });

  it('a short weekly rest cites the special regimes', () => {
    const schedule = every([1, 2, 3, 4, 5, 6, 7], ['08:00', '16:00']);
    expect(findingFor({ schedule }, 'weekly_rest_36').sources.map((s) => s.id)).toEqual([
      'weekly_rest_36',
      'special_working_time',
    ]);
  });

  it('the break is read against the longest stretch of any day', () => {
    const schedule = [...every([1], ['08:00', '15:00']), ...every([2], ['08:00', '12:00'])];
    expect(findingFor({ schedule }, 'break_15')).toMatchObject({
      status: 'missing_requirement',
      calculation: [phrase('working_time.longest_stretch', { hours: 7 })],
    });
  });

  it('a ten-hour day depends on the agreement', () => {
    const schedule = every([1], ['08:00', '13:00'], ['14:00', '19:00']);
    const finding = findingFor({ schedule }, 'daily_9');
    expect(finding).toMatchObject({
      status: 'depends_on_agreement',
      agreementMaySetOther: true,
      calculation: [phrase('working_time.longest_day', { day: { integer: 1 }, hours: 10 })],
    });
    expect(offerPass([{ kind: 'single', finding }])).toBe(false);
  });

  it('eleven hours between shifts is to review against the special regimes', () => {
    const schedule = [...every([1], ['14:00', '22:00']), ...every([2], ['09:00', '17:00'])];
    const finding = findingFor({ schedule, shifts: true }, 'rest_12');
    expect(finding.status).toBe('review_it');
    expect(finding.calculation).toEqual([
      phrase('working_time.shortest_rest', { hours: 11 }),
      phrase('working_time.special_regimes'),
    ]);
    expect(finding.sources.map((s) => s.id)).toEqual(['rest_12', 'special_working_time']);
  });

  it('a weekly rest of 24 hours is to review against the special regimes', () => {
    const schedule = [
      ...every([1, 2, 3, 4, 5, 6], ['08:00', '16:00']),
      ...every([7], ['16:00', '00:00']),
    ];
    const finding = findingFor({ schedule }, 'weekly_rest_36');
    expect(finding).toMatchObject({
      status: 'review_it',
      calculation: [
        phrase('working_time.longest_rest', { hours: 24 }),
        phrase('working_time.special_regimes'),
      ],
    });
  });

  it('a Monday-to-Friday week keeps both rests', () => {
    const schedule = every(WEEKDAYS, ['08:00', '12:00'], ['13:00', '17:00']);
    expect(findingFor({ schedule }, 'rest_12').status).toBe('within_limit');
    expect(findingFor({ schedule }, 'weekly_rest_36').status).toBe('within_limit');
    expect(findingFor({ schedule }, 'break_15').status).toBe('within_limit');
  });

  it('a continuous stretch over six hours misses the break', () => {
    const schedule = every(WEEKDAYS, ['08:00', '15:00']);
    expect(findingFor({ schedule }, 'break_15')).toMatchObject({
      status: 'missing_requirement',
      calculation: [phrase('working_time.longest_stretch', { hours: 7 })],
    });
  });

  it('no schedule, no schedule findings', () => {
    expect(findings({ schedule: null }).map((f) => f.id)).toEqual(['weekly_40']);
    expect(findings({ schedule: null, contractHours: { weekly: null, annual: 1700 } })).toEqual([]);
  });
});

describe('night work (art. 36.1 ET)', () => {
  const nights = every(WEEKDAYS, ['22:00', '07:00']);

  it('nine hours a night on average is to review for a night worker', () => {
    const finding = findingFor({ schedule: nights, nightWorker: true }, 'night_limits');
    expect(finding).toMatchObject({ status: 'review_it', basedOnYourAnswer: true });
    expect(finding.calculation).toContainEqual(phrase('working_time.night_average', { hours: 9 }));
  });

  it('an overtime pact for a night worker is to review', () => {
    const finding = findingFor(
      {
        schedule: null,
        nightWorker: true,
        overtimeAgreed: { hoursPerYear: 20, paidInMoney: null },
      },
      'night_limits',
    );
    expect(finding.calculation).toContainEqual(phrase('working_time.night_overtime'));
  });

  it('«No lo sé» with three night hours in the schedule checks the night limits', () => {
    const schedule = every(WEEKDAYS, ['22:00', '06:00']);
    expect(findingFor({ schedule, nightWorker: null }, 'night_limits')).toMatchObject({
      status: 'within_limit',
      basedOnYourAnswer: false,
      calculation: [phrase('working_time.night_hours_in_schedule', { days: { integer: 5 } })],
    });
  });

  it('a night worker by answer reads only the limits, with no note about the schedule', () => {
    const finding = findingFor({ schedule: nights, nightWorker: true }, 'night_limits');
    expect(finding.calculation).toEqual([
      phrase('working_time.night_average', { hours: 9 }),
      phrase('working_time.special_regimes'),
    ]);
    expect(finding.sources.map((s) => s.id)).toEqual(['night_limits', 'special_working_time']);
  });

  it('within the limits it cites no special regime', () => {
    const schedule = every(WEEKDAYS, ['22:00', '06:00']);
    expect(findingFor({ schedule, nightWorker: true }, 'night_limits')).toMatchObject({
      status: 'within_limit',
      calculation: [],
    });
    expect(
      findingFor({ schedule, nightWorker: true }, 'night_limits').sources.map((s) => s.id),
    ).toEqual(['night_limits']);
  });

  it('counts only the days with three night hours, three exactly included', () => {
    const schedule = [
      ...every([1], ['22:00', '01:00']),
      ...every([2], ['22:00', '00:59']),
      ...every([3], ['09:00', '17:00']),
    ];
    expect(findingFor({ schedule, nightWorker: null }, 'night_limits').calculation).toEqual([
      phrase('working_time.night_hours_in_schedule', { days: { integer: 1 } }),
    ]);
  });

  it('«No lo sé» without a schedule has no night finding, even with an overtime pact', () => {
    expect(
      findings({
        schedule: null,
        nightWorker: null,
        overtimeAgreed: { hoursPerYear: 20, paidInMoney: null },
      }).map((f) => f.id),
    ).not.toContain('night_limits');
  });

  it('a night worker with no schedule and nothing else to check has no finding', () => {
    expect(findings({ schedule: null, nightWorker: true }).map((f) => f.id)).not.toContain(
      'night_limits',
    );
  });

  it('not a night worker, no night finding', () => {
    expect(findings({ schedule: nights, nightWorker: false }).map((f) => f.id)).not.toContain(
      'night_limits',
    );
  });
});

describe('overtime pacts (art. 35 ET)', () => {
  const pact = (change: Partial<EmploymentInput>): Finding => {
    const assessed: Assessed | null = assessOvertimePact(contract(change), EMPLOYMENT_NORMS);
    if (assessed?.kind !== 'single') throw new Error('expected a single finding');
    return assessed.finding;
  };

  it('«as needed» is to review: art. 35.4 allows mandatory overtime within the cap', () => {
    const finding = pact({ overtimeAgreed: { hoursPerYear: 'as_needed', paidInMoney: true } });
    expect(finding).toMatchObject({ id: 'overtime_cap_80', status: 'review_it' });
    expect(offerPass([{ kind: 'single', finding }])).toBe(false);
  });

  it('«as needed» says its cap and cites the voluntary overtime', () => {
    const finding = pact({ overtimeAgreed: { hoursPerYear: 'as_needed', paidInMoney: true } });
    expect(finding.calculation).toEqual([phrase('working_time.overtime_as_needed', { cap: 80 })]);
    expect(finding.sources.map((s) => s.id)).toEqual(['overtime_cap_80', 'overtime_voluntary']);
  });

  it('exactly 80 hours a year is within the cap, and so is any number without a weekly figure', () => {
    const within = pact({ overtimeAgreed: { hoursPerYear: 80, paidInMoney: true } });
    expect(within).toMatchObject({
      status: 'within_limit',
      calculation: [phrase('working_time.overtime_hours', { hours: 80, cap: 80 })],
    });
    expect(within.sources.map((s) => s.id)).toEqual(['overtime_cap_80', 'overtime_voluntary']);
    expect(
      pact({
        contractHours: { weekly: null, annual: 1800 },
        overtimeAgreed: { hoursPerYear: 70, paidInMoney: true },
      }).status,
    ).toBe('within_limit');
  });

  it('100 hours a year paid in money is over the cap, 60 within it', () => {
    expect(pact({ overtimeAgreed: { hoursPerYear: 100, paidInMoney: true } }).status).toBe(
      'over_legal_limit',
    );
    expect(pact({ overtimeAgreed: { hoursPerYear: 60, paidInMoney: true } }).status).toBe(
      'within_limit',
    );
  });

  it.each([false, null])(
    '100 hours a year not known to be paid in money (%s) is to review: rested hours do not count',
    (paidInMoney) => {
      expect(pact({ overtimeAgreed: { hoursPerYear: 100, paidInMoney } })).toMatchObject({
        status: 'review_it',
        calculation: [
          phrase('working_time.overtime_hours', { hours: 100, cap: 80 }),
          phrase('working_time.overtime_rest_not_counted'),
        ],
      });
    },
  );

  it('the cap shrinks with a shorter working week', () => {
    // 30 of 40 hours: 60 hours a year.
    const finding = pact({
      contractHours: { weekly: 30, annual: null },
      overtimeAgreed: { hoursPerYear: 70, paidInMoney: true },
    });
    expect(finding).toMatchObject({
      status: 'over_legal_limit',
      calculation: [phrase('working_time.overtime_hours', { hours: 70, cap: 60 })],
    });
  });

  it.each([
    [
      'part-time',
      {
        partTime: {
          hoursStated: true,
          distributionStated: true,
          complementary: null,
          voluntaryPercent: null,
        },
      },
      'part_time_no_overtime',
    ],
    ['alternance training', { modality: 'training_alternance' }, 'training_alternance_no_overtime'],
    ['practice training', { modality: 'training_practice' }, 'training_practice_no_overtime'],
  ] as const)('a pact in %s is void', (_, change, id) => {
    const finding = pact({ ...change, overtimeAgreed: { hoursPerYear: 10, paidInMoney: null } });
    expect(finding).toMatchObject({ id, status: 'clause_void' });
    expect(finding.calculation).toEqual([
      phrase('working_time.overtime_not_allowed'),
      phrase('clause.partial_nullity'),
    ]);
    expect(finding.sources.map((s) => s.id)).toContain('partial_nullity');
  });

  it('no pact, no finding', () => {
    expect(assessOvertimePact(contract({ overtimeAgreed: null }), EMPLOYMENT_NORMS)).toBeNull();
  });
});

describe('working time notes', () => {
  it('always the daily record, and the monthly summary when part-time', () => {
    expect(workingTimeNotes(contract(), EMPLOYMENT_NORMS).map((n) => n.key)).toEqual([
      'working_time.time_record',
    ]);
    const partTime = {
      hoursStated: true,
      distributionStated: true,
      complementary: null,
      voluntaryPercent: null,
    };
    const notes = workingTimeNotes(contract({ partTime }), EMPLOYMENT_NORMS);
    expect(notes.map((n) => n.key)).toEqual([
      'working_time.time_record',
      'part_time.monthly_summary',
    ]);
    expect(notes[0]?.sources[0]?.inForceSince).toBe('2019-03-13');
    expect(notes[1]?.sources.map((source) => source.id)).toEqual(['part_time_record']);
  });
});
