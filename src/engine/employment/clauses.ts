import { round2 } from '../money';
import { phrase, type EmploymentPhraseKey } from './calculation';
import { findingOf, single, type Verdict } from './finding';
import type { NormTable } from './norms';
import { assessAcross, worldsOf } from './readings';
import type { EmploymentRuleId } from './rules';
import { assessOvertimePact } from './working-time';
import type { Assessed, Clause, ClauseLabel, EmploymentInput, Finding, Salary } from './types';

// Art. 21.2 ET: a non-compete pact lasts at most two years for technicians and six months for
// everyone else. Art. 21.4 ET: a staying commitment, two years at most.
const NON_COMPETE_TECHNICIANS_MONTHS = 24;
const NON_COMPETE_OTHERS_MONTHS = 6;
const RETENTION_MONTHS = 24;
// Ley 10/2021, art. 1: remote work is regular from 30 % of the working time over three months.
const REGULAR_REMOTE_PERCENT = 30;
const WEEKS_PER_YEAR = 365 / 7;
const DAYS_PER_YEAR = 365;

// The person confirms each clause's label; the engine reads only its objective fields, never its words.
export interface ClauseAssessment {
  // Position in `clauses`, to show the clause's own words next to its finding.
  readonly index: number;
  readonly label: ClauseLabel;
  // Null for a clause listed with its words and no verdict.
  readonly assessed: Assessed | null;
}

const finding = (id: EmploymentRuleId, verdict: Verdict, norms: NormTable): Finding =>
  findingOf(id, 'clauses', norms, verdict);

const reviewIt = (id: EmploymentRuleId, key: EmploymentPhraseKey, norms: NormTable): Finding =>
  finding(id, { status: 'review_it', calculation: [phrase(key)] }, norms);

// Art. 21.2 ET asks for an «adequate» compensation; whether it is cannot be told from the contract.
const nonCompeteCompensation = (clause: Clause, norms: NormTable): Finding =>
  reviewIt(
    'non_compete',
    clause.compensationStated === true
      ? 'clauses.non_compete_adequacy'
      : 'clauses.non_compete_compensation_unknown',
    norms,
  );

// Art. 21.2 ET says «técnicos», which need not be the qualified technicians of art. 14.1 ET: only a
// yes there settles it, any other answer opens both readings.
function nonCompete(input: EmploymentInput, clause: Clause, norms: NormTable): Assessed {
  if (clause.compensationStated === false)
    return single(
      finding(
        'non_compete',
        {
          status: 'clause_void',
          calculation: [phrase('clauses.non_compete_no_compensation')],
        },
        norms,
      ),
    );
  const { months } = clause;
  if (months === null) return single(reviewIt('non_compete', 'clauses.months_unknown', norms));
  const overCap = (cap: number): Finding =>
    finding(
      'non_compete',
      {
        status: 'over_legal_limit',
        calculation: [phrase('clauses.non_compete_months', { months, cap })],
      },
      norms,
    );
  if (months > NON_COMPETE_TECHNICIANS_MONTHS)
    return single(overCap(NON_COMPETE_TECHNICIANS_MONTHS));
  if (months <= NON_COMPETE_OTHERS_MONTHS) return single(nonCompeteCompensation(clause, norms));
  if (input.technical === true) return single(nonCompeteCompensation(clause, norms));
  return assessAcross('technical', worldsOf('technical', null), (world) =>
    world === 'technical'
      ? nonCompeteCompensation(clause, norms)
      : { ...overCap(NON_COMPETE_OTHERS_MONTHS), basedOnYourAnswer: true },
  );
}

// Art. 21.4 ET: only after specialised training paid by the company, and two years at most.
function retention(clause: Clause, norms: NormTable): Finding {
  const { months } = clause;
  if (months !== null && months > RETENTION_MONTHS)
    return finding(
      'retention',
      {
        status: 'over_legal_limit',
        calculation: [phrase('clauses.retention_months', { months, cap: RETENTION_MONTHS })],
      },
      norms,
    );
  if (clause.trainingDescribed !== true)
    return reviewIt('retention', 'clauses.retention_training_missing', norms);
  if (months === null) return reviewIt('retention', 'clauses.months_unknown', norms);
  return finding(
    'retention',
    {
      status: 'within_limit',
      calculation: [phrase('clauses.retention_months', { months, cap: RETENTION_MONTHS })],
    },
    norms,
  );
}

// Art. 21.1 ET: full exclusivity only with express compensation.
function exclusivity(clause: Clause, norms: NormTable): Finding {
  if (clause.compensationStated === true)
    return finding(
      'exclusivity',
      {
        status: 'within_limit',
        calculation: [phrase('clauses.exclusivity_compensated')],
      },
      norms,
    );
  return reviewIt(
    'exclusivity',
    clause.compensationStated === false
      ? 'clauses.exclusivity_no_compensation'
      : 'clauses.exclusivity_compensation_unknown',
    norms,
  );
}

const WAIVED: Readonly<Record<'holidays' | 'salary' | 'severance', EmploymentPhraseKey>> = {
  holidays: 'clauses.waiver_holidays',
  salary: 'clauses.waiver_salary',
  severance: 'clauses.waiver_severance',
};

// Art. 3.5 ET: rights the law grants cannot be waived, before or after acquiring them.
function waiver(clause: Clause, norms: NormTable): Finding {
  const right = clause.waivedRight;
  if (right === null || right === 'other') return reviewIt('waiver', 'clauses.waiver_other', norms);
  return finding('waiver', { status: 'clause_void', calculation: [phrase(WAIVED[right])] }, norms);
}

// Pay in money a year as agreed, for an hourly figure; an hourly salary has none to spread.
function yearlyPay(salary: Salary): number | null {
  switch (salary.period) {
    case 'year':
      return salary.amount;
    case 'month':
      return salary.amount * (salary.prorated ? 12 : salary.payments);
    case 'day':
      return salary.amount * DAYS_PER_YEAR;
    case 'hour':
      return null;
  }
}

// Art. 35.1 ET: overtime is never worth less than an ordinary hour. Whether a global salary may
// absorb it is not settled in the statute, so the hourly figures are only information.
function overtimeIncluded(input: EmploymentInput, norms: NormTable): Finding {
  const calculation = [phrase('clauses.overtime_included')];
  const pay = yearlyPay(input.salary);
  const real = input.realWeeklyHours;
  if (pay !== null && real !== null)
    calculation.push(
      phrase('clauses.hourly_pay', {
        euros: { euros: round2(pay / (real * WEEKS_PER_YEAR)) },
        hours: real,
      }),
    );
  const { categoryAnnualSalary, annualHours } = input.agreement;
  if (categoryAnnualSalary !== null && annualHours !== null)
    calculation.push(
      phrase('clauses.agreement_hourly_pay', {
        euros: { euros: round2(categoryAnnualSalary / annualHours) },
      }),
    );
  return finding(
    'overtime_value',
    {
      status: 'review_it',
      calculation,
      basedOnYourAnswer: calculation.length > 1,
    },
    norms,
  );
}

// Ley 10/2021, art. 12.1: regular remote work never puts its equipment costs on the worker.
function remoteCosts(input: EmploymentInput, clause: Clause, norms: NormTable): Finding {
  const share = input.remoteShare;
  if (share === null) return reviewIt('remote_costs', 'clauses.remote_share_unknown', norms);
  if (share < REGULAR_REMOTE_PERCENT)
    return finding(
      'remote_costs',
      {
        status: 'within_limit',
        calculation: [
          phrase('clauses.remote_not_regular', { percent: share, regular: REGULAR_REMOTE_PERCENT }),
        ],
      },
      norms,
    );
  if (clause.costsOnWorker === true)
    return finding(
      'remote_costs',
      {
        status: 'clause_void',
        calculation: [phrase('clauses.remote_costs_on_worker')],
      },
      norms,
    );
  if (clause.costsOnWorker === false)
    return finding('remote_costs', { status: 'within_limit' }, norms);
  return reviewIt('remote_costs', 'clauses.remote_costs_unknown', norms);
}

function assessClause(input: EmploymentInput, clause: Clause, norms: NormTable): Assessed | null {
  switch (clause.label) {
    case 'non_compete':
      return nonCompete(input, clause, norms);
    case 'retention':
      return single(retention(clause, norms));
    case 'exclusivity':
      return single(exclusivity(clause, norms));
    case 'waiver':
      return single(waiver(clause, norms));
    case 'mandatory_overtime':
      return (
        assessOvertimePact(input, norms) ??
        single(reviewIt('overtime_cap_80', 'clauses.overtime_hours_unknown', norms))
      );
    case 'overtime_included':
      return single(overtimeIncluded(input, norms));
    case 'remote_work_costs':
      return single(remoteCosts(input, clause, norms));
    case 'other':
      return null;
  }
}

export function assessClauses(
  input: EmploymentInput,
  norms: NormTable,
): readonly ClauseAssessment[] {
  return input.clauses.map((clause, index) => ({
    index,
    label: clause.label,
    assessed: assessClause(input, clause, norms),
  }));
}
