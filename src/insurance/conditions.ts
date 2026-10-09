import type { Scope } from '../engine/insurance/types';
import { formScope, type Sheet } from './form';

const CONDITIONS = '[data-if]';

// The value a control group holds now: the checked radio, or the field's own value.
function valueIn(form: HTMLFormElement, name: string): string {
  const controls = [...form.querySelectorAll<HTMLInputElement>(`[name="${name}"]`)];
  const first = controls[0];
  if (!first) return '';
  if (first.type === 'radio') return controls.find((c) => c.checked)?.value ?? '';
  return first.value;
}

// `data-if="line:home car"`: asked while `line` holds one of the values listed.
function holds(el: HTMLElement, form: HTMLFormElement): boolean {
  const [name = '', values = ''] = (el.dataset['if'] ?? '').split(':');
  return values.split(' ').includes(valueIn(form, name));
}

function setActive(el: HTMLElement, active: boolean) {
  el.hidden = !active;
  for (const control of el.querySelectorAll<HTMLInputElement>('input')) control.disabled = !active;
}

// Shows a question only when the answers before it ask for it, and switches off the controls of
// the rest so they never reach the review. Elements come in document order, so a condition
// inside a hidden one stays off.
export function applyConditions(form: HTMLFormElement): void {
  for (const el of form.querySelectorAll<HTMLElement>(CONDITIONS)) {
    const outer = el.parentElement?.closest<HTMLElement>(CONDITIONS);
    setActive(el, !(outer?.hidden ?? false) && holds(el, form));
  }
}

// The gate after each sheet: a policy the review does not cover goes straight to the result.
// Until its answers read, the visit goes on.
export const gate = (form: HTMLFormElement): Scope => formScope(form) ?? { inScope: true };

// The answer a radio group holds now, or '' while unanswered.
const chosen = (form: HTMLFormElement, name: string): string =>
  form.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value ?? '';

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
