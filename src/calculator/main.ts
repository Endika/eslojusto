import { pageTranslator } from '../i18n/client';
import {
  changedFields,
  sectionSecondsBucket,
  snapshot,
  reviewProps,
  type TrackableField,
  type Snapshot,
  type Props,
  type Section,
} from '../analytics/events';
import { track } from '../analytics/posthog';
import { estimateBenefit } from '../engine/unemployment';
import { reviewFinalPay } from '../engine/review';
import type { ItemId } from '../engine/types';
import { localToday } from '../scripts/clock';
import {
  SHEETS,
  ITEM_IDS,
  baseField,
  figureField,
  provisionalInput,
  sheetErrors,
  sheetOfField,
  readBenefitSheets,
  readForm,
  asksAboutBenefit,
  type FieldError,
} from './form';
import { setUpOtherContracts } from './other-contracts';
import { renderErrors, renderBenefit, renderReview } from './render';

// A step is one sheet; a section (one tab, one ground colour) can own more than one step.
// Step ids are also the URL fragments, so they keep their Spanish names.
const STEPS = [...SHEETS, 'resultado'] as const;
type Step = (typeof STEPS)[number];
const SECTION_OF_STEP: Record<Step, string> = {
  causa: 'cause',
  temporal: 'cause',
  fechas: 'dates',
  prorrateo: 'salary',
  salario: 'salary',
  pagas: 'salary',
  vacaciones: 'holidays',
  hijos: 'holidays',
  otros: 'holidays',
  finiquito: 'settlement',
  resultado: 'result',
};
const LAST_SHEET = SHEETS.length - 1;
const RESULT_STEP = STEPS.length - 1;

function required<T extends Element>(el: T | null, what: string): T {
  if (!el) throw new Error(`Missing ${what}`);
  return el;
}

const form = required(document.querySelector<HTMLFormElement>('#calculator'), 'the form');
const result = required(document.querySelector<HTMLElement>('#resultado'), 'the result');
const reviewContainer = required(result.querySelector<HTMLElement>('[data-review]'), 'the review');
const benefitSheet = required(
  result.querySelector<HTMLElement>('[data-benefit]'),
  'the benefit sheet',
);
const resultTitle = required(
  document.querySelector<HTMLElement>('#result-title'),
  'the result title',
);
const backButton = required(form.querySelector<HTMLButtonElement>('[data-back]'), 'Back');
const nextButton = required(form.querySelector<HTMLButtonElement>('[data-next]'), 'Next');
const reviewButton = required(form.querySelector<HTMLButtonElement>('[data-submit]'), 'Review');
const actions = required(form.querySelector<HTMLElement>('.actions'), 'the actions');
const sheets = SHEETS.map((h) =>
  required(form.querySelector<HTMLElement>(`[data-sheet="${h}"]`), h),
);
// A tab is a link once its section is reached and plain text before; it swaps element on change.
const tabs = [...document.querySelectorAll<HTMLElement>('[data-tab]')];
const tr = pageTranslator();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let current = 0;
let reached = 0;

// Analytics state for this page view. The catalogue's «section» is the sheet: when each
// sheet and the whole run started, how many reviews were made, and the previous answers,
// kept here only to name what changed.
let viewedSection: Section | null = null;
let sectionEnteredAt = 0;
let start: number | null = null;
let attempts = 0;
let previous: Snapshot | null = null;
const secondsSince = (t: number) => (performance.now() - t) / 1000;
const stepAt = (i: number): Section => STEPS[i] ?? 'causa';

function trackErrors(errors: readonly FieldError[]) {
  for (const { field } of errors)
    track('validation_error', {
      section: sheetOfField(field),
      field: baseField(field) as TrackableField,
    });
}

function trackCompleted(section: Section) {
  track('section_completed', {
    section,
    seconds: sectionSecondsBucket(secondsSince(sectionEnteredAt)),
  });
}

const indexOfHash = (hash: string): number => {
  const i = STEPS.indexOf(hash.replace(/^#/, '') as Step);
  return i < 0 ? 0 : i;
};

// Conditional sheets: the fixed-term type only for a fixed-term contract, extra pay only when
// it is not already spread over the monthly payslip, and the benefit questions only when the
// cause can give a right to the benefit.
function applies(i: number): boolean {
  const data = new FormData(form);
  if (STEPS[i] === 'temporal') return data.get('cause') === 'fixed_term_end';
  if (STEPS[i] === 'pagas') return data.get('extraPayProrated') === 'no';
  if (STEPS[i] === 'hijos' || STEPS[i] === 'otros')
    return asksAboutBenefit(data.get('cause') as string | null);
  return true;
}

function stepFrom(from: number, direction: 1 | -1): number {
  let i = from + direction;
  while (i > 0 && i < RESULT_STEP && !applies(i)) i += direction;
  return i;
}

function setActive(container: HTMLElement, active: boolean) {
  container.hidden = !active;
  for (const control of container.querySelectorAll<HTMLInputElement>('input'))
    control.disabled = !active;
}

function applyConditions() {
  const data = new FormData(form);
  const cause = String(data.get('cause') ?? '');
  for (const el of form.querySelectorAll<HTMLElement>('[data-if-cause]'))
    setActive(el, (el.dataset['ifCause'] ?? '').split(' ').includes(cause));
  const otherContractsChoice = String(data.get('otherContracts') ?? '');
  for (const el of form.querySelectorAll<HTMLElement>('[data-if-other-contracts]'))
    setActive(el, el.dataset['ifOtherContracts'] === otherContractsChoice);
  const prorating = String(data.get('extraPayProrated') ?? '');
  for (const el of form.querySelectorAll<HTMLElement>('[data-if-prorated]'))
    setActive(el, el.dataset['ifProrated'] === prorating);
  // The salary hint depends on the prorating answer, which the sheet before it asks.
  for (const el of form.querySelectorAll<HTMLElement>('[data-hint-yes]')) {
    const hint = el.querySelector('.hint');
    const text = el.dataset[prorating === 'yes' ? 'hintYes' : 'hintNo'];
    if (hint && text) hint.textContent = text;
  }
  for (const checkbox of form.querySelectorAll<HTMLInputElement>('[data-unknown-for]')) {
    const input = form.querySelector<HTMLInputElement>(
      `[name="${checkbox.dataset['unknownFor']}"]`,
    );
    if (input) {
      input.disabled = checkbox.checked;
      if (checkbox.checked) input.value = '';
    }
  }
}

// Asks for the employer's figure only for the items this case produces.
function prepareFigures() {
  const r = reviewFinalPay(provisionalInput(form), {}, localToday());
  const ids = new Set(r.ok ? r.review.items.map((p) => p.item.id) : []);
  for (const id of ITEM_IDS) {
    const box = required(form.querySelector<HTMLElement>(`[data-figure="${id}"]`), id);
    const input = required(form.querySelector<HTMLInputElement>(`[name="${figureField(id)}"]`), id);
    box.hidden = !ids.has(id);
    input.disabled = !ids.has(id);
  }
}

function asTab(el: HTMLElement, link: boolean): HTMLElement {
  if (el instanceof HTMLAnchorElement === link) return el;
  const other = document.createElement(link ? 'a' : 'span');
  for (const { name, value } of el.attributes) other.setAttribute(name, value);
  other.append(...el.childNodes);
  el.replaceWith(other);
  return other;
}

function renderTabs() {
  const currentSection = SECTION_OF_STEP[STEPS[current] ?? 'causa'];
  tabs.forEach((el, i) => {
    const id = el.dataset['tab'] ?? 'cause';
    const first = STEPS.findIndex((p) => SECTION_OF_STEP[p] === id);
    const available = first <= reached;
    const isCurrent = id === currentSection;
    const p = asTab(el, available);
    tabs[i] = p;
    if (available) {
      p.setAttribute('href', `#${STEPS[first]}`);
      p.removeAttribute('aria-disabled');
    } else {
      p.removeAttribute('href');
      p.setAttribute('aria-disabled', 'true');
    }
    p.dataset['state'] = isCurrent ? 'current' : available ? 'done' : 'pending';
    if (isCurrent) p.setAttribute('aria-current', 'step');
    else p.removeAttribute('aria-current');
  });
}

function show(i: number, options: { history?: 'push' | 'replace'; focus?: boolean } = {}) {
  let target = Math.max(0, Math.min(i, reached));
  if (!applies(target)) target = stepFrom(target, -1);
  const firstTime = current < 0;
  const changes = target !== current;
  current = target;
  const id = STEPS[current] ?? 'causa';

  sheets.forEach((h, j) => (h.hidden = j !== current));
  result.hidden = current !== RESULT_STEP;
  actions.hidden = current === RESULT_STEP;
  backButton.hidden = current === 0;
  nextButton.hidden = current >= LAST_SHEET;
  reviewButton.hidden = current !== LAST_SHEET;
  document.body.dataset['section'] = SECTION_OF_STEP[id];
  if (id !== viewedSection) {
    viewedSection = id;
    sectionEnteredAt = performance.now();
    start ??= sectionEnteredAt;
    track('section_viewed', { section: viewedSection });
  }
  if (current === LAST_SHEET) prepareFigures();
  renderTabs();

  if (options.history === 'push') history.pushState(null, '', `#${id}`);
  else if (options.history === 'replace') history.replaceState(null, '', `#${id}`);

  const visible = current === RESULT_STEP ? result : sheets[current];
  if (changes && !firstTime && visible && !reducedMotion.matches) {
    visible.classList.remove('turning');
    void visible.offsetWidth;
    visible.classList.add('turning');
  }
  if (changes && !firstTime) window.scrollTo({ top: 0 });
  if (options.focus) {
    const title = current === RESULT_STEP ? resultTitle : visible?.querySelector('h2');
    title?.focus({ preventScroll: true });
  }
}

function focusError(errors: readonly FieldError[]) {
  const first = errors[0];
  if (!first) return;
  form.querySelector<HTMLInputElement>(`[name="${first.field}"]:not([disabled])`)?.focus();
  // Inside the scrolling list of other contracts, the slip sits below its input.
  form.querySelector(`[data-error-for="${first.field}"]`)?.scrollIntoView({ block: 'nearest' });
}

function advance() {
  const sheet = SHEETS[current];
  if (!sheet) return;
  const errors = sheetErrors(form, sheet, localToday());
  renderErrors(form, errors, tr);
  if (errors.length > 0) {
    trackErrors(errors);
    focusError(errors);
    return;
  }
  const next = stepFrom(current, 1);
  trackCompleted(sheet);
  reached = Math.max(reached, next);
  show(next, { history: 'push', focus: true });
}

function goToError(errors: readonly FieldError[]) {
  trackErrors(errors);
  renderErrors(form, errors, tr);
  const first = errors[0];
  if (!first) return;
  show(SHEETS.indexOf(sheetOfField(first.field)), { history: 'push' });
  focusError(errors);
}

function submitReview() {
  const parsed = readForm(form);
  if ('errors' in parsed) return goToError(parsed.errors);
  const r = reviewFinalPay(parsed.input, parsed.figures, localToday());
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
  trackCompleted(stepAt(current));
  attempts += 1;
  const answers = snapshot(parsed.input, parsed.figures);
  track(
    'review_completed',
    reviewProps({
      review: r.review,
      input: parsed.input,
      attempt: attempts,
      changedFields: changedFields(previous, answers),
      seconds: secondsSince(start ?? sectionEnteredAt),
      benefit: estimate,
      otherContracts: benefit.data?.others.contracts.length ?? 0,
    }),
  );
  previous = answers;
  reached = RESULT_STEP;
  show(RESULT_STEP, { history: 'push', focus: true });
}

// Any move to an earlier step: the Back button, a tab or the browser's back.
function goBack(i: number, options: Parameters<typeof show>[1]) {
  const before = current;
  show(i, options);
  if (current < before) track('went_back', { from: stepAt(before), to: stepAt(current) });
}

// The furthest sheet a visitor may open: every sheet before it answers cleanly.
function firstIncomplete(): number {
  const i = SHEETS.findIndex((h, j) => applies(j) && sheetErrors(form, h, localToday()).length > 0);
  return i < 0 ? LAST_SHEET : i;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (current < LAST_SHEET) advance();
  else submitReview();
});
nextButton.addEventListener('click', advance);
backButton.addEventListener('click', () =>
  goBack(stepFrom(current, -1), { history: 'push', focus: true }),
);

form.addEventListener('change', applyConditions);
form.addEventListener('input', () => {
  if (reached === RESULT_STEP) {
    reached = LAST_SHEET;
    renderTabs();
  }
});

document.querySelector('.tabs')?.addEventListener('click', (e) => {
  const a = e.target instanceof Element && e.target.closest('a[data-tab]');
  if (!(a instanceof HTMLAnchorElement)) return;
  e.preventDefault();
  goBack(indexOfHash(a.hash), { history: 'push', focus: true });
});

window.addEventListener('popstate', () => goBack(indexOfHash(location.hash), {}));

// `toggle` does not bubble, so it is caught on the way down.
document.addEventListener(
  'toggle',
  (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.open) return;
    if (d.hasAttribute('data-help'))
      track('help_opened', { topic: d.id as Props<'help_opened'>['topic'] });
    const item = d.closest<HTMLElement>('[data-item]')?.dataset['item'];
    if (d.hasAttribute('data-detail') && item) track('detail_opened', { item: item as ItemId });
  },
  true,
);

required(result.querySelector('[data-restart]'), 'the restart button').addEventListener(
  'click',
  () => {
    track('started_over', {});
    form.reset();
    otherContracts.reset();
    renderErrors(form, [], tr);
    applyConditions();
    reached = 0;
    show(0, { history: 'push', focus: true });
  },
);

const otherContracts = setUpOtherContracts(form, tr, applyConditions);
applyConditions();
reached = firstIncomplete();
current = -1;
show(Math.min(indexOfHash(location.hash), reached), { history: 'replace' });
