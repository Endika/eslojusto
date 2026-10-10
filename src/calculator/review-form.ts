import { parseDate, type CivilDate } from '../engine/date';

// What the review sections that walk the shared section flow ask the same way: questions shown
// only while an earlier answer asks for them, and the answers read back from the form.

const CONDITIONS = '[data-if]';

// The value a control group holds now: the checked radio, or the field's own value.
function valueIn(form: HTMLFormElement, name: string): string {
  const controls = [...form.querySelectorAll<HTMLInputElement>(`[name="${name}"]`)];
  const first = controls[0];
  if (!first) return '';
  if (first.type === 'radio') return controls.find((c) => c.checked)?.value ?? '';
  return first.value;
}

// `data-if="product:personal_loan car_loan"`: asked while `product` holds one of the values listed.
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

// The answer a radio group holds now, or '' while unanswered.
export const chosen = (form: HTMLFormElement, name: string): string =>
  form.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value ?? '';

export const pick = <T extends string>(value: string | null, options: readonly T[]): T | null =>
  value !== null && (options as readonly string[]).includes(value) ? (value as T) : null;

// «Sí», «No» and «No lo sé»; undefined while unanswered.
export const triState = (value: string | null): boolean | null | undefined =>
  value === 'yes' ? true : value === 'no' ? false : value === 'unknown' ? null : undefined;

export const tryDate = (text: string): CivilDate | null => {
  try {
    return parseDate(text);
  } catch {
    return null;
  }
};
