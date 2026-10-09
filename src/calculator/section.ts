import type { CivilDate } from '../engine/date';
import { required } from './dom';
import { formEntries, setEntry, type FormEntries } from './fill';
import { firstIncomplete, indexOfHash, lastSheet, resultStep, stepFrom, type Flow } from './flow';
import { createNavigation, type NavigationEvents } from './navigation';

// What a review section brings to the shared walk through its sheets: its form, how it checks a
// sheet, how it stops at its gate and how it reviews the answers.
export interface Section<S extends string, Sheet extends S, E extends { readonly field: string }> {
  // The form's id.
  readonly formId: string;
  readonly flow: Flow<S>;
  readonly sheets: readonly Sheet[];
  readonly events: NavigationEvents<S>;
  readonly today: () => CivilDate;
  applyConditions(form: HTMLFormElement): void;
  sheetOfField(field: E['field']): Sheet;
  sheetErrors(form: HTMLFormElement, sheet: Sheet, today: CivilDate): readonly E[];
  renderErrors(form: HTMLFormElement, errors: readonly E[]): void;
  // Renders why the answers so far fall outside the review into the result, if they do.
  stopsAtGate(form: HTMLFormElement, result: HTMLElement): boolean;
  // Reviews the answers into the result, or returns the errors that keep it from doing so.
  review(form: HTMLFormElement, result: HTMLElement, today: CivilDate): readonly E[];
  // Told when the person starts over from the result.
  restarted?(): void;
}

// The section's form as reading documents and the pass drive it. These sections lock nothing in
// their result, so a pass verified or dropped leaves it as it is.
export interface SectionForm {
  readonly form: HTMLFormElement;
  // Sets the answers and returns the names it could not set.
  fill(entries: FormEntries): string[];
  entries(): FormEntries;
  open(): void;
  // Reviews the answers as the «Revisar» button does; false when a sheet still needs an answer.
  review(): boolean;
  refreshResult(): void;
}

// A review's sheets, the gate after the first ones and the result.
export function setUpSection<
  S extends string,
  Sheet extends S,
  E extends { readonly field: string },
>(root: HTMLElement, section: Section<S, Sheet, E>): SectionForm {
  const { flow, sheets, today } = section;
  const LAST_SHEET = lastSheet(flow);
  const RESULT_STEP = resultStep(flow);
  const form = required(root.querySelector<HTMLFormElement>(`#${section.formId}`), 'the form');
  const result = required(root.querySelector<HTMLElement>('#resultado'), 'the result');
  const backButton = required(form.querySelector<HTMLButtonElement>('[data-back]'), 'Back');
  const nextButton = required(form.querySelector<HTMLButtonElement>('[data-next]'), 'Next');
  const nav = createNavigation(
    {
      root,
      form,
      result,
      resultTitle: required(root.querySelector<HTMLElement>('#result-title'), 'the result title'),
      sheets: sheets.map((h) =>
        required(form.querySelector<HTMLElement>(`[data-sheet="${h}"]`), h),
      ),
      actions: required(form.querySelector<HTMLElement>('.actions'), 'the actions'),
      backButton,
      nextButton,
      reviewButton: required(form.querySelector<HTMLButtonElement>('[data-submit]'), 'Review'),
    },
    section.events,
    today,
    flow,
  );
  const conditions = () => section.applyConditions(form);

  function focusError(errors: readonly E[]) {
    const first = errors[0];
    if (!first) return;
    form
      .querySelector<HTMLElement>(`[name="${first.field}"]:not([disabled])`)
      ?.focus({ preventScroll: true });
  }

  function goToError(errors: readonly E[]) {
    section.renderErrors(form, errors);
    const first = errors[0];
    if (!first) return;
    nav.show(sheets.indexOf(section.sheetOfField(first.field)), { history: 'push' });
    focusError(errors);
  }

  function showResult() {
    nav.reached = RESULT_STEP;
    nav.show(RESULT_STEP, { history: 'push', focus: true });
  }

  // The gate: answers outside the review go from their sheet to the result, with why.
  function stopAtGate(): boolean {
    if (!section.stopsAtGate(form, result)) return false;
    showResult();
    return true;
  }

  function advance() {
    const sheet = sheets[nav.current];
    if (!sheet) return;
    const errors = section.sheetErrors(form, sheet, today());
    section.renderErrors(form, errors);
    if (errors.length > 0) {
      focusError(errors);
      return;
    }
    if (stopAtGate()) return;
    const next = stepFrom(flow, form, nav.current, 1);
    // The last sheet that applies closes the walk with the review.
    if (next === RESULT_STEP) {
      submitReview();
      return;
    }
    nav.reached = Math.max(nav.reached, next);
    nav.show(next, { history: 'push', focus: true });
  }

  function submitReview(): boolean {
    if (stopAtGate()) return true;
    const errors = section.review(form, result, today());
    if (errors.length > 0) {
      goToError(errors);
      return false;
    }
    section.renderErrors(form, []);
    showResult();
    return true;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (nav.current < LAST_SHEET) advance();
    else submitReview();
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

  required(result.querySelector('[data-restart]'), 'the restart button').addEventListener(
    'click',
    () => {
      section.restarted?.();
      form.reset();
      section.renderErrors(form, []);
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
      const missed = entries.filter(([name, value]) => !setEntry(form, name, value));
      conditions();
      return missed.map(([name]) => name);
    },
    entries: () => formEntries(form),
    open() {
      nav.reached = 0;
      nav.show(0, { history: 'replace', focus: true });
    },
    review() {
      nav.reached = LAST_SHEET;
      return submitReview();
    },
    refreshResult() {},
  };
}
