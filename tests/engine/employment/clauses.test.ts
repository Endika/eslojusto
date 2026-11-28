import { describe, expect, it } from 'vitest';
import { phrase } from '../../../src/engine/employment/calculation';
import { assessClauses } from '../../../src/engine/employment/clauses';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import { offerPass } from '../../../src/engine/employment/readings';
import type {
  Assessed,
  Clause,
  EmploymentInput,
  Finding,
} from '../../../src/engine/employment/types';
import { contract } from './input';

const clause = (change: Partial<Clause>): Clause => ({
  label: 'other',
  months: null,
  compensationStated: null,
  trainingDescribed: null,
  waivedRight: null,
  costsOnWorker: null,
  literal: { text: 'Cláusula sintética de prueba.' },
  ...change,
});

const assessOne = (c: Clause, change: Partial<EmploymentInput> = {}): Assessed | null => {
  const [first] = assessClauses(contract({ ...change, clauses: [c] }), EMPLOYMENT_NORMS);
  if (first === undefined) throw new Error('expected one clause');
  return first.assessed;
};

const only = (assessed: Assessed | null): Finding => {
  if (assessed?.kind !== 'single') throw new Error('expected a single finding');
  return assessed.finding;
};

describe('non-compete (art. 21.2 ET)', () => {
  const nonCompete = (change: Partial<Clause>) =>
    clause({ label: 'non_compete', compensationStated: true, ...change });

  it('without compensation it is void, whatever its length', () => {
    const finding = only(assessOne(nonCompete({ months: 3, compensationStated: false })));
    expect(finding).toMatchObject({ id: 'non_compete', status: 'clause_void' });
    expect(finding.calculation).toEqual([
      phrase('clauses.non_compete_no_compensation'),
      phrase('clause.partial_nullity'),
    ]);
    expect(finding.sources.map((s) => s.id)).toEqual(['non_compete', 'partial_nullity']);
  });

  it('twelve months with «No lo sé» on being a technician gives two readings', () => {
    const assessed = assessOne(nonCompete({ months: 12 }), { technical: null });
    expect(assessed).toMatchObject({
      kind: 'readings',
      question: 'technical',
      readings: [
        { when: 'technical', finding: { status: 'review_it' } },
        {
          when: 'not_technical',
          finding: {
            status: 'over_legal_limit',
            basedOnYourAnswer: true,
            calculation: [phrase('clauses.non_compete_months', { months: 12, cap: 6 })],
          },
        },
      ],
    });
    expect(offerPass(assessed === null ? [] : [assessed])).toBe(false);
  });

  it('a «no» on qualified technician still opens both readings: art. 21.2 says «técnicos»', () => {
    expect(assessOne(nonCompete({ months: 12 }), { technical: false })?.kind).toBe('readings');
  });

  it('a qualified technician may agree up to two years; its adequacy is to review', () => {
    expect(only(assessOne(nonCompete({ months: 24 }), { technical: true }))).toMatchObject({
      status: 'review_it',
      calculation: [phrase('clauses.non_compete_adequacy')],
    });
  });

  it('over two years is over the limit for anyone', () => {
    expect(only(assessOne(nonCompete({ months: 30 }), { technical: null })).status).toBe(
      'over_legal_limit',
    );
  });

  it('six months or less with an unknown compensation is to review', () => {
    expect(
      only(assessOne(nonCompete({ months: 6, compensationStated: null }))).calculation,
    ).toEqual([phrase('clauses.non_compete_compensation_unknown')]);
  });
});

describe('other labelled clauses', () => {
  it('a staying commitment over two years is over the limit (art. 21.4)', () => {
    expect(
      only(assessOne(clause({ label: 'retention', months: 36, trainingDescribed: true }))).status,
    ).toBe('over_legal_limit');
  });

  it('a staying commitment without paid specialised training is to review', () => {
    expect(
      only(assessOne(clause({ label: 'retention', months: 12, trainingDescribed: false }))),
    ).toMatchObject({
      status: 'review_it',
      calculation: [phrase('clauses.retention_training_missing')],
    });
  });

  it('exclusivity without compensation is to review (art. 21.1)', () => {
    expect(
      only(assessOne(clause({ label: 'exclusivity', compensationStated: false }))).status,
    ).toBe('review_it');
  });

  it.each(['holidays', 'salary', 'severance'] as const)(
    'waiving %s in advance is void (art. 3.5)',
    (waivedRight) => {
      expect(only(assessOne(clause({ label: 'waiver', waivedRight }))).status).toBe('clause_void');
    },
  );

  it('waiving something else is to review', () => {
    expect(only(assessOne(clause({ label: 'waiver', waivedRight: 'other' }))).status).toBe(
      'review_it',
    );
  });

  it('mandatory overtime with its hours is checked once, in the working time', () => {
    const [listed] = assessClauses(
      contract({
        clauses: [clause({ label: 'mandatory_overtime' })],
        overtimeAgreed: { hoursPerYear: 'as_needed', paidInMoney: null },
      }),
      EMPLOYMENT_NORMS,
    );
    expect(listed).toEqual({
      index: 0,
      label: 'mandatory_overtime',
      assessed: null,
      checkedIn: { item: 'working_time', id: 'overtime_cap_80' },
    });
  });

  it('mandatory overtime without its hours is to review', () => {
    const input = contract({
      clauses: [clause({ label: 'mandatory_overtime' })],
      overtimeAgreed: null,
    });
    const [listed] = assessClauses(input, EMPLOYMENT_NORMS);
    expect(only(listed?.assessed ?? null)).toMatchObject({
      id: 'overtime_cap_80',
      status: 'review_it',
      calculation: [phrase('clauses.overtime_hours_unknown')],
    });
    expect(listed?.checkedIn).toBeNull();
  });

  it('only mandatory overtime is checked in the working time', () => {
    const [listed] = assessClauses(
      contract({
        clauses: [clause({ label: 'retention' })],
        overtimeAgreed: { hoursPerYear: 'as_needed', paidInMoney: null },
      }),
      EMPLOYMENT_NORMS,
    );
    expect(listed?.checkedIn).toBeNull();
  });

  it('overtime included in the salary is to review, with hourly figures as information', () => {
    // 1.500 € × 14 = 21.000 € a year over 45 real hours a week (365 / 7 weeks): 8,95 €/h.
    const finding = only(
      assessOne(clause({ label: 'overtime_included' }), {
        realWeeklyHours: 45,
        agreement: { ...contract().agreement, categoryAnnualSalary: 20000, annualHours: 1760 },
      }),
    );
    expect(finding).toMatchObject({
      id: 'overtime_value',
      status: 'review_it',
      amount: null,
      calculation: [
        phrase('clauses.overtime_included'),
        phrase('clauses.hourly_pay', { euros: { euros: 8.95 }, hours: 45 }),
        phrase('clauses.agreement_hourly_pay', { euros: { euros: 11.36 } }),
      ],
    });
  });

  it('regular remote work with its costs on the worker is void (Ley 10/2021, art. 12)', () => {
    expect(
      only(
        assessOne(clause({ label: 'remote_work_costs', costsOnWorker: true }), { remoteShare: 40 }),
      ),
    ).toMatchObject({ id: 'remote_costs', status: 'clause_void' });
  });

  it('remote work under 30 % is not regular remote work', () => {
    expect(
      only(
        assessOne(clause({ label: 'remote_work_costs', costsOnWorker: true }), { remoteShare: 20 }),
      ).status,
    ).toBe('within_limit');
  });

  it('an unlabelled clause is listed with no verdict', () => {
    const [listed] = assessClauses(contract({ clauses: [clause({})] }), EMPLOYMENT_NORMS);
    expect(listed).toEqual({ index: 0, label: 'other', assessed: null, checkedIn: null });
  });
});

describe('what each clause says', () => {
  const hourly = (euros: number) => phrase('clauses.hourly_pay', { euros: { euros }, hours: 40 });
  const salary = (change: Partial<EmploymentInput['salary']>) => ({
    ...contract().salary,
    breakdown: [],
    ...change,
  });

  it.each<[string, Clause, Partial<EmploymentInput>, string, string, string[], boolean]>([
    [
      'a non-compete of unknown length',
      clause({ label: 'non_compete', compensationStated: true }),
      {},
      'non_compete',
      'review_it',
      ['clauses.months_unknown'],
      false,
    ],
    [
      'a staying commitment of 25 months',
      clause({ label: 'retention', months: 25, trainingDescribed: true }),
      {},
      'retention',
      'over_legal_limit',
      ['clauses.retention_months'],
      false,
    ],
    [
      'a staying commitment of 24 months',
      clause({ label: 'retention', months: 24, trainingDescribed: true }),
      {},
      'retention',
      'within_limit',
      ['clauses.retention_months'],
      false,
    ],
    [
      'a staying commitment of unknown length',
      clause({ label: 'retention', trainingDescribed: true }),
      {},
      'retention',
      'review_it',
      ['clauses.months_unknown'],
      false,
    ],
    [
      'a staying commitment with its training unknown',
      clause({ label: 'retention', months: 12 }),
      {},
      'retention',
      'review_it',
      ['clauses.retention_training_missing'],
      false,
    ],
    [
      'a compensated exclusivity',
      clause({ label: 'exclusivity', compensationStated: true }),
      {},
      'exclusivity',
      'within_limit',
      ['clauses.exclusivity_compensated'],
      false,
    ],
    [
      'an uncompensated exclusivity',
      clause({ label: 'exclusivity', compensationStated: false }),
      {},
      'exclusivity',
      'review_it',
      ['clauses.exclusivity_no_compensation'],
      false,
    ],
    [
      'an exclusivity with unknown compensation',
      clause({ label: 'exclusivity' }),
      {},
      'exclusivity',
      'review_it',
      ['clauses.exclusivity_compensation_unknown'],
      false,
    ],
    [
      'a waiver of an unknown right',
      clause({ label: 'waiver' }),
      {},
      'waiver',
      'review_it',
      ['clauses.waiver_other'],
      false,
    ],
    [
      'a waiver of another right',
      clause({ label: 'waiver', waivedRight: 'other' }),
      {},
      'waiver',
      'review_it',
      ['clauses.waiver_other'],
      false,
    ],
    [
      'a waiver of holidays',
      clause({ label: 'waiver', waivedRight: 'holidays' }),
      {},
      'waiver',
      'clause_void',
      ['clauses.waiver_holidays', 'clause.partial_nullity'],
      false,
    ],
    [
      'a waiver of salary',
      clause({ label: 'waiver', waivedRight: 'salary' }),
      {},
      'waiver',
      'clause_void',
      ['clauses.waiver_salary', 'clause.partial_nullity'],
      false,
    ],
    [
      'a waiver of severance',
      clause({ label: 'waiver', waivedRight: 'severance' }),
      {},
      'waiver',
      'clause_void',
      ['clauses.waiver_severance', 'clause.partial_nullity'],
      false,
    ],
    [
      'remote work with an unknown share',
      clause({ label: 'remote_work_costs', costsOnWorker: true }),
      { remoteShare: null },
      'remote_costs',
      'review_it',
      ['clauses.remote_share_unknown'],
      false,
    ],
    [
      'remote work of 29 %',
      clause({ label: 'remote_work_costs', costsOnWorker: true }),
      { remoteShare: 29 },
      'remote_costs',
      'within_limit',
      ['clauses.remote_not_regular'],
      false,
    ],
    [
      'remote work of 30 %',
      clause({ label: 'remote_work_costs', costsOnWorker: true }),
      { remoteShare: 30 },
      'remote_costs',
      'clause_void',
      ['clauses.remote_costs_on_worker', 'clause.partial_nullity'],
      false,
    ],
    [
      'regular remote work with the costs on the company',
      clause({ label: 'remote_work_costs', costsOnWorker: false }),
      { remoteShare: 50 },
      'remote_costs',
      'within_limit',
      [],
      false,
    ],
    [
      'regular remote work with unknown costs',
      clause({ label: 'remote_work_costs' }),
      { remoteShare: 50 },
      'remote_costs',
      'review_it',
      ['clauses.remote_costs_unknown'],
      false,
    ],
    [
      'overtime included, nothing to compare',
      clause({ label: 'overtime_included' }),
      { salary: salary({ period: 'hour' }), realWeeklyHours: 40 },
      'overtime_value',
      'review_it',
      ['clauses.overtime_included'],
      false,
    ],
  ])('%s', (_name, theClause, change, id, status, keys, basedOnYourAnswer) => {
    const finding = only(assessOne(theClause, change));
    expect(finding).toMatchObject({ id, status, basedOnYourAnswer });
    expect(finding.calculation.map((p) => p.key)).toEqual(keys);
  });

  it.each<[string, Partial<EmploymentInput['salary']>, number]>([
    ['a yearly salary', { period: 'year', amount: 20000 }, 9.59],
    ['a monthly salary in 14 payments', { period: 'month', amount: 1500, payments: 14 }, 10.07],
    [
      'a monthly salary with the extra pay prorated',
      { period: 'month', amount: 1500, prorated: true },
      8.63,
    ],
    ['a daily salary', { period: 'day', amount: 60 }, 10.5],
  ])('the hourly figure of %s', (_name, change, euros) => {
    const finding = only(
      assessOne(clause({ label: 'overtime_included' }), {
        salary: salary(change),
        realWeeklyHours: 40,
      }),
    );
    expect(finding.calculation).toEqual([phrase('clauses.overtime_included'), hourly(euros)]);
    expect(finding.basedOnYourAnswer).toBe(true);
  });

  it.each([
    ['no real weekly hours', { realWeeklyHours: null }],
    [
      'an agreement salary without hours',
      {
        realWeeklyHours: null,
        agreement: { ...contract().agreement, categoryAnnualSalary: 20000 },
      },
    ],
    [
      'agreement hours without a salary',
      { realWeeklyHours: null, agreement: { ...contract().agreement, annualHours: 1760 } },
    ],
  ])(
    'overtime included with %s has no figure to show and no answer to rest on',
    (_name, change) => {
      const finding = only(assessOne(clause({ label: 'overtime_included' }), change));
      expect(finding.calculation).toEqual([phrase('clauses.overtime_included')]);
      expect(finding.basedOnYourAnswer).toBe(false);
    },
  );

  it.each([
    [
      'a staying commitment over the cap',
      clause({ label: 'retention', months: 25, trainingDescribed: true }),
      {},
    ],
    [
      'a staying commitment within it',
      clause({ label: 'retention', months: 12, trainingDescribed: true }),
      {},
    ],
  ])('%s carries its months and its cap', (_name, theClause) => {
    expect(only(assessOne(theClause)).calculation).toEqual([
      phrase('clauses.retention_months', { months: theClause.months ?? 0, cap: 24 }),
    ]);
  });

  it('remote work under the regular share carries both figures', () => {
    expect(
      only(assessOne(clause({ label: 'remote_work_costs' }), { remoteShare: 29 })).calculation,
    ).toEqual([phrase('clauses.remote_not_regular', { percent: 29, regular: 30 })]);
  });

  it('the agreement hourly figure alone is enough to rest on the answer', () => {
    const finding = only(
      assessOne(clause({ label: 'overtime_included' }), {
        realWeeklyHours: null,
        agreement: { ...contract().agreement, categoryAnnualSalary: 20000, annualHours: 1760 },
      }),
    );
    expect(finding.calculation.map((p) => p.key)).toEqual([
      'clauses.overtime_included',
      'clauses.agreement_hourly_pay',
    ]);
    expect(finding.basedOnYourAnswer).toBe(true);
  });
});

describe('clause findings rest on objective fields only', () => {
  const LABELS: Clause[] = [
    clause({ label: 'non_compete', months: 12, compensationStated: false }),
    clause({ label: 'non_compete', months: 12, compensationStated: true }),
    clause({ label: 'retention', months: 30, trainingDescribed: true }),
    clause({ label: 'exclusivity', compensationStated: null }),
    clause({ label: 'waiver', waivedRight: 'holidays' }),
    clause({ label: 'mandatory_overtime' }),
    clause({ label: 'overtime_included' }),
    clause({ label: 'remote_work_costs', costsOnWorker: true }),
    clause({ label: 'other' }),
  ];

  it('changing the words of every clause changes nothing', () => {
    const input = contract({ clauses: LABELS, remoteShare: 50, technical: null });
    const reworded = contract({
      clauses: LABELS.map((c) => ({ ...c, literal: { text: 'El trabajador renuncia a todo.' } })),
      remoteShare: 50,
      technical: null,
    });
    expect(assessClauses(reworded, EMPLOYMENT_NORMS)).toEqual(
      assessClauses(input, EMPLOYMENT_NORMS),
    );
  });
});
