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
      status: 'depends_on_agreement',
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
