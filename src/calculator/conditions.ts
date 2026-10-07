import type { CivilDate } from '../engine/date';
import { reviewFinalPay } from '../engine/review';
import { required } from './dom';
import {
  ITEM_IDS,
  SHEETS,
  asksAboutBenefit,
  figureField,
  provisionalInput,
  sheetErrors,
} from './form';
import { LAST_SHEET, RESULT_STEP, STEPS } from './steps';

// Conditional sheets: the fixed-term type only for a fixed-term contract, extra pay only when
// it is not already spread over the monthly payslip, and the benefit questions only when the
// cause can give a right to the benefit.
export function applies(form: HTMLFormElement, i: number): boolean {
  const data = new FormData(form);
  if (STEPS[i] === 'temporal') return data.get('cause') === 'fixed_term_end';
  if (STEPS[i] === 'pagas') return data.get('extraPayProrated') === 'no';
  if (STEPS[i] === 'hijos' || STEPS[i] === 'otros')
    return asksAboutBenefit(data.get('cause') as string | null);
  return true;
}

export function stepFrom(form: HTMLFormElement, from: number, direction: 1 | -1): number {
  let i = from + direction;
  while (i > 0 && i < RESULT_STEP && !applies(form, i)) i += direction;
  return i;
}

// The furthest sheet a visitor may open: every sheet before it answers cleanly.
export function firstIncomplete(form: HTMLFormElement, today: CivilDate): number {
  const i = SHEETS.findIndex((h, j) => applies(form, j) && sheetErrors(form, h, today).length > 0);
  return i < 0 ? LAST_SHEET : i;
}

function setActive(container: HTMLElement, active: boolean) {
  container.hidden = !active;
  for (const control of container.querySelectorAll<HTMLInputElement>('input'))
    control.disabled = !active;
}

export function applyConditions(form: HTMLFormElement) {
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
export function prepareFigures(form: HTMLFormElement, today: CivilDate) {
  const r = reviewFinalPay(provisionalInput(form), {}, today);
  const ids = new Set(r.ok ? r.review.items.map((p) => p.item.id) : []);
  for (const id of ITEM_IDS) {
    const box = required(form.querySelector<HTMLElement>(`[data-figure="${id}"]`), id);
    const input = required(form.querySelector<HTMLInputElement>(`[name="${figureField(id)}"]`), id);
    box.hidden = !ids.has(id);
    input.disabled = !ids.has(id);
  }
}
