import { setUpSection } from '../calculator/section';
import { reviewCredit } from '../engine/credit/review';
import { applyConditions, gate } from './conditions';
import { SHEETS, onQuestions, readCreditForm, sheetErrors, sheetOfField } from './form';
import type { CreditSetup } from './ports';
import { renderCreditResult, renderErrors, renderOutOfScope } from './render';
import { CREDIT_FLOW as flow } from './steps';

// The consumer credit review: its sheets, the gate after the first ones and the result.
export const setUpCredit = (
  root: HTMLElement,
  { events, today, tr, tables }: CreditSetup,
): HTMLFormElement =>
  setUpSection(root, {
    formId: 'credit',
    flow,
    sheets: SHEETS,
    events,
    today,
    applyConditions,
    sheetOfField,
    sheetErrors,
    renderErrors: (form, errors) => renderErrors(form, errors, tr),
    stopsAtGate(form, result) {
      const g = gate(form);
      if (g.inScope) return false;
      renderOutOfScope(result, g, tr);
      return true;
    },
    review(form, result, day) {
      const parsed = readCreditForm(form, day);
      if ('errors' in parsed) return parsed.errors;
      const r = reviewCredit(parsed.input, day, tables);
      // The form already ran the engine's checks; this only guards against the two drifting apart.
      if (!r.ok) return onQuestions(r.errors, parsed.input);
      if (r.review.scope.inScope) renderCreditResult(result, r.review, tr);
      else renderOutOfScope(result, r.review.scope, tr);
      return [];
    },
  });
