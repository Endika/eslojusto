import { describe, expect, it } from 'vitest';
import { addDays, parseDate, type CivilDate } from '../../../src/engine/date';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import type { EmploymentNormId, NormTable } from '../../../src/engine/employment/norms';
import {
  everyAssessed,
  reviewEmployment,
  type EmploymentDeps,
  type EmploymentReview,
} from '../../../src/engine/employment/review';
import { RULES } from '../../../src/engine/employment/rules';
import {
  INFO_ELEMENTS,
  type Assessed,
  type Clause,
  type EmploymentInput,
  type Finding,
  type FindingStatus,
  type InfoPresence,
  type Modality,
  type Weekday,
} from '../../../src/engine/employment/types';
import { contract } from './input';

const TODAY = parseDate('2026-10-08');
const CASES = 400;
const DEPS: EmploymentDeps = { norms: EMPLOYMENT_NORMS, minimumWage: MINIMUM_WAGE };

// mulberry32: small, seeded and deterministic.
function prng(seed: number) {
  let a = seed;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)] as T;
  const maybe = <T>(x: T): T | null => (r() < 0.25 ? null : x);
  return { r, int, pick, maybe };
}
type Gen = ReturnType<typeof prng>;

const MODALITIES: readonly Modality[] = [
  'permanent',
  'discontinuous',
  'production',
  'production_occasional',
  'replacement',
  'replacement_selection',
  'training_alternance',
  'training_practice',
  'work_or_service',
  'eventual',
  'interim',
  'unknown',
];
const PRESENCE: readonly InfoPresence[] = ['present', 'by_reference', 'absent', 'unknown'];
const LABELS: readonly Clause['label'][] = [
  'non_compete',
  'retention',
  'exclusivity',
  'waiver',
  'mandatory_overtime',
  'overtime_included',
  'remote_work_costs',
  'other',
];
const bool = (g: Gen) => g.r() < 0.5;
const yesNo = (g: Gen) => g.maybe(bool(g));

function clause(g: Gen): Clause {
  return {
    label: g.pick(LABELS),
    months: g.maybe(g.int(1, 36)),
    compensationStated: yesNo(g),
    trainingDescribed: yesNo(g),
    waivedRight: g.maybe(g.pick(['holidays', 'salary', 'severance', 'other'] as const)),
    costsOnWorker: yesNo(g),
    literal: { text: 'Cláusula sintética de prueba.' },
  };
}

function generate(g: Gen): EmploymentInput {
  const start: CivilDate = addDays(parseDate('2021-06-01'), g.int(0, 2000));
  const modality = g.pick(MODALITIES);
  const open = modality === 'permanent' || modality === 'discontinuous';
  const endDate = open || g.r() < 0.2 ? null : addDays(start, g.int(6, 900));
  const period = g.pick(['year', 'month', 'day', 'hour'] as const);
  const amount = {
    year: g.int(9000, 40000),
    month: g.int(600, 3000),
    day: g.int(25, 120),
    hour: g.int(5, 25),
  }[period];
  const weekly = g.maybe(g.int(10, 45));
  const partTime =
    weekly !== null && weekly < 40
      ? {
          hoursStated: bool(g),
          distributionStated: bool(g),
          complementary: g.maybe({ percent: g.int(0, 60), noticeDays: g.maybe(g.int(0, 5)) }),
          voluntaryPercent: g.maybe(g.int(0, 40)),
        }
      : null;
  const fromHour = g.int(6, 14);
  return contract({
    relationship:
      g.r() < 0.9 ? 'common' : g.pick(['sport', 'public_servant', 'household'] as const),
    viaTempAgency: g.r() < 0.05,
    relief: g.r() < 0.03,
    under18: g.r() < 0.05,
    writtenContract: yesNo(g),
    startDate: start,
    endDate,
    signedOn: g.maybe(addDays(start, -g.int(0, 20))),
    modality,
    extensions: g.int(0, 2),
    causeStated: yesNo(g),
    circumstancesStated: yesNo(g),
    replacedPersonNamed: yesNo(g),
    replacementCauseStated: yesNo(g),
    salary: {
      amount,
      period,
      payments: g.pick([12, 14, 15]),
      prorated: bool(g),
      breakdown:
        g.r() < 0.5
          ? []
          : [
              {
                kind: g.pick(['base', 'fixed_complement', 'variable', 'unknown'] as const),
                amount,
              },
            ],
      inKind: g.r() < 0.8 ? null : g.int(10, 300),
    },
    contractHours: { weekly, annual: weekly === null ? g.maybe(g.int(500, 1800)) : null },
    agreement: {
      named: bool(g),
      categoryAnnualSalary: g.maybe(g.int(12000, 30000)),
      annualHours: null,
      holidayDays: g.maybe(g.int(22, 35)),
      trialMonths: g.maybe(g.int(1, 6)),
    },
    payslips: Array.from({ length: g.int(0, 3) }, (_, i) => ({
      month: `2026-0${i + 1}`,
      wholeMonth: bool(g),
      incidents: g.r() < 0.2,
      salaryInMoney: g.int(600, 2500),
      inKind: 0,
      proratedExtraPay: g.pick([0, 150]),
      overtimeHours: g.maybe(g.int(0, 20)),
      complementaryHours: null,
    })),
    trial: g.maybe({ amount: g.int(1, 8), unit: g.pick(['days', 'weeks', 'months'] as const) }),
    technical: yesNo(g),
    smallCompany: yesNo(g),
    sameDutiesBefore: yesNo(g),
    afterTraining: yesNo(g),
    schedule: g.maybe(
      Array.from({ length: g.int(1, 7) }, (_, i) => ({
        day: (i + 1) as Weekday,
        slots: [
          {
            from: `${String(fromHour).padStart(2, '0')}:00`,
            to: `${String(fromHour + g.int(4, 10)).padStart(2, '0')}:00`,
          },
        ],
      })),
    ),
    nightWorker: yesNo(g),
    overtimeAgreed: g.maybe({
      hoursPerYear: g.r() < 0.3 ? 'as_needed' : g.int(10, 120),
      paidInMoney: yesNo(g),
    }),
    partTime,
    remoteShare: g.maybe(g.int(0, 100)),
    realWeeklyHours: g.maybe(g.int(20, 50)),
    holidays: g.maybe({
      days: g.int(20, 31),
      unit: g.pick(['calendar', 'working'] as const),
      workDaysPerWeek: g.maybe(g.int(5, 6)),
      includedInSalary: g.r() < 0.1,
    }),
    extraPays: g.maybe({ count: g.int(0, 3), prorated: bool(g) }),
    clauses: Array.from({ length: g.int(0, 3) }, () => clause(g)),
    info: Object.fromEntries(
      INFO_ELEMENTS.map((e) => [e, g.pick(PRESENCE)]),
    ) as EmploymentInput['info'],
    offer: g.maybe({
      grossAnnual: g.maybe(g.int(12000, 40000)),
      net: g.r() < 0.3,
      weeklyHours: g.maybe(g.int(20, 40)),
      modality: g.maybe(g.pick(MODALITIES)),
      remote: g.maybe(g.pick(['none', 'hybrid', 'full'] as const)),
    }),
  });
}

const reviewOf = (input: EmploymentInput, deps = DEPS) => reviewEmployment(input, TODAY, deps);

const inputs: readonly EmploymentInput[] = (() => {
  const g = prng(20261008);
  return Array.from({ length: CASES }, () => generate(g)).filter((input) => reviewOf(input).ok);
})();

const cases: readonly EmploymentReview[] = inputs.flatMap((input) => {
  const result = reviewOf(input);
  return result.ok ? [result.review] : [];
});

const findings = (a: Assessed): Finding[] =>
  a.kind === 'single' ? [a.finding] : a.readings.map((r) => r.finding);
const allFindings = (review: EmploymentReview): Finding[] =>
  everyAssessed(review).flatMap(findings);

// A source names a rule or, for a minimum wage year, the decree itself.
const cites = (f: Finding, norm: EmploymentNormId): boolean =>
  f.sources.some(
    (s) => s.id === norm || (s.id in RULES && RULES[s.id as keyof typeof RULES].norm === norm),
  );

// The pass table: the statuses that open it, when no agreement can set another limit.
const OPENS_PASS: Readonly<Record<FindingStatus, boolean>> = {
  below_minimum: true,
  over_legal_limit: true,
  clause_void: true,
  becomes_permanent: true,
  missing_requirement: false,
  within_limit: false,
  depends_on_agreement: false,
  review_it: false,
  not_applicable_to_date: false,
  not_entered: false,
  not_reviewed_in_this_version: false,
  not_published: false,
};
const opens = (f: Finding) => OPENS_PASS[f.status] && !f.agreementMaySetOther;

describe('employment review properties', () => {
  it('most generated contracts are valid input', () => {
    expect(cases.length).toBeGreaterThan(CASES / 2);
    expect(cases.some((c) => c.offerPass)).toBe(true);
    expect(cases.some((c) => !c.offerPass && c.scope.inScope)).toBe(true);
  });

  it('only the minimum wage carries an amount, never inverted or negative', () => {
    for (const review of cases)
      for (const f of allFindings(review)) {
        if (f.amount === null) continue;
        expect(f.item).toBe('minimum_wage');
        expect(f.amount.min).toBeGreaterThanOrEqual(0);
        expect(f.amount.max).toBeGreaterThanOrEqual(f.amount.min);
      }
  });

  it('no information block and no offer carries an amount or a verdict', () => {
    for (const review of cases) {
      expect(JSON.stringify(review.information)).not.toMatch(/"(euros|amount)"/);
      expect(JSON.stringify(review.offer)).not.toMatch(/"(euros|amount|status)"/);
    }
  });

  it('offerPass follows the pass table: a concrete finding that holds in every reading', () => {
    for (const review of cases) {
      const expected = everyAssessed(review).some((a) => findings(a).every(opens));
      expect(review.offerPass).toBe(expected);
    }
  });

  const NORM_IDS = Object.keys(EMPLOYMENT_NORMS) as EmploymentNormId[];
  const altered = (
    id: EmploymentNormId,
    change: Partial<NormTable[EmploymentNormId]>,
  ): NormTable => ({
    ...EMPLOYMENT_NORMS,
    [id]: { ...EMPLOYMENT_NORMS[id], ...change },
  });
  const key = (f: Finding) => JSON.stringify(f);

  it.each(NORM_IDS)('altering %s changes only the findings that cite it', (id) => {
    for (const change of [
      { citation: 'Norma alterada de prueba' },
      {
        status: 'pending_validation' as const,
        statusSince: '2026-01-01',
        statusUrl: 'https://www.boe.es/',
      },
    ]) {
      const norms = altered(id, change);
      for (const input of inputs) {
        const before = reviewOf(input);
        const after = reviewOf(input, { ...DEPS, norms });
        if (!before.ok || !after.ok) throw new Error('validation does not read the norms');
        const was = new Set(allFindings(before.review).map(key));
        const is = new Set(allFindings(after.review).map(key));
        const appeared = allFindings(after.review).filter((f) => !was.has(key(f)));
        const vanished = allFindings(before.review).filter((f) => !is.has(key(f)));
        for (const f of [...appeared, ...vanished])
          expect(cites(f, id), `${f.id} for ${id}`).toBe(true);
      }
    }
  });
});
