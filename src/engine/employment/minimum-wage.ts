import { calendarDays, compareDates, daysInYear, max, min, toIso, type CivilDate } from '../date';
import type { Figure } from '../calculation';
import type { NormSource } from '../law/sources';
import { exact, round2 } from '../money';
import { annualSalary, DEFAULT_WORK_WEEK, minimumHolidays } from '../settlement';
import { phrase, type EmploymentPhrase } from './calculation';
import type { EmploymentNormId, NormTable } from './norms';
import { assessAcross } from './readings';
import { ruleSource, type EmploymentRuleId } from './rules';
import {
  READINGS,
  type Assessed,
  type EmploymentInput,
  type Finding,
  type FindingStatus,
  type ReadingCode,
  type Salary,
  type SalaryComponentKind,
} from './types';

// One year of the minimum wage, as fixed by that year's royal decree.
export interface MinimumWageRow {
  readonly year: number;
  readonly norm: EmploymentNormId;
  readonly url: string;
  // Day the decree came out in the BOE.
  readonly publishedOn: string;
  // The calendar year the amounts have effects for (disposición final 3.ª of each decree).
  readonly effectsFrom: string;
  readonly effectsUntil: string;
  // True only once the BOE text was read to pay the amounts from 1 January even though the decree
  // came out later; false sends payslips before `publishedOn` to review.
  readonly retroactiveVerified: boolean;
  // Art. 1: per month with fourteen payments, and per day.
  readonly monthly: number;
  readonly daily: number;
  // Art. 3.1: the yearly floor of comparison.
  readonly annual: number;
  // Art. 4.1: per legal working day for fixed-term contracts of up to 120 days.
  readonly temporaryPerDay: number;
  // Art. 4.2: household employees paid by the hour; kept for completeness, household work is out of scope.
  readonly householdPerHour: number;
}

export type MinimumWageTable = readonly MinimumWageRow[];

export type MinimumWageLookup =
  | { readonly kind: 'published'; readonly row: MinimumWageRow }
  // A year after the last decree loaded: its amount is unknown, the latest year is only a reference.
  | { readonly kind: 'not_published'; readonly year: number; readonly reference: MinimumWageRow }
  // A year before the first one loaded.
  | { readonly kind: 'not_loaded'; readonly year: number };

export function minimumWageFor(year: number, table: MinimumWageTable): MinimumWageLookup {
  const row = table.find((r) => r.year === year);
  if (row !== undefined) return { kind: 'published', row };
  const latest = table.reduce<MinimumWageRow | null>(
    (last, r) => (last === null || r.year > last.year ? r : last),
    null,
  );
  if (latest !== null && year > latest.year) {
    return { kind: 'not_published', year, reference: latest };
  }
  return { kind: 'not_loaded', year };
}

// The comparison itself (art. 27 ET and each year's decree): the contract year by year, each whole
// payslip month without incidents, the share of pay in kind and, as the person's own figure, the
// agreement's category salary.

// Art. 34.1 ET: the legal maximum week stands for full time when no agreement week is given.
const LEGAL_WEEK = 40;
// Art. 26.1 ET: pay in kind never over thirty per cent of salary.
const IN_KIND_CAP = 0.3;
// Art. 4.1 of each decree: fixed-term services of up to 120 days to one company.
const SHORT_TEMPORARY_DAYS = 120;
const MONTHS_IN_YEAR = 12;
// Rounding allowance when matching amounts read from a payslip.
const CENT = 0.01;
// A day rate is carried to a year over every calendar day, an hour rate over 52 weeks; both are
// stated with the result.
const DAYS_FOR_DAY_RATE = 365;
const WEEKS_FOR_HOUR_RATE = 52;
// Art. 37.2 ET: at most fourteen paid public holidays a year.
const PUBLIC_HOLIDAYS = 14;
// Yearly effective hours leave out paid rest: thirty calendar days of holidays (art. 38.1 ET), as
// working days of a five-day week, and the public holidays. Used only as a labelled reading.
const PAID_REST_WORKING_DAYS = minimumHolidays('working') + PUBLIC_HOLIDAYS;
const WORKING_DAYS_IN_YEAR = WEEKS_FOR_HOUR_RATE * DEFAULT_WORK_WEEK;

export interface MinimumWageDeps {
  readonly norms: NormTable;
  readonly minimumWage: MinimumWageTable;
}

type ComplementWorld = ReadingCode<'complement_kind'>;
type HoursWorld = ReadingCode<'paid_hours'>;

// One answer to each doubt about the pay.
export interface PayWorld {
  readonly complement: ComplementWorld;
  readonly hours: HoursWorld;
}

// The reading most favourable to the pay: a shortfall in it holds in every reading.
const FAVOURABLE: PayWorld = { complement: 'complement_fixed', hours: 'with_paid_rest' };

// Base pay and fixed complements always count. Whether a complement marked variable or unknown can
// be compared with the minimum wage is not settled in the law itself, so it opens two readings.
const COUNTED: Readonly<Record<ComplementWorld, ReadonlySet<SalaryComponentKind>>> = {
  complement_fixed: new Set(['base', 'fixed_complement', 'variable', 'unknown']),
  complement_variable: new Set(['base', 'fixed_complement']),
};

const euros = (n: number): Figure => ({ euros: round2(n) });
const integer = (n: number): Figure => ({ integer: n });

// What a breakdown leaves of the total unexplained.
const breakdownGap = (salary: Salary): number =>
  salary.breakdown.length === 0
    ? 0
    : Math.max(0, round2(salary.amount - salary.breakdown.reduce((t, c) => t + c.amount, 0)));

// Money per salary period that counts in one world. A breakdown, when given, replaces the total,
// and the part of the total it leaves unexplained is a complement of unknown kind.
function periodPay(salary: Salary, world: ComplementWorld): { counted: number; excluded: number } {
  if (salary.breakdown.length === 0) return { counted: salary.amount, excluded: 0 };
  const components = [
    ...salary.breakdown,
    { kind: 'unknown' as const, amount: breakdownGap(salary) },
  ];
  const sum = (counted: boolean) =>
    components
      .filter((c) => COUNTED[world].has(c.kind) === counted)
      .reduce((total, c) => total + c.amount, 0);
  return { counted: sum(true), excluded: sum(false) };
}

const complementInDoubt = (salary: Salary): boolean =>
  breakdownGap(salary) > 0 ||
  salary.breakdown.some((c) => !COUNTED.complement_variable.has(c.kind));

// An hour rate with only yearly hours: those may be effective hours, without the paid rest.
const hoursInDoubt = (input: EmploymentInput): boolean =>
  input.salary.period === 'hour' &&
  input.contractHours.weekly === null &&
  input.contractHours.annual !== null;

const extraPaysOf = (salary: Salary): number => Math.max(0, salary.payments - MONTHS_IN_YEAR);

interface AnnualPay {
  readonly annual: number;
  // A day or hour rate with extra payments of unknown size: `annual` leaves them out.
  readonly extraPaysUnknown: boolean;
  readonly how: EmploymentPhrase;
}

// The contract's money carried to a year; null for an hour rate without its hours.
function annualPay(input: EmploymentInput, rate: number, hoursWorld: HoursWorld): AnnualPay | null {
  const { salary } = input;
  const extraPays = extraPaysOf(salary);
  const extraPaysUnknown = !salary.prorated && extraPays > 0;
  switch (salary.period) {
    case 'year':
      return {
        annual: rate,
        extraPaysUnknown: false,
        how: phrase('minimum_wage.pay.year', { annual: euros(rate) }),
      };
    case 'month': {
      // Each extra payment is taken as one month's pay.
      const annual = annualSalary({
        monthlySalary: rate,
        extraPayProrated: salary.prorated,
        extraPayCount: extraPays,
        extraPayAmount: rate,
      });
      const how = salary.prorated
        ? phrase('minimum_wage.pay.month_prorated', { monthly: euros(rate), annual: euros(annual) })
        : phrase('minimum_wage.pay.month', {
            monthly: euros(rate),
            payments: integer(MONTHS_IN_YEAR + extraPays),
            annual: euros(annual),
          });
      return { annual, extraPaysUnknown: false, how };
    }
    case 'day': {
      const annual = rate * DAYS_FOR_DAY_RATE;
      const how = phrase('minimum_wage.pay.day', {
        daily: euros(rate),
        days: { days: DAYS_FOR_DAY_RATE },
        annual: euros(annual),
      });
      return { annual, extraPaysUnknown, how };
    }
    case 'hour': {
      const { annual: hours, weekly } = input.contractHours;
      // A week is carried over 52 weeks, as the decree's full-time year is.
      if (weekly !== null) {
        const annual = rate * weekly * WEEKS_FOR_HOUR_RATE;
        const how = phrase('minimum_wage.pay.hour_weekly', {
          hourly: euros(rate),
          weekly,
          weeks: integer(WEEKS_FOR_HOUR_RATE),
          annual: euros(annual),
        });
        return { annual, extraPaysUnknown, how };
      }
      if (hours === null) return null;
      if (hoursWorld === 'effective_hours') {
        const annual = rate * hours;
        const how = phrase('minimum_wage.pay.hour', {
          hourly: euros(rate),
          hours,
          annual: euros(annual),
        });
        return { annual, extraPaysUnknown, how };
      }
      const paidHours = round2(
        (hours * WORKING_DAYS_IN_YEAR) / (WORKING_DAYS_IN_YEAR - PAID_REST_WORKING_DAYS),
      );
      const annual = rate * paidHours;
      const how = phrase('minimum_wage.pay.hour_with_paid_rest', {
        hourly: euros(rate),
        hours,
        restDays: { days: PAID_REST_WORKING_DAYS },
        paidHours,
        annual: euros(annual),
      });
      return { annual, extraPaysUnknown, how };
    }
  }
}

// The contract's money carried to a year when no reading is in doubt: null for an hour rate with
// only yearly hours or without hours, for extra payments of unknown size, and when the payments and
// the extra pays answer contradict each other. Unprorated extra pays of a monthly salary are taken
// as a whole month only when nothing but base pay is stated: many agreements pay them on base
// salary alone (art. 31 ET leaves their amount to the agreement).
export function contractAnnualPay(input: EmploymentInput): number | null {
  const { salary, extraPays } = input;
  if (hoursInDoubt(input)) return null;
  if (
    extraPays !== null &&
    (extraPays.count !== extraPaysOf(salary) || extraPays.prorated !== salary.prorated)
  )
    return null;
  const onlyBase = breakdownGap(salary) === 0 && salary.breakdown.every((c) => c.kind === 'base');
  if (salary.period === 'month' && !salary.prorated && extraPaysOf(salary) > 0 && !onlyBase)
    return null;
  const pay = annualPay(input, salary.amount, 'effective_hours');
  return pay === null || pay.extraPaysUnknown ? null : round2(pay.annual);
}

// Art. 1 of each decree and art. 12.1 ET: a shorter working time earns the minimum pro rata to the
// agreement's full time, else to the legal 40 hours; a longer one never raises it. Null if unknown.
export function partTimeCoefficient(input: EmploymentInput): number | null {
  const { weekly, annual } = input.contractHours;
  if (weekly !== null) return Math.min(1, weekly / (input.fullTimeHours ?? LEGAL_WEEK));
  const fullYear = input.agreement.annualHours;
  if (annual !== null && fullYear !== null) return Math.min(1, annual / fullYear);
  return null;
}

function prorataPhrases(input: EmploymentInput, coefficient: number | null): EmploymentPhrase[] {
  if (coefficient === null || coefficient >= 1) return [];
  const { weekly, annual } = input.contractHours;
  if (weekly === null) {
    return [
      phrase('minimum_wage.prorata_annual', {
        hours: annual ?? 0,
        fullTime: input.agreement.annualHours ?? 0,
        coefficient,
      }),
    ];
  }
  const prorata = phrase('minimum_wage.prorata', {
    hours: weekly,
    fullTime: input.fullTimeHours ?? LEGAL_WEEK,
    coefficient,
  });
  // A shorter agreement week would raise the minimum somewhat.
  return input.fullTimeHours === null ? [prorata, phrase('minimum_wage.legal_week')] : [prorata];
}

export type ComparisonVerdict =
  | 'within'
  | 'below'
  // The decree's effects from 1 January were not read in the BOE for that year.
  | 'effects_unverified'
  | 'hours_unknown'
  | 'extra_pays_unknown'
  // Art. 11.2.m ET: alternance training earns the minimum in proportion to effective work only.
  | 'training_effective_work';

interface Doubts {
  readonly hoursKnown: boolean;
  readonly extraPaysUnknown: boolean;
  readonly effectsVerified: boolean;
}

// A shortfall is certain only when nothing it rests on is in doubt.
function verdictOf(input: EmploymentInput, shortfall: number, doubts: Doubts): ComparisonVerdict {
  if (shortfall <= 0) return 'within';
  if (!doubts.hoursKnown) return 'hours_unknown';
  if (doubts.extraPaysUnknown) return 'extra_pays_unknown';
  if (input.modality === 'training_alternance') return 'training_effective_work';
  if (!doubts.effectsVerified) return 'effects_unverified';
  return 'below';
}

export type YearComparison =
  | {
      readonly kind: 'compared';
      readonly year: number;
      readonly row: MinimumWageRow;
      readonly minimum: number;
      readonly pay: number;
      // Short of the minimum over the whole year, or per working day for a short contract.
      readonly shortfall: number;
      // Days of the contract inside the year up to today.
      readonly days: number;
      // The shortfall over those days; null when no total can be given (per working day, or the
      // idle periods of a fixed-discontinuous contract).
      readonly accrued: number | null;
      readonly verdict: ComparisonVerdict;
      // The year before's minimum, shown beside this one while its effects from 1 January are
      // unverified; null without a year before.
      readonly previousMinimum: number | null;
    }
  | { readonly kind: 'not_published'; readonly year: number; readonly reference: MinimumWageRow }
  | { readonly kind: 'not_loaded'; readonly year: number };

// Days of [from, to] inside `year`; zero when they do not meet.
function daysInside(year: number, from: CivilDate, to: CivilDate): number {
  const start = max(from, { y: year, m: 1, d: 1 });
  const end = min(to, { y: year, m: 12, d: 31 });
  return compareDates(start, end) > 0 ? 0 : calendarDays(start, end);
}

// Art. 4.1 of each decree: a day rate in a fixed-term contract agreed for up to 120 days.
export function isShortTemporary(input: EmploymentInput): boolean {
  if (input.salary.period !== 'day' || input.endDate === null) return false;
  if (input.modality === 'permanent' || input.modality === 'discontinuous') return false;
  return calendarDays(input.startDate, input.endDate) <= SHORT_TEMPORARY_DAYS;
}

// Each calendar year of the contract, from its start to today or its end, against that year's
// minimum: the yearly amount, or the amount per working day for a short fixed-term contract.
export function compareByYear(
  input: EmploymentInput,
  today: CivilDate,
  table: MinimumWageTable,
  world: PayWorld = FAVOURABLE,
): readonly YearComparison[] {
  const rate = periodPay(input.salary, world.complement).counted;
  const pay = annualPay(input, rate, world.hours);
  const coefficient = partTimeCoefficient(input);
  const short = isShortTemporary(input);
  const until = short ? (input.endDate ?? today) : min(input.endDate ?? today, today);
  const lastYear = compareDates(input.startDate, until) <= 0 ? until.y : input.startDate.y;
  const years: YearComparison[] = [];
  for (let year = input.startDate.y; year <= lastYear; year += 1) {
    const lookup = minimumWageFor(year, table);
    if (lookup.kind !== 'published') {
      years.push(lookup);
      continue;
    }
    const { row } = lookup;
    const amountOf = (r: MinimumWageRow) =>
      round2((short ? r.temporaryPerDay : r.annual) * (coefficient ?? 1));
    const minimum = amountOf(row);
    const previous = table.find((r) => r.year === year - 1);
    const paid = round2(short ? rate : (pay?.annual ?? 0));
    const shortfall = Math.max(0, round2(minimum - paid));
    const days = daysInside(year, input.startDate, until);
    const verdict = verdictOf(input, shortfall, {
      hoursKnown: coefficient !== null && (short || pay !== null),
      // Art. 4.1: the floor per working day already holds the share of the extra payments.
      extraPaysUnknown: pay?.extraPaysUnknown ?? false,
      effectsVerified: row.retroactiveVerified || toIso(input.startDate) >= row.publishedOn,
    });
    const accrued =
      short || input.modality === 'discontinuous'
        ? null
        : round2((shortfall * days) / daysInYear(year));
    years.push({
      kind: 'compared',
      year,
      row,
      minimum,
      pay: paid,
      shortfall,
      days,
      accrued,
      verdict,
      previousMinimum: previous === undefined ? null : amountOf(previous),
    });
  }
  return years;
}

export type PayslipVerdict =
  | ComparisonVerdict
  // Extra payments paid apart: arts. 3.1 and 3.2 of each decree compare the year, so the month is
  // only a guide.
  | 'annual_decides'
  // Some extra payments are prorated into the month, but not how many.
  | 'prorated_count_unknown'
  | 'not_compared'
  | 'not_published'
  | 'not_loaded';

export interface PayslipComparison {
  // 'YYYY-MM'
  readonly month: string;
  readonly verdict: PayslipVerdict;
  // The month's row, or the latest one as a reference when the month's is not published.
  readonly row: MinimumWageRow | null;
  // Null when the month is not compared.
  readonly minimum: number | null;
  readonly paid: number | null;
  readonly shortfall: number;
  // Compared with extra payments prorated into the month.
  readonly prorated: boolean;
}

const yearAndMonth = (month: string): { year: number; month: number } => ({
  year: Number(month.slice(0, 4)),
  month: Number(month.slice(5, 7)),
});

// How many extra payments the contract spreads over the months; null when it does not say.
function proratedExtraCount(input: EmploymentInput): number | null {
  if (input.extraPays?.prorated === true) return input.extraPays.count;
  if (!input.salary.prorated) return null;
  const count = input.extraPays?.count ?? extraPaysOf(input.salary);
  return count > 0 ? count : null;
}

// Each payslip of a whole month without incidents against that month's minimum: the monthly
// amount plus a twelfth of it for each extra payment prorated into the month, up to the two the
// yearly minimum holds.
export function comparePayslips(
  input: EmploymentInput,
  table: MinimumWageTable,
): readonly PayslipComparison[] {
  const coefficient = partTimeCoefficient(input);
  const proratedCount = proratedExtraCount(input);
  const sorted = [...input.payslips].sort((a, b) => a.month.localeCompare(b.month));
  return sorted.map((p): PayslipComparison => {
    const prorated = p.proratedExtraPay > 0;
    const unmatched = { minimum: null, paid: null, shortfall: 0, prorated };
    if (!p.wholeMonth || p.incidents) {
      return { month: p.month, verdict: 'not_compared', row: null, ...unmatched };
    }
    const lookup = minimumWageFor(yearAndMonth(p.month).year, table);
    if (lookup.kind === 'not_loaded') {
      return { month: p.month, verdict: 'not_loaded', row: null, ...unmatched };
    }
    if (lookup.kind === 'not_published') {
      return { month: p.month, verdict: 'not_published', row: lookup.reference, ...unmatched };
    }
    const { row } = lookup;
    const factor = coefficient ?? 1;
    const paid = round2(p.salaryInMoney + p.proratedExtraPay);
    const decreeExtras = Math.round((row.annual - row.monthly * MONTHS_IN_YEAR) / row.monthly);
    const withExtras = (count: number) =>
      round2(
        (row.monthly + (row.monthly * Math.min(count, decreeExtras)) / MONTHS_IN_YEAR) * factor,
      );
    const doubts = {
      hoursKnown: coefficient !== null,
      extraPaysUnknown: false,
      effectsVerified: row.retroactiveVerified || `${p.month}-01` >= row.publishedOn,
    };
    const compare = (minimum: number, ifShort: PayslipVerdict | null): PayslipComparison => {
      const shortfall = Math.max(0, round2(minimum - paid));
      const certain = verdictOf(input, shortfall, doubts);
      const verdict = certain === 'below' && ifShort !== null ? ifShort : certain;
      return { month: p.month, verdict, row, minimum, paid, shortfall, prorated };
    };
    if (!prorated) return compare(withExtras(0), 'annual_decides');
    // The month shows less prorated than the contract's count implies: some may be paid apart.
    const proratedShort =
      proratedCount !== null &&
      p.proratedExtraPay < (p.salaryInMoney * proratedCount) / MONTHS_IN_YEAR - CENT;
    if (proratedCount !== null && !proratedShort) {
      return compare(withExtras(proratedCount), null);
    }
    // Unknown or doubtful count: only the yearly count can tell.
    return compare(withExtras(decreeExtras), 'prorated_count_unknown');
  });
}

// The findings.

const decreeSource = (row: MinimumWageRow, article: string, norms: NormTable): NormSource => {
  const norm = norms[row.norm];
  return {
    id: row.norm,
    citation: `${article} (${norm.citation})`,
    url: row.url,
    inForceSince: norm.inForceSince,
    inForceUntil: norm.inForceUntil,
    endUncertainUntil: norm.endUncertainUntil ?? null,
    status: norm.status,
    statusSince: norm.statusSince,
    statusUrl: norm.statusUrl,
  };
};

const uniqueSources = (sources: readonly NormSource[]): NormSource[] =>
  sources.filter((s, i) => sources.findIndex((o) => o.citation === s.citation) === i);

type Outcome = 'below' | 'review' | 'not_published' | 'within' | 'not_loaded' | 'not_compared';

const outcomeOf = (verdict: PayslipVerdict): Outcome => {
  if (verdict === 'below' || verdict === 'within') return verdict;
  if (verdict === 'not_published' || verdict === 'not_loaded' || verdict === 'not_compared') {
    return verdict;
  }
  return 'review';
};

// A certain shortfall anywhere decides; then any doubt; then a year still unpublished, which gives
// no difference; then what was compared; a month left out matters only when nothing was compared.
function statusOf(outcomes: readonly Outcome[]): FindingStatus {
  const has = (o: Outcome) => outcomes.includes(o);
  if (has('below')) return 'below_minimum';
  if (has('review')) return 'review_it';
  if (has('not_published')) return 'not_published';
  if (has('within')) return 'within_limit';
  if (has('not_compared')) return 'review_it';
  return 'not_applicable_to_date';
}

const finding = (
  id: EmploymentRuleId,
  status: FindingStatus,
  change: Partial<Finding> = {},
): Finding => ({
  id,
  item: 'minimum_wage',
  status,
  amount: null,
  calculation: [],
  sources: [],
  basedOnYourAnswer: false,
  agreementMaySetOther: false,
  literal: null,
  ...change,
});

const sumOf = (values: readonly number[]): number =>
  round2(values.reduce((total, v) => total + v, 0));

const firstLoadedYear = (table: MinimumWageTable): number => Math.min(...table.map((r) => r.year));

function yearPhrase(y: YearComparison, short: boolean): EmploymentPhrase {
  if (y.kind === 'not_published') {
    return phrase('minimum_wage.not_published', {
      year: integer(y.year),
      referenceYear: integer(y.reference.year),
      reference: euros(short ? y.reference.temporaryPerDay : y.reference.annual),
    });
  }
  if (y.kind === 'not_loaded') return phrase('minimum_wage.not_loaded', { year: integer(y.year) });
  const vars = { year: integer(y.year), minimum: euros(y.minimum), pay: euros(y.pay) };
  const family = short ? 'temporary' : 'year';
  if (y.verdict === 'below') {
    const accrued = y.accrued === null ? {} : { days: { days: y.days }, accrued: euros(y.accrued) };
    return phrase(`minimum_wage.${family}.below`, {
      ...vars,
      difference: euros(y.shortfall),
      ...accrued,
    });
  }
  if (y.verdict === 'effects_unverified' && y.previousMinimum !== null) {
    return phrase(`minimum_wage.${family}.effects_unverified`, {
      ...vars,
      previous: euros(y.previousMinimum),
    });
  }
  return phrase(`minimum_wage.${family}.${y.verdict}`, vars);
}

// The contract, year by year, in one complement world.
function contractFinding(
  input: EmploymentInput,
  today: CivilDate,
  deps: MinimumWageDeps,
  world: PayWorld,
): Finding {
  const { salary } = input;
  const short = isShortTemporary(input);
  const coefficient = partTimeCoefficient(input);
  const { counted, excluded } = periodPay(salary, world.complement);
  const pay = annualPay(input, counted, world.hours);
  const gap = breakdownGap(salary);
  const years = compareByYear(input, today, deps.minimumWage, world);
  const compared = years.flatMap((y) => (y.kind === 'compared' ? [y] : []));
  const below = compared.filter((y) => y.verdict === 'below');
  const accrued = below.flatMap((y) => (y.accrued === null ? [] : [y.accrued]));
  const total = sumOf(accrued);
  const notLoaded = years.some((y) => y.kind === 'not_loaded');
  const id: EmploymentRuleId = short
    ? 'smi_temporary_120'
    : coefficient !== null && coefficient < 1
      ? 'smi_prorata'
      : 'smi_annual';

  const calculation: EmploymentPhrase[] = [];
  if (!short) calculation.push(pay?.how ?? phrase('minimum_wage.pay.hours_unknown'));
  if (pay?.extraPaysUnknown === true) {
    calculation.push(
      phrase('minimum_wage.pay.extra_pays_unknown', { count: integer(extraPaysOf(salary)) }),
    );
  }
  if (gap > 0) calculation.push(phrase('minimum_wage.breakdown_gap', { gap: euros(gap) }));
  if (excluded > 0)
    calculation.push(phrase('minimum_wage.excluded', { excluded: euros(excluded) }));
  if ((salary.inKind ?? 0) > 0) calculation.push(phrase('minimum_wage.in_kind_not_counted'));
  calculation.push(...prorataPhrases(input, coefficient));
  if (notLoaded) {
    calculation.push(
      phrase('minimum_wage.not_loaded', { from: integer(firstLoadedYear(deps.minimumWage)) }),
    );
  }
  calculation.push(
    ...years.filter((y) => y.kind !== 'not_loaded').map((y) => yearPhrase(y, short)),
  );
  if (below.length > 0 && input.modality === 'discontinuous') {
    calculation.push(phrase('minimum_wage.discontinuous_periods'));
  }
  if (accrued.length > 1) calculation.push(phrase('minimum_wage.total', { total: euros(total) }));
  calculation.push(phrase('minimum_wage.agreement_may_pay_more'));

  const rows = years.flatMap((y) =>
    y.kind === 'compared' ? [y.row] : y.kind === 'not_published' ? [y.reference] : [],
  );
  const decreeArticle = short ? 'art. 4.1' : 'art. 3.1';
  const sources = uniqueSources([
    ruleSource(id, deps.norms),
    ...(id === 'smi_prorata' ? [ruleSource('smi_annual', deps.norms)] : []),
    ...(short ? [] : [ruleSource('smi_absorption', deps.norms)]),
    ...rows.map((row) => decreeSource(row, decreeArticle, deps.norms)),
  ]);

  return finding(
    id,
    statusOf(years.map((y) => (y.kind === 'compared' ? outcomeOf(y.verdict) : y.kind))),
    {
      amount: total > 0 ? exact(total) : null,
      calculation,
      sources,
    },
  );
}

// What each year comes to in one world: its verdict and how short it falls. A total alone hides a
// shortfall per working day and the idle periods of a fixed-discontinuous contract, which add up
// to no total.
function yearOutcomes(
  input: EmploymentInput,
  today: CivilDate,
  deps: MinimumWageDeps,
  world: PayWorld,
): string {
  return compareByYear(input, today, deps.minimumWage, world)
    .map((y) =>
      y.kind === 'compared' ? `${y.year}:${y.verdict}:${y.shortfall}` : `${y.year}:${y.kind}`,
    )
    .join('|');
}

// Each doubt about the pay opens two readings that show only when they change the result, year by
// year; the complement's kind comes first, read with the hours most favourable to the pay. A
// result that holds in every reading but by different amounts keeps both readings, so the lower
// amount is the one counted.
function assessContract(input: EmploymentInput, today: CivilDate, deps: MinimumWageDeps): Assessed {
  const worldOf = (world: Partial<PayWorld>): PayWorld => ({ ...FAVOURABLE, ...world });
  const findingIn = (world: Partial<PayWorld>): Finding =>
    contractFinding(input, today, deps, worldOf(world));
  const outcomeIn = (world: Partial<PayWorld>): string =>
    yearOutcomes(input, today, deps, worldOf(world));
  if (complementInDoubt(input.salary)) {
    return readingsOf(
      'complement_kind',
      'complement_variable',
      (complement) => findingIn({ complement }),
      (complement) => outcomeIn({ complement }),
    );
  }
  if (hoursInDoubt(input)) {
    return readingsOf(
      'paid_hours',
      'effective_hours',
      (hours) => findingIn({ hours }),
      (hours) => outcomeIn({ hours }),
    );
  }
  return { kind: 'single', finding: findingIn({}) };
}

function readingsOf<Q extends 'complement_kind' | 'paid_hours'>(
  question: Q,
  strictest: ReadingCode<Q>,
  findingIn: (world: ReadingCode<Q>) => Finding,
  outcomeIn: (world: ReadingCode<Q>) => string,
): Assessed {
  const worlds: readonly ReadingCode<Q>[] = READINGS[question];
  const strict = outcomeIn(strictest);
  if (worlds.every((w) => outcomeIn(w) === strict))
    return { kind: 'single', finding: findingIn(strictest) };
  return assessAcross(question, worlds, (world) => ({
    ...findingIn(world),
    basedOnYourAnswer: true,
  }));
}

function payslipPhrase(c: PayslipComparison): EmploymentPhrase {
  const { year, month } = yearAndMonth(c.month);
  const when = { year: integer(year), month: integer(month) };
  if (c.verdict === 'not_compared' || c.verdict === 'not_loaded') {
    return phrase(`minimum_wage.payslip.${c.verdict}`, when);
  }
  if (c.verdict === 'not_published') {
    return phrase('minimum_wage.payslip.not_published', {
      ...when,
      referenceYear: integer(c.row?.year ?? year),
      reference: euros((c.prorated ? (c.row?.annual ?? 0) / MONTHS_IN_YEAR : c.row?.monthly) ?? 0),
    });
  }
  const vars = { ...when, minimum: euros(c.minimum ?? 0), paid: euros(c.paid ?? 0) };
  if (c.verdict === 'below') {
    return phrase('minimum_wage.payslip.below', { ...vars, difference: euros(c.shortfall) });
  }
  return phrase(`minimum_wage.payslip.${c.verdict}`, vars);
}

function payslipFinding(input: EmploymentInput, deps: MinimumWageDeps): Finding {
  if (input.payslips.length === 0) return finding('smi_monthly', 'not_entered');
  const compared = comparePayslips(input, deps.minimumWage);
  const below = compared.filter((c) => c.verdict === 'below');
  const total = sumOf(below.map((c) => c.shortfall));
  const calculation = compared.map(payslipPhrase);
  if (below.length > 1) calculation.push(phrase('minimum_wage.total', { total: euros(total) }));
  const rows = compared.flatMap((c) => (c.row === null ? [] : [c.row]));
  const sources = uniqueSources([
    ruleSource('smi_monthly', deps.norms),
    ...rows.map((row) => decreeSource(row, 'art. 1', deps.norms)),
  ]);
  return finding('smi_monthly', statusOf(compared.map((c) => outcomeOf(c.verdict))), {
    amount: total > 0 ? exact(total) : null,
    calculation,
    sources,
  });
}

// Art. 26.1 ET: the share of pay in kind over a year, with no amount. Pay in kind is reckoned
// over the twelve months and money over all its payments; a day or hour rate gives no year.
function inKindFinding(input: EmploymentInput, deps: MinimumWageDeps): Finding | null {
  const { salary } = input;
  const inKind = salary.inKind ?? 0;
  if (inKind <= 0) return null;
  const sources = [ruleSource('smi_in_kind_cap', deps.norms)];
  const pay =
    salary.period === 'year' || salary.period === 'month'
      ? annualPay(input, salary.amount, 'with_paid_rest')
      : null;
  if (pay === null) {
    return finding('smi_in_kind_cap', 'review_it', {
      calculation: [phrase('minimum_wage.in_kind_rate', { inKind: euros(inKind) })],
      sources,
    });
  }
  const yearlyInKind = salary.period === 'year' ? inKind : inKind * MONTHS_IN_YEAR;
  const share = yearlyInKind / (yearlyInKind + pay.annual);
  return finding('smi_in_kind_cap', share > IN_KIND_CAP ? 'over_legal_limit' : 'within_limit', {
    calculation: [
      phrase('minimum_wage.in_kind', {
        inKind: euros(yearlyInKind),
        money: euros(pay.annual),
        percent: round2(share * 100),
      }),
    ],
    sources,
  });
}

// The agreement's category salary as the person gave it: never a legal verdict, never in the total.
function agreementFinding(input: EmploymentInput, deps: MinimumWageDeps): Finding | null {
  const category = input.agreement.categoryAnnualSalary;
  const pay = annualPay(input, input.salary.amount, FAVOURABLE.hours);
  if (category === null || pay === null) return null;
  const minimum = round2(category * (partTimeCoefficient(input) ?? 1));
  const annual = round2(pay.annual);
  const vars = { category: euros(category), minimum: euros(minimum), pay: euros(annual) };
  const short = annual < minimum;
  return finding('agreement_salary', short ? 'depends_on_agreement' : 'within_limit', {
    calculation: [
      short
        ? phrase('minimum_wage.agreement.below', { ...vars, difference: euros(minimum - annual) })
        : phrase('minimum_wage.agreement.within', vars),
    ],
    sources: [ruleSource('agreement_salary', deps.norms)],
    basedOnYourAnswer: true,
  });
}

// Pay against the minimum wage: the contract by year, the payslips by month, pay in kind and the
// person's agreement figure.
export function assessMinimumWage(
  input: EmploymentInput,
  today: CivilDate,
  deps: MinimumWageDeps,
): readonly Assessed[] {
  const extra = [inKindFinding(input, deps), agreementFinding(input, deps)].flatMap((f) =>
    f === null ? [] : [{ kind: 'single' as const, finding: f }],
  );
  return [
    assessContract(input, today, deps),
    { kind: 'single', finding: payslipFinding(input, deps) },
    ...extra,
  ];
}
