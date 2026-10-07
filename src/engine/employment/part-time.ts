import { round2 } from '../money';
import { phrase, type EmploymentPhrase } from './calculation';
import { findingOf, single, type Verdict } from './finding';
import type { NormTable } from './norms';
import type { EmploymentRuleId } from './rules';
import { isOpenEnded } from './term';
import type { Assessed, EmploymentInput, Finding, FindingStatus, PartTime } from './types';

// Art. 12.5.b and g ET: complementary hours only with at least ten hours a week, counted over the year.
const MIN_WEEKLY_HOURS = 10;
const WEEKS_PER_YEAR = 365 / 7;
// Art. 12.5.c ET: agreed complementary hours up to 30 % of the ordinary ones; the agreement may
// set between 30 % and 60 %.
const AGREED_PERCENT = 30;
const AGREED_PERCENT_AGREEMENT_MAX = 60;
// Art. 12.5.d ET: three days' notice, unless the agreement sets less.
const NOTICE_DAYS = 3;
// Art. 12.5.g ET: voluntary complementary hours up to 15 %, up to 30 % by agreement.
const VOLUNTARY_PERCENT = 15;
const VOLUNTARY_PERCENT_AGREEMENT_MAX = 30;

const finding = (id: EmploymentRuleId, verdict: Verdict, norms: NormTable): Finding =>
  findingOf(id, 'part_time', norms, verdict);

const weeklyHours = (input: EmploymentInput): number | null => {
  const { weekly, annual } = input.contractHours;
  if (weekly !== null) return weekly;
  return annual === null ? null : annual / WEEKS_PER_YEAR;
};

// Art. 12.4.a ET: the hours and their distribution, or the contract is presumed full-time.
function contents(partTime: PartTime, norms: NormTable): Finding {
  const missing: EmploymentPhrase[] = [
    ...(partTime.hoursStated ? [] : [phrase('part_time.hours_missing')]),
    ...(partTime.distributionStated ? [] : [phrase('part_time.distribution_missing')]),
  ];
  return finding(
    'part_time_contents',
    missing.length === 0
      ? { status: 'within_limit' }
      : {
          status: 'missing_requirement',
          calculation: [...missing, phrase('part_time.full_time_presumed')],
        },
    norms,
  );
}

const SEVERITY: readonly FindingStatus[] = [
  'over_legal_limit',
  'depends_on_agreement',
  'within_limit',
];
const worst = (statuses: readonly FindingStatus[]): FindingStatus =>
  SEVERITY.find((s) => statuses.includes(s)) ?? 'within_limit';

// A cap the agreement may raise up to a hard maximum: over the hard one is over the legal limit,
// between them depends on the agreement.
const againstCap = (value: number, cap: number, agreementMax: number): FindingStatus => {
  if (value > agreementMax) return 'over_legal_limit';
  return value > cap ? 'depends_on_agreement' : 'within_limit';
};

// Art. 12.5 ET: the pact of complementary hours the company may require.
function complementary(
  input: EmploymentInput,
  partTime: PartTime,
  norms: NormTable,
): Finding | null {
  const pact = partTime.complementary;
  if (pact === null) return null;
  const weekly = weeklyHours(input);
  if (weekly !== null && weekly < MIN_WEEKLY_HOURS)
    return finding(
      'complementary_hours',
      {
        status: 'clause_void',
        calculation: [phrase('part_time.complementary_under_10_hours', { hours: round2(weekly) })],
      },
      norms,
    );
  const checks: { status: FindingStatus; says: EmploymentPhrase }[] = [
    {
      status: againstCap(pact.percent, AGREED_PERCENT, AGREED_PERCENT_AGREEMENT_MAX),
      says: phrase('part_time.complementary_percent', {
        percent: pact.percent,
        cap: AGREED_PERCENT,
        agreementMax: AGREED_PERCENT_AGREEMENT_MAX,
      }),
    },
  ];
  if (pact.noticeDays !== null)
    checks.push({
      status: pact.noticeDays < NOTICE_DAYS ? 'depends_on_agreement' : 'within_limit',
      says: phrase('part_time.complementary_notice', {
        days: { integer: pact.noticeDays },
        minimum: { integer: NOTICE_DAYS },
      }),
    });
  return finding(
    'complementary_hours',
    {
      status: worst(checks.map((c) => c.status)),
      calculation: checks.map((c) => c.says),
    },
    norms,
  );
}

// Art. 12.5.g ET: voluntary complementary hours, only in open-ended contracts of ten hours or more.
function voluntary(input: EmploymentInput, partTime: PartTime, norms: NormTable): Finding | null {
  const percent = partTime.voluntaryPercent;
  if (percent === null) return null;
  const says = phrase('part_time.voluntary_percent', {
    percent,
    cap: VOLUNTARY_PERCENT,
    agreementMax: VOLUNTARY_PERCENT_AGREEMENT_MAX,
  });
  if (input.modality === 'unknown')
    return finding(
      'voluntary_complementary',
      {
        status: 'review_it',
        calculation: [says, phrase('part_time.voluntary_needs_open_ended')],
      },
      norms,
    );
  if (!isOpenEnded(input.modality))
    return finding(
      'voluntary_complementary',
      {
        status: 'clause_void',
        calculation: [says, phrase('part_time.voluntary_needs_open_ended')],
      },
      norms,
    );
  const weekly = weeklyHours(input);
  if (weekly !== null && weekly < MIN_WEEKLY_HOURS)
    return finding(
      'voluntary_complementary',
      {
        status: 'clause_void',
        calculation: [
          says,
          phrase('part_time.complementary_under_10_hours', { hours: round2(weekly) }),
        ],
      },
      norms,
    );
  return finding(
    'voluntary_complementary',
    {
      status: againstCap(percent, VOLUNTARY_PERCENT, VOLUNTARY_PERCENT_AGREEMENT_MAX),
      calculation: [says],
    },
    norms,
  );
}

export function assessPartTime(input: EmploymentInput, norms: NormTable): readonly Assessed[] {
  const { partTime } = input;
  if (partTime === null) return [];
  return [
    contents(partTime, norms),
    complementary(input, partTime, norms),
    voluntary(input, partTime, norms),
  ]
    .filter((f): f is Finding => f !== null)
    .map(single);
}
