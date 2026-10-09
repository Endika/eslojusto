import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import {
  assessNotice,
  noticeDaysGiven,
  overOneYear,
  requiredNoticeDays,
} from '../../../src/engine/household/notice';
import { countedAmount, highestAmount } from '../../../src/engine/household/review';
import { round2 } from '../../../src/engine/money';
import { desistimiento, household, single } from './input';
import { NORMS } from './norms-table';

const d = parseDate;
const DAILY = 21_000 / 365;
const START = d('2025-03-01');

const run = (noticeOn: string, lastDay: string, termination = {}) =>
  assessNotice(
    household({
      startDate: START,
      termination: desistimiento({
        noticeGivenOn: d(noticeOn),
        effectiveOn: d(lastDay),
        ...termination,
      }),
    }),
    NORMS,
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
  it('is within the law with the full 20 days after a year', () => {
    const [a] = run('2026-03-01', '2026-03-21');
    expect(a?.kind).toBe('single');
    expect(single(run('2026-03-01', '2026-03-21'), 'desistimiento_notice').status).toBe(
      'within_limit',
    );
  });

  it('is one day short with 19 days after a year, worth one day of salary', () => {
    const f = single(run('2026-03-01', '2026-03-20'), 'desistimiento_notice');
    expect(f.status).toBe('missing_requirement');
    expect(f.amount).toEqual({ min: round2(DAILY), max: round2(DAILY) });
  });

  it('is within the law with 7 days under a year, and 6 is a day short', () => {
    expect(single(run('2026-02-20', '2026-02-27'), 'desistimiento_notice').status).toBe(
      'within_limit',
    );
    const f = single(run('2026-02-20', '2026-02-26'), 'desistimiento_notice');
    expect(f.status).toBe('missing_requirement');
    expect(f.amount?.max).toBe(round2(DAILY));
  });

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
    const part = assessNotice(household({ weeklyHours: 20, termination: desistimiento() }), NORMS);
    expect(part).toHaveLength(1);
  });

  it('asks for the day of the notice, and does not apply to another termination', () => {
    const asked = assessNotice(
      household({ termination: desistimiento({ noticeGivenOn: null }) }),
      NORMS,
    );
    expect(single(asked, 'desistimiento_notice').status).toBe('not_entered');
    expect(
      assessNotice(household({ termination: desistimiento({ route: 'et_cause' }) }), NORMS),
    ).toEqual([]);
  });

  it('cannot put the missing days in euros without the salary', () => {
    const f = single(
      assessNotice(
        household({
          monthlyCash: null,
          termination: desistimiento({ noticeGivenOn: d('2026-09-10') }),
        }),
        NORMS,
      ),
      'desistimiento_notice',
    );
    expect(f.status).toBe('missing_requirement');
    expect(f.amount).toBeNull();
  });
});
