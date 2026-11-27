import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import {
  assessNotice,
  noticeDaysGiven,
  noticeShort,
  overOneYear,
  requiredNoticeDays,
} from '../../../src/engine/household/notice';
import { countedAmount, highestAmount } from '../../../src/engine/household/review';
import { round2 } from '../../../src/engine/money';
import type { HouseholdInput } from '../../../src/engine/household/types';
import { desistimiento, household, single, DEPS } from './input';
import { NORMS } from './norms-table';

const d = parseDate;
const DAILY = 21_000 / 365;
const START = d('2025-03-01');

const run = (
  noticeOn: string,
  lastDay: string,
  termination = {},
  change: Partial<HouseholdInput> = {},
) =>
  assessNotice(
    household({
      startDate: START,
      ...change,
      termination: desistimiento({
        noticeGivenOn: d(noticeOn),
        effectiveOn: d(lastDay),
        ...termination,
      }),
    }),
    NORMS,
    DEPS.minimumWage,
  );

describe('notice counted in calendar days (Código Civil 5.1 and 5.2)', () => {
  it('starts the day after the notice and counts rest days', () => {
    // Notice on a Friday, last day on the Sunday 20 days later.
    expect(noticeDaysGiven(d('2026-09-04'), d('2026-09-24'))).toBe(20);
    expect(noticeDaysGiven(d('2026-09-04'), d('2026-09-05'))).toBe(1);
    expect(noticeDaysGiven(d('2026-09-04'), d('2026-09-04'))).toBe(0);
  });

  it('counts across a month and a year end', () => {
    expect(noticeDaysGiven(d('2026-12-20'), d('2027-01-09'))).toBe(20);
  });
});

describe('seven days up to a year of service, twenty after it', () => {
  it('is seven the day the first year ends and twenty the day after', () => {
    // Service from 01-03-2025: the first year ends on 28-02-2026.
    expect(overOneYear(START, d('2026-02-28'))).toBe(false);
    expect(overOneYear(START, d('2026-03-01'))).toBe(true);
    expect(requiredNoticeDays(START, d('2026-02-28'))).toBe(7);
    expect(requiredNoticeDays(START, d('2026-03-01'))).toBe(20);
  });

  it('keeps seven for a worker of a few months', () => {
    expect(requiredNoticeDays(START, d('2025-04-01'))).toBe(7);
  });

  it('follows a start on 29 February to the 28th of the following year', () => {
    expect(overOneYear(d('2024-02-29'), d('2025-02-27'))).toBe(false);
    expect(overOneYear(d('2024-02-29'), d('2025-02-28'))).toBe(true);
  });
});

describe('the notice finding', () => {
  it('shows two readings when the first year ends during the notice', () => {
    // Notice on the last day of the first year with 7 days: 7 if the year is counted then,
    // 20 if it is counted when the service ends on 07-03-2026.
    const [a] = run('2026-02-28', '2026-03-07');
    expect(a?.kind).toBe('readings');
    if (a?.kind !== 'readings') return;
    expect(a.question).toBe('notice_service_date');
    expect(a.readings.map((r) => [r.when, r.finding.status])).toEqual([
      ['measured_at_notice', 'within_limit'],
      ['measured_at_termination', 'missing_requirement'],
    ]);
    expect(countedAmount(a)).toBe(0);
    expect(highestAmount(a)).toBe(round2(13 * DAILY));
  });

  it('takes the salary of the missing days as the substitute, minus what was paid', () => {
    expect(
      single(
        run('2026-03-01', '2026-03-10', { substitutePaid: round2(11 * DAILY) }),
        'desistimiento_notice',
      ).status,
    ).toBe('within_limit');
    const short = single(
      run('2026-03-01', '2026-03-10', { substitutePaid: 100 }),
      'desistimiento_notice',
    );
    expect(short.status).toBe('missing_requirement');
    expect(short.amount?.max).toBe(round2(11 * DAILY - 100));
  });

  it('cites art. 11.2 and the Código Civil', () => {
    const f = single(run('2026-03-01', '2026-03-10'), 'desistimiento_notice');
    expect(f.sources.map((s) => s.citation.split(' (')[0])).toEqual([
      'Real Decreto 1620/2011, art. 11.2',
      'Código Civil, arts. 5.1 y 5.2',
    ]);
  });

  it('adds the six paid hours a week for a full-time worker during the notice', () => {
    const items = run('2026-03-01', '2026-03-21');
    expect(items.map((a) => (a.kind === 'single' ? a.finding.id : ''))).toEqual([
      'desistimiento_notice',
      'desistimiento_leave',
    ]);
    const part = assessNotice(
      household({ weeklyHours: 20, termination: desistimiento() }),
      NORMS,
      DEPS.minimumWage,
    );
    expect(part).toHaveLength(1);
  });

  it('asks for the day of the notice, and does not apply to another termination', () => {
    const asked = assessNotice(
      household({ termination: desistimiento({ noticeGivenOn: null }) }),
      NORMS,
      DEPS.minimumWage,
    );
    expect(single(asked, 'desistimiento_notice').status).toBe('not_entered');
    expect(
      assessNotice(
        household({ termination: desistimiento({ route: 'et_cause' }) }),
        NORMS,
        DEPS.minimumWage,
      ),
    ).toEqual([]);
  });
});

const days = (required: number, given: number, missing: number) => ({
  key: 'notice.days',
  vars: { required, given, missing },
});
const substitute = (missing: number, daily: number, amount: number) => ({
  key: 'notice.substitute',
  vars: { missing, daily: { euros: daily }, amount: { euros: amount } },
});
const LEAVE = { key: 'notice.leave', vars: { hours: 6 } };

describe('what the notice finding shows', () => {
  it.each<
    [
      string,
      [string, string],
      Partial<HouseholdInput['termination'] & object>,
      Partial<HouseholdInput>,
      { status: string; calculation: object[]; basedOnYourAnswer: boolean },
    ]
  >([
    [
      'the full notice',
      ['2026-03-01', '2026-03-21'],
      {},
      {},
      { status: 'within_limit', calculation: [days(20, 20, 0)], basedOnYourAnswer: false },
    ],
    [
      'the days missing, with part of the substitute paid',
      ['2026-03-01', '2026-03-10'],
      { substitutePaid: 100 },
      {},
      {
        status: 'missing_requirement',
        calculation: [
          days(20, 9, 11),
          substitute(11, 57.53, 632.88),
          {
            key: 'notice.substitute_short',
            vars: { paid: { euros: 100 }, difference: { euros: 532.88 } },
          },
        ],
        basedOnYourAnswer: true,
      },
    ],
    [
      'the days missing, with the substitute paid',
      ['2026-03-01', '2026-03-10'],
      { substitutePaid: 633 },
      {},
      {
        status: 'within_limit',
        calculation: [
          days(20, 9, 11),
          substitute(11, 57.53, 632.88),
          { key: 'notice.substitute_paid', vars: { paid: { euros: 633 } } },
        ],
        basedOnYourAnswer: true,
      },
    ],
    [
      'the days missing, with no salary to put them in euros',
      ['2026-03-01', '2026-03-10'],
      {},
      { monthlyCash: null },
      {
        status: 'missing_requirement',
        calculation: [days(20, 9, 11), { key: 'notice.salary_unknown' }],
        basedOnYourAnswer: false,
      },
    ],
    [
      'the days missing, with a salary raised to the minimum wage',
      ['2026-03-01', '2026-03-10'],
      {},
      { monthlyCash: 1000, extraPays: null },
      {
        status: 'missing_requirement',
        calculation: [days(20, 9, 11), { key: 'base.minimum_wage' }, substitute(11, 46.83, 515.16)],
        basedOnYourAnswer: true,
      },
    ],
  ])('%s', (_name, [noticeOn, lastDay], termination, change, expected) => {
    const f = single(run(noticeOn, lastDay, termination, change), 'desistimiento_notice');
    expect(f).toMatchObject(expected);
    expect(f.item).toBe('notice');
    expect(f.sources).toHaveLength(2);
  });

  it('shows what each reading rests on when they differ', () => {
    const [a] = run('2026-02-28', '2026-03-07');
    if (a?.kind !== 'readings') throw new Error('expected two readings');
    expect(a.readings.map((r) => r.finding.calculation)).toEqual([
      [days(7, 7, 0)],
      [days(20, 7, 13), substitute(13, 57.53, 747.95)],
    ]);
    expect(a.readings.map((r) => r.finding.basedOnYourAnswer)).toEqual([false, true]);
  });
});

describe('the paid hours to look for work', () => {
  it.each([
    ['a full-time worker', 40, '2026-03-21', true],
    ['a notice given on the last day', 40, '2026-03-01', false],
  ])('go to %s: %s', (_name, weeklyHours, lastDay, given) => {
    const items = run('2026-03-01', lastDay, {}, { weeklyHours });
    const leave = items.filter(
      (a) => a.kind === 'single' && a.finding.id === 'desistimiento_leave',
    );
    expect(leave.length).toBe(given ? 1 : 0);
    if (given) expect(single(items, 'desistimiento_leave').calculation).toEqual([LEAVE]);
  });
});

describe('a notice that is short', () => {
  const short = (change: Partial<HouseholdInput['termination'] & object>, noTermination = false) =>
    noticeShort(
      household({
        startDate: START,
        termination: noTermination ? null : desistimiento({ ...change }),
      }),
    );

  it.each([
    [
      'a desistimiento with 19 days after a year',
      { noticeGivenOn: d('2026-03-01'), effectiveOn: d('2026-03-20') },
      true,
    ],
    [
      'a desistimiento with the full 20 days',
      { noticeGivenOn: d('2026-03-01'), effectiveOn: d('2026-03-21') },
      false,
    ],
    ['no day of notice', { noticeGivenOn: null }, false],
    [
      'another cause of termination',
      { route: 'et_cause', noticeGivenOn: d('2026-03-01'), effectiveOn: d('2026-03-05') },
      false,
    ],
  ] as const)('is told for %s', (_name, change, expected) => {
    expect(short(change)).toBe(expected);
  });

  it('is not there without a termination', () => {
    expect(short({}, true)).toBe(false);
  });
});
