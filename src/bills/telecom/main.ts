import { applyConditions } from '../../calculator/review-form';
import { setUpSection, type SectionForm } from '../../calculator/section';
import { reviewTelecom, type TelecomReview } from '../../engine/bills/telecom-review';
import { renderErrors, renderOutOfScope } from '../result';
import { gate } from './conditions';
import { SHEETS, onQuestions, readTelecomForm, sheetErrors, sheetOfField } from './form';
import type { TelecomSetup } from './ports';
import { renderTelecomResult } from './render';
import { TELECOM_FLOW as flow } from './steps';

// The review of leaving a phone or internet contract: its sheets, the gate after the exit date and
// the result, shown again when the pass is verified or dropped.
export function setUpTelecom(
  root: HTMLElement,
  { events, today, tr, tables, detail = () => 'unlocked' }: TelecomSetup,
): SectionForm {
  let shown: TelecomReview | null = null;
  return setUpSection(root, {
    formId: 'telecom',
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
      const parsed = readTelecomForm(form, day);
      if ('errors' in parsed) return parsed.errors;
      const r = reviewTelecom(parsed.input, day, tables);
      // The form already ran the engine's checks; this only guards against the two drifting apart.
      if (!r.ok) return onQuestions(r.errors);
      const reach = r.review.scope;
      if (reach.inScope) {
        shown = r.review;
        renderTelecomResult(result, r.review, tables.norms, detail() === 'locked', tr);
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
      if (shown) renderTelecomResult(result, shown, tables.norms, detail() === 'locked', tr);
    },
  });
}
