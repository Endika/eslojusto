import { phrase } from './calculation';
import { compareItem, type ItemResult } from './compare';
import type { CivilDate } from './date';
import { lateInterest, type LateInterest } from './late-interest';
import { computeSeverance } from './severance';
import { SOURCES } from './sources';
import {
  noticeDeductionItem,
  extraPayItem,
  employerNoticeItem,
  pendingSalaryItem,
  holidayPayItem,
  annualSalary,
} from './settlement';
import type { Cause, FinalPayInput, ZeroReason, Item, ItemId } from './types';
import { validate, type InputError } from './validate';

export type EmployerFigures = Partial<Record<ItemId, number>>;

export type UncheckedCode =
  'net_pay' | 'bonuses' | 'additional_extra_pay' | 'dismissal_cause' | 'processing_wages';

export interface Review {
  readonly items: readonly ItemResult[];
  // What the severance would be were the dismissal declared unfair, for a disciplinary, an
  // objective or a collective dismissal; null for any other cause or without the salary for it.
  readonly unfairReference: number | null;
  readonly uncheckedCodes: readonly UncheckedCode[];
  // Only when the person says the final pay is still unpaid.
  readonly lateInterest: LateInterest | null;
}

function zeroReason(e: FinalPayInput): ZeroReason | undefined {
  if (e.cause === 'resignation' || e.cause === 'disciplinary_dismissal') return e.cause;
  if (e.cause === 'fixed_term_end' && e.fixedTermType !== 'production_circumstances')
    return e.fixedTermType;
  return undefined;
}

// The monthly salary the severance is counted on. Under an ERTE it is the full one from before:
// a reduced working day does not lower it (STS 678/2018) and suspended months do not count
// (STS 638/2022). null when the person did not give it.
export function severanceMonthlySalary(e: FinalPayInput): number | null {
  if (e.erte === 'reduced' || e.erte === 'suspended') return e.preErteMonthlySalary ?? null;
  return e.monthlySalary;
}

function severanceAnnualSalary(e: FinalPayInput): number | null {
  const monthlySalary = severanceMonthlySalary(e);
  return monthlySalary === null ? null : annualSalary({ ...e, monthlySalary });
}

const ERTE_PHRASE = {
  reduced: 'severance.erte_reduced',
  suspended: 'severance.erte_suspended',
} as const;

function severanceItem(e: FinalPayInput): Item {
  const base = {
    id: 'severance',
    direction: 'credit',
    dependsOnAgreement: false,
    basedOnYourAnswer: false,
  } as const;
  const { cause } = e;
  if (cause === 'unknown')
    return {
      ...base,
      range: null,
      missingAnswer: 'cause',
      calculation: [phrase('severance.cause_unknown')],
      sources: [SOURCES.et49],
    };
  const reason = zeroReason(e);
  const annual = severanceAnnualSalary(e);
  const r = computeSeverance({
    cause,
    startDate: e.startDate,
    endDate: e.endDate,
    annualSalary: annual ?? annualSalary(e),
    fixedTermType: e.fixedTermType,
  });
  const orMore = cause === 'collective_dismissal' ? ({ orMore: 'ere_agreement' } as const) : {};
  if (reason !== undefined)
    return {
      ...base,
      range: r.range,
      calculation: r.calculation,
      sources: r.sources,
      zeroReason: reason,
    };
  if (annual === null)
    return {
      ...base,
      ...orMore,
      range: null,
      missingAnswer: 'pre_erte_salary',
      calculation: [phrase('severance.erte_salary_unknown')],
      sources: r.sources,
    };
  const erte = e.erte === 'reduced' || e.erte === 'suspended' ? e.erte : null;
  return {
    ...base,
    ...orMore,
    range: r.range,
    calculation:
      erte === null
        ? r.calculation
        : [
            phrase(ERTE_PHRASE[erte], { salario: { euros: severanceMonthlySalary(e) ?? 0 } }),
            ...r.calculation,
          ],
    sources: r.sources,
  };
}

const REFERENCE_CAUSES: readonly Cause[] = [
  'disciplinary_dismissal',
  'objective_dismissal',
  'collective_dismissal',
];

export function reviewFinalPay(
  e: FinalPayInput,
  figures: EmployerFigures,
  today: CivilDate,
): { ok: true; review: Review } | { ok: false; errors: readonly InputError[] } {
  const errors = validate(e, today);
  if (errors.length > 0) return { ok: false, errors };

  const items = [
    pendingSalaryItem(e),
    holidayPayItem(e),
    extraPayItem(e),
    severanceItem(e),
    employerNoticeItem(e),
    noticeDeductionItem(e),
  ]
    .filter((p): p is Item => p !== null)
    .map((p) => compareItem(p, figures[p.id] ?? null));

  const referenceSalary = severanceAnnualSalary(e);
  const unfairReference =
    REFERENCE_CAUSES.includes(e.cause) && referenceSalary !== null
      ? computeSeverance({
          cause: 'unfair_dismissal',
          startDate: e.startDate,
          endDate: e.endDate,
          annualSalary: referenceSalary,
        }).amount
      : null;

  const uncheckedCodes: UncheckedCode[] = [
    'net_pay',
    'bonuses',
    ...(e.extraPayCount > 2 ? (['additional_extra_pay'] as const) : []),
    'dismissal_cause',
    'processing_wages',
  ];

  return {
    ok: true,
    review: {
      items,
      unfairReference,
      uncheckedCodes,
      lateInterest:
        e.paid === false
          ? lateInterest(
              items.map((p) => p.item),
              e.endDate,
              today,
            )
          : null,
    },
  };
}
