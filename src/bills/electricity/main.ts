import { applyConditions } from '../../calculator/review-form';
import { setUpSection, type SectionForm } from '../../calculator/section';
import { reviewElectricityBill } from '../../engine/bills/electricity-review';
import { renderErrors, renderOutOfScope } from '../result';
import { gate } from './conditions';
import { SHEETS, onQuestions, readElectricityForm, sheetErrors, sheetOfField } from './form';
import type { CompletedElectricityReview, ElectricitySetup } from './ports';
import { renderElectricityResult } from './render';
import { ELECTRICITY_FLOW as flow } from './steps';

// The review of a household electricity bill: its sheets, the gate after each and the result, shown
// again when the pass is verified or dropped.
export function setUpElectricity(
  root: HTMLElement,
  { events, today, tr, tables, detail = () => 'unlocked', offered = () => false }: ElectricitySetup,
): SectionForm {
  let shown: CompletedElectricityReview | null = null;
  const show = (result: HTMLElement, r: CompletedElectricityReview) =>
    renderElectricityResult(
      result,
      r.review,
      r.input,
      tables.norms,
      detail() === 'locked' && offered(r),
      tr,
    );
  return setUpSection(root, {
    formId: 'electricity',
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
      const parsed = readElectricityForm(form, day);
      if ('errors' in parsed) return parsed.errors;
      const r = reviewElectricityBill(parsed.input, day, tables);
      // The form already ran the engine's checks; this only guards against the two drifting apart.
      if (!r.ok) return onQuestions(r.errors);
      const reach = r.review.scope;
      if (reach.inScope) {
        shown = { review: r.review, input: parsed.input };
        show(result, shown);
        events.reviewCompleted(shown);
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
    // A fill brings another bill's answers, or none for a new one: the review shown is no longer
    // the form's, and only reviewing it again shows it.
    beforeFill() {
      shown = null;
    },
    refreshResult(result) {
      if (shown) show(result, shown);
    },
  });
}
