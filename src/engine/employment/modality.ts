import {
  addMonthsClamped,
  calendarDays,
  compareDates,
  max,
  min,
  wholeMonthsAndRest,
  type CivilDate,
} from '../date';
import { phrase, type EmploymentPhrase } from './calculation';
import {
  cite,
  longerThan,
  ruleStanding,
  settle,
  shorterThan,
  single,
  type Draft,
  type TemporalityDeps,
} from './fixed-term';
import type { NormTable } from './norms';
import { LAW_QUOTES } from './quotes';
import { concludedOn, scope } from './scope';
import type { Assessed, EmploymentInput, Finding, Modality } from './types';

// 15.2: production contracts, six months, or up to one year by sectoral agreement.
const PRODUCTION_MONTHS = 6;
const PRODUCTION_AGREEMENT_MONTHS = 12;
// 15.2: «por una única vez».
const PRODUCTION_EXTENSIONS = 1;
// 15.2: occasional situations, 90 days a calendar year; 120 in the agri-food sector (Ley 1/2025).
const OCCASIONAL_DAYS = 90;
const OCCASIONAL_AGRIFOOD_DAYS = 120;
// 15.3: covering a post during selection or promotion, three months.
const SELECTION_MONTHS = 3;
// 11.2.g: alternance training, three months to two years.
const ALTERNANCE_MIN_MONTHS = 3;
const ALTERNANCE_MAX_MONTHS = 24;
// 11.2.i: effective work at most 65 % the first year and 85 % the second.
const ALTERNANCE_YEAR1_PERCENT = 65;
const ALTERNANCE_YEAR2_PERCENT = 85;
// 11.3.c: practice, six months to one year.
const PRACTICE_MIN_MONTHS = 6;
const PRACTICE_MAX_MONTHS = 12;
// 11.3.b: within three years of finishing studies, five with a disability.
const PRACTICE_WINDOW_MONTHS = 36;
const PRACTICE_WINDOW_DISABILITY_MONTHS = 60;
// 8.2: fixed-term contracts of over four weeks are written.
const WRITTEN_OVER_DAYS = 28;
// 34.1: the legal full-time week, when the agreement's is not known.
const LEGAL_WEEK_HOURS = 40;

const TEMPORARY: ReadonlySet<Modality> = new Set([
  'production',
  'production_occasional',
  'replacement',
  'replacement_selection',
  'work_or_service',
  'eventual',
  'interim',
]);

const TRAINING: ReadonlySet<Modality> = new Set(['training_alternance', 'training_practice']);

// What art. 15.4 says follows from hiring in breach of art. 15, quoted and never asserted.
const onBreach = {
  cites: ['permanent_on_breach'],
  literal: LAW_QUOTES.permanent_on_breach,
} as const;
const permanentOnBreach = phrase('modality.permanent_on_breach');

interface Context {
  readonly input: EmploymentInput;
  readonly today: CivilDate;
  readonly norms: NormTable;
  // Rules on the contract itself are read on the day it was concluded.
  readonly concluded: CivilDate;
}

const modalityFinding = (c: Context, draft: Omit<Draft, 'item'>): Finding =>
  settle({ ...draft, item: 'modality' }, c.concluded, c.norms);

// The span of the contract: to its end, or so far when it has none.
function span(c: Context): { end: CivilDate; known: boolean; duration: EmploymentPhrase } {
  const known = c.input.endDate !== null;
  const end = c.input.endDate ?? c.today;
  const { whole, rest } = wholeMonthsAndRest(c.input.startDate, end);
  const duration = phrase(known ? 'modality.duration' : 'modality.duration_so_far', {
    meses: { integer: whole },
    dias: { integer: rest },
  });
  return { end, known, duration };
}

// 15.1: the cause, the circumstances and their link with the duration must be in the contract.
// Only whether they are written is checked, never whether they are enough.
function causeStated(c: Context): Finding {
  const { causeStated: cause, circumstancesStated: circumstances } = c.input;
  if (cause === false || circumstances === false) {
    return modalityFinding(c, {
      id: 'fixed_term_presumption',
      status: 'review_it',
      calculation: [phrase('modality.cause_missing')],
      basedOnYourAnswer: true,
      literal: LAW_QUOTES.fixed_term_presumption,
    });
  }
  if (cause === null || circumstances === null) {
    return modalityFinding(c, {
      id: 'fixed_term_presumption',
      status: 'not_entered',
      calculation: [phrase('modality.cause_unknown')],
    });
  }
  return modalityFinding(c, {
    id: 'fixed_term_presumption',
    status: 'within_limit',
    calculation: [phrase('modality.cause_stated')],
    basedOnYourAnswer: true,
  });
}

// 15.2: six months; between six months and a year only if the sectoral agreement extends it.
function productionDuration(c: Context): Finding {
  const { end, known, duration } = span(c);
  const start = c.input.startDate;
  if (longerThan(start, end, PRODUCTION_AGREEMENT_MONTHS)) {
    return modalityFinding(c, {
      id: 'production_1_year',
      status: 'over_legal_limit',
      calculation: [duration, phrase('modality.production_over_year'), permanentOnBreach],
      ...onBreach,
    });
  }
  if (longerThan(start, end, PRODUCTION_MONTHS)) {
    return modalityFinding(c, {
      id: 'production_1_year',
      status: 'depends_on_agreement',
      calculation: [duration, phrase('modality.production_agreement_year')],
      agreementMaySetOther: true,
    });
  }
  if (!known) {
    return modalityFinding(c, {
      id: 'production_6_months',
      status: 'not_entered',
      calculation: [duration, phrase('modality.no_end_date')],
    });
  }
  return modalityFinding(c, {
    id: 'production_6_months',
    status: 'within_limit',
    calculation: [duration, phrase('modality.production_within')],
  });
}

// 15.2: a production contract may be extended once only.
function productionExtensions(c: Context): readonly Finding[] {
  const { extensions } = c.input;
  if (extensions === 0) return [];
  const calculation = [phrase('modality.extensions', { prorrogas: { integer: extensions } })];
  if (extensions > PRODUCTION_EXTENSIONS) {
    return [
      modalityFinding(c, {
        id: 'production_one_extension',
        status: 'over_legal_limit',
        calculation: [...calculation, permanentOnBreach],
        ...onBreach,
      }),
    ];
  }
  return [
    modalityFinding(c, { id: 'production_one_extension', status: 'within_limit', calculation }),
  ];
}

// 15.2: occasional situations, counted by calendar year since the limit is the company's yearly
// allowance; the agri-food allowance cannot be told apart without the sector, so it is only noted.
function occasionalDays(c: Context): Finding {
  const { end, known } = span(c);
  const start = c.input.startDate;
  const years = Array.from({ length: end.y - start.y + 1 }, (_, i) => start.y + i).map((y) => {
    const last = min(end, { y, m: 12, d: 31 });
    return { year: y, days: calendarDays(max(start, { y, m: 1, d: 1 }), last), last };
  });
  const worst = years.reduce((a, b) => (b.days > a.days ? b : a));
  const agrifood = ruleStanding('production_occasional_agrifood_120', worst.last, c.norms);
  const days = (limit: number) =>
    phrase('modality.occasional_days', {
      anio: { integer: worst.year },
      dias: { integer: worst.days },
      limite: { integer: limit },
    });
  const overLimit = agrifood === 'not_in_force' ? OCCASIONAL_DAYS : OCCASIONAL_AGRIFOOD_DAYS;
  if (worst.days > overLimit) {
    return modalityFinding(c, {
      id:
        agrifood === 'not_in_force'
          ? 'production_occasional_90'
          : 'production_occasional_agrifood_120',
      status: 'over_legal_limit',
      calculation: [days(overLimit), permanentOnBreach],
      ...onBreach,
    });
  }
  if (worst.days > OCCASIONAL_DAYS) {
    return modalityFinding(c, {
      id: 'production_occasional_agrifood_120',
      status: 'review_it',
      calculation: [days(OCCASIONAL_DAYS), phrase('modality.occasional_agrifood')],
    });
  }
  return modalityFinding(c, {
    id: 'production_occasional_90',
    status: known ? 'within_limit' : 'not_entered',
    calculation: known
      ? [days(OCCASIONAL_DAYS)]
      : [days(OCCASIONAL_DAYS), phrase('modality.no_end_date')],
  });
}

// 15.3: the contract names the person replaced and the cause.
function replacementStated(c: Context): Finding {
  const { replacedPersonNamed: named, replacementCauseStated: cause } = c.input;
  if (named === false || cause === false) {
    return modalityFinding(c, {
      id: 'replacement_name_cause',
      status: 'missing_requirement',
      calculation: [phrase('modality.replacement_missing')],
      basedOnYourAnswer: true,
      literal: LAW_QUOTES.replacement_name_cause,
    });
  }
  if (named === null || cause === null) {
    return modalityFinding(c, {
      id: 'replacement_name_cause',
      status: 'not_entered',
      calculation: [phrase('modality.replacement_unknown')],
    });
  }
  return modalityFinding(c, {
    id: 'replacement_name_cause',
    status: 'within_limit',
    calculation: [phrase('modality.replacement_stated')],
    basedOnYourAnswer: true,
  });
}

// 15.3: three months at most, «o el plazo inferior recogido en convenio colectivo»: the agreement
// can only shorten it, so going over three months is certain and staying under may not be.
function selectionDuration(c: Context): Finding {
  const { end, known, duration } = span(c);
  if (longerThan(c.input.startDate, end, SELECTION_MONTHS)) {
    return modalityFinding(c, {
      id: 'replacement_selection_3_months',
      status: 'over_legal_limit',
      calculation: [duration, phrase('modality.selection_over'), permanentOnBreach],
      ...onBreach,
    });
  }
  return modalityFinding(c, {
    id: 'replacement_selection_3_months',
    status: known ? 'within_limit' : 'not_entered',
    calculation: known
      ? [duration, phrase('modality.selection_within')]
      : [duration, phrase('modality.no_end_date')],
    agreementMaySetOther: true,
  });
}

// 11.2.g and 11.3.c. Over the maximum is only asked to review: sick leave, birth and the other
// suspensions of 11.4.b stop the count, and 11.4.d lifts the maximum for people with a disability.
function trainingDuration(
  c: Context,
  id: 'training_alternance_duration' | 'training_practice_duration',
  minMonths: number,
  maxMonths: number,
): Finding {
  const { end, known, duration } = span(c);
  const start = c.input.startDate;
  const limits = { minimo: { integer: minMonths }, maximo: { integer: maxMonths } };
  if (longerThan(start, end, maxMonths)) {
    return modalityFinding(c, {
      id,
      status: 'review_it',
      calculation: [
        duration,
        phrase('modality.training_too_long', limits),
        phrase('modality.training_max_disability'),
      ],
    });
  }
  if (!known) {
    return modalityFinding(c, {
      id,
      status: 'not_entered',
      calculation: [duration, phrase('modality.no_end_date')],
    });
  }
  if (shorterThan(start, end, minMonths)) {
    return modalityFinding(c, {
      id,
      status: 'below_minimum',
      calculation: [duration, phrase('modality.training_too_short', limits)],
    });
  }
  return modalityFinding(c, {
    id,
    status: 'within_limit',
    calculation: [duration, phrase('modality.training_within', limits)],
  });
}

// 11.2.i: effective work, as a share of the agreement's or the legal maximum working time.
function effectiveWork(c: Context): Finding {
  const { year1, year2 } = c.input.training?.effectiveWorkPercent ?? { year1: null, year2: null };
  const entered = [
    { year: 1, percent: year1, limit: ALTERNANCE_YEAR1_PERCENT },
    { year: 2, percent: year2, limit: ALTERNANCE_YEAR2_PERCENT },
  ].flatMap((y) => (y.percent === null ? [] : [{ ...y, percent: y.percent }]));
  if (entered.length === 0) {
    return modalityFinding(c, {
      id: 'training_alternance_effective_work',
      status: 'not_entered',
      calculation: [phrase('modality.effective_work_unknown')],
    });
  }
  return modalityFinding(c, {
    id: 'training_alternance_effective_work',
    status: entered.some((y) => y.percent > y.limit) ? 'over_legal_limit' : 'within_limit',
    calculation: entered.map((y) =>
      phrase('modality.effective_work', {
        anio: { integer: y.year },
        porcentaje: y.percent,
        limite: y.limit,
      }),
    ),
    basedOnYourAnswer: true,
  });
}

// 11.2.k: no night work or shifts, «excepcionalmente» allowed when the training needs it, which
// cannot be told from the contract. Overtime in training contracts is checked with working time.
function alternanceShifts(c: Context): readonly Finding[] {
  if (!c.input.shifts && c.input.nightWorker !== true) return [];
  return [
    modalityFinding(c, {
      id: 'training_alternance_no_overtime',
      status: 'review_it',
      calculation: [phrase('modality.alternance_shifts_or_night')],
    }),
  ];
}

// 11.3.b: concluded within three years of finishing the studies, five with a disability.
function practiceWindow(c: Context): Finding {
  const ended = c.input.training?.studiesEndedOn ?? null;
  if (ended === null) {
    return modalityFinding(c, {
      id: 'training_practice_window',
      status: 'not_entered',
      calculation: [phrase('modality.studies_end_unknown')],
    });
  }
  const disability = c.input.training?.disability ?? null;
  const after = (months: number) => compareDates(c.concluded, addMonthsClamped(ended, months)) > 0;
  const elapsed = wholeMonthsAndRest(ended, c.concluded).whole;
  const draft = (status: Finding['status'], limit: number, extra: EmploymentPhrase[] = []) =>
    modalityFinding(c, {
      id: 'training_practice_window',
      status,
      calculation: [
        phrase('modality.practice_window', {
          meses: { integer: elapsed },
          limite: { integer: limit },
        }),
        ...extra,
      ],
      basedOnYourAnswer: true,
    });
  const general = PRACTICE_WINDOW_MONTHS;
  const withDisability = PRACTICE_WINDOW_DISABILITY_MONTHS;
  if (after(withDisability)) return draft('over_legal_limit', withDisability);
  if (!after(general)) return draft('within_limit', general);
  if (disability === true) return draft('within_limit', withDisability);
  if (disability === false) return draft('over_legal_limit', general);
  return draft('review_it', general, [phrase('modality.practice_window_disability_unknown')]);
}

// 11.4.c: written, with the individual training plan in it.
function planAttached(c: Context): Finding {
  const attached = c.input.training?.planAttached ?? null;
  if (attached === false) {
    return modalityFinding(c, {
      id: 'training_plan_attached',
      status: 'missing_requirement',
      calculation: [phrase('modality.plan_missing')],
      basedOnYourAnswer: true,
    });
  }
  return modalityFinding(c, {
    id: 'training_plan_attached',
    status: attached === null ? 'not_entered' : 'within_limit',
    calculation: [phrase(attached === null ? 'modality.plan_unknown' : 'modality.plan_attached')],
    basedOnYourAnswer: attached !== null,
  });
}

// 16.2: the activity period, the working hours and their distribution, estimates allowed.
function discontinuousEssentials(c: Context): Finding {
  const d = c.input.discontinuous;
  const answers = d === null ? [null] : [d.activityPeriod, d.hours, d.distribution];
  if (answers.includes(false)) {
    return modalityFinding(c, {
      id: 'discontinuous_essentials',
      status: 'missing_requirement',
      calculation: [phrase('modality.discontinuous_missing')],
      basedOnYourAnswer: true,
    });
  }
  const unknown = answers.includes(null);
  return modalityFinding(c, {
    id: 'discontinuous_essentials',
    status: unknown ? 'not_entered' : 'within_limit',
    calculation: [
      phrase(unknown ? 'modality.discontinuous_unknown' : 'modality.discontinuous_stated'),
    ],
    basedOnYourAnswer: !unknown,
  });
}

// 8.2: training, part-time, fixed-discontinuous and fixed-term contracts of over four weeks are
// written; otherwise the contract is presumed open-ended and full-time, «salvo prueba en contrario».
function writtenForm(c: Context): readonly Finding[] {
  const { input } = c;
  const { end } = span(c);
  const partTime =
    input.partTime !== null ||
    (input.contractHours.weekly !== null &&
      input.contractHours.weekly < (input.fullTimeHours ?? LEGAL_WEEK_HOURS));
  const required =
    TRAINING.has(input.modality) ||
    input.modality === 'discontinuous' ||
    partTime ||
    (TEMPORARY.has(input.modality) && calendarDays(input.startDate, end) > WRITTEN_OVER_DAYS);
  if (!required || input.writtenContract === true) return [];
  if (input.writtenContract === null) {
    return [
      modalityFinding(c, {
        id: 'written_form',
        status: 'not_entered',
        calculation: [phrase('modality.written_unknown')],
      }),
    ];
  }
  return [
    modalityFinding(c, {
      id: 'written_form',
      status: 'missing_requirement',
      calculation: [phrase('modality.written_missing')],
      basedOnYourAnswer: true,
      literal: LAW_QUOTES.written_form,
    }),
  ];
}

// 15.1, 15.4 and transitional provisions 3.ª and 4.ª RDL 32/2021: from 30-03-2022 a fixed-term
// contract is concluded only for production or replacement.
const abolished = (c: Context): Finding =>
  modalityFinding(c, {
    id: 'abolished_modalities',
    status: 'becomes_permanent',
    calculation: [phrase('modality.abolished'), permanentOnBreach],
    ...onBreach,
  });

// An earlier name used for a contract that meets the requirements of a current modality.
const outdatedLabel = (c: Context, extra: EmploymentPhrase[] = []): Finding =>
  modalityFinding(c, {
    id: 'abolished_modalities',
    status: 'review_it',
    calculation: [phrase('modality.outdated_label'), ...extra],
  });

const production = (c: Context): readonly Finding[] => [
  causeStated(c),
  productionDuration(c),
  ...productionExtensions(c),
];

function byModality(c: Context): readonly Finding[] {
  switch (c.input.modality) {
    case 'permanent':
      return [
        modalityFinding(c, {
          id: 'fixed_term_presumption',
          status: 'within_limit',
          calculation: [phrase('modality.permanent')],
        }),
      ];
    case 'unknown':
      return [
        modalityFinding(c, {
          id: 'fixed_term_presumption',
          status: 'not_entered',
          calculation: [phrase('modality.unknown')],
        }),
      ];
    case 'discontinuous':
      return [discontinuousEssentials(c)];
    case 'work_or_service':
      return [abolished(c)];
    // «Eventual» named the production contract before the reform: with a production cause written
    // it is read as one; without any cause nothing makes it a current modality.
    case 'eventual':
      if (c.input.causeStated === false) return [abolished(c)];
      if (c.input.causeStated === null)
        return [outdatedLabel(c, [phrase('modality.cause_unknown')])];
      return [outdatedLabel(c), ...production(c)];
    // «Interinidad» became «sustitución»: with the person and the cause named it is read as one.
    case 'interim': {
      const { replacedPersonNamed: named, replacementCauseStated: cause } = c.input;
      if (named === false || cause === false) return [abolished(c)];
      if (named === null || cause === null)
        return [outdatedLabel(c, [phrase('modality.replacement_unknown')])];
      return [outdatedLabel(c), replacementStated(c)];
    }
    case 'production':
      return production(c);
    case 'production_occasional':
      return [causeStated(c), occasionalDays(c)];
    case 'replacement':
      return [replacementStated(c)];
    case 'replacement_selection':
      return [selectionDuration(c)];
    case 'training_alternance':
      return [
        trainingDuration(
          c,
          'training_alternance_duration',
          ALTERNANCE_MIN_MONTHS,
          ALTERNANCE_MAX_MONTHS,
        ),
        effectiveWork(c),
        ...alternanceShifts(c),
        planAttached(c),
      ];
    case 'training_practice':
      return [
        trainingDuration(c, 'training_practice_duration', PRACTICE_MIN_MONTHS, PRACTICE_MAX_MONTHS),
        practiceWindow(c),
        planAttached(c),
      ];
  }
}

// The contract's modality and its fixed-term limits under arts. 8.2, 11, 15 and 16 ET as worded
// by RDL 32/2021. A contract concluded before 30-03-2022 follows the earlier rules, which this
// review leaves out.
export function reviewModality(
  input: EmploymentInput,
  today: CivilDate,
  deps: TemporalityDeps,
): readonly Assessed[] {
  const reach = scope(input);
  if (!reach.inScope) return [];
  if (reach.partial) {
    return [
      single(
        cite(
          {
            id: 'fixed_term_presumption',
            item: 'modality',
            status: 'not_reviewed_in_this_version',
            calculation: [phrase('modality.before_reform')],
          },
          deps.norms,
        ),
      ),
    ];
  }
  const c: Context = { input, today, norms: deps.norms, concluded: concludedOn(input) };
  return [...byModality(c), ...writtenForm(c)].map(single);
}
