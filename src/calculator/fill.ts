// The form's answers as name/value pairs, to set them from outside (a document that was read, or
// a review put back after a payment) and to read them back. Values are the form's own strings.
export type FormEntries = readonly (readonly [string, string])[];

const ROW_FIELD = /^otherContracts\.(\d+)\./;

export function formEntries(form: HTMLFormElement): FormEntries {
  const entries: [string, string][] = [];
  for (const el of form.querySelectorAll<HTMLInputElement>('input[name]')) {
    if (el.type === 'radio' || el.type === 'checkbox') {
      if (el.checked) entries.push([el.name, el.value]);
    } else if (el.value !== '') entries.push([el.name, el.value]);
  }
  return entries;
}

// How many «Otros trabajos» rows the entries need.
export const rowsNeeded = (entries: FormEntries): number =>
  entries.reduce((n, [name]) => {
    const m = ROW_FIELD.exec(name);
    return m ? Math.max(n, Number(m[1]) + 1) : n;
  }, 0);

// Sets one control; returns false when the form has no such control or option.
export function setEntry(form: HTMLFormElement, name: string, value: string): boolean {
  const controls = [...form.querySelectorAll<HTMLInputElement>('input[name]')].filter(
    (el) => el.name === name,
  );
  const first = controls[0];
  if (!first) return false;
  if (first.type === 'radio') {
    const option = controls.find((el) => el.value === value);
    if (!option) return false;
    option.checked = true;
    return true;
  }
  if (first.type === 'checkbox') {
    first.checked = first.value === value;
    return true;
  }
  first.value = value;
  return true;
}
