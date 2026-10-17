import { required } from '../calculator/dom';
import { setUpSection, type SectionForm } from '../calculator/section';
import { reviewEmployment } from '../engine/employment/review';
import { applyConditions, gate } from './conditions';
import {
  SHEETS,
  answersSoFar,
  baseField,
  readEmploymentForm,
  sheetErrors,
  sheetOfField,
} from './form';
import type { CompletedEmploymentReview, EmploymentItemKind, EmploymentReviewDeps } from './ports';
import {
  renderEmploymentResult,
  renderErrors,
  renderOutOfScope,
  type EmploymentResultData,
} from './render';
import { employmentEntries, rowsNeeded, setControl } from './fill';
import { ROW_LISTS, setUpRows } from './rows';
import { EMPLOYMENT_FLOW } from './steps';

// The employment review: its sheets, the gate after the first one and the result, shown again when
// its detail is locked or unlocked.
export function setUpEmployment(
  root: HTMLElement,
  { events, today, tr, tables, detail = () => 'unlocked' }: EmploymentReviewDeps,
): SectionForm {
  const form = required(root.querySelector<HTMLFormElement>('#employment'), 'the form');
  const rows = setUpRows(form, tr, () => applyConditions(form));
  let shown: EmploymentResultData | null = null;
  let completed: CompletedEmploymentReview | null = null;

  return setUpSection(root, {
    formId: 'employment',
    flow: EMPLOYMENT_FLOW,
    sheets: SHEETS,
    events,
    today,
    applyConditions,
    // A typed figure can open or close a question too, such as the extra pays and their proration.
    conditionsOnInput: true,
    sheetOfField,
    fieldName: baseField,
    sheetErrors,
    renderErrors: (f, errors) => renderErrors(f, errors, tr),
    // A relationship outside the review goes from the first sheet to the result, with why.
    stopsAtGate(f, result) {
      const g = gate(f);
      if (g.inScope) return false;
      shown = null;
      const answers = answersSoFar(f);
      const r = reviewEmployment(answers, today(), tables);
      renderOutOfScope(
        result,
        g.reason,
        r.ok ? r.review.information : [],
        tr,
        answers.relationship === 'household',
      );
      events.outOfScope(g.reason);
      return true;
    },
    review(f, result, day) {
      const parsed = readEmploymentForm(f, day);
      if ('errors' in parsed) return parsed.errors;
      const r = reviewEmployment(parsed.input, day, tables);
      // The form already ran the engine's checks; this only guards against the two drifting apart.
      if (!r.ok) return r.errors.map(({ field, code }) => ({ field, code }));
      shown = { review: r.review, input: parsed.input };
      const state = detail();
      renderEmploymentResult(result, shown, state === 'locked', tr);
      completed = { review: r.review, input: parsed.input, detail: state };
      return [];
    },
    reviewed() {
      if (completed) events.reviewCompleted(completed);
    },
    opened(d) {
      const kind = d.closest<HTMLElement>('[data-item]')?.dataset['kind'];
      if (d.hasAttribute('data-detail') && kind) events.detailOpened(kind as EmploymentItemKind);
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
    entries: employmentEntries,
    refreshResult(result) {
      if (shown) renderEmploymentResult(result, shown, detail() === 'locked', tr);
    },
  });
}
