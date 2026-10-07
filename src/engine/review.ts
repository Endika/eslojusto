import { compareItem, type ItemResult } from './compare';
import type { CivilDate } from './date';
import { computeSeverance } from './severance';
import {
  noticeDeductionItem,
  extraPayItem,
  employerNoticeItem,
  pendingSalaryItem,
  holidayPayItem,
  annualSalary,
} from './settlement';
import type { FinalPayInput, ZeroReason, Item, ItemId } from './types';
import { validate, type InputError } from './validate';

export type EmployerFigures = Partial<Record<ItemId, number>>;

export type UncheckedCode =
  'net_pay' | 'bonuses' | 'additional_extra_pay' | 'dismissal_cause' | 'processing_wages';

const UNCHECKED: Record<UncheckedCode, string> = {
  net_pay: 'El neto: retenciones de IRPF y cotizaciones',
  bonuses: 'Pluses, complementos, horas extra y comisiones de tu convenio o contrato',
  additional_extra_pay: 'Pagas extra además de las dos ordinarias',
  dismissal_cause: 'Si la causa de despido está justificada, algo que decide un juzgado',
  processing_wages: 'Salarios de tramitación',
};

export interface Review {
  readonly items: readonly ItemResult[];
  readonly unfairReference: number | null;
  readonly unchecked: readonly string[];
  // The same list as codes, for the UI to translate.
  readonly uncheckedCodes: readonly UncheckedCode[];
}

function zeroReason(e: FinalPayInput): ZeroReason | undefined {
  if (e.cause === 'resignation' || e.cause === 'disciplinary_dismissal') return e.cause;
  if (e.cause === 'fixed_term_end' && e.fixedTermType !== 'production_circumstances')
    return e.fixedTermType;
  return undefined;
}

function severanceItem(e: FinalPayInput): Item {
  const reason = zeroReason(e);
  const r = computeSeverance({
    cause: e.cause,
    startDate: e.startDate,
    endDate: e.endDate,
    annualSalary: annualSalary(e),
    fixedTermType: e.fixedTermType,
  });
  return {
    id: 'severance',
    title: 'Indemnización',
    direction: 'credit',
    range: r.range,
    calculation: r.detail,
    dependsOnAgreement: false,
    basedOnYourAnswer: false,
    sources: r.sources,
    ...(reason === undefined ? {} : { zeroReason: reason }),
  };
}

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

  const unfairReference =
    e.cause === 'disciplinary_dismissal'
      ? computeSeverance({
          cause: 'unfair_dismissal',
          startDate: e.startDate,
          endDate: e.endDate,
          annualSalary: annualSalary(e),
        }).amount
      : null;

  const uncheckedCodes: UncheckedCode[] = [
    'net_pay',
    'bonuses',
    ...(e.extraPayCount > 2 ? (['additional_extra_pay'] as const) : []),
    'dismissal_cause',
    'processing_wages',
  ];
  const unchecked = uncheckedCodes.map((c) => UNCHECKED[c]);

  return {
    ok: true,
    review: { items, unfairReference, unchecked, uncheckedCodes },
  };
}
