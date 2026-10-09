import { phrase, type HouseholdPhrase, type HouseholdPhraseKey } from './calculation';
import { assessAcross } from '../law/readings';
import { findingsFor, single, type Verdict } from './finding';
import type { NormTable } from './norms';
import { noticeShort } from './notice';
import { annualPay } from './salary';
import { severanceDays, severanceFigures } from './severance';
import { minutesOf } from './validate';
import type {
  Assessed,
  DesistimientoCause,
  HouseholdInput,
  HouseholdTermination,
  ReadingCode,
} from './types';

// Art. 11.4: no termination notice to a live-in worker from 17:00 to 08:00.
const NIGHT_FROM = 17 * 60;
const NIGHT_UNTIL = 8 * 60;

// The three causes art. 11.2 allows.
const LEGAL_CAUSE_PHRASE = {
  income_drop_or_expense_rise: 'termination.cause.income_drop_or_expense_rise',
  family_needs_change: 'termination.cause.family_needs_change',
  loss_of_trust: 'termination.cause.loss_of_trust',
} as const satisfies Partial<Record<DesistimientoCause, HouseholdPhraseKey>>;
const isLegalCause = (c: DesistimientoCause): c is keyof typeof LEGAL_CAUSE_PHRASE =>
  Object.hasOwn(LEGAL_CAUSE_PHRASE, c);

// The severance made available is below the one the counted reading requires: an error in the
// figure, whose difference is owed but which does not by itself bring the dismissal regime.
function severanceShort(input: HouseholdInput): boolean {
  const t = input.termination;
  const annual = annualPay(input);
  if (t === null || annual === null || t.severanceAvailable !== true || t.severanceOffered === null)
    return false;
  return (
    t.severanceOffered <
    severanceFigures(input.startDate, t.effectiveOn, annual).completeYearsOnly.amount
  );
}

// Art. 11.1 and 11.2: how the employer ended the relationship. The engine checks the form and the
// category of the cause, never whether the cause is true.
export function assessTermination(input: HouseholdInput, norms: NormTable): readonly Assessed[] {
  const t = input.termination;
  if (t === null) return [];
  const make = findingsFor('termination');
  const one = (id: Parameters<typeof make>[0], verdict: Verdict) =>
    single(make(id, verdict, norms));

  if (t.route === 'et_cause')
    return [
      one('termination_causes', {
        status: 'information',
        calculation: [phrase('termination.et_cause')],
        alsoCites: ['et_termination_causes'],
      }),
    ];

  const out: Assessed[] = [];

  // The category of the cause.
  if (t.cause === null) out.push(one('desistimiento_cause', { status: 'not_entered' }));
  else if (isLegalCause(t.cause))
    out.push(
      one('desistimiento_cause', {
        status: 'within_limit',
        calculation: [
          phrase(LEGAL_CAUSE_PHRASE[t.cause]),
          phrase('termination.cause_truth_not_judged'),
        ],
        basedOnYourAnswer: true,
      }),
    );
  else
    out.push(
      one('desistimiento_cause', {
        status: 'missing_requirement',
        calculation: [
          phrase(t.cause === 'none' ? 'termination.cause_none' : 'termination.cause_other'),
        ],
        basedOnYourAnswer: true,
      }),
    );

  // In writing, with the cause.
  const written: Verdict =
    t.inWriting === false
      ? { status: 'missing_requirement', calculation: [phrase('termination.not_in_writing')] }
      : t.inWriting === true && t.cause === 'none'
        ? {
            status: 'missing_requirement',
            calculation: [phrase('termination.cause_not_in_writing')],
          }
        : t.inWriting === true && t.cause !== null
          ? { status: 'within_limit', calculation: [phrase('termination.in_writing')] }
          : { status: 'review_it', calculation: [phrase('termination.writing_unknown')] };
  out.push(one('desistimiento_written', { ...written, basedOnYourAnswer: true }));

  // Art. 11.3: the dismissal regime is presumed without the written notice or the severance made
  // available. A short notice or an error in the figure does not bring it: the difference is owed.
  // Whether a severance was owed at all depends on how an incomplete year counts, so the
  // presumption is read in both readings and counts only where it holds in both.
  out.push(dismissalPresumed(input, t, norms));

  // Art. 11.4.
  if (input.liveIn) out.push(nightNotice(input, one));
  return out;
}

function dismissalPresumed(
  input: HouseholdInput,
  t: HouseholdTermination,
  norms: NormTable,
): Assessed {
  const make = findingsFor('termination');
  const days = severanceDays(input.startDate, t.effectiveOn);
  const differences: HouseholdPhrase[] = [
    ...(noticeShort(input) ? [phrase('dismissal.short_notice')] : []),
    ...(severanceShort(input) ? [phrase('dismissal.figure_difference')] : []),
  ];
  const verdict = (world: ReadingCode<'incomplete_year'>): Verdict => {
    const owed =
      (world === 'complete_years_only' ? days.completeYearsOnly : days.proratedByMonths) > 0;
    const triggers: HouseholdPhrase[] = [
      ...(t.inWriting === false ? [phrase('dismissal.no_written_notice')] : []),
      ...(owed && t.severanceAvailable === false ? [phrase('dismissal.no_severance')] : []),
    ];
    const unknown = t.inWriting === null || (owed && t.severanceAvailable === null);
    if (triggers.length > 0)
      return {
        status: 'dismissal_regime_presumed',
        calculation: [...triggers, ...differences],
        basedOnYourAnswer: true,
      };
    if (unknown)
      return {
        status: 'review_it',
        calculation: [phrase('dismissal.unknown'), ...differences],
        basedOnYourAnswer: true,
      };
    return {
      status: severanceShort(input) ? 'review_it' : 'within_limit',
      calculation: [
        phrase(owed ? 'dismissal.none_of_the_two' : 'dismissal.none_of_the_two_no_severance_due'),
        ...differences,
      ],
      basedOnYourAnswer: true,
    };
  };
  const readings = assessAcross(
    'incomplete_year',
    ['complete_years_only', 'prorated_by_months'],
    (world) => make('dismissal_presumed', verdict(world), norms),
  );
  return readings.kind === 'single' ? single(readings.finding) : readings;
}

// The notice time against the 17:00 to 08:00 stretch. Right on 17:00 or 08:00 the text does not
// say whether the hour itself is inside, so it is shown to review and never counted.
function nightNotice(
  input: HouseholdInput,
  one: (id: 'live_in_night_notice', verdict: Verdict) => Assessed,
): Assessed {
  const time = input.termination?.noticeTime ?? null;
  const minutes = time === null ? null : minutesOf(time);
  if (time === null || minutes === null)
    return one('live_in_night_notice', { status: 'not_entered' });
  const calculation = [phrase('night.notice_time', { time })];
  const inside = minutes > NIGHT_FROM || minutes < NIGHT_UNTIL;
  const onEdge = minutes === NIGHT_FROM || minutes === NIGHT_UNTIL;
  if (!inside && !onEdge)
    return one('live_in_night_notice', {
      status: 'within_limit',
      calculation,
      basedOnYourAnswer: true,
    });
  if (onEdge)
    return one('live_in_night_notice', {
      status: 'review_it',
      calculation: [...calculation, phrase('night.on_the_hour')],
      basedOnYourAnswer: true,
    });
  if (input.termination?.seriousBreachAlleged === true)
    return one('live_in_night_notice', {
      status: 'review_it',
      calculation: [...calculation, phrase('night.serious_breach_alleged')],
      basedOnYourAnswer: true,
    });
  return one('live_in_night_notice', {
    status: 'missing_requirement',
    calculation: [...calculation, phrase('night.inside')],
    basedOnYourAnswer: true,
  });
}
