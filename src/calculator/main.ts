import { estimateBenefit } from '../engine/unemployment';
import { reviewFinalPay } from '../engine/review';
import { applyConditions, firstIncomplete, followHolidayUnit, stepFrom } from './conditions';
import { watchDisclosures } from './disclosures';
import { required } from './dom';
import { formEntries, rowsNeeded, setEntry, type FormEntries } from './fill';
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
import { renderErrors, renderResult, type ResultData } from './render';
import { LAST_SHEET, RESULT_STEP, indexOfHash, stepAt } from './steps';

// What the page's other parts can do with the calculator: set or read its answers, and open it.
export interface Calculator {
  readonly form: HTMLFormElement;
  // Sets the answers and returns the names it could not set.
  fill(entries: FormEntries): string[];
  entries(): FormEntries;
  // Shows the first sheet, as if the visit started there.
  open(): void;
  // Reviews the answers as the «Revisar» button does; false when a sheet still needs an answer.
  review(): boolean;
  // Shows the last review again, locked or with its detail as `detail` now says.
  refreshResult(): void;
}

export function setUpCalculator(
  root: HTMLElement,
  { events, today, tr, detail = () => 'unlocked' }: CalculatorDeps,
): Calculator {
  const form = required(root.querySelector<HTMLFormElement>('#calculator'), 'the form');
  const result = required(root.querySelector<HTMLElement>('#resultado'), 'the result');
  // The last review shown, to show it again when its detail is unlocked or locked.
  let shown: ResultData | null = null;
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

  function goToError(errors: readonly FieldError[]): false {
    trackErrors(errors);
    renderErrors(form, errors, tr);
    const first = errors[0];
    if (!first) return false;
    nav.show(SHEETS.indexOf(sheetOfField(first.field)), { history: 'push' });
    focusError(errors);
    return false;
  }

  function submitReview(): boolean {
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
    shown = {
      review: r.review,
      benefit: estimate,
      cause: parsed.input.cause,
      children: benefit.data?.children ?? null,
    };
    const state = detail();
    renderResult(result, shown, state === 'locked', tr);
    events.stepCompleted(stepAt(nav.current));
    events.reviewCompleted({
      review: r.review,
      input: parsed.input,
      figures: parsed.figures,
      benefit: estimate,
      otherContracts: benefit.data?.others.contracts.length ?? 0,
      detail: state,
    });
    nav.reached = RESULT_STEP;
    nav.show(RESULT_STEP, { history: 'push', focus: true });
    return true;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (nav.current < LAST_SHEET) advance();
    else void submitReview();
  });
  nextButton.addEventListener('click', advance);
  backButton.addEventListener('click', () =>
    nav.goBack(stepFrom(form, nav.current, -1), { history: 'push', focus: true }),
  );

  form.addEventListener('change', (e) => {
    followHolidayUnit(form, e.target);
    conditions();
  });
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
      shown = null;
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

  return {
    form,
    fill(entries) {
      const rows = rowsNeeded(entries);
      if (rows > 0) otherContracts.setRows(rows);
      // A sheet's conditions decide which controls are enabled, so they follow every answer.
      const missed = entries.filter(([name, value]) => !setEntry(form, name, value));
      conditions();
      renderErrors(form, [], tr);
      return missed.map(([name]) => name);
    },
    entries: () => formEntries(form),
    open() {
      nav.reached = 0;
      nav.show(0, { history: 'replace', focus: true });
    },
    review: () => {
      nav.reached = LAST_SHEET;
      return submitReview();
    },
    refreshResult() {
      if (shown) renderResult(result, shown, detail() === 'locked', tr);
    },
  };
}
