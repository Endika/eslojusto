import { applyConditions } from '../calculator/review-form';
import { setUpSection, type SectionForm } from '../calculator/section';
import { reviewMortgage } from '../engine/mortgage/review';
import { gate } from './conditions';
import { SHEETS, onQuestions, readMortgageForm, sheetErrors, sheetOfField } from './form';
import type { MortgageSetup } from './ports';
import { renderErrors, renderMortgageResult, renderOutOfScope } from './render';
import { MORTGAGE_FLOW as flow } from './steps';

// The mortgage review: its sheets, the gate after the first ones and the result.
export const setUpMortgage = (
  root: HTMLElement,
  { events, today, tr, tables }: MortgageSetup,
): SectionForm =>
  setUpSection(root, {
    formId: 'mortgage',
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
      events.reviewCleared();
      return true;
    },
    review(form, result, day) {
      const parsed = readMortgageForm(form, day);
      if ('errors' in parsed) return parsed.errors;
      const r = reviewMortgage(parsed.input, day, tables);
      // The form already ran the engine's checks; this only guards against the two drifting apart.
      if (!r.ok) return onQuestions(r.errors, parsed.invoiceFields);
      if (r.review.scope.inScope) {
        renderMortgageResult(result, r.review, tr);
        events.reviewCompleted({ review: r.review, input: parsed.input });
      } else {
        renderOutOfScope(result, r.review.scope, tr);
        events.reviewCleared();
      }
      return [];
    },
    restarted: () => events.reviewCleared(),
  });
