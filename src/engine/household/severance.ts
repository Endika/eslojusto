import { proratedMonths, wholeMonthsAndRest, type CivilDate } from '../date';
import { exact, round2 } from '../money';
import { dailySalary } from '../severance';
import { assessAcross } from '../law/readings';
import { phrase, type HouseholdPhrase } from './calculation';
import { findingsFor, type Verdict } from './finding';
import type { NormTable } from './norms';
import { annualPay } from './salary';
import type { Assessed, Finding, HouseholdInput, ReadingCode } from './types';

// Art. 11.2: twelve days of salary per year of service, six monthly salaries at most. A monthly
// salary is thirty days, as the Estatuto's caps are counted in the severance of the site (the
// conversion is itself doubtful; the lower figure is the one that counts).
const DAYS_PER_YEAR = 12;
const MONTHS_IN_YEAR = 12;
const CAP_MONTHS = 6;
const DAYS_IN_MONTHLY_SALARY = 30;
const CAP_DAYS = CAP_MONTHS * DAYS_IN_MONTHLY_SALARY;

export interface SeverancePart {
  readonly days: number;
  readonly amount: number;
  readonly capped: boolean;
}

export interface HouseholdSeverance {
  readonly annualPay: number;
  readonly dailySalary: number;
  readonly completeYears: number;
  // The counted figure: complete years only, art. 11.2 not prorating an incomplete one.
  readonly completeYearsOnly: SeverancePart;
  // The higher reading, one day for each month started.
  readonly proratedByMonths: SeverancePart;
  readonly capDays: number;
}

function part(days: number, capDays: number, daily: number): SeverancePart {
  const capped = days > capDays;
  const counted = capped ? capDays : days;
  return { days: counted, amount: round2(counted * daily), capped };
}

// The days of salary in each reading of an incomplete year, before the cap: they need no salary,
// so whether any severance is owed is known without it.
export function severanceDays(
  start: CivilDate,
  end: CivilDate,
): {
  readonly completeYears: number;
  readonly completeYearsOnly: number;
  readonly proratedByMonths: number;
} {
  const completeYears = Math.floor(wholeMonthsAndRest(start, end).whole / MONTHS_IN_YEAR);
  return {
    completeYears,
    completeYearsOnly: completeYears * DAYS_PER_YEAR,
    proratedByMonths: (proratedMonths(start, end) * DAYS_PER_YEAR) / MONTHS_IN_YEAR,
  };
}

// The severance in both readings of an incomplete year, capped at six monthly salaries.
export function severanceFigures(
  start: CivilDate,
  end: CivilDate,
  annual: number,
): HouseholdSeverance {
  const daily = dailySalary(annual);
  const days = severanceDays(start, end);
  return {
    annualPay: annual,
    dailySalary: daily,
    completeYears: days.completeYears,
    completeYearsOnly: part(days.completeYearsOnly, CAP_DAYS, daily),
    proratedByMonths: part(days.proratedByMonths, CAP_DAYS, daily),
    capDays: CAP_DAYS,
  };
}

const euros = (n: number) => ({ euros: round2(n) });

// The verdict on what was made available, against what the reading requires.
function verdictOf(figures: HouseholdSeverance, p: SeverancePart, input: HouseholdInput): Verdict {
  const t = input.termination;
  const calculation: HouseholdPhrase[] = [
    phrase('severance.figure', {
      days: { days: p.days },
      daily: euros(figures.dailySalary),
      amount: euros(p.amount),
    }),
    ...(p.capped
      ? [phrase('severance.capped', { months: CAP_MONTHS, amount: euros(p.amount) })]
      : []),
  ];
  const owed = (amount: number, extra: HouseholdPhrase): Verdict => ({
    status: amount > 0 ? 'below_minimum' : 'within_limit',
    amount: amount > 0 ? exact(amount) : null,
    calculation: amount > 0 ? [...calculation, extra] : calculation,
  });
  if (t?.severanceAvailable === false)
    return {
      status: p.amount > 0 ? 'missing_requirement' : 'within_limit',
      amount: p.amount > 0 ? exact(p.amount) : null,
      calculation:
        p.amount > 0 ? [...calculation, phrase('severance.not_made_available')] : calculation,
      basedOnYourAnswer: true,
    };
  if (t?.severanceAvailable === true && t.severanceOffered !== null)
    return {
      ...owed(
        round2(p.amount - t.severanceOffered),
        phrase('severance.shortfall', {
          offered: euros(t.severanceOffered),
          difference: euros(p.amount - t.severanceOffered),
        }),
      ),
      basedOnYourAnswer: true,
    };
  return {
    status: 'review_it',
    calculation: [...calculation, phrase('severance.offered_unknown')],
    basedOnYourAnswer: true,
  };
}

// Art. 11.2: the severance a desistimiento makes available with the notice.
export function assessSeverance(input: HouseholdInput, norms: NormTable): Assessed | null {
  const t = input.termination;
  if (t === null || t.route !== 'desistimiento') return null;
  const make = findingsFor('severance');
  const annual = annualPay(input);
  if (annual === null)
    return {
      kind: 'single',
      finding: make(
        'desistimiento_severance',
        { status: 'not_entered', calculation: [phrase('severance.salary_unknown')] },
        norms,
      ),
    };
  const figures = severanceFigures(input.startDate, t.effectiveOn, annual);
  const finding = (world: ReadingCode<'incomplete_year'>): Finding =>
    make(
      'desistimiento_severance',
      verdictOf(
        figures,
        world === 'complete_years_only' ? figures.completeYearsOnly : figures.proratedByMonths,
        input,
      ),
      norms,
    );
  const readings = assessAcross(
    'incomplete_year',
    ['complete_years_only', 'prorated_by_months'],
    finding,
  );
  if (readings.kind === 'single') return readings;
  // Nothing owed in either reading: the incomplete year changes nothing.
  const [counted, higher] = readings.readings;
  if (counted?.finding.status === 'within_limit' && higher?.finding.status === 'within_limit')
    return { kind: 'single', finding: counted.finding };
  // The prorated reading is only «y hasta»: a note says why it is not the counted one.
  return {
    ...readings,
    readings: readings.readings.map((r) =>
      r.when === 'prorated_by_months'
        ? {
            ...r,
            finding: {
              ...r.finding,
              calculation: [
                ...r.finding.calculation,
                phrase('severance.prorated_note', { years: figures.completeYears }),
              ],
            },
          }
        : r,
    ),
  };
}
