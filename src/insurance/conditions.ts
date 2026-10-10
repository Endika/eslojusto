import { chosen } from '../calculator/review-form';
import type { Scope } from '../engine/insurance/types';
import { formScope, type Sheet } from './form';

export { applyConditions } from '../calculator/review-form';

// The gate after each sheet: a policy the review does not cover goes straight to the result.
// Until its answers read, the visit goes on.
export const gate = (form: HTMLFormElement): Scope => formScope(form) ?? { inScope: true };

// The policy sheet and the result always; the rest only for a policy within the review. The
// terms are asked only of a policy that may have been bought at a distance, and the notice's
// figures only once it has arrived.
export function applies(form: HTMLFormElement, step: Sheet | 'resultado'): boolean {
  if (step === 'poliza' || step === 'resultado') return true;
  if (!gate(form).inScope) return false;
  if (step === 'condiciones') return ['yes', 'unknown'].includes(chosen(form, 'distance'));
  if (step === 'primas' || step === 'cambios') return chosen(form, 'hasNotice') === 'yes';
  return true;
}
