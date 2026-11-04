import { setUpSection, type SectionForm } from '../../calculator/section';
import { reviewRenewal } from '../../engine/bills/renewal-review';
import { renderErrors } from '../result';
import { applyConditions } from './conditions';
import { SHEETS, onQuestions, readRenewalForm, sheetErrors, sheetOfField } from './form';
import type { RenewalSetup } from './ports';
import { renderRenewalResult } from './render';
import { RENEWAL_FLOW as flow } from './steps';

// The review of a renewal letter: its sheets and the result. The result is free and shown at
// once, with no pass to lock any of it.
export function setUpRenewal(
  root: HTMLElement,
  { events, today, tr, tables }: RenewalSetup,
): SectionForm {
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
      const r = reviewRenewal(parsed.input, day, tables);
      // The form already ran the engine's checks; this only guards against the two drifting apart.
      if (!r.ok) return onQuestions(r.errors);
      renderRenewalResult(result, r.review, tables.norms, tr);
      events.reviewCompleted({ review: r.review });
      return [];
    },
    restarted: () => events.reviewCleared(),
  });
}
