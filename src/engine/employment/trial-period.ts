import {
  addDays,
  addMonthsClamped,
  calendarDays,
  compareDates,
  parseDate,
  type CivilDate,
} from '../date';
import { phrase, type EmploymentPhrase } from './calculation';
import { findingOf, single } from './finding';
import type { NormTable } from './norms';
import { assessAcross, worldsOf } from './readings';
import type { EmploymentRuleId } from './rules';
import { agreedDays, isFixedTerm, lastsAtMostMonths, lastsLessThanMonths } from './term';
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

// RDL 39/2026 rewrote art. 14.1 ET for contracts starting from this day, with no transitional rule.
const RDL39_START = parseDate('2026-11-19');

interface Regime {
  readonly fromRdl39: boolean;
  readonly limits: EmploymentRuleId;
  readonly temporary: EmploymentRuleId;
  readonly overPhrase: 'trial.over_legal_limit' | 'trial.over_legal_limit_justified';
}

const BEFORE_RDL39: Regime = {
  fromRdl39: false,
  limits: 'trial_limits',
  temporary: 'trial_temporary_1_month',
  overPhrase: 'trial.over_legal_limit',
};

const FROM_RDL39: Regime = {
  fromRdl39: true,
  limits: 'trial_limits_2026',
  temporary: 'trial_temporary_proportional',
  overPhrase: 'trial.over_legal_limit_justified',
};

const regimeOf = (input: EmploymentInput): Regime =>
  compareDates(input.startDate, RDL39_START) >= 0 ? FROM_RDL39 : BEFORE_RDL39;

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

// The trial in calendar days, counting a trial in months from the start day.
function trialDays(trial: Trial, start: CivilDate): number {
  if (trial.unit === 'months')
    return calendarDays(start, addDays(addMonthsClamped(start, trial.amount), -1));
  return trial.unit === 'weeks' ? trial.amount * 7 : trial.amount;
}

interface LimitContext {
  readonly regime: Regime;
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
  { regime, input, trial, norms, notes }: LimitContext,
): Finding {
  const over = exceeds(trial, months, input.startDate);
  const vars = { trial: trialPhrase(trial), months };
  return findingOf(rule, 'trial_period', norms, {
    status: over ? 'depends_on_agreement' : 'within_limit',
    calculation: [phrase(over ? regime.overPhrase : 'trial.within_legal_limit', vars), ...notes],
    basedOnYourAnswer,
  });
}

// The general limit of art. 14.1 ET. «No lo sé» on being a qualified technician or on staff size
// opens one reading per limit that could apply, reduced to one when they all agree.
function generalLimit(context: LimitContext): Assessed {
  const { technical, smallCompany } = context.input;
  const limit = (months: number) => againstLimit(context.regime.limits, months, true, context);
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

// From RDL 39/2026 a trial in a fixed-term contract is at most one month, and in a contract of less
// than six months the same proportion of it. Over it, only an agreement that justifies it allows more.
function fixedTermFromRdl39(context: LimitContext): Assessed {
  const { regime, input, trial, norms } = context;
  const days = agreedDays(input);
  const oneMonth = (notes: readonly EmploymentPhrase[]) =>
    single(againstLimit(regime.temporary, ONE_MONTH, false, { ...context, notes }));
  if (days === null) {
    const unknownEnd = phrase('trial.end_unknown_proportional');
    return oneMonth(exceeds(trial, ONE_MONTH, input.startDate) ? [] : [unknownEnd]);
  }
  if (lastsLessThanMonths(input, SHORT_TERM_MONTHS) !== true) return oneMonth([]);
  const over = trialDays(trial, input.startDate) * SHORT_TERM_MONTHS > days;
  return single(
    findingOf(regime.temporary, 'trial_period', norms, {
      status: over ? 'depends_on_agreement' : 'within_limit',
      calculation: [
        phrase(over ? 'trial.over_legal_limit_days' : 'trial.within_legal_limit_days', {
          trial: trialPhrase(trial),
          days: Math.floor(days / SHORT_TERM_MONTHS),
        }),
      ],
    }),
  );
}

// Up to RDL 39/2026: one month in contracts of six months or less, whose end date may be unknown.
function fixedTermBeforeRdl39(context: LimitContext): Assessed | null {
  const { regime, input, trial } = context;
  const short = lastsAtMostMonths(input, SHORT_TERM_MONTHS);
  if (short === true) return single(againstLimit(regime.temporary, ONE_MONTH, false, context));
  if (short === null) {
    if (!exceeds(trial, ONE_MONTH, input.startDate))
      return single(againstLimit(regime.temporary, ONE_MONTH, false, context));
    return generalLimit({
      ...context,
      notes: [phrase('trial.temporary_end_unknown', { months: ONE_MONTH })],
    });
  }
  return null;
}

function legalLimit(context: LimitContext): Assessed {
  const { regime, input } = context;
  if (input.modality === 'training_practice')
    return single(
      againstLimit('training_practice_trial', ONE_MONTH, false, {
        ...context,
        regime: BEFORE_RDL39,
      }),
    );
  if (isFixedTerm(input.modality)) {
    if (regime.fromRdl39) return fixedTermFromRdl39(context);
    return fixedTermBeforeRdl39(context) ?? generalLimit(context);
  }
  return generalLimit(context);
}

const staysWithinLaw = (assessed: Assessed): boolean =>
  assessed.kind === 'single'
    ? assessed.finding.status === 'within_limit'
    : assessed.readings.every((r) => r.finding.status === 'within_limit');

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
  const regime = regimeOf(input);
  if (trial === null)
    return single(findingOf(regime.limits, 'trial_period', norms, { status: 'not_entered' }));

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
      findingOf(regime.limits, 'trial_period', norms, {
        status: 'missing_requirement',
        calculation: [phrase('trial.not_in_writing', { trial: trialPhrase(trial) })],
        alsoCites: ['written_form'],
        basedOnYourAnswer: true,
      }),
    );

  const context: LimitContext = { regime, input, trial, norms, notes: [] };
  const agreed = input.agreement.trialMonths;
  if (agreed !== null) {
    const over = exceeds(trial, agreed, input.startDate);
    const vars = { trial: trialPhrase(trial), months: agreed };
    // Within an agreement that allows more than the law, the agreement has to justify it.
    if (
      !over &&
      regime.fromRdl39 &&
      input.modality !== 'training_practice' &&
      !staysWithinLaw(legalLimit(context))
    )
      return single(
        findingOf(regime.limits, 'trial_period', norms, {
          status: 'depends_on_agreement',
          calculation: [phrase('trial.agreement_above_legal_limit', vars)],
          basedOnYourAnswer: true,
        }),
      );
    // The agreement's own limit, as the person gave it: nothing further to defer to.
    return single(
      findingOf(regime.limits, 'trial_period', norms, {
        status: over ? 'over_legal_limit' : 'within_limit',
        calculation: [
          phrase(over ? 'trial.over_your_agreement' : 'trial.within_your_agreement', vars),
        ],
        basedOnYourAnswer: true,
      }),
    );
  }

  return legalLimit(context);
}
