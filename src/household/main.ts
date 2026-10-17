import { setUpSection } from '../calculator/section';
import { reviewHousehold } from '../engine/household/review';
import { applyConditions, gate } from './conditions';
import { SHEETS, endingOf, readHouseholdForm, sheetErrors, sheetOfField } from './form';
import type { CompletedHouseholdReview, HouseholdItemKind, HouseholdPageDeps } from './ports';
import { renderErrors, renderHouseholdResult, renderOutOfScope } from './render';
import { HOUSEHOLD_FLOW } from './steps';

// The household employee's review: its sheets, the gate after the dates and the result.
export function setUpHousehold(
  root: HTMLElement,
  { events, today, tr, tables }: HouseholdPageDeps,
): void {
  let completed: CompletedHouseholdReview | null = null;
  setUpSection(root, {
    formId: 'household',
    flow: HOUSEHOLD_FLOW,
    sheets: SHEETS,
    events,
    today,
    applyConditions,
    // A typed figure can open or close a question too, such as the extra payments and their
    // proration.
    conditionsOnInput: true,
    sheetOfField,
    sheetErrors,
    renderErrors: (form, errors) => renderErrors(form, errors, tr),
    // A relationship that ended before the reform goes to the result, with why.
    stopsAtGate(form, result) {
      const g = gate(form);
      if (g.inScope) return false;
      renderOutOfScope(result, g.reason, tr);
      events.outOfScope(g.reason);
      return true;
    },
    review(form, result, day) {
      const parsed = readHouseholdForm(form, day);
      if ('errors' in parsed) return parsed.errors;
      const r = reviewHousehold(parsed.input, day, tables);
      // The form already ran the engine's checks; this only guards against the two drifting apart.
      if (!r.ok) return r.errors.map(({ field, code }) => ({ field, code }));
      const ending = endingOf(form);
      renderHouseholdResult(
        result,
        { review: r.review, input: parsed.input, endingUnknown: ending === 'unknown' },
        tr,
      );
      completed = { review: r.review, input: parsed.input, ending };
      return [];
    },
    reviewed() {
      if (completed) events.reviewCompleted(completed);
    },
    opened(d) {
      const kind = d.closest<HTMLElement>('[data-item]')?.dataset['kind'];
      if (d.hasAttribute('data-detail') && kind) events.detailOpened(kind as HouseholdItemKind);
    },
  });
}
