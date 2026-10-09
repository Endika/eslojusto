import { setUpSection, type SectionForm } from '../calculator/section';
import { reviewInsurance } from '../engine/insurance/review';
import { applyConditions, gate } from './conditions';
import { SHEETS, onQuestions, readInsuranceForm, sheetErrors, sheetOfField } from './form';
import type { InsuranceSetup } from './ports';
import { renderErrors, renderInsuranceResult, renderOutOfScope } from './render';
import { INSURANCE_FLOW as flow } from './steps';

// The review of a policy's dates: its sheets, the gate after the first one and the result.
export const setUpInsurance = (
  root: HTMLElement,
  { events, today, tr, tables }: InsuranceSetup,
): SectionForm =>
  setUpSection(root, {
    formId: 'insurance',
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
      renderOutOfScope(result, g.reason, tr);
      events.reviewCleared();
      events.outOfScope(g.reason);
      return true;
    },
    review(form, result, day) {
      const parsed = readInsuranceForm(form, day);
      if ('errors' in parsed) return parsed.errors;
      const r = reviewInsurance(parsed.input, day, tables);
      // The form already ran the engine's checks; this only guards against the two drifting apart.
      if (!r.ok) return onQuestions(r.errors);
      const reach = r.review.scope;
      if (reach.inScope) {
        renderInsuranceResult(result, r.review, tr);
        events.reviewCompleted({ review: r.review, input: parsed.input });
      } else {
        renderOutOfScope(result, reach.reason, tr);
        events.reviewCleared();
        events.outOfScope(reach.reason);
      }
      return [];
    },
    restarted: () => events.reviewCleared(),
  });
