import { chosen } from '../calculator/review-form';
import type { Scope } from '../engine/credit/types';
import { formScope, isLoan, type Sheet } from './form';

// The gate after each sheet: a credit the review does not cover goes straight to the result.
// Until its answers read, the visit goes on.
export const gate = (form: HTMLFormElement): Scope =>
  formScope(form) ?? { inScope: true, indicatorOnly: false };

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
