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

  it('mandatory overtime is checked like the overtime pact', () => {
    expect(
      only(
        assessOne(clause({ label: 'mandatory_overtime' }), {
          overtimeAgreed: { hoursPerYear: 'as_needed' },
        }),
      ),
    ).toMatchObject({ id: 'overtime_cap_80', status: 'over_legal_limit' });
    expect(
      only(assessOne(clause({ label: 'mandatory_overtime' }), { overtimeAgreed: null })).status,
    ).toBe('review_it');
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
    expect(listed).toEqual({ index: 0, label: 'other', assessed: null });
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
