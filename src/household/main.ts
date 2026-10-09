import { required } from '../calculator/dom';
import {
  firstIncomplete,
  indexOfHash,
  lastSheet,
  resultStep,
  stepAt,
  stepFrom,
} from '../calculator/flow';
import { createNavigation } from '../calculator/navigation';
import { reviewHousehold } from '../engine/household/review';
import { applyConditions, gate } from './conditions';
import {
  SHEETS,
  endingOf,
  readHouseholdForm,
  sheetErrors,
  sheetOfField,
  type FieldError,
} from './form';
import type { HouseholdItemKind, HouseholdPageDeps } from './ports';
import {
  renderErrors,
  renderHouseholdResult,
  renderOutOfScope,
  type HouseholdResultData,
} from './render';
import { HOUSEHOLD_FLOW } from './steps';

export function setUpHousehold(
  root: HTMLElement,
  { events, today, tr, tables }: HouseholdPageDeps,
): void {
  const flow = HOUSEHOLD_FLOW;
  const LAST_SHEET = lastSheet(flow);
  const RESULT_STEP = resultStep(flow);
  const form = required(root.querySelector<HTMLFormElement>('#household'), 'the form');
  const result = required(root.querySelector<HTMLElement>('#resultado'), 'the result');
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
    for (const { field } of errors) events.fieldRejected(sheetOfField(field), field);
  }

  function focusError(errors: readonly FieldError[]) {
    const first = errors[0];
    if (!first) return;
    form
      .querySelector<HTMLElement>(`[name="${first.field}"]:not([disabled])`)
      ?.focus({ preventScroll: true });
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

  // The gate: a relationship that ended before the reform goes to the result, with why.
  function stopAtGate(): boolean {
    const g = gate(form);
    if (g.inScope) return false;
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
    const parsed = readHouseholdForm(form, today());
    if ('errors' in parsed) return goToError(parsed.errors);
    const r = reviewHousehold(parsed.input, today(), tables);
    // The form already ran the engine's checks; this only guards against the two drifting apart.
    if (!r.ok) return goToError(r.errors.map(({ field, code }) => ({ field, code })));
    renderErrors(form, [], tr);
    const ending = endingOf(form);
    const shown: HouseholdResultData = {
      review: r.review,
      input: parsed.input,
      endingUnknown: ending === 'unknown',
    };
    renderHouseholdResult(result, shown, tr);
    events.stepCompleted(stepAt(flow, nav.current));
    events.reviewCompleted({ review: r.review, input: parsed.input, ending });
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
  // A typed figure can open or close a question too, such as the extra payments and their proration.
  form.addEventListener('input', conditions);
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

  // Which question or point detail a visitor opens; `toggle` does not bubble, so it is caught on
  // the way down.
  root.addEventListener(
    'toggle',
    (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.open) return;
      if (d.hasAttribute('data-help')) events.helpOpened(d.id);
      const kind = d.closest<HTMLElement>('[data-item]')?.dataset['kind'];
      if (d.hasAttribute('data-detail') && kind) events.detailOpened(kind as HouseholdItemKind);
    },
    true,
  );

  required(result.querySelector('[data-restart]'), 'the restart button').addEventListener(
    'click',
    () => {
      events.startedOver();
      form.reset();
      renderErrors(form, [], tr);
      conditions();
      nav.reached = 0;
      nav.show(0, { history: 'push', focus: true });
    },
  );

  conditions();
  nav.reached = firstIncomplete(flow, form, today());
  nav.show(Math.min(indexOfHash(flow, location.hash), nav.reached), { history: 'replace' });
}
