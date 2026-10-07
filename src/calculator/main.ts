import { estimateBenefit } from '../engine/unemployment';
import { reviewFinalPay } from '../engine/review';
import { applyConditions, firstIncomplete, stepFrom } from './conditions';
import { watchDisclosures } from './disclosures';
import { required } from './dom';
import {
  SHEETS,
  baseField,
  sheetErrors,
  sheetOfField,
  readBenefitSheets,
  readForm,
  type FieldError,
} from './form';
import { createNavigation } from './navigation';
import { setUpOtherContracts } from './other-contracts';
import type { CalculatorDeps } from './ports';
import { renderErrors, renderBenefit, renderReview } from './render';
import { LAST_SHEET, RESULT_STEP, indexOfHash, stepAt } from './steps';

export function setUpCalculator(root: HTMLElement, { events, today, tr }: CalculatorDeps): void {
  const form = required(root.querySelector<HTMLFormElement>('#calculator'), 'the form');
  const result = required(root.querySelector<HTMLElement>('#resultado'), 'the result');
  const reviewContainer = required(
    result.querySelector<HTMLElement>('[data-review]'),
    'the review',
  );
  const benefitSheet = required(
    result.querySelector<HTMLElement>('[data-benefit]'),
    'the benefit sheet',
  );
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
  );
  const conditions = () => applyConditions(form);

  function trackErrors(errors: readonly FieldError[]) {
    for (const { field } of errors) events.fieldRejected(sheetOfField(field), baseField(field));
  }

  function focusError(errors: readonly FieldError[]) {
    const first = errors[0];
    if (!first) return;
    form.querySelector<HTMLInputElement>(`[name="${first.field}"]:not([disabled])`)?.focus();
    // Inside the scrolling list of other contracts, the slip sits below its input.
    form.querySelector(`[data-error-for="${first.field}"]`)?.scrollIntoView({ block: 'nearest' });
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
    const next = stepFrom(form, nav.current, 1);
    events.stepCompleted(sheet);
    nav.reached = Math.max(nav.reached, next);
    nav.show(next, { history: 'push', focus: true });
  }

  function goToError(errors: readonly FieldError[]) {
    trackErrors(errors);
    renderErrors(form, errors, tr);
    const first = errors[0];
    if (!first) return;
    nav.show(SHEETS.indexOf(sheetOfField(first.field)), { history: 'push' });
    focusError(errors);
  }

  function submitReview() {
    const parsed = readForm(form);
    if ('errors' in parsed) return goToError(parsed.errors);
    const r = reviewFinalPay(parsed.input, parsed.figures, today());
    if (!r.ok) return goToError(r.errors);
    const benefit = readBenefitSheets(form);
    if ('errors' in benefit) return goToError(benefit.errors);
    const estimate = estimateBenefit(
      parsed.input,
      benefit.data?.children ?? null,
      benefit.data?.others,
    );
    renderErrors(form, [], tr);
    renderReview(reviewContainer, r.review, tr);
    renderBenefit(benefitSheet, estimate, parsed.input.cause, benefit.data?.children ?? null, tr);
    events.stepCompleted(stepAt(nav.current));
    events.reviewCompleted({
      review: r.review,
      input: parsed.input,
      figures: parsed.figures,
      benefit: estimate,
      otherContracts: benefit.data?.others.contracts.length ?? 0,
    });
    nav.reached = RESULT_STEP;
    nav.show(RESULT_STEP, { history: 'push', focus: true });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (nav.current < LAST_SHEET) advance();
    else submitReview();
  });
  nextButton.addEventListener('click', advance);
  backButton.addEventListener('click', () =>
    nav.goBack(stepFrom(form, nav.current, -1), { history: 'push', focus: true }),
  );

  form.addEventListener('change', conditions);
  form.addEventListener('input', () => {
    if (nav.reached === RESULT_STEP) {
      nav.reached = LAST_SHEET;
      nav.renderTabs();
    }
  });

  root.querySelector('.tabs')?.addEventListener('click', (e) => {
    const a = e.target instanceof Element && e.target.closest('a[data-tab]');
    if (!(a instanceof HTMLAnchorElement)) return;
    e.preventDefault();
    nav.goBack(indexOfHash(a.hash), { history: 'push', focus: true });
  });

  window.addEventListener('popstate', () => nav.goBack(indexOfHash(location.hash), {}));

  watchDisclosures(root, events);

  required(result.querySelector('[data-restart]'), 'the restart button').addEventListener(
    'click',
    () => {
      events.startedOver();
      form.reset();
      otherContracts.reset();
      renderErrors(form, [], tr);
      conditions();
      nav.reached = 0;
      nav.show(0, { history: 'push', focus: true });
    },
  );

  const otherContracts = setUpOtherContracts(form, tr, conditions);
  conditions();
  nav.reached = firstIncomplete(form, today());
  nav.show(Math.min(indexOfHash(location.hash), nav.reached), { history: 'replace' });
}
