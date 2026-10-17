import type { CivilDate } from '../engine/date';
import { required } from './dom';
import { formEntries, setEntry, type FormEntries } from './fill';
import {
  firstIncomplete,
  indexOfHash,
  lastSheet,
  resultStep,
  startStep,
  stepAt,
  stepFrom,
  stepOfHash,
  type Flow,
} from './flow';
import { createNavigation, type NavigationEvents } from './navigation';

// What a visit through a section's sheets reports, for whoever listens.
export interface SectionEvents<S extends string> extends NavigationEvents<S> {
  stepCompleted(step: S): void;
  fieldRejected(step: S, field: string): void;
  // A frequently asked question, by the id of its <details>.
  helpOpened(topic: string): void;
  startedOver(): void;
}

// What a review section brings to the shared walk through its sheets: its form, how it checks a
// sheet, how it stops at its gate and how it reviews the answers. The optional parts are for the
// sections whose form does more, such as lists of rows.
interface Section<S extends string, Sheet extends S, E extends { readonly field: string }> {
  // The form's id.
  readonly formId: string;
  readonly flow: Flow<S>;
  readonly sheets: readonly Sheet[];
  readonly events: SectionEvents<S>;
  readonly today: () => CivilDate;
  applyConditions(form: HTMLFormElement): void;
  sheetOfField(field: E['field']): Sheet;
  sheetErrors(form: HTMLFormElement, sheet: Sheet, today: CivilDate): readonly E[];
  renderErrors(form: HTMLFormElement, errors: readonly E[]): void;
  // Renders why the answers so far fall outside the review into the result, if they do.
  stopsAtGate(form: HTMLFormElement, result: HTMLElement): boolean;
  // Reviews the answers into the result, or returns the errors that keep it from doing so.
  review(form: HTMLFormElement, result: HTMLElement, today: CivilDate): readonly E[];
  // Told once a review is on screen and its last sheet completed.
  reviewed?(): void;
  // Told when the person starts over from the result.
  restarted?(): void;
  // The name a rejected field is reported by; the field's own unless told otherwise.
  fieldName?(field: E['field']): string;
  // Told on every change, once the conditions follow it.
  changed?(form: HTMLFormElement): void;
  // Whether a typed answer can open or close a question too, not only a changed one.
  readonly conditionsOnInput?: boolean;
  // Told of every <details> opened, after a help topic is reported.
  opened?(details: HTMLDetailsElement): void;
  // Readies the form for the answers a fill brings, such as the rows they name.
  beforeFill?(entries: FormEntries): void;
  // Sets one answer; `setEntry` unless the form has controls of its own.
  setEntry?(form: HTMLFormElement, name: string, value: string): boolean;
  // Told after a fill, once the conditions follow its answers.
  filled?(form: HTMLFormElement): void;
  entries?(form: HTMLFormElement): FormEntries;
  // Shows the last review again into the result, as its detail now stands.
  refreshResult?(result: HTMLElement): void;
}

// The section's form as reading documents and the pass drive it.
export interface SectionForm {
  readonly form: HTMLFormElement;
  // Sets the answers and returns the names it could not set.
  fill(entries: FormEntries): string[];
  entries(): FormEntries;
  // Shows the sheet a visit opens on, as if it started there.
  open(): void;
  // Reviews the answers as the «Revisar» button does; false when a sheet still needs an answer.
  review(): boolean;
  // Shows the last review again, locked or with its detail as the pass now says; a section that
  // locks nothing leaves its result as it is.
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
  const { events } = section;
  const conditions = () => section.applyConditions(form);

  function trackErrors(errors: readonly E[]) {
    for (const { field } of errors)
      events.fieldRejected(section.sheetOfField(field), section.fieldName?.(field) ?? field);
  }

  function focusError(errors: readonly E[]) {
    const first = errors[0];
    if (!first) return;
    form
      .querySelector<HTMLElement>(`[name="${first.field}"]:not([disabled])`)
      ?.focus({ preventScroll: true });
    // Inside a scrolling list of rows, the slip sits below its control.
    form.querySelector(`[data-error-for="${first.field}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function goToError(errors: readonly E[]) {
    trackErrors(errors);
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
      trackErrors(errors);
      focusError(errors);
      return;
    }
    events.stepCompleted(sheet);
    if (stopAtGate()) return;
    const next = stepFrom(flow, form, nav.current, 1);
    // The last sheet that applies closes the walk with the review.
    if (next === RESULT_STEP) {
      submitReview(false);
      return;
    }
    nav.reached = Math.max(nav.reached, next);
    nav.show(next, { history: 'push', focus: true });
  }

  // `complete` is false when Next has already reported this sheet as completed.
  function submitReview(complete = true): boolean {
    if (stopAtGate()) return true;
    const errors = section.review(form, result, today());
    if (errors.length > 0) {
      goToError(errors);
      return false;
    }
    section.renderErrors(form, []);
    if (complete) events.stepCompleted(stepAt(flow, nav.current));
    section.reviewed?.();
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

  form.addEventListener('change', () => {
    conditions();
    section.changed?.(form);
  });
  if (section.conditionsOnInput) form.addEventListener('input', conditions);
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

  window.addEventListener('popstate', () => nav.followHistory());

  // Which question a visitor opens; `toggle` does not bubble, so it is caught on the way down.
  root.addEventListener(
    'toggle',
    (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.open) return;
      if (d.hasAttribute('data-help')) events.helpOpened(d.id);
      section.opened?.(d);
    },
    true,
  );

  required(result.querySelector('[data-restart]'), 'the restart button').addEventListener(
    'click',
    () => {
      events.startedOver();
      section.restarted?.();
      form.reset();
      section.renderErrors(form, []);
      conditions();
      nav.reached = startStep(flow, form);
      nav.show(nav.reached, { history: 'push', focus: true });
    },
  );

  conditions();
  nav.reached = firstIncomplete(flow, form, today());
  // An address that names no step opens where the flow says a visit starts.
  const arrival = (flow.steps as readonly string[]).includes(stepOfHash(location.hash))
    ? indexOfHash(flow, location.hash)
    : startStep(flow, form);
  nav.show(Math.min(arrival, nav.reached), { history: 'replace' });
  const set = section.setEntry ?? setEntry;
  return {
    form,
    fill(entries) {
      section.beforeFill?.(entries);
      const missed = entries.filter(([name, value]) => !set(form, name, value));
      conditions();
      section.filled?.(form);
      return missed.map(([name]) => name);
    },
    entries: () => (section.entries ?? formEntries)(form),
    open() {
      nav.reached = startStep(flow, form);
      nav.show(nav.reached, { history: 'replace', focus: true });
    },
    review() {
      nav.reached = LAST_SHEET;
      return submitReview();
    },
    refreshResult: () => section.refreshResult?.(result),
  };
}
