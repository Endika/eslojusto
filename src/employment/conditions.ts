import { parseAmount } from '../calculator/number';
import type { Scope } from '../engine/employment/types';
import { formScope, sheetApplies, type Sheet } from './form';

const CONDITIONS = '[data-if], [data-if-above0], [data-row-if]';

// The value a control group holds now: the checked radio, or the field's own value.
function valueIn(scope: ParentNode, selector: string): string {
  const controls = [...scope.querySelectorAll<HTMLInputElement | HTMLSelectElement>(selector)];
  const first = controls[0];
  if (!first) return '';
  if (first instanceof HTMLInputElement && first.type === 'radio')
    return (controls as HTMLInputElement[]).find((c) => c.checked)?.value ?? '';
  return first.value;
}

const listed = (rule: string | undefined, value: string): boolean => {
  const [, values = ''] = (rule ?? '').split(':');
  return values.split(' ').includes(value);
};

function holds(el: HTMLElement, form: HTMLFormElement): boolean {
  const { dataset } = el;
  if (dataset['if'] !== undefined) {
    const [name = ''] = dataset['if'].split(':');
    if (!listed(dataset['if'], valueIn(form, `[name="${name}"]`))) return false;
  }
  // Asked only when the figure typed reads as more than zero: «0», «00» and «0,0» all close it.
  if (dataset['ifAbove0'] !== undefined) {
    const n = parseAmount(valueIn(form, `[name="${dataset['ifAbove0']}"]`));
    if (n === null || Number.isNaN(n) || n <= 0) return false;
  }
  if (dataset['rowIf'] !== undefined) {
    const [key = ''] = dataset['rowIf'].split(':');
    const row = el.closest('[data-row]') ?? form;
    if (!listed(dataset['rowIf'], valueIn(row, `[data-row-field="${key}"]`))) return false;
  }
  return true;
}

function setActive(el: HTMLElement, active: boolean) {
  el.hidden = !active;
  for (const control of el.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('input, select, textarea'))
    control.disabled = !active;
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

// The gate after the relationship sheet: a relationship the review does not cover goes straight
// to the result. Until those answers read, the visit goes on.
export function gate(form: HTMLFormElement): Scope {
  return formScope(form) ?? { inScope: true, partial: false };
}

// Whether a sheet has a question on: one whose every question waits on an answer that did not
// open it is skipped.
const asks = (form: HTMLFormElement, sheet: Sheet): boolean =>
  form.querySelector(`[data-sheet="${sheet}"] :is(input, select, textarea):not(:disabled)`) !==
  null;

// The result always; a sheet as the gate, the modality and the answers before it allow.
export const applies = (form: HTMLFormElement, step: Sheet | 'resultado'): boolean =>
  step === 'resultado' || (sheetApplies(form, step) && asks(form, step));
