import type { FormEntries } from '../calculator/fill';
import { parseRowField, type RowList } from './rows';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const CONTROLS = 'input[name], select[name], textarea[name]';

const controlsNamed = (form: HTMLFormElement, name: string): Control[] =>
  [...form.querySelectorAll<Control>(CONTROLS)].filter((el) => el.name === name);

const isChoice = (el: Control): el is HTMLInputElement =>
  el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox');

// The review's answers as name/value pairs: every chosen radio or ticked box, every typed field
// and every chosen option, so a review can be put back as it was.
export function employmentEntries(form: HTMLFormElement): FormEntries {
  const entries: [string, string][] = [];
  for (const el of form.querySelectorAll<Control>(CONTROLS)) {
    if (isChoice(el)) {
      if (el.checked) entries.push([el.name, el.value]);
    } else if (el.value !== '') entries.push([el.name, el.value]);
  }
  return entries;
}

// How many rows each list needs for the entries: one past the highest row they name.
export function rowsNeeded(entries: FormEntries): Partial<Record<RowList, number>> {
  const needed: Partial<Record<RowList, number>> = {};
  for (const [name] of entries) {
    const field = parseRowField(name);
    if (field) needed[field.list] = Math.max(needed[field.list] ?? 0, field.row + 1);
  }
  return needed;
}

// Sets one answer; false when the form has no such control, or no such option.
export function setControl(form: HTMLFormElement, name: string, value: string): boolean {
  const controls = controlsNamed(form, name);
  const first = controls[0];
  if (!first) return false;
  if (first instanceof HTMLSelectElement) {
    if (![...first.options].some((o) => o.value === value)) return false;
    first.value = value;
    return true;
  }
  if (isChoice(first)) {
    const option = controls.find((el) => el.value === value);
    if (!(option instanceof HTMLInputElement)) return false;
    option.checked = true;
    return true;
  }
  first.value = value;
  return true;
}
