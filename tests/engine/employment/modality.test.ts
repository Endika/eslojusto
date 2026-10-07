import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
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

  it('«eventual» without any cause written is quoted under art. 15.4', () => {
    const f = byId(
      temporary('eventual', '2023-01-09', '2023-04-08', { causeStated: false }),
      'abolished_modalities',
    );
    expect(f.status).toBe('becomes_permanent');
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
    expect(all.map((f) => f.status)).toEqual(['review_it']);
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

  it('«interinidad» without the person named is quoted under art. 15.4', () => {
    const f = byId(
      temporary('interim', '2023-01-09', null, {
        replacedPersonNamed: false,
        replacementCauseStated: true,
      }),
      'abolished_modalities',
    );
    expect(f.status).toBe('becomes_permanent');
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

  it('a practice contract of four months is below the six-month minimum', () => {
    const input = temporary('training_practice', '2025-02-03', '2025-06-02', {
      training: {
        studiesEndedOn: parseDate('2024-06-30'),
        disability: false,
        planAttached: true,
        effectiveWorkPercent: { year1: null, year2: null },
      },
    });
    expect(byId(input, 'training_practice_duration').status).toBe('below_minimum');
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
