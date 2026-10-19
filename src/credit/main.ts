import { applyConditions } from '../calculator/review-form';
import { setUpSection, type SectionForm } from '../calculator/section';
import { reviewCredit, type CreditReview } from '../engine/credit/review';
import { gate } from './conditions';
import { SHEETS, onQuestions, readCreditForm, sheetErrors, sheetOfField } from './form';
import type { CreditSetup } from './ports';
import { renderCreditResult, renderErrors, renderOutOfScope } from './render';
import { CREDIT_FLOW as flow } from './steps';

// The consumer credit review: its sheets, the gate after the first ones and the result, shown
// again when the pass is verified or dropped.
export function setUpCredit(
  root: HTMLElement,
  { events, today, tr, tables, detail = () => 'unlocked' }: CreditSetup,
): SectionForm {
  let shown: CreditReview | null = null;
  return setUpSection(root, {
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
      shown = null;
      renderOutOfScope(result, g, tr);
      events.reviewCleared();
      events.outOfScope(g.reason);
      return true;
    },
    review(form, result, day) {
      const parsed = readCreditForm(form, day);
      if ('errors' in parsed) return parsed.errors;
      const r = reviewCredit(parsed.input, day, tables);
      // The form already ran the engine's checks; this only guards against the two drifting apart.
      if (!r.ok) return onQuestions(r.errors, parsed.input);
      const reach = r.review.scope;
      if (reach.inScope) {
        shown = r.review;
        renderCreditResult(result, r.review, detail() === 'locked', tr);
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
      if (shown) renderCreditResult(result, shown, detail() === 'locked', tr);
    },
  });
}
