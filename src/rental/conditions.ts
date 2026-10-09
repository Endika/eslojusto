import type { NormTable } from '../engine/rental/norms';
import { scope, type Scope } from '../engine/rental/scope';
import { contractAnswers, type Sheet } from './form';

const CONDITIONS =
  '[data-if], [data-row-if], [data-if-signed-from], [data-row-first-of], [data-row-repeat-of]';

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
  if (dataset['rowIf'] !== undefined) {
    const [key = ''] = dataset['rowIf'].split(':');
    const row = el.closest('[data-row]') ?? form;
    if (!listed(dataset['rowIf'], valueIn(row, `[data-row-field="${key}"]`))) return false;
  }
  // Asked once per value of a row field, on the first row that has it: a concept's contract terms
  // go on its first row, and the rows after it only say so.
  const once = dataset['rowFirstOf'] ?? dataset['rowRepeatOf'];
  if (once !== undefined) {
    const row = el.closest<HTMLElement>('[data-row]');
    const value = row ? valueIn(row, `[data-row-field="${once}"]`) : '';
    const earlier = row
      ? [...(row.parentElement?.children ?? [])]
          .slice(0, [...(row.parentElement?.children ?? [])].indexOf(row))
          .some((r) => valueIn(r, `[data-row-field="${once}"]`) === value)
      : false;
    if (earlier !== (dataset['rowRepeatOf'] !== undefined)) return false;
  }
  if (dataset['ifSignedFrom'] !== undefined) {
    const signed = valueIn(form, '[name="signedOn"]');
    if (signed === '' || signed < dataset['ifSignedFrom']) return false;
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

// The gate after the contract's sheets: a contract the review does not cover goes straight to the
// result. Until the three answers read, the visit goes on.
export function gate(form: HTMLFormElement, norms: NormTable): Scope {
  const answers = contractAnswers(form);
  return answers === null ? { inScope: true } : scope(answers, norms);
}

// The contract's sheets ask the gate's answers; the rest follow it, and what was given back of the
// deposit only once the home is left.
export function applies(form: HTMLFormElement, step: Sheet | 'resultado', norms: NormTable) {
  if (step === 'contrato' || step === 'fechas' || step === 'resultado') return true;
  if (!gate(form, norms).inScope) return false;
  return step !== 'fianza' || valueIn(form, '[name="movedOut"]') === 'yes';
}
