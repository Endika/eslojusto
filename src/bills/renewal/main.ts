import { setUpSection, type SectionForm } from '../../calculator/section';
import { reviewRenewal } from '../../engine/bills/renewal-review';
import { renderErrors } from '../result';
import { applyConditions } from './conditions';
import { SHEETS, onQuestions, readRenewalForm, sheetErrors, sheetOfField } from './form';
import type { RenewalSetup } from './ports';
import { clearRenewalResult, renderRenewalResult } from './render';
import { RENEWAL_FLOW as flow } from './steps';

// The review of a renewal letter: its sheets and the result. The result is free, with no pass to
// lock any of it; it is drawn once the PVPC prices are in.
export function setUpRenewal(
  root: HTMLElement,
  { events, today, tr, tables, official }: RenewalSetup,
): SectionForm {
  // Counts the reviews asked for, so a slow load never draws one the person has moved past.
  let asked = 0;
  return setUpSection(root, {
    formId: 'renewal',
    flow,
    sheets: SHEETS,
    events,
    today,
    applyConditions,
    sheetOfField,
    sheetErrors,
    renderErrors: (form, errors) => renderErrors(form, errors, tr),
    stopsAtGate: () => false,
    review(form, result, day) {
      const parsed = readRenewalForm(form, day);
      if ('errors' in parsed) return parsed.errors;
      const { input } = parsed;
      // The form already ran the engine's checks; this only guards against the two drifting apart.
      const checked = reviewRenewal(input, day, { ...tables, official: null });
      if (!checked.ok) return onQuestions(checked.errors);
      const turn = ++asked;
      clearRenewalResult(result);
      void official().then((loaded) => {
        const r = reviewRenewal(input, day, { ...tables, official: loaded });
        if (turn !== asked || !r.ok) return;
        renderRenewalResult(result, r.review, tables.norms, tr);
        events.reviewCompleted({ review: r.review });
      });
      return [];
    },
    restarted: () => {
      asked++;
      events.reviewCleared();
    },
  });
}
