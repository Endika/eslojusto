import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { phrase } from '../../../src/engine/employment/calculation';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import { offerPass } from '../../../src/engine/employment/readings';
import { assessTrialPeriod } from '../../../src/engine/employment/trial-period';
import type { Assessed, EmploymentInput, Finding } from '../../../src/engine/employment/types';
import { contract } from './input';

const assess = (change: Partial<EmploymentInput>): Assessed =>
  assessTrialPeriod(contract(change), EMPLOYMENT_NORMS);

const only = (assessed: Assessed): Finding => {
  if (assessed.kind !== 'single') throw new Error('expected a single finding');
  return assessed.finding;
};

const months = (amount: number) => ({ amount, unit: 'months' as const });
const monthsPhrase = (amount: number) => phrase('trial.amount_months', { amount });

const statusesOf = (assessed: Assessed) =>
  assessed.kind === 'single'
    ? assessed.finding.status
    : assessed.readings.map((r) => [r.when, r.finding.status]);

describe('trial period against art. 14.1 ET', () => {
  it('six months for a qualified technician is within the limit', () => {
    const finding = only(assess({ trial: months(6), technical: true }));
    expect(finding).toMatchObject({ id: 'trial_limits', status: 'within_limit' });
    expect(finding.sources.map((s) => s.id)).toEqual(['trial_limits']);
  });

  it('three months for a non-technician in a company of 25 or more depends on the agreement', () => {
    const finding = only(assess({ trial: months(3), technical: false, smallCompany: false }));
    expect(finding).toMatchObject({
      status: 'depends_on_agreement',
      agreementMaySetOther: true,
      calculation: [phrase('trial.over_legal_limit', { trial: monthsPhrase(3), months: 2 })],
    });
    expect(offerPass([single(finding)])).toBe(false);
  });

  it('three months for a non-technician in a company under 25 is within the limit', () => {
    expect(only(assess({ trial: months(3), technical: false, smallCompany: true })).status).toBe(
      'within_limit',
    );
  });

  it('«No lo sé» on staff size with three months gives both limits and no pass', () => {
    const assessed = assess({ trial: months(3), technical: false, smallCompany: null });
    expect(statusesOf(assessed)).toEqual([
      ['under_25_staff', 'within_limit'],
      ['from_25_staff', 'depends_on_agreement'],
    ]);
    expect(offerPass([assessed])).toBe(false);
  });

  it('«No lo sé» on being a technician with four months cites each limit', () => {
    const assessed = assess({ trial: months(4), technical: null, smallCompany: false });
    expect(assessed).toMatchObject({
      kind: 'readings',
      question: 'technical',
      readings: [
        {
          when: 'technical',
          finding: {
            status: 'within_limit',
            calculation: [
              phrase('trial.within_legal_limit', { trial: monthsPhrase(4), months: 6 }),
            ],
          },
        },
        {
          when: 'not_technical',
          finding: {
            status: 'depends_on_agreement',
            calculation: [phrase('trial.over_legal_limit', { trial: monthsPhrase(4), months: 2 })],
          },
        },
      ],
    });
  });

  it('«No lo sé» on both questions opens up to three readings', () => {
    const assessed = assess({ trial: months(4), technical: null, smallCompany: null });
    expect(assessed.kind === 'readings' && assessed.question).toBe('technical_and_staff');
    expect(statusesOf(assessed)).toEqual([
      ['technical', 'within_limit'],
      ['not_technical_under_25_staff', 'depends_on_agreement'],
      ['not_technical_from_25_staff', 'depends_on_agreement'],
    ]);
  });

  it('within every limit that could apply, one finding with the tightest limit', () => {
    const assessed = assess({ trial: months(2), technical: null, smallCompany: null });
    expect(only(assessed)).toMatchObject({
      status: 'within_limit',
      basedOnYourAnswer: true,
      calculation: [phrase('trial.within_legal_limit', { trial: monthsPhrase(2), months: 2 })],
    });
  });

  it('measures a trial in days against calendar months from the start', () => {
    // 01-01-2026 plus two months ends on 28-02-2026: 59 days.
    const start = { startDate: parseDate('2026-01-01'), technical: false, smallCompany: false };
    expect(only(assess({ ...start, trial: { amount: 59, unit: 'days' } })).status).toBe(
      'within_limit',
    );
    expect(only(assess({ ...start, trial: { amount: 60, unit: 'days' } })).status).toBe(
      'depends_on_agreement',
    );
    expect(only(assess({ ...start, trial: { amount: 9, unit: 'weeks' } })).status).toBe(
      'depends_on_agreement',
    );
  });

  it('a fixed-term contract of five months allows one month', () => {
    const finding = only(
      assess({
        modality: 'production',
        startDate: parseDate('2026-01-01'),
        endDate: parseDate('2026-05-31'),
        trial: months(2),
        technical: true,
      }),
    );
    expect(finding).toMatchObject({
      id: 'trial_temporary_1_month',
      status: 'depends_on_agreement',
    });
  });

  it('a fixed-term contract of seven months follows the general limit', () => {
    const finding = only(
      assess({
        modality: 'production',
        startDate: parseDate('2026-01-01'),
        endDate: parseDate('2026-07-31'),
        trial: months(2),
        technical: false,
        smallCompany: false,
      }),
    );
    expect(finding).toMatchObject({ id: 'trial_limits', status: 'within_limit' });
  });

  it('a fixed-term contract without an end date says when one month would apply', () => {
    const finding = only(
      assess({
        modality: 'replacement',
        endDate: null,
        trial: months(2),
        technical: false,
        smallCompany: false,
      }),
    );
    expect(finding.calculation).toContainEqual(
      phrase('trial.temporary_end_unknown', { months: 1 }),
    );
    expect(only(assess({ modality: 'replacement', endDate: null, trial: months(1) })).id).toBe(
      'trial_temporary_1_month',
    );
  });

  it('a practice training contract allows one month unless the agreement says otherwise', () => {
    const finding = only(assess({ modality: 'training_practice', trial: months(2) }));
    expect(finding).toMatchObject({
      id: 'training_practice_trial',
      status: 'depends_on_agreement',
    });
  });

  it('compares with the agreement limit the person gives, by their data', () => {
    const agreement = { ...contract().agreement, trialMonths: 4 };
    expect(only(assess({ agreement, trial: months(3) }))).toMatchObject({
      status: 'within_limit',
      basedOnYourAnswer: true,
    });
    expect(only(assess({ agreement, trial: months(6) }))).toMatchObject({
      status: 'over_legal_limit',
      calculation: [phrase('trial.over_your_agreement', { trial: monthsPhrase(6), months: 4 })],
    });
  });
});

describe('void and unwritten trial periods', () => {
  it('the same duties performed before make it void (art. 14.1), whatever its length', () => {
    const finding = only(
      assess({
        modality: 'production',
        startDate: parseDate('2026-01-01'),
        endDate: parseDate('2026-05-31'),
        trial: months(2),
        sameDutiesBefore: true,
      }),
    );
    expect(finding).toMatchObject({ id: 'trial_void_same_duties', status: 'clause_void' });
    expect(finding.sources.map((s) => s.id)).toEqual(['trial_void_same_duties', 'partial_nullity']);
    expect(finding.calculation).toContainEqual(phrase('clause.partial_nullity'));
    expect(offerPass([single(finding)])).toBe(true);
  });

  it('alternance training allows no trial at all (art. 11.2.l)', () => {
    expect(
      only(assess({ modality: 'training_alternance', trial: { amount: 15, unit: 'days' } })),
    ).toMatchObject({ id: 'training_alternance_no_trial', status: 'clause_void' });
  });

  it('staying on after a training contract allows no new trial (art. 11.4.g)', () => {
    expect(only(assess({ afterTraining: true, trial: months(1) }))).toMatchObject({
      id: 'training_no_new_trial',
      status: 'clause_void',
      basedOnYourAnswer: true,
    });
  });

  it('a trial without a written contract misses its requirement', () => {
    expect(only(assess({ writtenContract: false, trial: months(1) }))).toMatchObject({
      status: 'missing_requirement',
    });
  });

  it('without a trial period there is nothing to check', () => {
    expect(only(assess({ trial: null })).status).toBe('not_entered');
  });

  it('never opens the pass for a limit, only for a void trial', () => {
    const limits = [
      assess({ trial: months(12), technical: false, smallCompany: false }),
      assess({ trial: months(12), technical: null, smallCompany: null }),
      assess({ modality: 'training_practice', trial: months(5) }),
    ];
    expect(offerPass(limits)).toBe(false);
  });
});

function single(finding: Finding): Assessed {
  return { kind: 'single', finding };
}

describe('trial period from RDL 39/2026', () => {
  const from = (day: string, change: Partial<EmploymentInput>) =>
    only(assess({ startDate: parseDate(day), technical: false, smallCompany: false, ...change }));
  const days = (amount: number) => ({ amount, unit: 'days' as const });
  const production = (start: string, end: string | null) => ({
    modality: 'production' as const,
    startDate: parseDate(start),
    endDate: end === null ? null : parseDate(end),
  });

  it('keeps the old rules for a contract that started on 18-11-2026', () => {
    expect(from('2026-11-18', { trial: months(3) })).toMatchObject({
      id: 'trial_limits',
      status: 'depends_on_agreement',
      calculation: [phrase('trial.over_legal_limit', { trial: monthsPhrase(3), months: 2 })],
    });
  });

  it('applies the new wording to a contract that starts on 19-11-2026', () => {
    const finding = from('2026-11-19', { trial: months(3) });
    expect(finding).toMatchObject({
      id: 'trial_limits_2026',
      status: 'depends_on_agreement',
      calculation: [
        phrase('trial.over_legal_limit_justified', { trial: monthsPhrase(3), months: 2 }),
      ],
    });
    expect(finding.sources.map((s) => s.id)).toEqual(['trial_limits_2026']);
  });

  it('allows one month in a fixed-term contract of exactly six months and not five weeks', () => {
    const six = production('2026-12-01', '2027-05-31');
    expect(from('2026-12-01', { ...six, trial: months(1) })).toMatchObject({
      id: 'trial_temporary_proportional',
      status: 'within_limit',
    });
    expect(from('2026-12-01', { ...six, trial: { amount: 5, unit: 'weeks' } }).status).toBe(
      'depends_on_agreement',
    );
  });

  it('reduces the limit in proportion in a contract of less than six months', () => {
    const three = production('2027-01-01', '2027-03-31');
    expect(from('2027-01-01', { ...three, trial: days(15) })).toMatchObject({
      status: 'within_limit',
      calculation: [
        phrase('trial.within_legal_limit_days', {
          trial: phrase('trial.amount_days', { amount: 15 }),
          days: 15,
        }),
      ],
    });
    expect(from('2027-01-01', { ...three, trial: days(16) })).toMatchObject({
      status: 'depends_on_agreement',
      calculation: [
        phrase('trial.over_legal_limit_days', {
          trial: phrase('trial.amount_days', { amount: 16 }),
          days: 15,
        }),
      ],
    });
  });

  it('without an end date, one month is within the limit with a note and six weeks is over', () => {
    const open = production('2026-12-01', null);
    expect(from('2026-12-01', { ...open, trial: months(1) })).toMatchObject({
      status: 'within_limit',
      calculation: expect.arrayContaining([phrase('trial.end_unknown_proportional')]),
    });
    expect(from('2026-12-01', { ...open, trial: { amount: 6, unit: 'weeks' } })).toMatchObject({
      id: 'trial_temporary_proportional',
      status: 'depends_on_agreement',
    });
  });

  it('an indefinite contract allows two months, and three in a company of 25 or more depends', () => {
    expect(from('2026-12-01', { trial: months(2) }).status).toBe('within_limit');
    expect(from('2026-12-01', { trial: months(3) }).status).toBe('depends_on_agreement');
  });

  it('an agreement above the legal limit has to justify it, and one below it is over', () => {
    const agreement = (trialMonths: number) => ({ ...contract().agreement, trialMonths });
    expect(from('2026-12-01', { agreement: agreement(4), trial: months(3) })).toMatchObject({
      id: 'trial_limits_2026',
      status: 'depends_on_agreement',
      basedOnYourAnswer: true,
      calculation: [
        phrase('trial.agreement_above_legal_limit', { trial: monthsPhrase(3), months: 4 }),
      ],
    });
    expect(from('2026-12-01', { agreement: agreement(4), trial: months(5) }).status).toBe(
      'over_legal_limit',
    );
    expect(from('2026-12-01', { agreement: agreement(1), trial: months(2) }).status).toBe(
      'over_legal_limit',
    );
    expect(from('2026-12-01', { agreement: agreement(4), trial: months(2) }).status).toBe(
      'within_limit',
    );
  });
});

describe('trial period details', () => {
  const trialOf = (change: Partial<EmploymentInput>) =>
    assess({ technical: false, smallCompany: false, ...change });
  const reading = (a: Assessed) => (a.kind === 'readings' ? a.question : null);

  it('names the question left open about the staff size', () => {
    expect(reading(assess({ trial: months(3), technical: false, smallCompany: null }))).toBe(
      'small_company',
    );
  });

  it('files every finding under the trial period', () => {
    const items = [
      assess({ trial: null }),
      assess({ trial: months(1), afterTraining: true }),
      assess({ trial: months(1), writtenContract: false }),
      assess({ trial: months(1), agreement: { ...contract().agreement, trialMonths: 4 } }),
      trialOf({ trial: months(1) }),
      trialOf({ trial: months(1), modality: 'training_practice' }),
      trialOf({
        trial: months(3),
        startDate: parseDate('2026-12-01'),
        agreement: { ...contract().agreement, trialMonths: 4 },
      }),
      trialOf({
        trial: months(1),
        modality: 'production',
        startDate: parseDate('2026-12-01'),
        endDate: parseDate('2027-02-28'),
      }),
    ].map((a) => (a.kind === 'single' ? a.finding.item : null));
    expect(items).toEqual(Array(8).fill('trial_period'));
  });

  it.each([
    ['training_alternance_no_trial', { modality: 'training_alternance' as const }, false],
  ] as const)('a void trial by %s says so and rests on the answer: %s', (id, change, basedOn) => {
    const phraseKey = {
      training_alternance_no_trial: 'trial.void_alternance',
      training_no_new_trial: 'trial.void_after_training',
      trial_void_same_duties: 'trial.void_same_duties',
    } as const;
    expect(only(assess({ trial: months(1), ...change }))).toMatchObject({
      id,
      status: 'clause_void',
      basedOnYourAnswer: basedOn,
      calculation: [
        phrase(phraseKey[id], { trial: monthsPhrase(1) }),
        phrase('clause.partial_nullity'),
      ],
    });
  });

  it('a trial without a written contract cites the written form and rests on the answer', () => {
    const finding = only(assess({ writtenContract: false, trial: months(1) }));
    expect(finding).toMatchObject({
      id: 'trial_limits',
      basedOnYourAnswer: true,
      calculation: [phrase('trial.not_in_writing', { trial: monthsPhrase(1) })],
    });
    expect(finding.sources.map((s) => s.id)).toEqual(['trial_limits', 'written_form']);
  });

  it('the legal limits of a fixed-term contract rest on no answer of the person', () => {
    const fixed = (endDate: string | null) =>
      only(
        trialOf({
          modality: 'replacement',
          endDate: endDate === null ? null : parseDate(endDate),
          trial: months(1),
        }),
      );
    expect(fixed('2024-05-31').basedOnYourAnswer).toBe(false);
    expect(fixed(null).basedOnYourAnswer).toBe(false);
    expect(
      only(trialOf({ modality: 'training_practice', trial: months(1) })).basedOnYourAnswer,
    ).toBe(false);
  });
});

describe('trial period from RDL 39/2026, in more detail', () => {
  const from = (change: Partial<EmploymentInput>) =>
    only(assess({ technical: false, smallCompany: false, ...change }));
  const fixedTerm = (start: string, end: string | null) => ({
    modality: 'production' as const,
    startDate: parseDate(start),
    endDate: end === null ? null : parseDate(end),
  });

  it('a fixed-term contract rests the limit on no answer, and an open end over one month says only that', () => {
    const open = from({ ...fixedTerm('2026-12-01', null), trial: { amount: 6, unit: 'weeks' } });
    expect(open).toMatchObject({
      basedOnYourAnswer: false,
      calculation: [
        phrase('trial.over_legal_limit_justified', {
          trial: phrase('trial.amount_weeks', { amount: 6 }),
          months: 1,
        }),
      ],
    });
  });

  it('a fixed-term contract of six months or more reads only the one-month limit', () => {
    expect(from({ ...fixedTerm('2026-12-01', '2027-06-30'), trial: months(1) })).toMatchObject({
      basedOnYourAnswer: false,
      calculation: [phrase('trial.within_legal_limit', { trial: monthsPhrase(1), months: 1 })],
    });
  });

  it.each([['3 weeks', { amount: 3, unit: 'weeks' }, 'depends_on_agreement']] as const)(
    '%s in a contract of 90 days',
    (_name, trial, status) => {
      expect(from({ ...fixedTerm('2027-01-01', '2027-03-31'), trial }).status).toBe(status);
    },
  );

  it('a month in a short contract is its real length: 28 days in February, 31 in January', () => {
    expect(from({ ...fixedTerm('2027-02-01', '2027-07-29'), trial: months(1) }).status).toBe(
      'within_limit',
    );
    expect(from({ ...fixedTerm('2027-01-01', '2027-06-29'), trial: months(1) }).status).toBe(
      'depends_on_agreement',
    );
  });

  it('a practice training contract keeps its own one-month limit, even above an agreement', () => {
    const agreement = { ...contract().agreement, trialMonths: 6 };
    expect(
      from({
        modality: 'training_practice',
        startDate: parseDate('2026-12-01'),
        agreement,
        trial: months(2),
      }),
    ).toMatchObject({
      id: 'trial_limits_2026',
      status: 'within_limit',
      calculation: [phrase('trial.within_your_agreement', { trial: monthsPhrase(2), months: 6 })],
    });
  });

  it('an agreement above a limit that differs by reading has to justify it', () => {
    const agreement = { ...contract().agreement, trialMonths: 6 };
    const start = { startDate: parseDate('2026-12-01'), technical: null, smallCompany: null };
    expect(only(assess({ ...start, agreement, trial: months(3) }))).toMatchObject({
      status: 'depends_on_agreement',
      calculation: [
        phrase('trial.agreement_above_legal_limit', { trial: monthsPhrase(3), months: 6 }),
      ],
    });
    expect(only(assess({ ...start, agreement, trial: months(1) }))).toMatchObject({
      status: 'within_limit',
      calculation: [phrase('trial.within_your_agreement', { trial: monthsPhrase(1), months: 6 })],
    });
  });
});
