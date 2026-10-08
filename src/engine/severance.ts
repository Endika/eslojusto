import { SOURCES, type Source } from './sources';
import { between, exact, round2, type Range } from './money';
import { phrase, type Calculation, type Phrase } from './calculation';
import {
  compareDates,
  calendarDays,
  wholeMonthsAndRest,
  min,
  parseDate,
  type CivilDate,
} from './date';
import type { Cause, FixedTermType } from './types';

export interface Severance {
  readonly amount: number;
  readonly range: Range;
  readonly salaryDays: number;
  readonly dailySalary: number;
  readonly capApplied: boolean;
  readonly calculation: Calculation;
  readonly sources: readonly Source[];
}

const OBJECTIVE_CAP_DAYS = 360;
const UNFAIR_CAP_DAYS = 720;
const ABSOLUTE_CAP_DAYS = 1260;
const DT11_START = parseDate('2012-02-12');
const FIRST_STRETCH_END = parseDate('2012-02-11');
// DT 8.ª.2 ET: temporary contracts concluded before this date keep the rules of their time.
const DT8_START = parseDate('2001-03-04');

function result(
  dailySalary: number,
  salaryDays: number,
  capApplied: boolean,
  calculation: Calculation,
  sources: readonly Source[],
): Severance {
  const amount = round2(dailySalary * salaryDays);
  return {
    amount,
    range: exact(amount),
    salaryDays,
    dailySalary,
    capApplied,
    calculation,
    sources,
  };
}

type Pick = 'g' | 'lo' | 'hi';
interface MonthsRange {
  readonly g: number;
  readonly lo: number;
  readonly hi: number;
}

// At the edge the CGPJ calculator drifts a month from its own guide: with 1-2 leftover days it sometimes
// leaves the month out, and on an exact anniversary not starting on the 1st it sometimes adds one.
function monthsRange(from: CivilDate, to: CivilDate): MonthsRange {
  const { whole, rest } = wholeMonthsAndRest(from, to);
  const g = rest > 0 ? whole + 1 : whole;
  if (rest === 1 || rest === 2) return { g, lo: whole, hi: g };
  if (rest === 0 && from.d !== 1) return { g, lo: g, hi: whole + 1 };
  return { g, lo: g, hi: g };
}

interface Computation {
  readonly days: number;
  readonly capped: boolean;
  readonly calculation: Calculation;
}

const total = (days: number, sd: number): Phrase =>
  phrase('severance.total', { dias: { days }, diario: { euros: sd } });

// The cap, when it applies, comes before the total.
const capAndTotal = (capped: boolean, cap: number, days: number, sd: number): Phrase[] =>
  capped ? [phrase('severance.cap', { tope: cap }), total(days, sd)] : [total(days, sd)];

function unfairComputation(
  startDate: CivilDate,
  endDate: CivilDate,
  sd: number,
  pick: Pick,
): Computation {
  if (compareDates(startDate, DT11_START) >= 0) {
    const months = monthsRange(startDate, endDate)[pick];
    const gross = months * 2.75;
    const days = Math.min(gross, UNFAIR_CAP_DAYS);
    const capped = gross > UNFAIR_CAP_DAYS;
    return {
      days,
      capped,
      calculation: [
        phrase('severance.unfair', { meses: months, dias: { days: gross } }),
        ...capAndTotal(capped, UNFAIR_CAP_DAYS, days, sd),
      ],
    };
  }
  const months1 = monthsRange(startDate, min(endDate, FIRST_STRETCH_END))[pick];
  const d1 = months1 * 3.75;
  const first = phrase('severance.first_stretch', { meses: months1, dias: { days: d1 } });
  if (d1 > UNFAIR_CAP_DAYS) {
    const days = Math.min(d1, ABSOLUTE_CAP_DAYS);
    return {
      days,
      capped: days < d1,
      calculation: [
        first,
        phrase('severance.over_cap', { tope: UNFAIR_CAP_DAYS, maximo: ABSOLUTE_CAP_DAYS }),
        total(days, sd),
      ],
    };
  }
  let d2 = 0;
  const second: Phrase[] = [];
  if (compareDates(endDate, DT11_START) >= 0) {
    const months2 = monthsRange(DT11_START, endDate)[pick];
    d2 = months2 * 2.75;
    second.push(phrase('severance.second_stretch', { meses: months2, dias: { days: d2 } }));
  }
  const gross = d1 + d2;
  const days = Math.min(gross, UNFAIR_CAP_DAYS);
  const capped = gross > UNFAIR_CAP_DAYS;
  return {
    days,
    capped,
    calculation: [first, ...second, ...capAndTotal(capped, UNFAIR_CAP_DAYS, days, sd)],
  };
}

function objectiveComputation(
  startDate: CivilDate,
  endDate: CivilDate,
  sd: number,
  pick: Pick,
): Computation {
  const months = monthsRange(startDate, endDate)[pick];
  const gross = (months * 20) / 12;
  const days = Math.min(gross, OBJECTIVE_CAP_DAYS);
  const capped = gross > OBJECTIVE_CAP_DAYS;
  return {
    days,
    capped,
    calculation: [
      phrase('severance.objective', { meses: months, dias: { days: gross } }),
      ...capAndTotal(capped, OBJECTIVE_CAP_DAYS, days, sd),
    ],
  };
}

function withRange(
  startDate: CivilDate,
  endDate: CivilDate,
  sd: number,
  calculation: (startDate: CivilDate, endDate: CivilDate, sd: number, pick: Pick) => Computation,
  sources: readonly Source[],
): Severance {
  const guide = calculation(startDate, endDate, sd, 'g');
  const low = round2(sd * calculation(startDate, endDate, sd, 'lo').days);
  const high = round2(sd * calculation(startDate, endDate, sd, 'hi').days);
  const base = result(sd, guide.days, guide.capped, guide.calculation, sources);
  const range = between(Math.min(low, base.amount), Math.max(high, base.amount));
  const degenerate = range.min === range.max;
  return {
    ...base,
    range,
    calculation: degenerate
      ? base.calculation
      : [...base.calculation, phrase('severance.cgpj_range')],
  };
}

function unfair(startDate: CivilDate, endDate: CivilDate, sd: number): Severance {
  return withRange(startDate, endDate, sd, unfairComputation, [
    SOURCES.et56,
    SOURCES.etDt11,
    SOURCES.cgpjGuide,
  ]);
}

function objective(startDate: CivilDate, endDate: CivilDate, sd: number): Severance {
  return withRange(startDate, endDate, sd, objectiveComputation, [
    SOURCES.et53,
    SOURCES.cgpjGuide,
    SOURCES.sts651_2026,
  ]);
}

function fixedTermDaysPerYear(startDate: CivilDate): number {
  if (startDate.y <= 2011) return 8;
  if (startDate.y >= 2015) return 12;
  return startDate.y - 2003;
}

function fixedTermEnd(
  startDate: CivilDate,
  endDate: CivilDate,
  sd: number,
  kind: FixedTermType | undefined,
): Severance {
  const sources = [SOURCES.et49_1c, SOURCES.etDt8, SOURCES.cgpjGuide];
  if (kind === 'replacement' || kind === 'training') {
    return result(sd, 0, false, [phrase(`severance.${kind}`)], sources);
  }
  if (compareDates(startDate, DT8_START) < 0) {
    return result(sd, 0, false, [phrase('severance.fixed_term_before_2001')], sources);
  }
  const n = fixedTermDaysPerYear(startDate);
  const dn = calendarDays(startDate, endDate);
  const salaryDays = (dn * n) / 365;
  return result(
    sd,
    salaryDays,
    false,
    [
      phrase('severance.fixed_term', {
        dias: { integer: dn },
        dias_anuales: n,
        diario: { euros: sd },
      }),
    ],
    sources,
  );
}

export function computeSeverance(args: {
  cause: Cause;
  startDate: CivilDate;
  endDate: CivilDate;
  annualSalary: number;
  fixedTermType?: FixedTermType | undefined;
}): Severance {
  const { cause, startDate, endDate, annualSalary, fixedTermType } = args;
  const sd = annualSalary / 365;
  switch (cause) {
    case 'unfair_dismissal':
      return unfair(startDate, endDate, sd);
    case 'objective_dismissal':
      return objective(startDate, endDate, sd);
    case 'fixed_term_end':
      return fixedTermEnd(startDate, endDate, sd, fixedTermType);
    case 'resignation':
      return result(
        sd,
        0,
        false,
        [phrase('severance.resignation')],
        [SOURCES.et49_1d, SOURCES.cgpjGuide],
      );
    case 'disciplinary_dismissal':
      return result(
        sd,
        0,
        false,
        [phrase('severance.disciplinary')],
        [SOURCES.et55, SOURCES.et56, SOURCES.cgpjGuide],
      );
  }
}
