import { SOURCES, type Source } from './sources';
import { days, between, exact, num, round2, type Range } from './money';
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
  readonly detail: string;
  readonly sources: readonly Source[];
}

const OBJECTIVE_CAP_DAYS = 360;
const UNFAIR_CAP_DAYS = 720;
const ABSOLUTE_CAP_DAYS = 1260;
const DT11_START = parseDate('2012-02-12');
const FIRST_STRETCH_END = parseDate('2012-02-11');

function result(
  dailySalary: number,
  salaryDays: number,
  capApplied: boolean,
  detail: string,
  sources: readonly Source[],
): Severance {
  const amount = round2(dailySalary * salaryDays);
  return {
    amount,
    range: exact(amount),
    salaryDays,
    dailySalary,
    capApplied,
    detail,
    sources,
  };
}

const RANGE_NOTE =
  ' La calculadora del CGPJ y su guía cuentan distinto los meses en este caso (un mes de diferencia); por eso damos un margen entre ambas cifras.';

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
  readonly detail: string;
}

function unfairComputation(
  startDate: CivilDate,
  endDate: CivilDate,
  sd: number,
  pick: Pick,
): Computation {
  const perDay = `${num(sd)} €/día`;
  if (compareDates(startDate, DT11_START) >= 0) {
    const months = monthsRange(startDate, endDate)[pick];
    const gross = months * 2.75;
    const total = Math.min(gross, UNFAIR_CAP_DAYS);
    const capped = gross > UNFAIR_CAP_DAYS;
    const base = `${months} meses × 2,75 = ${days(gross)} días.`;
    const detail = capped
      ? `${base} Tope de ${UNFAIR_CAP_DAYS} días. Total ${days(total)} días × ${perDay}.`
      : `${base} Total ${days(total)} días × ${perDay}.`;
    return { days: total, capped, detail };
  }
  const months1 = monthsRange(startDate, min(endDate, FIRST_STRETCH_END))[pick];
  const d1 = months1 * 3.75;
  const txt1 = `Tramo hasta 11-02-2012: ${months1} meses × 3,75 = ${days(d1)} días.`;
  if (d1 > UNFAIR_CAP_DAYS) {
    const total = Math.min(d1, ABSOLUTE_CAP_DAYS);
    return {
      days: total,
      capped: total < d1,
      detail: `${txt1} Supera ${UNFAIR_CAP_DAYS} días: el tramo posterior no suma y el máximo es ${ABSOLUTE_CAP_DAYS} días. Total ${days(total)} días × ${perDay}.`,
    };
  }
  let d2 = 0;
  let txt2 = '';
  if (compareDates(endDate, DT11_START) >= 0) {
    const months2 = monthsRange(DT11_START, endDate)[pick];
    d2 = months2 * 2.75;
    txt2 = ` Tramo desde 12-02-2012: ${months2} meses × 2,75 = ${days(d2)} días.`;
  }
  const gross = d1 + d2;
  const total = Math.min(gross, UNFAIR_CAP_DAYS);
  const capped = gross > UNFAIR_CAP_DAYS;
  const tail = capped
    ? ` Tope de ${UNFAIR_CAP_DAYS} días. Total ${days(total)} días × ${perDay}.`
    : ` Total ${days(total)} días × ${perDay}.`;
  return { days: total, capped, detail: `${txt1}${txt2}${tail}` };
}

function objectiveComputation(
  startDate: CivilDate,
  endDate: CivilDate,
  sd: number,
  pick: Pick,
): Computation {
  const months = monthsRange(startDate, endDate)[pick];
  const gross = (months * 20) / 12;
  const total = Math.min(gross, OBJECTIVE_CAP_DAYS);
  const capped = gross > OBJECTIVE_CAP_DAYS;
  const base = `${months} meses × 20/12 = ${days(gross)} días.`;
  const detail = capped
    ? `${base} Tope de ${OBJECTIVE_CAP_DAYS} días. Total ${days(total)} días × ${num(sd)} €/día.`
    : `${base} Total ${days(total)} días × ${num(sd)} €/día.`;
  return { days: total, capped, detail };
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
  const base = result(sd, guide.days, guide.capped, guide.detail, sources);
  const range = between(Math.min(low, base.amount), Math.max(high, base.amount));
  const degenerate = range.min === range.max;
  return {
    ...base,
    range,
    detail: degenerate ? base.detail : base.detail + RANGE_NOTE,
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
    return result(
      sd,
      0,
      false,
      `Los contratos de ${kind === 'replacement' ? 'sustitución' : 'formación'} no generan indemnización por fin de contrato.`,
      sources,
    );
  }
  const n = fixedTermDaysPerYear(startDate);
  const dn = calendarDays(startDate, endDate);
  const salaryDays = (dn * n) / 365;
  return result(
    sd,
    salaryDays,
    false,
    `${new Intl.NumberFormat('es-ES', { useGrouping: 'always' }).format(dn)} días × ${n}/365 × ${num(sd)} €/día`,
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
      return result(sd, 0, false, 'La dimisión voluntaria no genera indemnización.', [
        SOURCES.et49_1d,
        SOURCES.cgpjGuide,
      ]);
    case 'disciplinary_dismissal':
      return result(
        sd,
        0,
        false,
        'El despido disciplinario declarado procedente no genera indemnización. Si se declara improcedente, se calcula como un despido improcedente.',
        [SOURCES.et55, SOURCES.et56, SOURCES.cgpjGuide],
      );
  }
}
