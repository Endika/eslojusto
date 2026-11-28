import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import { phrase } from '../../../src/engine/employment/calculation';
import { reviewModality } from '../../../src/engine/employment/modality';
import type { NormTable } from '../../../src/engine/employment/norms';
import { LAW_QUOTES } from '../../../src/engine/employment/quotes';
import { offerPass } from '../../../src/engine/employment/readings';
import type {
  Assessed,
  EmploymentInput,
  Finding,
  FindingStatus,
} from '../../../src/engine/employment/types';
import { contract } from './input';

const TODAY = parseDate('2026-10-07');
const deps = { norms: EMPLOYMENT_NORMS };

const findings = (input: EmploymentInput, norms: NormTable = EMPLOYMENT_NORMS): Finding[] =>
  reviewModality(input, TODAY, { norms }).map((a) => {
    if (a.kind !== 'single') throw new Error('modality findings are single');
    return a.finding;
  });

const byId = (input: EmploymentInput, id: Finding['id'], norms?: NormTable): Finding => {
  const found = findings(input, norms).find((f) => f.id === id);
  if (found === undefined) throw new Error(`no finding ${id}`);
  return found;
};

const keys = (f: Finding) => f.calculation.map((p) => p.key);
const sourceIds = (f: Finding) => f.sources.map((s) => s.id);

// A fixed-term contract concluded and started the same day.
const temporary = (
  modality: EmploymentInput['modality'],
  start: string,
  end: string | null,
  change: Partial<EmploymentInput> = {},
): EmploymentInput =>
  contract({
    modality,
    startDate: parseDate(start),
    signedOn: parseDate(start),
    endDate: end === null ? null : parseDate(end),
    causeStated: true,
    circumstancesStated: true,
    ...change,
  });

const production = (start: string, end: string | null, change: Partial<EmploymentInput> = {}) =>
  temporary('production', start, end, change);

describe('reviewModality: abolished modalities', () => {
  it('a work-or-service contract of 2023: art. 15.4 quoted, never asserted', () => {
    const f = byId(
      temporary('work_or_service', '2023-05-02', '2024-05-01'),
      'abolished_modalities',
    );
    expect(f.status).toBe<FindingStatus>('becomes_permanent');
    expect(keys(f)).toEqual(['modality.abolished', 'modality.permanent_on_breach']);
    expect(f.literal).toEqual(LAW_QUOTES.permanent_on_breach);
    expect(f.literal?.text).toBe(
      'Las personas contratadas incumpliendo lo establecido en este artículo adquirirán la condición de fijas.',
    );
    expect(sourceIds(f)).toEqual(['abolished_modalities', 'permanent_on_breach']);
    expect(f.sources[1]?.url).toBe('https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430#a15');
    expect(
      offerPass(reviewModality(temporary('work_or_service', '2023-05-02', null), TODAY, deps)),
    ).toBe(true);
  });

  it('the same contract started on 15-01-2022 is not reviewed in this version', () => {
    const assessed = reviewModality(
      temporary('work_or_service', '2022-01-15', '2022-07-14'),
      TODAY,
      deps,
    );
    expect(assessed).toHaveLength(1);
    const [only] = assessed;
    expect(only?.kind === 'single' && only.finding.status).toBe('not_reviewed_in_this_version');
    expect(only?.kind === 'single' && keys(only.finding)).toEqual(['modality.before_reform']);
    expect(offerPass(assessed)).toBe(false);
  });

  it('signed before the reform and started after it is not reviewed either', () => {
    const input = temporary('work_or_service', '2022-04-04', null, {
      signedOn: parseDate('2022-03-25'),
    });
    expect(findings(input).map((f) => f.status)).toEqual(['not_reviewed_in_this_version']);
  });

  it('«eventual» without any cause written is asked to review, like a production contract', () => {
    const input = temporary('eventual', '2023-01-09', '2023-04-08', { causeStated: false });
    expect(findings(input).map((f) => [f.id, f.status])).toEqual([
      ['abolished_modalities', 'review_it'],
      ['fixed_term_presumption', 'review_it'],
      ['production_6_months', 'within_limit'],
    ]);
    expect(byId(input, 'fixed_term_presumption').literal).toEqual(
      LAW_QUOTES.fixed_term_presumption,
    );
    expect(offerPass(reviewModality(input, TODAY, deps))).toBe(false);
  });

  it('«eventual» with its production cause is read as a production contract', () => {
    const all = findings(temporary('eventual', '2023-01-09', '2023-04-08'));
    expect(all.map((f) => [f.id, f.status])).toEqual([
      ['abolished_modalities', 'review_it'],
      ['fixed_term_presumption', 'within_limit'],
      ['production_6_months', 'within_limit'],
    ]);
  });

  it('«eventual» with the cause unknown only asks to review it', () => {
    const all = findings(temporary('eventual', '2023-01-09', '2023-04-08', { causeStated: null }));
    expect(all.map((f) => f.status)).toEqual(['review_it', 'not_entered', 'within_limit']);
  });

  it('«interinidad» naming the person and the cause is read as a replacement', () => {
    const all = findings(
      temporary('interim', '2023-01-09', null, {
        replacedPersonNamed: true,
        replacementCauseStated: true,
      }),
    );
    expect(all.map((f) => [f.id, f.status])).toEqual([
      ['abolished_modalities', 'review_it'],
      ['replacement_name_cause', 'within_limit'],
    ]);
  });

  it('«interinidad» without the person named misses art. 15.3, like a replacement', () => {
    const input = temporary('interim', '2023-01-09', null, {
      replacedPersonNamed: false,
      replacementCauseStated: true,
    });
    expect(findings(input).map((f) => [f.id, f.status])).toEqual([
      ['abolished_modalities', 'review_it'],
      ['replacement_name_cause', 'missing_requirement'],
    ]);
    expect(offerPass(reviewModality(input, TODAY, deps))).toBe(false);
  });
});

describe('reviewModality: production', () => {
  it('six months to the day are within the limit', () => {
    expect(byId(production('2025-01-15', '2025-07-14'), 'production_6_months').status).toBe(
      'within_limit',
    );
  });

  it('seven months depend on the sectoral agreement and never open the pass', () => {
    const input = production('2025-01-01', '2025-07-31');
    const f = byId(input, 'production_1_year');
    expect(f.status).toBe('depends_on_agreement');
    expect(f.agreementMaySetOther).toBe(true);
    expect(f.literal).toBeNull();
    expect(f.calculation).toEqual([
      { key: 'modality.duration', vars: { meses: { integer: 7 }, dias: { integer: 0 } } },
      { key: 'modality.production_agreement_year' },
    ]);
    expect(offerPass(reviewModality(input, TODAY, deps))).toBe(false);
  });

  it('a day over six months already depends on the agreement', () => {
    expect(byId(production('2025-01-15', '2025-07-15'), 'production_1_year').status).toBe(
      'depends_on_agreement',
    );
  });

  it('thirteen months are over the legal limit whatever the agreement says', () => {
    const input = production('2025-01-01', '2026-01-31');
    const f = byId(input, 'production_1_year');
    expect(f.status).toBe('over_legal_limit');
    expect(f.agreementMaySetOther).toBe(false);
    expect(f.literal).toEqual(LAW_QUOTES.permanent_on_breach);
    expect(keys(f)).toEqual([
      'modality.duration',
      'modality.production_over_year',
      'modality.permanent_on_breach',
    ]);
    expect(offerPass(reviewModality(input, TODAY, deps))).toBe(true);
  });

  it('two extensions are over the legal limit; one is within', () => {
    const twice = byId(
      production('2025-01-01', '2025-05-31', { extensions: 2 }),
      'production_one_extension',
    );
    expect(twice.status).toBe('over_legal_limit');
    expect(twice.calculation[0]).toEqual({
      key: 'modality.extensions',
      vars: { prorrogas: { integer: 2 } },
    });
    expect(
      byId(production('2025-01-01', '2025-05-31', { extensions: 1 }), 'production_one_extension')
        .status,
    ).toBe('within_limit');
    expect(
      findings(production('2025-01-01', '2025-05-31')).some(
        (f) => f.id === 'production_one_extension',
      ),
    ).toBe(false);
  });

  it('without an end date it measures so far and says the end is missing', () => {
    const early = byId(production('2026-08-01', null), 'production_6_months');
    expect(early.status).toBe('not_entered');
    expect(keys(early)).toEqual(['modality.duration_so_far', 'modality.no_end_date']);
    const late = byId(production('2025-06-01', null), 'production_1_year');
    expect(late.status).toBe('over_legal_limit');
    expect(keys(late)[0]).toBe('modality.duration_so_far');
  });

  it('a missing cause is only asked to review, quoting art. 15.1', () => {
    const f = byId(
      production('2025-01-01', '2025-03-31', { circumstancesStated: false }),
      'fixed_term_presumption',
    );
    expect(f.status).toBe('review_it');
    expect(f.basedOnYourAnswer).toBe(true);
    expect(f.literal).toEqual(LAW_QUOTES.fixed_term_presumption);
    expect(
      byId(production('2025-01-01', '2025-03-31', { causeStated: null }), 'fixed_term_presumption')
        .status,
    ).toBe('not_entered');
  });
});

describe('reviewModality: occasional production', () => {
  const occasional = (start: string, end: string) => temporary('production_occasional', start, end);

  it('within the 90 days, says the law forbids using them continuously, unchecked', () => {
    const f = byId(occasional('2024-03-01', '2024-05-29'), 'production_occasional_90');
    expect(f.status).toBe('within_limit');
    expect(f.calculation.map((p) => p.key)).toContain('modality.occasional_not_continuous');
  });

  it('91 days in 2024 are over the 90 a year', () => {
    const f = byId(occasional('2024-03-01', '2024-05-30'), 'production_occasional_90');
    expect(f.status).toBe('over_legal_limit');
    expect(f.calculation[0]).toEqual({
      key: 'modality.occasional_days',
      vars: { anio: { integer: 2024 }, dias: { integer: 91 }, limite: { integer: 90 } },
    });
  });

  it('100 days in 2025 may be within the agri-food 120, so it is only asked to review', () => {
    const f = byId(occasional('2025-03-01', '2025-06-08'), 'production_occasional_agrifood_120');
    expect(f.status).toBe('review_it');
    expect(keys(f)).toContain('modality.occasional_agrifood');
  });

  it('130 days in 2025 are over even the agri-food 120', () => {
    const f = byId(occasional('2025-03-01', '2025-07-08'), 'production_occasional_agrifood_120');
    expect(f.status).toBe('over_legal_limit');
  });

  it('days are counted per calendar year', () => {
    expect(byId(occasional('2023-11-01', '2024-01-31'), 'production_occasional_90').status).toBe(
      'within_limit',
    );
  });
});

describe('reviewModality: replacement', () => {
  it('a replacement without the person named is missing what art. 15.3 requires', () => {
    const input = temporary('replacement', '2024-02-05', null, {
      replacedPersonNamed: false,
      replacementCauseStated: true,
    });
    const f = byId(input, 'replacement_name_cause');
    expect(f.status).toBe('missing_requirement');
    expect(f.literal).toEqual(LAW_QUOTES.replacement_name_cause);
    expect(offerPass(reviewModality(input, TODAY, deps))).toBe(false);
  });

  it('covering a selection process over three months is over the limit for certain', () => {
    const f = byId(
      temporary('replacement_selection', '2025-01-01', '2025-04-15'),
      'replacement_selection_3_months',
    );
    expect(f.status).toBe('over_legal_limit');
    expect(f.agreementMaySetOther).toBe(false);
  });

  it('within three months the agreement may still set a shorter one', () => {
    const f = byId(
      temporary('replacement_selection', '2025-01-01', '2025-03-31'),
      'replacement_selection_3_months',
    );
    expect(f.status).toBe('within_limit');
    expect(f.agreementMaySetOther).toBe(true);
  });
});

describe('reviewModality: training', () => {
  const practice = (studiesEndedOn: string, disability: boolean | null) =>
    temporary('training_practice', '2025-02-03', '2026-02-02', {
      training: {
        studiesEndedOn: parseDate(studiesEndedOn),
        disability,
        planAttached: true,
        effectiveWorkPercent: { year1: null, year2: null },
      },
    });

  it('practice four years after the studies is over the limit; with a disability it is within', () => {
    expect(byId(practice('2021-01-15', false), 'training_practice_window').status).toBe(
      'over_legal_limit',
    );
    expect(byId(practice('2021-01-15', true), 'training_practice_window').status).toBe(
      'within_limit',
    );
    const unknown = byId(practice('2021-01-15', null), 'training_practice_window');
    expect(unknown.status).toBe('review_it');
    expect(keys(unknown)).toContain('modality.practice_window_disability_unknown');
  });

  it('practice two years after the studies is within; six years is over even with a disability', () => {
    expect(byId(practice('2023-02-01', false), 'training_practice_window').status).toBe(
      'within_limit',
    );
    expect(byId(practice('2019-01-15', true), 'training_practice_window').status).toBe(
      'over_legal_limit',
    );
  });

  it('a practice contract of four months is only asked to review: it may have ended early', () => {
    const input = temporary('training_practice', '2025-02-03', '2025-06-02', {
      training: {
        studiesEndedOn: parseDate('2024-06-30'),
        disability: false,
        planAttached: true,
        effectiveWorkPercent: { year1: null, year2: null },
      },
    });
    const f = byId(input, 'training_practice_duration');
    expect(f.status).toBe('review_it');
    expect(keys(f)).toContain('modality.training_too_short');
  });

  it('a training contract over its maximum is only asked to review', () => {
    const input = temporary('training_practice', '2024-02-05', '2025-04-04', {
      training: {
        studiesEndedOn: parseDate('2023-06-30'),
        disability: false,
        planAttached: true,
        effectiveWorkPercent: { year1: null, year2: null },
      },
    });
    const f = byId(input, 'training_practice_duration');
    expect(f.status).toBe('review_it');
    expect(keys(f)).toContain('modality.training_max_disability');
  });

  it('alternance over 65 % of effective work the first year is over the limit', () => {
    const input = temporary('training_alternance', '2025-09-01', '2026-08-31', {
      training: {
        studiesEndedOn: null,
        disability: false,
        planAttached: false,
        effectiveWorkPercent: { year1: 70, year2: null },
      },
      shifts: true,
    });
    expect(findings(input).map((f) => [f.id, f.status])).toEqual([
      ['training_alternance_duration', 'within_limit'],
      ['training_alternance_effective_work', 'over_legal_limit'],
      ['training_alternance_no_overtime', 'review_it'],
      ['training_plan_attached', 'missing_requirement'],
    ]);
  });
});

describe('reviewModality: written form and fixed-discontinuous', () => {
  it('a fixed-term contract of two months not in writing carries the presumption of art. 8.2', () => {
    const f = byId(
      production('2025-01-01', '2025-02-28', { writtenContract: false }),
      'written_form',
    );
    expect(f.status).toBe('missing_requirement');
    expect(f.literal).toEqual(LAW_QUOTES.written_form);
  });

  it('three weeks, or a full-time permanent contract, need no writing', () => {
    expect(
      findings(production('2025-01-01', '2025-01-21', { writtenContract: false })).some(
        (f) => f.id === 'written_form',
      ),
    ).toBe(false);
    expect(
      findings(contract({ writtenContract: false })).some((f) => f.id === 'written_form'),
    ).toBe(false);
  });

  it('a work-or-service contract of any length needs writing', () => {
    const input = temporary('work_or_service', '2023-05-02', '2023-05-19', {
      writtenContract: false,
    });
    expect(byId(input, 'written_form').status).toBe('missing_requirement');
  });

  it('regular remote work from 30 % needs writing; under it does not', () => {
    expect(byId(contract({ writtenContract: false, remoteShare: 30 }), 'written_form').status).toBe(
      'missing_requirement',
    );
    expect(
      findings(contract({ writtenContract: false, remoteShare: 29 })).some(
        (f) => f.id === 'written_form',
      ),
    ).toBe(false);
  });

  it('a part-time permanent contract does', () => {
    const input = contract({ writtenContract: false, contractHours: { weekly: 20, annual: null } });
    expect(byId(input, 'written_form').status).toBe('missing_requirement');
  });

  it('a fixed-discontinuous contract without the distribution of hours misses art. 16.2', () => {
    const input = contract({
      modality: 'discontinuous',
      discontinuous: { activityPeriod: true, hours: true, distribution: false },
    });
    expect(byId(input, 'discontinuous_essentials').status).toBe('missing_requirement');
  });
});

describe('reviewModality: dependencies and boundaries', () => {
  it('a permanent contract is within; an unknown modality is not entered', () => {
    expect(findings(contract()).map((f) => f.status)).toEqual(['within_limit']);
    expect(findings(contract({ modality: 'unknown' })).map((f) => f.status)).toEqual([
      'not_entered',
    ]);
  });

  it('out of scope there is nothing to review', () => {
    expect(reviewModality(contract({ relationship: 'household' }), TODAY, deps)).toEqual([]);
  });

  it('a doubtful reform only asks to review what would open the pass', () => {
    const norms: NormTable = {
      ...EMPLOYMENT_NORMS,
      rdl32_2021: { ...EMPLOYMENT_NORMS.rdl32_2021, status: 'pending_validation' },
    };
    const input = temporary('work_or_service', '2023-05-02', null);
    const f = byId(input, 'abolished_modalities', norms);
    expect(f.status).toBe('review_it');
    expect(keys(f)).toContain('modality.rule_in_doubt');
    expect(f.sources[0]?.status).toBe('pending_validation');
    expect(offerPass(reviewModality(input, TODAY, { norms }))).toBe(false);
  });

  it('without the agri-food amendment in force, 100 days in 2025 are over the 90', () => {
    const norms: NormTable = {
      ...EMPLOYMENT_NORMS,
      law1_2025: { ...EMPLOYMENT_NORMS.law1_2025, inForceSince: '2026-01-01' },
    };
    const f = byId(
      temporary('production_occasional', '2025-03-01', '2025-06-08'),
      'production_occasional_90',
      norms,
    );
    expect(f.status).toBe('over_legal_limit');
  });

  it('never carries an amount', () => {
    const all: Assessed[] = [
      ...reviewModality(production('2025-01-01', '2026-01-31', { extensions: 2 }), TODAY, deps),
      ...reviewModality(temporary('work_or_service', '2023-05-02', null), TODAY, deps),
    ];
    for (const a of all) if (a.kind === 'single') expect(a.finding.amount).toBeNull();
  });
});

describe('temporality copy', () => {
  it.each([
    'src/engine/employment/modality.ts',
    'src/engine/employment/chaining.ts',
    'src/engine/employment/fixed-term.ts',
    'src/engine/employment/quotes.ts',
    'src/engine/employment/reference.ts',
    'src/engine/employment/calculation.ts',
  ])('%s never says the person is permanent', (file) => {
    const text = readFileSync(file, 'utf8').toLowerCase();
    for (const asserted of [/eres fij[oa]/, /te convierte/, /pasas a ser/, /ya eres/]) {
      expect(text).not.toMatch(asserted);
    }
  });
});

describe('reviewModality: what each finding says', () => {
  const anyTraining = (change: Partial<NonNullable<EmploymentInput['training']>> = {}) => ({
    studiesEndedOn: null,
    disability: null,
    planAttached: null,
    effectiveWorkPercent: { year1: null, year2: null },
    ...change,
  });
  const says = (f: Finding) => [f.status, keys(f), f.basedOnYourAnswer];

  it.each([
    ['a cause not written', { causeStated: false }, 'review_it', ['modality.cause_missing'], true],
    [
      'circumstances not known',
      { circumstancesStated: null },
      'not_entered',
      ['modality.cause_unknown'],
      false,
    ],
    ['both written', {}, 'within_limit', ['modality.cause_stated'], true],
  ])('production with %s', (_name, change, status, calculation, basedOn) => {
    expect(
      says(byId(production('2025-01-01', '2025-05-31', change), 'fixed_term_presumption')),
    ).toEqual([status, calculation, basedOn]);
  });

  it('production within six months says its duration and that it fits', () => {
    expect(keys(byId(production('2025-01-01', '2025-05-31'), 'production_6_months'))).toEqual([
      'modality.duration',
      'modality.production_within',
    ]);
  });

  it.each([
    ['named and stated', {}, 'within_limit', ['modality.replacement_stated'], true],
    [
      'cause not stated',
      { replacementCauseStated: false },
      'missing_requirement',
      ['modality.replacement_missing'],
      true,
    ],
    [
      'person not known',
      { replacedPersonNamed: null },
      'not_entered',
      ['modality.replacement_unknown'],
      false,
    ],
    [
      'cause not known',
      { replacementCauseStated: null },
      'not_entered',
      ['modality.replacement_unknown'],
      false,
    ],
  ])('a replacement with the person %s', (_name, change, status, calculation, basedOn) => {
    const input = temporary('replacement', '2025-01-01', '2025-05-31', {
      replacedPersonNamed: true,
      replacementCauseStated: true,
      ...change,
    });
    expect(says(byId(input, 'replacement_name_cause'))).toEqual([status, calculation, basedOn]);
  });

  it('a selection cover says what it fits, and that the agreement may shorten it', () => {
    const f = byId(
      temporary('replacement_selection', '2025-01-01', '2025-02-28'),
      'replacement_selection_3_months',
    );
    expect(says(f)).toEqual([
      'within_limit',
      ['modality.duration', 'modality.selection_within'],
      false,
    ]);
    expect(f.agreementMaySetOther).toBe(true);
  });

  it('a selection cover without an end says so', () => {
    const f = byId(
      temporary('replacement_selection', '2026-08-01', null),
      'replacement_selection_3_months',
    );
    expect(says(f)).toEqual([
      'not_entered',
      ['modality.duration_so_far', 'modality.no_end_date'],
      false,
    ]);
  });

  it('a selection cover over three months says it makes the contract permanent', () => {
    const f = byId(
      temporary('replacement_selection', '2025-01-01', '2025-06-30'),
      'replacement_selection_3_months',
    );
    expect(keys(f)).toEqual([
      'modality.duration',
      'modality.selection_over',
      'modality.permanent_on_breach',
    ]);
  });

  describe('occasional production', () => {
    const occasional = (start: string, end: string | null) =>
      byId(temporary('production_occasional', start, end), 'production_occasional_90');
    const days = (anio: number, dias: number) =>
      phrase('modality.occasional_days', {
        anio: { integer: anio },
        dias: { integer: dias },
        limite: { integer: 90 },
      });

    it('without an end date it says so', () => {
      const f = occasional('2026-09-01', null);
      expect(f.status).toBe('not_entered');
      expect(keys(f)).toEqual([
        'modality.occasional_days',
        'modality.no_end_date',
        'modality.occasional_not_continuous',
      ]);
    });

    it('reads the calendar year with the most days, the first one on a tie', () => {
      expect(occasional('2024-11-01', '2025-01-20').calculation[0]).toEqual(days(2024, 61));
      expect(occasional('2024-12-20', '2025-03-10').calculation[0]).toEqual(days(2025, 69));
      expect(occasional('2024-12-27', '2025-01-05').calculation[0]).toEqual(days(2024, 5));
    });
  });

  describe('training', () => {
    const limits = { minimo: { integer: 3 }, maximo: { integer: 24 } };
    const alternance = (end: string | null, change: Partial<EmploymentInput> = {}) =>
      temporary('training_alternance', '2025-09-01', end, change);

    it('says its limits when within them, and when over the maximum', () => {
      expect(says(byId(alternance('2026-08-31'), 'training_alternance_duration'))).toEqual([
        'within_limit',
        ['modality.duration', 'modality.training_within'],
        false,
      ]);
      expect(byId(alternance('2026-08-31'), 'training_alternance_duration').calculation[1]).toEqual(
        phrase('modality.training_within', limits),
      );
      expect(byId(alternance('2027-09-01'), 'training_alternance_duration').calculation).toEqual([
        phrase('modality.duration', { meses: { integer: 24 }, dias: { integer: 1 } }),
        phrase('modality.training_too_long', limits),
        phrase('modality.training_max_disability'),
      ]);
    });

    it('without an end date it says so, and never that it is too short', () => {
      expect(
        says(
          byId(
            alternance(null, { startDate: parseDate('2026-08-01') }),
            'training_alternance_duration',
          ),
        ),
      ).toEqual(['not_entered', ['modality.duration_so_far', 'modality.no_end_date'], false]);
    });

    it.each([
      ['no training data', null, 'not_entered', ['modality.effective_work_unknown']],
      [
        '65 % in the first year',
        anyTraining({ effectiveWorkPercent: { year1: 65, year2: null } }),
        'within_limit',
        ['modality.effective_work'],
      ],
      [
        'an excess only in the first year',
        anyTraining({ effectiveWorkPercent: { year1: 70, year2: 80 } }),
        'over_legal_limit',
        ['modality.effective_work', 'modality.effective_work'],
      ],
    ])('the effective work with %s', (_name, training, status, calculation) => {
      const f = byId(alternance('2026-08-31', { training }), 'training_alternance_effective_work');
      expect(f.status).toBe(status);
      expect(keys(f)).toEqual(calculation);
      expect(f.basedOnYourAnswer).toBe(calculation[0] === 'modality.effective_work');
    });

    it('the effective work carries the year, the percentage and the limit', () => {
      const training = anyTraining({ effectiveWorkPercent: { year1: 60, year2: 90 } });
      expect(
        byId(alternance('2026-08-31', { training }), 'training_alternance_effective_work')
          .calculation,
      ).toEqual([
        phrase('modality.effective_work', { anio: { integer: 1 }, porcentaje: 60, limite: 65 }),
        phrase('modality.effective_work', { anio: { integer: 2 }, porcentaje: 90, limite: 85 }),
      ]);
    });

    it.each([['night work', { shifts: false, nightWorker: true }, true]])(
      'an alternance contract with %s',
      (_name, change, flagged) => {
        const f = findings(alternance('2026-08-31', change)).find(
          (x) => x.id === 'training_alternance_no_overtime',
        );
        expect(f === undefined ? null : [f.status, keys(f)]).toEqual(
          flagged ? ['review_it', ['modality.alternance_shifts_or_night']] : null,
        );
      },
    );

    it.each([
      ['not known', null, 'not_entered', 'modality.plan_unknown', false],
      ['missing', false, 'missing_requirement', 'modality.plan_missing', true],
      ['attached', true, 'within_limit', 'modality.plan_attached', true],
    ])('the training plan %s', (_name, planAttached, status, key, basedOn) => {
      const f = byId(
        alternance('2026-08-31', { training: anyTraining({ planAttached }) }),
        'training_plan_attached',
      );
      expect(says(f)).toEqual([status, [key], basedOn]);
    });

    const practice = (
      concluded: string,
      studiesEndedOn: string | null,
      disability: boolean | null,
    ) =>
      byId(
        temporary('training_practice', concluded, '2026-12-31', {
          training: anyTraining({
            studiesEndedOn: studiesEndedOn === null ? null : parseDate(studiesEndedOn),
            disability,
          }),
        }),
        'training_practice_window',
      );

    it('the studies end not known', () => {
      expect(says(practice('2025-02-03', null, null))).toEqual([
        'not_entered',
        ['modality.studies_end_unknown'],
        false,
      ]);
      const withoutTraining = byId(
        temporary('training_practice', '2025-02-03', '2025-12-31'),
        'training_practice_window',
      );
      expect(says(withoutTraining)).toEqual([
        'not_entered',
        ['modality.studies_end_unknown'],
        false,
      ]);
    });

    it('says the months elapsed and the limit it was read against', () => {
      expect(practice('2025-02-03', '2023-02-03', false).calculation).toEqual([
        phrase('modality.practice_window', { meses: { integer: 24 }, limite: { integer: 36 } }),
      ]);
      expect(practice('2025-02-03', '2023-02-03', false).basedOnYourAnswer).toBe(true);
    });

    it.each([['on the last day of three years', '2022-02-03', false, 'within_limit']])(
      'a practice contract concluded %s',
      (_name, studiesEnd, disability, status) => {
        expect(practice('2025-02-03', studiesEnd, disability).status).toBe(status);
      },
    );
  });

  describe('fixed-discontinuous', () => {
    const discontinuous = (d: EmploymentInput['discontinuous']) =>
      byId(contract({ modality: 'discontinuous', discontinuous: d }), 'discontinuous_essentials');

    it.each([
      ['nothing entered', null, 'not_entered', 'modality.discontinuous_unknown', false],
      [
        'the hours missing',
        { activityPeriod: true, hours: false, distribution: true },
        'missing_requirement',
        'modality.discontinuous_missing',
        true,
      ],
      [
        'everything stated',
        { activityPeriod: true, hours: true, distribution: true },
        'within_limit',
        'modality.discontinuous_stated',
        true,
      ],
    ])('with %s', (_name, d, status, key, basedOn) => {
      expect(says(discontinuous(d))).toEqual([status, [key], basedOn]);
    });
  });

  describe('written form', () => {
    const unwritten = (change: Partial<EmploymentInput>) =>
      findings(contract({ writtenContract: false, ...change })).find(
        (f) => f.id === 'written_form',
      );

    it.each([
      [
        'a part-time arrangement',
        {
          partTime: {
            hoursStated: true,
            distributionStated: true,
            complementary: null,
            voluntaryPercent: null,
          },
        },
      ],
    ])('is required for %s', (_name, change) => {
      expect(unwritten(change)?.status).toBe('missing_requirement');
    });

    it.each([
      [
        'a fixed-term contract of 28 days',
        {
          modality: 'production' as const,
          startDate: parseDate('2025-01-01'),
          endDate: parseDate('2025-01-28'),
        },
      ],
    ])('is not required for %s', (_name, change) => {
      expect(unwritten(change)).toBeUndefined();
    });

    it('says what is missing, and that it rests on the answer', () => {
      const f = unwritten({ modality: 'work_or_service' });
      expect(says(f as Finding)).toEqual([
        'missing_requirement',
        ['modality.written_missing'],
        true,
      ]);
    });

    it('with the answer unknown, says so', () => {
      const f = findings(contract({ writtenContract: null, modality: 'discontinuous' })).find(
        (x) => x.id === 'written_form',
      );
      expect(f && says(f)).toEqual(['not_entered', ['modality.written_unknown'], false]);
    });
  });

  describe('the modalities themselves', () => {
    it('a permanent contract and an unknown modality', () => {
      expect(says(byId(contract({ modality: 'permanent' }), 'fixed_term_presumption'))).toEqual([
        'within_limit',
        ['modality.permanent'],
        false,
      ]);
      expect(says(byId(contract({ modality: 'unknown' }), 'fixed_term_presumption'))).toEqual([
        'not_entered',
        ['modality.unknown'],
        false,
      ]);
    });

    it.each(['eventual'] as const)('an outdated %s name asks to review', (modality) => {
      const input = temporary(modality, '2025-01-01', '2025-04-30', {
        replacedPersonNamed: true,
        replacementCauseStated: true,
      });
      expect(says(byId(input, 'abolished_modalities'))).toEqual([
        'review_it',
        ['modality.outdated_label'],
        false,
      ]);
    });

    it('a contract before the reform is filed under the modality item', () => {
      const [only] = reviewModality(
        temporary('production', '2022-01-10', '2022-05-31'),
        TODAY,
        deps,
      );
      expect(only?.kind === 'single' && only.finding.item).toBe('modality');
    });
  });
});
