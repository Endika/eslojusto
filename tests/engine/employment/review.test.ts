import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import {
  everyAssessed,
  reviewEmployment,
  type EmploymentDeps,
  type EmploymentReview,
} from '../../../src/engine/employment/review';
import type { Assessed, EmploymentInput, Finding } from '../../../src/engine/employment/types';
import { contract } from './input';

const TODAY = parseDate('2026-10-08');
const DEPS: EmploymentDeps = { norms: EMPLOYMENT_NORMS, minimumWage: MINIMUM_WAGE };

const reviewed = (
  input: EmploymentInput,
  today = TODAY,
  deps: EmploymentDeps = DEPS,
): EmploymentReview => {
  const result = reviewEmployment(input, today, deps);
  if (!result.ok) throw new Error(`invalid input: ${JSON.stringify(result.errors)}`);
  return result.review;
};

const findings = (a: Assessed): Finding[] =>
  a.kind === 'single' ? [a.finding] : a.readings.map((r) => r.finding);

const all = (review: EmploymentReview): Finding[] => everyAssessed(review).flatMap(findings);

const ALL_UNCHECKED = [
  'agreement_tables',
  'bonuses',
  'real_hours',
  'equal_pay',
  'contributions',
  'net_pay',
  'later_agreements',
];

describe('reviewEmployment', () => {
  it('returns the input errors and nothing else', () => {
    const result = reviewEmployment(contract({ endDate: parseDate('2024-01-01') }), TODAY, DEPS);
    expect(result).toEqual({
      ok: false,
      errors: [{ field: 'endDate', index: null, code: 'before_start' }],
    });
  });

  it('reviews every item of a well-formed permanent contract', () => {
    const review = reviewed(contract());
    expect(review.scope).toEqual({ inScope: true, partial: false });
    expect(new Set(all(review).map((f) => f.item))).toEqual(
      new Set([
        'minimum_wage',
        'modality',
        'trial_period',
        'working_time',
        'holidays_pay',
        'information',
      ]),
    );
    expect(review.offerPass).toBe(false);
    expect(review.reference).toBeNull();
    expect(review.offer).toBeNull();
    expect(review.information.map((b) => b.id)).toContain('agreement');
  });

  it('a contract started on 06-10-2026 without its agreement owes it before starting', () => {
    const base = contract({
      startDate: parseDate('2026-10-06'),
      signedOn: parseDate('2026-10-01'),
    });
    const review = reviewed({ ...base, info: { ...base.info, o: 'absent' } });
    const duty = review.informationDuty;
    if (duty?.applies !== true) throw new Error('expected the duty to apply');
    const o = duty.elements[0];
    expect(o?.element).toBe('o');
    if (o?.applies !== true) throw new Error('expected o to be checked');
    expect(o.finding.status).toBe('missing_requirement');
    expect(o.finding.calculation.map((p) => p.key)).toContain('information.missing_before_start');
    expect(review.offerPass).toBe(false);
  });

  it('a contract started in 2025 can ask for it', () => {
    const base = contract({
      startDate: parseDate('2025-04-01'),
      signedOn: parseDate('2025-03-28'),
    });
    const duty = reviewed({ ...base, info: { ...base.info, o: 'absent' } }).informationDuty;
    if (duty?.applies !== true) throw new Error('expected the duty to apply');
    const o = duty.elements[0];
    if (o?.applies !== true) throw new Error('expected o to be checked');
    expect(o.finding.calculation.map((p) => p.key)).toContain('information.missing_on_request');
  });

  it('a relationship of three weeks leaves the list out', () => {
    const review = reviewed(
      contract({
        modality: 'production',
        causeStated: true,
        circumstancesStated: true,
        startDate: parseDate('2026-09-01'),
        signedOn: parseDate('2026-09-01'),
        endDate: parseDate('2026-09-21'),
      }),
    );
    expect(review.informationDuty).toEqual(
      expect.objectContaining({ applies: false, reason: 'short_relation' }),
    );
  });

  it('a void clause opens the pass', () => {
    const review = reviewed(
      contract({
        clauses: [
          {
            label: 'waiver',
            months: null,
            compensationStated: null,
            trainingDescribed: null,
            waivedRight: 'holidays',
            costsOnWorker: null,
            literal: { text: 'Cláusula sintética de prueba.' },
          },
        ],
      }),
    );
    expect(review.clauses[0]?.assessed).toEqual(
      expect.objectContaining({ finding: expect.objectContaining({ status: 'clause_void' }) }),
    );
    expect(review.offerPass).toBe(true);
  });

  it('a work-or-service contract of 2023 opens the pass and gets the court reference', () => {
    const review = reviewed(
      contract({
        modality: 'work_or_service',
        startDate: parseDate('2023-05-02'),
        signedOn: parseDate('2023-05-02'),
        causeStated: true,
        circumstancesStated: true,
      }),
    );
    expect(review.offerPass).toBe(true);
    expect(review.reference?.on).toEqual(TODAY);
  });

  it('a contract concluded before the reform is reviewed in part', () => {
    const review = reviewed(
      contract({
        modality: 'production',
        startDate: parseDate('2022-01-10'),
        signedOn: parseDate('2022-01-10'),
        endDate: parseDate('2026-12-31'),
      }),
    );
    expect(review.scope).toEqual({ inScope: true, partial: true, reason: 'before_reform' });
    expect(
      review.items.some((a) =>
        findings(a).some((f) => f.status === 'not_reviewed_in_this_version'),
      ),
    ).toBe(true);
    expect(review.reference).toBeNull();
  });

  it.each([
    ['special relationship', { relationship: 'sport' }, 'out_of_scope'],
    ['temporary work agency', { viaTempAgency: true }, 'out_of_scope'],
    ['minor', { under18: true }, 'minors'],
  ] as const)('outside the review (%s): no items, only the reason', (_, change, block) => {
    const review = reviewed(
      contract({
        ...change,
        clauses: [
          {
            label: 'waiver',
            months: null,
            compensationStated: null,
            trainingDescribed: null,
            waivedRight: 'holidays',
            costsOnWorker: null,
            literal: { text: 'Cláusula sintética de prueba.' },
          },
        ],
        offer: { grossAnnual: 30000, net: false, weeklyHours: 40, modality: null, remote: null },
      }),
    );
    expect(review.items).toEqual([]);
    expect(review.clauses).toEqual([]);
    expect(review.informationDuty).toBeNull();
    expect(review.offer).toBeNull();
    expect(review.information.map((b) => b.id)).toEqual([block]);
    expect(review.offerPass).toBe(false);
    expect(review.unchecked).toEqual(ALL_UNCHECKED);
  });

  it('always lists what it did not check; real hours only until the person gives them', () => {
    expect(reviewed(contract()).unchecked).toEqual(ALL_UNCHECKED);
    expect(reviewed(contract({ realWeeklyHours: 42 })).unchecked).not.toContain('real_hours');
  });

  it('sets the offer beside the contract', () => {
    const review = reviewed(
      contract({
        offer: {
          grossAnnual: 24000,
          net: false,
          weeklyHours: 40,
          modality: 'permanent',
          remote: null,
        },
      }),
    );
    expect(review.offer?.differences).toEqual([
      { field: 'gross_annual', offer: 24000, contract: 21000 },
    ]);
  });

  it('takes its tables as arguments: a 2027 minimum wage only once it is in the table', () => {
    const in2027 = contract({
      startDate: parseDate('2027-01-04'),
      signedOn: parseDate('2026-12-20'),
    });
    const today = parseDate('2027-03-01');
    const smi = (deps: EmploymentDeps) =>
      reviewed(in2027, today, deps)
        .items.flatMap(findings)
        .find((f) => f.id === 'smi_annual');
    expect(smi(DEPS)?.status).toBe('not_published');
    const last = MINIMUM_WAGE[MINIMUM_WAGE.length - 1];
    if (last === undefined) throw new Error('empty table');
    const with2027 = [
      ...MINIMUM_WAGE,
      {
        ...last,
        year: 2027,
        effectsFrom: '2027-01-01',
        effectsUntil: '2027-12-31',
        publishedOn: '2027-02-10',
      },
    ];
    expect(smi({ ...DEPS, minimumWage: with2027 })?.status).toBe('within_limit');
  });

  it('carries the warnings of the input', () => {
    const salary = { ...contract().salary, breakdown: [{ kind: 'base' as const, amount: 1000 }] };
    expect(reviewed(contract({ salary })).warnings.map((w) => w.code)).toEqual([
      'breakdown_short_of_total',
    ]);
  });
});
