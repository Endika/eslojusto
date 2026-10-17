import { required } from '../calculator/dom';
import { setUpSection, type SectionForm } from '../calculator/section';
import { reviewRental } from '../engine/rental/review';
import { applyConditions, gate } from './conditions';
import { SHEETS, baseField, readRentalForm, sheetErrors, sheetOfField } from './form';
import type { CompletedRentalReview, RentalDeps, RentalItemKind } from './ports';
import {
  renderErrors,
  renderOutOfScope,
  renderRentalResult,
  type RentalResultData,
} from './render';
import { rentalEntries, rowsNeeded, setControl } from './fill';
import { ROW_LISTS, setUpRows } from './rows';
import { rentalFlow } from './steps';

// The rental review: its sheets, the gate after the first one and the result, shown again when its
// detail is locked or unlocked.
export function setUpRental(
  root: HTMLElement,
  { events, today, tr, tables, detail = () => 'unlocked' }: RentalDeps,
): SectionForm {
  const form = required(root.querySelector<HTMLFormElement>('#rental'), 'the form');
  const rows = setUpRows(form, tr, () => applyConditions(form));
  let shown: RentalResultData | null = null;
  let completed: CompletedRentalReview | null = null;

  return setUpSection(root, {
    formId: 'rental',
    flow: rentalFlow(tables.norms),
    sheets: SHEETS,
    events,
    today,
    applyConditions,
    sheetOfField,
    fieldName: baseField,
    sheetErrors,
    renderErrors: (f, errors) => renderErrors(f, errors, tr),
    // A contract outside the review goes from the first sheet to the result, with why.
    stopsAtGate(f, result) {
      const g = gate(f, tables.norms);
      if (g.inScope) return false;
      shown = null;
      renderOutOfScope(result, g.reason, tr);
      events.outOfScope(g.reason);
      return true;
    },
    review(f, result, day) {
      const parsed = readRentalForm(f, day);
      if ('errors' in parsed) return parsed.errors;
      const r = reviewRental(parsed.input, day, tables);
      // The form already ran the engine's checks; this only guards against the two drifting apart.
      if (!r.ok) return r.errors.map(({ field, code }) => ({ field, code }));
      shown = { review: r.review, input: parsed.input };
      const state = detail();
      renderRentalResult(result, shown, state === 'locked', tr);
      completed = { review: r.review, input: parsed.input, detail: state };
      return [];
    },
    reviewed() {
      if (completed) events.reviewCompleted(completed);
    },
    opened(d) {
      const item = d.closest<HTMLElement>('[data-item]')?.dataset['item'];
      if (d.hasAttribute('data-detail') && item) events.detailOpened(item as RentalItemKind);
    },
    restarted() {
      shown = null;
      for (const list of Object.values(rows)) list.reset();
    },
    beforeFill(entries) {
      const needed = rowsNeeded(entries);
      for (const list of ROW_LISTS) {
        const n = needed[list];
        if (n !== undefined) rows[list].setRows(n);
      }
    },
    setEntry: setControl,
    entries: rentalEntries,
    refreshResult(result) {
      if (shown) renderRentalResult(result, shown, detail() === 'locked', tr);
    },
  });
}
