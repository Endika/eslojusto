import type { NormSource } from '../law/sources';
import { round2 } from '../money';
import { phrase, type EmploymentPhrase, type EmploymentPhraseKey } from './calculation';
import { findingsFor, single } from './finding';
import type { NormTable } from './norms';
import { ruleSource, type EmploymentRuleId } from './rules';
import { workWeek, type WorkWeek } from './schedule';
import type { Assessed, EmploymentInput, Finding } from './types';

// Art. 34.1 ET: forty hours a week of effective work on average over the year.
const WEEKLY_MAX_HOURS = 40;
// Art. 34.3 ET: nine ordinary hours a day, unless an agreement distributes them otherwise…
const DAILY_MAX_MINUTES = 9 * 60;
// …and twelve hours between the end of one day and the start of the next.
const REST_BETWEEN_DAYS_MINUTES = 12 * 60;
// Art. 37.1 ET: a day and a half of uninterrupted weekly rest.
const WEEKLY_REST_MINUTES = 36 * 60;
// Art. 34.4 ET: a break once a continuous day goes over six hours.
const CONTINUOUS_MAX_MINUTES = 6 * 60;
// Art. 36.1 ET: a night worker does at least three hours of the daily work at night, and works
// eight hours a day on average.
const NIGHT_WORKER_MINUTES = 3 * 60;
const NIGHT_AVERAGE_MAX_MINUTES = 8 * 60;
// Art. 35.2 ET: eighty hours of overtime a year, reduced in proportion for a shorter working year.
const OVERTIME_MAX_HOURS = 80;

const hours = (minutes: number): number => round2(minutes / 60);

const finding = findingsFor('working_time');

// Over forty hours is never a sure verdict here. Agreed hours may be lawful under a special regime
// whose sector we do not know (RD 1561/1995, arts. 5.2, 8, 10 bis and 20, which sets no figure);
// scheduled hours are presence, which breaks of art. 34.4 ET, rotating shifts or an irregular
// distribution may bring down to forty hours of effective work.
function weeklyHours(
  input: EmploymentInput,
  week: WorkWeek | null,
  norms: NormTable,
): Finding | null {
  const agreed = input.contractHours.weekly;
  const scheduled = week === null ? null : hours(week.minutes);
  if (agreed !== null && agreed > WEEKLY_MAX_HOURS)
    return finding(
      'weekly_40',
      {
        status: 'review_it',
        calculation: [
          phrase('working_time.weekly_hours_agreed', { hours: agreed }),
          phrase('working_time.special_regimes'),
        ],
        alsoCites: ['special_working_time'],
      },
      norms,
    );
  if (scheduled !== null && scheduled > WEEKLY_MAX_HOURS)
    return finding(
      'weekly_40',
      {
        status: 'review_it',
        calculation: [
          phrase('working_time.weekly_hours_scheduled', { hours: scheduled }),
          phrase('working_time.time_worked_counts'),
          ...(input.irregular ? [phrase('working_time.irregular_distribution')] : []),
        ],
      },
      norms,
    );
  if (scheduled !== null)
    return finding(
      'weekly_40',
      {
        status: 'within_limit',
        calculation: [phrase('working_time.weekly_hours_scheduled', { hours: scheduled })],
      },
      norms,
    );
  if (agreed !== null)
    return finding(
      'weekly_40',
      {
        status: 'within_limit',
        calculation: [phrase('working_time.weekly_hours_agreed', { hours: agreed })],
      },
      norms,
    );
  return null;
}

function longestDay(week: WorkWeek, norms: NormTable): Finding {
  const longest = week.days.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  const over = longest.minutes > DAILY_MAX_MINUTES;
  return finding(
    'daily_9',
    {
      status: over ? 'depends_on_agreement' : 'within_limit',
      calculation: [
        phrase('working_time.longest_day', {
          day: { integer: longest.day },
          hours: hours(longest.minutes),
        }),
      ],
    },
    norms,
  );
}

// Some activities and shift changes may shorten these rests with compensation (RD 1561/1995), so
// a shorter one is to review, never a verdict.
const SPECIAL_REGIMES = phrase('working_time.special_regimes');

function restBetweenDays(week: WorkWeek, norms: NormTable): Finding {
  const shortest = Math.min(...week.rests);
  const short = shortest < REST_BETWEEN_DAYS_MINUTES;
  return finding(
    'rest_12',
    {
      status: short ? 'review_it' : 'within_limit',
      calculation: [
        phrase('working_time.shortest_rest', { hours: hours(shortest) }),
        ...(short ? [SPECIAL_REGIMES] : []),
      ],
      alsoCites: short ? ['special_working_time'] : [],
    },
    norms,
  );
}

// The schedule repeats every week, so the longest rest of one week is the longest of any fourteen days.
function weeklyRest(week: WorkWeek, norms: NormTable): Finding {
  const longest = Math.max(...week.rests);
  const short = longest < WEEKLY_REST_MINUTES;
  return finding(
    'weekly_rest_36',
    {
      status: short ? 'review_it' : 'within_limit',
      calculation: [
        phrase('working_time.longest_rest', { hours: hours(longest) }),
        ...(short ? [SPECIAL_REGIMES] : []),
      ],
      alsoCites: short ? ['special_working_time'] : [],
    },
    norms,
  );
}

// The schedule may not show the break, so a long stretch is what the contract should state.
function breakInLongStretch(week: WorkWeek, norms: NormTable): Finding {
  const longest = Math.max(...week.days.map((d) => d.longestStretch));
  return finding(
    'break_15',
    {
      status: longest > CONTINUOUS_MAX_MINUTES ? 'missing_requirement' : 'within_limit',
      calculation: [phrase('working_time.longest_stretch', { hours: hours(longest) })],
    },
    norms,
  );
}

// Art. 36.1 ET for night workers: the person's answer, or a schedule with three night hours a day.
// Both limits have exceptions in RD 1561/1995 (art. 32) and «eight hours a day on average» can be
// counted over working or calendar days, so night findings are to review.
function nightWork(
  input: EmploymentInput,
  week: WorkWeek | null,
  norms: NormTable,
): Finding | null {
  if (input.nightWorker === false) return null;
  const nightDays = week?.days.filter((d) => d.nightMinutes >= NIGHT_WORKER_MINUTES) ?? [];
  const byAnswer = input.nightWorker === true;
  if (!byAnswer && nightDays.length === 0) return null;
  const notes: EmploymentPhrase[] = [];
  if (!byAnswer)
    notes.push(
      phrase('working_time.night_hours_in_schedule', { days: { integer: nightDays.length } }),
    );
  const issues: EmploymentPhrase[] = [];
  if (week !== null && week.days.length > 0) {
    const average = week.minutes / week.days.length;
    if (average > NIGHT_AVERAGE_MAX_MINUTES)
      issues.push(phrase('working_time.night_average', { hours: hours(average) }));
  }
  if (input.overtimeAgreed !== null) issues.push(phrase('working_time.night_overtime'));
  if (issues.length === 0 && week === null) return null;
  return finding(
    'night_limits',
    {
      status: issues.length > 0 ? 'review_it' : 'within_limit',
      calculation: [...notes, ...issues, ...(issues.length > 0 ? [SPECIAL_REGIMES] : [])],
      alsoCites: issues.length > 0 ? ['special_working_time'] : [],
      basedOnYourAnswer: byAnswer,
    },
    norms,
  );
}

// Who may not work overtime at all: part-time (art. 12.4.c), alternance training (art. 11.2.k)
// and practice training (art. 11.3.h), all save art. 35.3.
function noOvertimeRule(input: EmploymentInput): EmploymentRuleId | null {
  if (input.partTime !== null) return 'part_time_no_overtime';
  if (input.modality === 'training_alternance') return 'training_alternance_no_overtime';
  if (input.modality === 'training_practice') return 'training_practice_no_overtime';
  return null;
}

// The rule an overtime pact is checked against, or null without one.
export function overtimePactRule(input: EmploymentInput): EmploymentRuleId | null {
  if (input.overtimeAgreed === null) return null;
  return noOvertimeRule(input) ?? 'overtime_cap_80';
}

// The overtime the contract makes compulsory, which art. 35.4 ET allows «dentro de los límites del
// apartado 2». Art. 35.2 ET does not count hours compensated with rest within four months, so only
// hours paid in money can be over its cap for sure.
export function assessOvertimePact(input: EmploymentInput, norms: NormTable): Assessed | null {
  const pact = input.overtimeAgreed;
  if (pact === null) return null;
  const banned = noOvertimeRule(input);
  if (banned !== null)
    return single(
      finding(
        banned,
        { status: 'clause_void', calculation: [phrase('working_time.overtime_not_allowed')] },
        norms,
      ),
    );
  if (pact.hoursPerYear === 'as_needed')
    return single(
      finding(
        'overtime_cap_80',
        {
          status: 'review_it',
          calculation: [phrase('working_time.overtime_as_needed', { cap: OVERTIME_MAX_HOURS })],
          alsoCites: ['overtime_voluntary'],
        },
        norms,
      ),
    );
  const weekly = input.contractHours.weekly;
  const fullTime = input.fullTimeHours ?? WEEKLY_MAX_HOURS;
  const share = weekly === null ? 1 : Math.min(1, weekly / fullTime);
  const cap = round2(OVERTIME_MAX_HOURS * share);
  const over = pact.hoursPerYear > cap;
  const sure = over && pact.paidInMoney === true;
  return single(
    finding(
      'overtime_cap_80',
      {
        status: sure ? 'over_legal_limit' : over ? 'review_it' : 'within_limit',
        calculation: [
          phrase('working_time.overtime_hours', { hours: pact.hoursPerYear, cap }),
          ...(over && !sure ? [phrase('working_time.overtime_rest_not_counted')] : []),
        ],
        alsoCites: ['overtime_voluntary'],
      },
      norms,
    ),
  );
}

// Working hours, rests and night work from the weekly schedule, and the overtime pact.
export function assessWorkingTime(input: EmploymentInput, norms: NormTable): readonly Assessed[] {
  const week = input.schedule === null ? null : workWeek(input.schedule);
  const scheduled = week !== null && week.days.length > 0 ? week : null;
  const findings: (Finding | null)[] = [
    weeklyHours(input, scheduled, norms),
    ...(scheduled === null
      ? []
      : [
          longestDay(scheduled, norms),
          restBetweenDays(scheduled, norms),
          weeklyRest(scheduled, norms),
          breakInLongStretch(scheduled, norms),
        ]),
    nightWork(input, scheduled, norms),
  ];
  const overtime = assessOvertimePact(input, norms);
  return [
    ...findings.filter((f): f is Finding => f !== null).map(single),
    ...(overtime === null ? [] : [overtime]),
  ];
}

// Shown with the working time, with no verdict.
export interface WorkingTimeNote {
  readonly key: EmploymentPhraseKey;
  readonly sources: readonly NormSource[];
}

// The daily time record (art. 34.9 ET) and, part-time, the monthly summary with the payslip
// (art. 12.4.c ET).
export function workingTimeNotes(
  input: EmploymentInput,
  norms: NormTable,
): readonly WorkingTimeNote[] {
  const note = (key: EmploymentPhraseKey, rule: EmploymentRuleId): WorkingTimeNote => ({
    key,
    sources: [ruleSource(rule, norms)],
  });
  return [
    note('working_time.time_record', 'time_record'),
    ...(input.partTime === null ? [] : [note('part_time.monthly_summary', 'part_time_record')]),
  ];
}
