import { required } from '../calculator/dom';
import { firstIncomplete, indexOfHash, lastSheet, resultStep, stepFrom } from '../calculator/flow';
import { createNavigation } from '../calculator/navigation';
import { reviewInsurance } from '../engine/insurance/review';
import { applyConditions, gate } from './conditions';
import {
  SHEETS,
  onQuestions,
  readInsuranceForm,
  sheetErrors,
  sheetOfField,
  type FieldError,
} from './form';
import type { InsuranceSetup } from './ports';
import { renderErrors, renderInsuranceResult, renderOutOfScope } from './render';
import { INSURANCE_FLOW as flow } from './steps';

// The review of a policy's dates: its sheets, the gate after the first one and the result.
export function setUpInsurance(
  root: HTMLElement,
  { events, today, tr, tables }: InsuranceSetup,
): HTMLFormElement {
  const LAST_SHEET = lastSheet(flow);
  const RESULT_STEP = resultStep(flow);
  const form = required(root.querySelector<HTMLFormElement>('#insurance'), 'the form');
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

  function focusError(errors: readonly FieldError[]) {
    const first = errors[0];
    if (!first) return;
    form
      .querySelector<HTMLElement>(`[name="${first.field}"]:not([disabled])`)
      ?.focus({ preventScroll: true });
  }

  function goToError(errors: readonly FieldError[]) {
    renderErrors(form, errors, tr);
    const first = errors[0];
    if (!first) return;
    nav.show(SHEETS.indexOf(sheetOfField(first.field)), { history: 'push' });
    focusError(errors);
  }

  function showResult() {
    nav.reached = RESULT_STEP;
    nav.show(RESULT_STEP, { history: 'push', focus: true });
  }

  // The gate: a policy outside the review goes from the first sheet to the result, with why.
  function stopAtGate(): boolean {
    const g = gate(form);
    if (g.inScope) return false;
    renderOutOfScope(result, g.reason, tr);
    showResult();
    return true;
  }

  function advance() {
    const sheet = SHEETS[nav.current];
    if (!sheet) return;
    const errors = sheetErrors(form, sheet, today());
    renderErrors(form, errors, tr);
    if (errors.length > 0) {
      focusError(errors);
      return;
    }
    if (stopAtGate()) return;
    const next = stepFrom(flow, form, nav.current, 1);
    // The notice's sheets close the walk only when there is a notice; without one, the review.
    if (next === RESULT_STEP) {
      submitReview();
      return;
    }
    nav.reached = Math.max(nav.reached, next);
    nav.show(next, { history: 'push', focus: true });
  }

  function submitReview() {
    if (stopAtGate()) return;
    const parsed = readInsuranceForm(form, today());
    if ('errors' in parsed) {
      goToError(parsed.errors);
      return;
    }
    const r = reviewInsurance(parsed.input, today(), tables);
    // The form already ran the engine's checks; this only guards against the two drifting apart.
    if (!r.ok) {
      goToError(onQuestions(r.errors));
      return;
    }
    renderErrors(form, [], tr);
    if (r.review.scope.inScope) renderInsuranceResult(result, r.review, tr);
    else renderOutOfScope(result, r.review.scope.reason, tr);
    showResult();
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
  return form;
}
