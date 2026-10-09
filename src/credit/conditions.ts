import type { Scope } from '../engine/credit/types';
import { formScope, isLoan, type Sheet } from './form';

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

// The gate after each sheet: a credit the review does not cover goes straight to the result.
// Until its answers read, the visit goes on.
export const gate = (form: HTMLFormElement): Scope =>
  formScope(form) ?? { inScope: true, indicatorOnly: false };

// The answer a radio group holds now, or '' while unanswered.
const chosen = (form: HTMLFormElement, name: string): string =>
  form.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value ?? '';

// What a revolving card concluded before the 2011 law is asked: its indicator needs the APR it
// states, and its statement arithmetic the card's figures.
const INDICATOR_SHEETS: readonly Sheet[] = ['uso', 'importe', 'contrato', 'interes', 'tae'];

const LOAN_SHEETS: readonly Sheet[] = [
  'cuotas',
  'cuota-final',
  'apertura',
  'otros-gastos',
  'seguro',
  'amortizacion',
];
const REPAYMENT_SHEETS: readonly Sheet[] = ['compensacion', 'fin-pactado', 'detalles'];

// The product sheet and the result always; the rest only for a credit within the review, each as
// its answers ask for it.
export function applies(form: HTMLFormElement, step: Sheet | 'resultado'): boolean {
  if (step === 'producto' || step === 'resultado') return true;
  const reach = gate(form);
  if (!reach.inScope) return false;
  const product = chosen(form, 'product');
  const loan = isLoan(product);
  if (step === 'tarjeta') return product === 'revolving';
  if (reach.indicatorOnly) return INDICATOR_SHEETS.includes(step);
  if (LOAN_SHEETS.includes(step)) return loan;
  if (step === 'seguro-pago') return loan && chosen(form, 'hasInsurance') === 'yes';
  if (REPAYMENT_SHEETS.includes(step)) return loan && chosen(form, 'repaid') === 'yes';
  if (step === 'comparar') return chosen(form, 'aprStated') === 'yes';
  return true;
}
