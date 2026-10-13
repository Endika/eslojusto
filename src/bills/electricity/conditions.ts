import { chosen } from '../../calculator/review-form';
import type { ElectricityScope } from '../../engine/bills/types';
import { formScope, type Sheet } from './form';

// The gate after each sheet: a bill the review does not cover yet goes straight to the result.
export const gate = (form: HTMLFormElement): ElectricityScope => formScope(form);

// Sheets asked only when an earlier answer asks for them.
const ASKED_WHEN: Partial<Record<Sheet, readonly [string, readonly string[]]>> = {
  'bono-social-consumo': ['hasBonus', ['yes']],
  'contador-tipo': ['meterCharged', ['yes']],
  'servicio-1': ['serviceCount', ['1', '2']],
  'servicio-2': ['serviceCount', ['2']],
  'penalizacion-contrato': ['hasPenalty', ['yes']],
};

// The first sheet and the result always; the rest only for a bill within the review.
export function applies(form: HTMLFormElement, step: Sheet | 'resultado'): boolean {
  if (step === 'suministro' || step === 'resultado') return true;
  if (!gate(form).inScope) return false;
  const when = ASKED_WHEN[step];
  return when === undefined || when[1].includes(chosen(form, when[0]));
}
