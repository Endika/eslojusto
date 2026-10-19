import { applyConditions } from '../calculator/review-form';
import { setUpSection, type SectionForm } from '../calculator/section';
import { reviewMortgage } from '../engine/mortgage/review';
import { gate } from './conditions';
import { SHEETS, onQuestions, readMortgageForm, sheetErrors, sheetOfField } from './form';
import type { MortgageReview } from '../engine/mortgage/review';
import type { MortgageSetup } from './ports';
import { renderErrors, renderMortgageResult, renderOutOfScope } from './render';
import { MORTGAGE_FLOW as flow } from './steps';

// The mortgage review: its sheets, the gate after the first ones and the result, shown again when
// the pass is verified or dropped.
export function setUpMortgage(
  root: HTMLElement,
  { events, today, tr, tables, detail = () => 'unlocked' }: MortgageSetup,
): SectionForm {
  let shown: MortgageReview | null = null;
  return setUpSection(root, {
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
      shown = null;
      renderOutOfScope(result, g, tr);
      events.reviewCleared();
      events.outOfScope(g.reason);
      return true;
    },
    review(form, result, day) {
      const parsed = readMortgageForm(form, day);
      if ('errors' in parsed) return parsed.errors;
      const r = reviewMortgage(parsed.input, day, tables);
      // The form already ran the engine's checks; this only guards against the two drifting apart.
      if (!r.ok) return onQuestions(r.errors, parsed.invoiceFields);
      const reach = r.review.scope;
      if (reach.inScope) {
        shown = r.review;
        renderMortgageResult(result, r.review, detail() === 'locked', tr);
        events.reviewCompleted({ review: r.review, input: parsed.input });
      } else {
        shown = null;
        renderOutOfScope(result, reach, tr);
        events.reviewCleared();
        events.outOfScope(reach.reason);
      }
      return [];
    },
    restarted() {
      shown = null;
      events.reviewCleared();
    },
    refreshResult(result) {
      if (shown) renderMortgageResult(result, shown, detail() === 'locked', tr);
    },
  });
}
