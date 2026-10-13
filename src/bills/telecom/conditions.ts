import { chosen } from '../../calculator/review-form';
import type { TelecomScope } from '../../engine/bills/types';
import { formScope, type Sheet } from './form';

// The gate after each sheet: an exit the review does not cover goes straight to the result.
export const gate = (form: HTMLFormElement): TelecomScope => formScope(form);

// The commitment sheets and the result always; the rest only for an exit within the review. The
// agreed penalty is asked only of a commitment, and what changed and the handset kept only when the
// conditions changed.
export function applies(form: HTMLFormElement, step: Sheet | 'resultado'): boolean {
  if (step === 'permanencia' || step === 'resultado') return true;
  if (step === 'penalizacion') return chosen(form, 'hasCommitment') === 'yes';
  if (step === 'baja') return true;
  if (!gate(form).inScope) return false;
  if (step === 'cambio' || step === 'terminal')
    return ['notice', 'no_notice'].includes(chosen(form, 'change'));
  return true;
}
