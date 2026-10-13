import { chosen, tryDate } from '../calculator/review-form';
import { deedPicksOption } from '../engine/mortgage/fees';
import type { Scope } from '../engine/mortgage/types';
import { formScope, type Sheet } from './form';

// The gate after each sheet: a loan the review does not cover goes straight to the result. Until
// its answers read, the visit goes on.
export const gate = (form: HTMLFormElement): Scope => formScope(form) ?? { inScope: true };

// A floor and an index are clauses of a variable rate, wholly or in part.
const VARIABLE = ['variable', 'mixed'];
const INVOICE_SHEETS: readonly Sheet[] = [
  'notaria',
  'registro',
  'gestoria',
  'tasacion',
  'impuesto',
  'pago',
  'acuerdo',
];
const PREPAYMENTS = ['partial_prepayment', 'full_prepayment', 'creditor_subrogation'];

const deedOn = (form: HTMLFormElement) =>
  tryDate(form.querySelector<HTMLInputElement>('[name="deedOn"]')?.value.trim() ?? '');

// The loan sheet and the result always; the rest only for a mortgage within the review, each as
// its answers ask for it.
export function applies(form: HTMLFormElement, step: Sheet | 'resultado'): boolean {
  if (step === 'hipoteca' || step === 'resultado') return true;
  if (!gate(form).inScope) return false;
  const variable = VARIABLE.includes(chosen(form, 'rateType'));
  const operation = chosen(form, 'operation');
  if (step === 'suelo' || step === 'indice') return variable;
  if (INVOICE_SHEETS.includes(step)) return chosen(form, 'hasInvoices') === 'yes';
  if (step === 'operacion') return operation !== '' && operation !== 'none';
  if (step === 'condiciones') {
    const deed = deedOn(form);
    return PREPAYMENTS.includes(operation) && variable && deed !== null && deedPicksOption(deed);
  }
  if (step === 'seguro') return operation === 'full_prepayment';
  return true;
}
