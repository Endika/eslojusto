import { addDays, addMonthsClamped, calendarDays, type CivilDate } from '../date';
import { phrase, type EmploymentPhrase } from './calculation';
import { findingOf, single } from './finding';
import type { NormTable } from './norms';
import { assessAcross, worldsOf } from './readings';
import type { EmploymentRuleId } from './rules';
import { isFixedTerm, lastsAtMostMonths } from './term';
import type { Assessed, EmploymentInput, Finding, ReadingCode, Trial } from './types';

// Art. 14.1 ET, failing a limit in the collective agreement: six months for qualified technicians,
// two for everyone else and three for them in companies with fewer than 25 workers.
const TECHNICAL_MONTHS = 6;
const OTHERS_MONTHS = 2;
const OTHERS_SMALL_COMPANY_MONTHS = 3;
// Art. 14.1 ET for fixed-term contracts of up to six months, and art. 11.3.e ET for practice
// training contracts: one month unless the agreement says otherwise.
const SHORT_TERM_MONTHS = 6;
const ONE_MONTH = 1;

const othersMonths = (smallCompany: boolean): number =>
  smallCompany ? OTHERS_SMALL_COMPANY_MONTHS : OTHERS_MONTHS;

const STAFF_WORLD_MONTHS: Readonly<Record<ReadingCode<'technical_and_staff'>, number>> = {
  technical: TECHNICAL_MONTHS,
  not_technical_under_25_staff: OTHERS_SMALL_COMPANY_MONTHS,
  not_technical_from_25_staff: OTHERS_MONTHS,
};

const trialPhrase = (trial: Trial): EmploymentPhrase =>
  phrase(`trial.amount_${trial.unit}`, { amount: trial.amount });

// A trial in days or weeks is measured against the calendar months counted from the start day.
function exceeds(trial: Trial, months: number, start: CivilDate): boolean {
  if (trial.unit === 'months') return trial.amount > months;
  const days = trial.unit === 'weeks' ? trial.amount * 7 : trial.amount;
  return days > calendarDays(start, addDays(addMonthsClamped(start, months), -1));
}

interface LimitContext {
  readonly input: EmploymentInput;
  readonly trial: Trial;
  readonly norms: NormTable;
  readonly notes: readonly EmploymentPhrase[];
}

// Every legal limit on the trial period gives way to the collective agreement, so going over one
// is «depends on your agreement», never a void clause.
function againstLimit(
  rule: EmploymentRuleId,
  months: number,
  basedOnYourAnswer: boolean,
  { input, trial, norms, notes }: LimitContext,
): Finding {
  const over = exceeds(trial, months, input.startDate);
  const vars = { trial: trialPhrase(trial), months };
  return findingOf(rule, 'trial_period', norms, {
    status: over ? 'depends_on_agreement' : 'within_limit',
    calculation: [
      phrase(over ? 'trial.over_legal_limit' : 'trial.within_legal_limit', vars),
      ...notes,
    ],
    basedOnYourAnswer,
  });
}

// The general limit of art. 14.1 ET. «No lo sé» on being a qualified technician or on staff size
// opens one reading per limit that could apply, reduced to one when they all agree.
function generalLimit(context: LimitContext): Assessed {
  const { technical, smallCompany } = context.input;
  const limit = (months: number) => againstLimit('trial_limits', months, true, context);
  if (technical === true) return single(limit(TECHNICAL_MONTHS));
  if (technical === false) {
    if (smallCompany !== null) return single(limit(othersMonths(smallCompany)));
    return collapse(
      assessAcross('small_company', worldsOf('small_company', null), (world) =>
        limit(othersMonths(world === 'under_25_staff')),
      ),
    );
  }
  if (smallCompany !== null)
    return collapse(
      assessAcross('technical', worldsOf('technical', null), (world) =>
        limit(world === 'technical' ? TECHNICAL_MONTHS : othersMonths(smallCompany)),
      ),
    );
  return collapse(
    assessAcross('technical_and_staff', worldsOf('technical_and_staff', null), (world) =>
      limit(STAFF_WORLD_MONTHS[world]),
    ),
  );
}

// Within every limit that could apply, the answer did not matter: the tightest limit, the last
// reading (readings go from the loosest limit to the tightest), is the one shown.
function collapse(assessed: Assessed): Assessed {
  if (assessed.kind === 'single') return assessed;
  if (!assessed.readings.every((r) => r.finding.status === 'within_limit')) return assessed;
  const [tightest] = assessed.readings.slice(-1);
  return tightest === undefined ? assessed : single(tightest.finding);
}

const VOID_PHRASE = {
  training_alternance_no_trial: 'trial.void_alternance',
  training_no_new_trial: 'trial.void_after_training',
  trial_void_same_duties: 'trial.void_same_duties',
} as const;

function voidTrial(input: EmploymentInput): keyof typeof VOID_PHRASE | null {
  // Art. 11.2.l ET: no trial period in alternance training.
  if (input.modality === 'training_alternance') return 'training_alternance_no_trial';
  // Art. 11.4.g ET: no new trial for whoever stays on after a training contract.
  if (input.afterTraining === true) return 'training_no_new_trial';
  // Art. 14.1 ET: void when the same duties were already performed in the company.
  if (input.sameDutiesBefore === true) return 'trial_void_same_duties';
  return null;
}

export function assessTrialPeriod(input: EmploymentInput, norms: NormTable): Assessed {
  const { trial } = input;
  if (trial === null)
    return single(findingOf('trial_limits', 'trial_period', norms, { status: 'not_entered' }));

  const voidRule = voidTrial(input);
  if (voidRule !== null)
    return single(
      findingOf(voidRule, 'trial_period', norms, {
        status: 'clause_void',
        calculation: [phrase(VOID_PHRASE[voidRule], { trial: trialPhrase(trial) })],
        basedOnYourAnswer: voidRule !== 'training_alternance_no_trial',
      }),
    );

  // Art. 14.1 ET: a trial period «podrá concertarse por escrito».
  if (input.writtenContract === false)
    return single(
      findingOf('trial_limits', 'trial_period', norms, {
        status: 'missing_requirement',
        calculation: [phrase('trial.not_in_writing', { trial: trialPhrase(trial) })],
        alsoCites: ['written_form'],
        basedOnYourAnswer: true,
      }),
    );

  const context: LimitContext = { input, trial, norms, notes: [] };
  const agreed = input.agreement.trialMonths;
  if (agreed !== null) {
    const over = exceeds(trial, agreed, input.startDate);
    const vars = { trial: trialPhrase(trial), months: agreed };
    return single(
      findingOf('trial_limits', 'trial_period', norms, {
        status: over ? 'depends_on_agreement' : 'within_limit',
        calculation: [
          phrase(over ? 'trial.over_your_agreement' : 'trial.within_your_agreement', vars),
        ],
        basedOnYourAnswer: true,
      }),
    );
  }

  if (input.modality === 'training_practice')
    return single(againstLimit('training_practice_trial', ONE_MONTH, false, context));

  if (isFixedTerm(input.modality)) {
    const short = lastsAtMostMonths(input, SHORT_TERM_MONTHS);
    if (short === true)
      return single(againstLimit('trial_temporary_1_month', ONE_MONTH, false, context));
    // Without an end date the one-month limit may or may not apply; within it nothing changes.
    if (short === null) {
      if (!exceeds(trial, ONE_MONTH, input.startDate))
        return single(againstLimit('trial_temporary_1_month', ONE_MONTH, false, context));
      return generalLimit({
        ...context,
        notes: [phrase('trial.temporary_end_unknown', { months: ONE_MONTH })],
      });
    }
  }
  return generalLimit(context);
}
