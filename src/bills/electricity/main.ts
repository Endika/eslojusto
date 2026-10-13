import { applyConditions } from '../../calculator/review-form';
import { setUpSection, type SectionForm } from '../../calculator/section';
import { reviewElectricityBill } from '../../engine/bills/electricity-review';
import { renderErrors, renderOutOfScope } from '../result';
import { gate } from './conditions';
import { SHEETS, onQuestions, readElectricityForm, sheetErrors, sheetOfField } from './form';
import type { ElectricitySetup } from './ports';
import { renderElectricityResult } from './render';
import { ELECTRICITY_FLOW as flow } from './steps';

// The review of a household electricity bill: its sheets, the gate after each and the result.
export const setUpElectricity = (
  root: HTMLElement,
  { events, today, tr, tables }: ElectricitySetup,
): SectionForm =>
  setUpSection(root, {
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
        renderElectricityResult(result, r.review, parsed.input, tables.norms, tr);
        events.reviewCompleted({ review: r.review, input: parsed.input });
      } else {
        renderOutOfScope(result, reach, tr);
        events.reviewCleared();
        events.outOfScope(reach.reason);
      }
      return [];
    },
    restarted: () => events.reviewCleared(),
  });
