import { parseDate } from '../engine/date';
import type { Range } from '../engine/money';
import { reviewFinalPay, type EmployerFigures, type Review } from '../engine/review';
import { annualSalary } from '../engine/settlement';
import { computeSeverance } from '../engine/severance';
import {
  BENEFIT_2026,
  amounts,
  contractContributedDays,
  durationForDays,
  estimateBenefit,
  monthlyBase,
} from '../engine/unemployment';
import type { Cause, FinalPayInput, ItemId } from '../engine/types';

// The worked examples of the case pages, worked out by the same engine as the calculator when the
// site is built, so a figure on a page can never drift from what the calculator gives. Every
// person in them is made up: 1.500 € gross a month with two extra payments of 1.500 € that accrue
// by half years, 21.000 € a year, as in the guide of /finiquito/.

export const SALARY = 1500;

const date = parseDate;

// A contract that ends on `end`, with nothing of this year's holidays taken unless said otherwise.
export const exampleInput = (
  cause: Cause,
  start: string,
  end: string,
  extra: Partial<FinalPayInput> = {},
): FinalPayInput => ({
  cause,
  startDate: date(start),
  endDate: date(end),
  monthlySalary: SALARY,
  extraPayProrated: false,
  extraPayCount: 2,
  extraPayAmount: SALARY,
  extraPayAccrual: 'semiannual',
  holidayUnit: 'working',
  annualHolidayDays: 22,
  holidayDaysTaken: 0,
  ...extra,
});

// The review as the calculator would show it, on the day the contract ends.
export function review(e: FinalPayInput, figures: EmployerFigures = {}): Review {
  const r = reviewFinalPay(e, figures, e.endDate);
  if (!r.ok) throw new Error(`An example does not validate: ${JSON.stringify(r.errors)}`);
  return r.review;
}

export const itemRange = (r: Review, id: ItemId): Range | null =>
  r.items.find((p) => p.item.id === id)?.item.range ?? null;

// The final pay proper, the money already earned: salary, holidays and extra pay.
export function finalPayTotal(r: Review): Range {
  const ids: readonly ItemId[] = ['pending_salary', 'holiday_pay', 'extra_pay'];
  const ranges = ids.map((id) => itemRange(r, id) ?? { min: 0, max: 0 });
  return {
    min: ranges.reduce((s, x) => s + x.min, 0),
    max: ranges.reduce((s, x) => s + x.max, 0),
  };
}

// Baja voluntaria: three years and a half, gone on 15 October with 10 holiday days taken and the
// 15 days of notice of the agreement not given.
export const resignation = review(
  exampleInput('resignation', '2023-03-01', '2026-10-15', {
    holidayDaysTaken: 10,
    agreementNoticeDays: 15,
    noticeDaysGiven: 0,
  }),
);

// Despido improcedente: one contract after the 2012 reform and one before it.
export const unfairAfter2012 = computeSeverance({
  cause: 'unfair_dismissal',
  startDate: date('2018-05-03'),
  endDate: date('2026-07-20'),
  annualSalary: annualSalary(exampleInput('unfair_dismissal', '2018-05-03', '2026-07-20')),
});
export const unfairBefore2012 = computeSeverance({
  cause: 'unfair_dismissal',
  startDate: date('2010-03-01'),
  endDate: date('2026-09-15'),
  annualSalary: annualSalary(exampleInput('unfair_dismissal', '2010-03-01', '2026-09-15')),
});

// The months a severance counted, read from its own calculation: one stretch, or two before 2012.
export function severanceMonths(calculation: readonly { key: string; vars?: object }[]): number[] {
  return calculation.flatMap((p) => {
    const months = (p.vars as { meses?: unknown } | undefined)?.meses;
    return typeof months === 'number' ? [months] : [];
  });
}

// Despido objetivo: the same dates as the unfair example, no notice given.
export const objective = review(
  exampleInput('objective_dismissal', '2018-05-03', '2026-07-20', {
    holidayDaysTaken: 10,
    noticeDaysReceived: 0,
  }),
);

// A contract for production circumstances lasts at most 6 months, or a year where a sectoral
// agreement extends it (art. 15.2 ET); past that, the person may be permanent (art. 15.4 ET).
export type FixedTermLimit = 'legal' | 'sector_agreement' | 'over';
const fixedTermLimit = (months: number): FixedTermLimit =>
  months <= 6 ? 'legal' : months <= 12 ? 'sector_agreement' : 'over';

// Fin de contrato temporal: contracts for production circumstances of 3, 6 and 12 months that end
// on 30 September 2026.
export const FIXED_TERMS = [
  ['3 meses', '2026-07-01', 3],
  ['6 meses', '2026-04-01', 6],
  ['12 meses', '2025-10-01', 12],
] as const;
export const fixedTerms = FIXED_TERMS.map(([label, start, months]) => {
  const r = review(
    exampleInput('fixed_term_end', start, '2026-09-30', {
      fixedTermType: 'production_circumstances',
      noticeDaysReceived: 0,
    }),
  );
  return { label, limit: fixedTermLimit(months), severance: itemRange(r, 'severance') };
});

// /finiquito/: what changes with seniority for a contract that ends on 30 September 2026. The
// final pay itself stops growing after a year; the severance, by cause, keeps growing.
export const SENIORITY = [
  ['3 meses', '2026-07-01', 3],
  ['6 meses', '2026-04-01', 6],
  ['1 año', '2025-10-01', 12],
  ['3 años', '2023-10-01', 36],
] as const;
export const bySeniority = SENIORITY.map(([label, start, months]) => {
  const end = '2026-09-30';
  const finalPay = finalPayTotal(review(exampleInput('resignation', start, end)));
  const severance = (cause: Cause) =>
    computeSeverance({
      cause,
      startDate: date(start),
      endDate: date(end),
      annualSalary: annualSalary(exampleInput(cause, start, end)),
      fixedTermType: 'production_circumstances',
    }).amount;
  return {
    label,
    finalPay,
    fixedTermLimit: fixedTermLimit(months),
    // No figure where a contract for production circumstances could not have lasted that long.
    fixedTerm: fixedTermLimit(months) === 'over' ? null : severance('fixed_term_end'),
    objective: severance('objective_dismissal'),
    unfair: severance('unfair_dismissal'),
  };
});

// Firmar «no conforme»: the resignation above, with an offer that leaves holidays short.
export const OFFERED_HOLIDAYS = 300;
export const notAgreed = review(
  exampleInput('resignation', '2023-03-01', '2026-10-15', {
    holidayDaysTaken: 10,
    agreementNoticeDays: 15,
    noticeDaysGiven: 15,
  }),
  { holiday_pay: OFFERED_HOLIDAYS },
);

// /paro/: what a gross salary paid in 14 payments gives, for each number of children.
export const BENEFIT_SALARIES = [1300, 1500, 1800] as const;
export const benefitBySalary = BENEFIT_SALARIES.map((salary) => {
  const e = exampleInput('unfair_dismissal', '2022-01-01', '2026-09-30', {
    monthlySalary: salary,
    extraPayAmount: salary,
  });
  const base = monthlyBase(e);
  return {
    salary,
    base,
    children: ([0, 1, 2] as const).map((n) => amounts(base, n)),
  };
});

// /paro/por-tiempo-trabajado/: one contract alone, ending on 31 August 2026.
export const WORKED = [
  ['6 meses', '2026-03-01'],
  ['1 año', '2025-09-01'],
  ['2 años', '2024-09-01'],
  ['3 años', '2023-09-01'],
  ['6 años', '2020-09-01'],
] as const;
export const durationByTime = WORKED.map(([label, start]) => {
  const days = contractContributedDays(date(start), date('2026-08-31'));
  return { label, days, benefitDays: durationForDays(days) };
});
export const BENEFIT_SCALE = [...BENEFIT_2026.scale].reverse();

// /paro/baja-voluntaria/ and /paro/despido-disciplinario/: the same contract ended two ways.
const threeYears = (cause: Cause) => exampleInput(cause, '2023-09-01', '2026-08-31');
export const benefitAfterResignation = estimateBenefit(threeYears('resignation'), 0);
export const benefitAfterDismissal = estimateBenefit(threeYears('unfair_dismissal'), 0);

export const disciplinary = estimateBenefit(
  exampleInput('disciplinary_dismissal', '2022-06-01', '2026-09-30'),
  0,
);

// Which causes the engine treats as a legal unemployment situation.
export const CAUSES: readonly Cause[] = [
  'disciplinary_dismissal',
  'unfair_dismissal',
  'objective_dismissal',
  'fixed_term_end',
  'resignation',
];
export const entitledByCause = CAUSES.map((cause) => ({
  cause,
  entitled: estimateBenefit(threeYears(cause), 0).entitled,
}));
