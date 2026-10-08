import { required } from '../calculator/dom';
import {
  firstIncomplete,
  indexOfHash,
  lastSheet,
  resultStep,
  stepAt,
  stepFrom,
} from '../calculator/flow';
import type { FormEntries } from '../calculator/fill';
import { createNavigation } from '../calculator/navigation';
import { reviewRental } from '../engine/rental/review';
import { applyConditions, gate } from './conditions';
import {
  SHEETS,
  baseField,
  readRentalForm,
  sheetErrors,
  sheetOfField,
  type FieldError,
} from './form';
import type { RentalDeps, RentalItemKind } from './ports';
import {
  renderErrors,
  renderOutOfScope,
  renderRentalResult,
  type RentalResultData,
} from './render';
import { rentalEntries, rowsNeeded, setControl } from './fill';
import { ROW_LISTS, setUpRows } from './rows';
import { rentalFlow } from './steps';

// What the page's other parts can do with the review: set or read its answers, open it, review
// it, and show its last result again when the detail is locked or unlocked.
export interface RentalCalculator {
  readonly form: HTMLFormElement;
  // Sets the answers, with the rows they name, and returns the names it could not set.
  fill(entries: FormEntries): string[];
  entries(): FormEntries;
  open(): void;
  review(): boolean;
  refreshResult(): void;
}

export function setUpRental(
  root: HTMLElement,
  { events, today, tr, tables, detail = () => 'unlocked' }: RentalDeps,
): RentalCalculator {
  const flow = rentalFlow(tables.norms);
  const LAST_SHEET = lastSheet(flow);
  const RESULT_STEP = resultStep(flow);
  const form = required(root.querySelector<HTMLFormElement>('#rental'), 'the form');
  const result = required(root.querySelector<HTMLElement>('#resultado'), 'the result');
  let shown: RentalResultData | null = null;
  const backButton = required(form.querySelector<HTMLButtonElement>('[data-back]'), 'Back');
  const nextButton = required(form.querySelector<HTMLButtonElement>('[data-next]'), 'Next');
  const nav = createNavigation(
    {
      root,
      form,
      result,
      resultTitle: required(root.querySelector<HTMLElement>('#result-title'), 'the result title'),
      sheets: SHEETS.map((h) =>
        required(form.querySelector<HTMLElement>(`[data-sheet="${h}"]`), h),
      ),
      actions: required(form.querySelector<HTMLElement>('.actions'), 'the actions'),
      backButton,
      nextButton,
      reviewButton: required(form.querySelector<HTMLButtonElement>('[data-submit]'), 'Review'),
    },
    events,
    today,
    flow,
  );
  const conditions = () => applyConditions(form);

  function trackErrors(errors: readonly FieldError[]) {
    for (const { field } of errors) events.fieldRejected(sheetOfField(field), baseField(field));
  }

  function focusError(errors: readonly FieldError[]) {
    const first = errors[0];
    if (!first) return;
    form
      .querySelector<HTMLElement>(`[name="${first.field}"]:not([disabled])`)
      ?.focus({ preventScroll: true });
    // Inside a scrolling list of rows, the slip sits below its control.
    form.querySelector(`[data-error-for="${first.field}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function goToError(errors: readonly FieldError[]): false {
    trackErrors(errors);
    renderErrors(form, errors, tr);
    const first = errors[0];
    if (!first) return false;
    nav.show(SHEETS.indexOf(sheetOfField(first.field)), { history: 'push' });
    focusError(errors);
    return false;
  }

  function showResult() {
    nav.reached = RESULT_STEP;
    nav.show(RESULT_STEP, { history: 'push', focus: true });
  }

  // The gate: a contract outside the review goes from the first sheet to the result, with why.
  function stopAtGate(): boolean {
    const g = gate(form, tables.norms);
    if (g.inScope) return false;
    shown = null;
    renderOutOfScope(result, g.reason, tr);
    events.outOfScope(g.reason);
    showResult();
    return true;
  }

  function advance() {
    const sheet = SHEETS[nav.current];
    if (!sheet) return;
    const errors = sheetErrors(form, sheet, today());
    renderErrors(form, errors, tr);
    if (errors.length > 0) {
      trackErrors(errors);
      focusError(errors);
      return;
    }
    events.stepCompleted(sheet);
    if (stopAtGate()) return;
    const next = stepFrom(flow, form, nav.current, 1);
    nav.reached = Math.max(nav.reached, next);
    nav.show(next, { history: 'push', focus: true });
  }

  function submitReview(): boolean {
    if (stopAtGate()) return true;
    const parsed = readRentalForm(form, today());
    if ('errors' in parsed) return goToError(parsed.errors);
    const r = reviewRental(parsed.input, today(), tables);
    // The form already ran the engine's checks; this only guards against the two drifting apart.
    if (!r.ok) return goToError(r.errors.map(({ field, code }) => ({ field, code })));
    renderErrors(form, [], tr);
    shown = { review: r.review, input: parsed.input };
    const state = detail();
    renderRentalResult(result, shown, state === 'locked', tr);
    events.stepCompleted(stepAt(flow, nav.current));
    events.reviewCompleted({ review: r.review, input: parsed.input, detail: state });
    showResult();
    return true;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (nav.current < LAST_SHEET) advance();
    else void submitReview();
  });
  nextButton.addEventListener('click', advance);
  backButton.addEventListener('click', () =>
    nav.goBack(stepFrom(flow, form, nav.current, -1), { history: 'push', focus: true }),
  );

  form.addEventListener('change', conditions);
  // A changed answer reopens the sheets: the furthest one reachable is the first that still needs
  // an answer, so a stop at the gate never opens the sheets it skipped.
  form.addEventListener('input', () => {
    if (nav.reached === RESULT_STEP) {
      nav.reached = Math.min(LAST_SHEET, firstIncomplete(flow, form, today()));
      nav.renderTabs();
    }
  });

  root.querySelector('.tabs')?.addEventListener('click', (e) => {
    const a = e.target instanceof Element && e.target.closest('a[data-tab]');
    if (!(a instanceof HTMLAnchorElement)) return;
    e.preventDefault();
    nav.goBack(indexOfHash(flow, a.hash), { history: 'push', focus: true });
  });

  window.addEventListener('popstate', () => nav.goBack(indexOfHash(flow, location.hash), {}));

  const rows = setUpRows(form, tr, conditions);

  // Which question or item detail a visitor opens; `toggle` does not bubble, so it is caught on
  // the way down.
  root.addEventListener(
    'toggle',
    (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.open) return;
      if (d.hasAttribute('data-help')) events.helpOpened(d.id);
      const item = d.closest<HTMLElement>('[data-item]')?.dataset['item'];
      if (d.hasAttribute('data-detail') && item) events.detailOpened(item as RentalItemKind);
    },
    true,
  );

  required(result.querySelector('[data-restart]'), 'the restart button').addEventListener(
    'click',
    () => {
      events.startedOver();
      shown = null;
      form.reset();
      for (const list of Object.values(rows)) list.reset();
      renderErrors(form, [], tr);
      conditions();
      nav.reached = 0;
      nav.show(0, { history: 'push', focus: true });
    },
  );

  conditions();
  nav.reached = firstIncomplete(flow, form, today());
  nav.show(Math.min(indexOfHash(flow, location.hash), nav.reached), { history: 'replace' });

  return {
    form,
    fill(entries) {
      const needed = rowsNeeded(entries);
      for (const list of ROW_LISTS) {
        const n = needed[list];
        if (n !== undefined) rows[list].setRows(n);
      }
      const missed = entries.filter(([name, value]) => !setControl(form, name, value));
      conditions();
      return missed.map(([name]) => name);
    },
    entries: () => rentalEntries(form),
    open() {
      nav.reached = 0;
      nav.show(0, { history: 'replace', focus: true });
    },
    review: () => {
      nav.reached = LAST_SHEET;
      return submitReview();
    },
    refreshResult() {
      if (shown) renderRentalResult(result, shown, detail() === 'locked', tr);
    },
  };
}
