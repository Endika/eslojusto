import { parseAmount } from '../calculator/number';
import { compareDates, parseDate } from '../engine/date';
import { RULES } from '../engine/household/rules';
import type { Scope } from '../engine/household/types';
import { endDateOf, type Sheet } from './form';

// The day the reform took effect, as the engine's own scope reads it.
const REFORM_DAY = parseDate(RULES.transitional_application.from);

const CONDITIONS = '[data-if], [data-if-above0], [data-if-below]';

// The value a control group holds now: the checked radio, or the field's own value.
function valueIn(root: ParentNode, selector: string): string {
  const controls = [...root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(selector)];
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

// A figure typed, or null while it does not read as one.
function typed(form: HTMLFormElement, name: string): number | null {
  const n = parseAmount(valueIn(form, `[name="${name}"]`));
  return n === null || Number.isNaN(n) ? null : n;
}

function holds(el: HTMLElement, form: HTMLFormElement): boolean {
  const { dataset } = el;
  if (dataset['if'] !== undefined) {
    const [name = ''] = dataset['if'].split(':');
    if (!listed(dataset['if'], valueIn(form, `[name="${name}"]`))) return false;
  }
  // Asked only when the figure typed reads as more than zero: «0», «00» and «0,0» all close it.
  if (dataset['ifAbove0'] !== undefined) {
    const n = typed(form, dataset['ifAbove0']);
    if (n === null || n <= 0) return false;
  }
  // Asked only when the figure typed is below a bound: «noticeDays:30» opens under 30.
  if (dataset['ifBelow'] !== undefined) {
    const [name = '', bound = '0'] = dataset['ifBelow'].split(':');
    const n = typed(form, name);
    if (n === null || n >= Number(bound)) return false;
  }
  return true;
}

function setActive(el: HTMLElement, active: boolean) {
  el.hidden = !active;
  for (const control of el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'))
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

// The gate after the dates sheet: a relationship that ended before the reform goes straight to
// the result. Until the last day reads, the visit goes on.
export function gate(form: HTMLFormElement): Scope {
  const end = endDateOf(form);
  return end !== null && compareDates(end, REFORM_DAY) < 0
    ? { inScope: false, reason: 'before_reform' }
    : { inScope: true };
}

// The extra payments only when paid by the month, and when they are paid only if they are apart;
// the desistimiento sheets only after a desistimiento, and the night notice only for a live-in worker.
export function applies(form: HTMLFormElement, step: Sheet | 'resultado'): boolean {
  const value = (name: string) => valueIn(form, `[name="${name}"]`);
  const count = typed(form, 'extraCount');
  switch (step) {
    case 'pagas':
      return value('work') !== 'hourly_external';
    case 'pagas-cuando':
      return (
        value('work') !== 'hourly_external' &&
        count !== null &&
        count > 0 &&
        value('extraProrated') === 'no'
      );
    case 'desistimiento':
    case 'escrito':
    case 'indemnizacion':
    case 'preaviso':
      return value('ending') === 'desistimiento';
    case 'noche':
      return value('ending') === 'desistimiento' && value('work') === 'live_in';
    default:
      return true;
  }
}
