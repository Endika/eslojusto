import { required } from '../calculator/dom';
import type { ClientKey, Translate } from '../i18n/client';

// The lists whose rows the person adds: one guarantee, fee, rise, charge, return or deduction
// per row. A field is named «<list>.<row>.<key>», so its error lands on its own row.
export const ROW_LISTS = [
  'guarantees',
  'fees',
  'updates',
  'charges',
  'returns',
  'deductions',
] as const;
export type RowList = (typeof ROW_LISTS)[number];

export const rowField = (list: RowList, row: number, key: string): string =>
  `${list}.${row}.${key}`;

const ROW_NAME = /^(\w+)\.(\d+)\.(\w+)$/;

// «fees.2.amount» → the list, the row and the key; null for a field outside the lists.
export function parseRowField(
  field: string,
): { readonly list: RowList; readonly row: number; readonly key: string } | null {
  const m = ROW_NAME.exec(field);
  if (!m) return null;
  const [, list = '', row = '0', key = ''] = m;
  return (ROW_LISTS as readonly string[]).includes(list)
    ? { list: list as RowList, row: Number(row), key }
    : null;
}

export interface Rows {
  // Back to the list's first rows, as on arrival.
  reset(): void;
  // Exactly `n` rows (never fewer than the list's minimum), so values can be set by their names.
  setRows(n: number): void;
}

const LEGEND: Record<RowList, ClientKey> = {
  guarantees: 'client.rental.rows.guarantees',
  fees: 'client.rental.rows.fees',
  updates: 'client.rental.rows.updates',
  charges: 'client.rental.rows.charges',
  returns: 'client.rental.rows.returns',
  deductions: 'client.rental.rows.deductions',
};
const REMOVE: Record<RowList, ClientKey> = {
  guarantees: 'client.rental.rows.guarantees_remove',
  fees: 'client.rental.rows.fees_remove',
  updates: 'client.rental.rows.updates_remove',
  charges: 'client.rental.rows.charges_remove',
  returns: 'client.rental.rows.returns_remove',
  deductions: 'client.rental.rows.deductions_remove',
};

function setUpList(box: HTMLElement, list: RowList, tr: Translate, onChange: () => void): Rows {
  const ol = required(box.querySelector<HTMLElement>('[data-rows-list]'), `the rows of ${list}`);
  const template = required(
    box.querySelector<HTMLTemplateElement>('template[data-rows-template]'),
    `the row of ${list}`,
  );
  const addButton = required(
    box.querySelector<HTMLButtonElement>('[data-rows-add]'),
    `the add button of ${list}`,
  );
  const min = Number(box.dataset['min'] ?? '0');
  const max = Number(box.dataset['max'] ?? '10');
  const rows = () => [...ol.querySelectorAll<HTMLElement>(':scope > [data-row]')];

  function renumber() {
    const all = rows();
    all.forEach((row, i) => {
      row.dataset['row'] = String(i);
      const n = String(i + 1);
      const id = (suffix: string) => `${list}-${i}-${suffix}`;
      const legend = row.querySelector('[data-row-legend]');
      if (legend) legend.textContent = tr(LEGEND[list], { n });
      for (const el of row.querySelectorAll<HTMLElement>('[data-row-box]'))
        el.dataset['field'] = rowField(list, i, el.dataset['rowBox'] ?? '');
      for (const el of row.querySelectorAll<HTMLElement>('[data-row-error]')) {
        const key = el.dataset['rowError'] ?? '';
        el.id = `error-${id(key)}`;
        el.dataset['errorFor'] = rowField(list, i, key);
      }
      for (const el of row.querySelectorAll<HTMLElement>('[data-row-hint]'))
        el.id = `hint-${id(el.dataset['rowHint'] ?? '')}`;
      for (const control of row.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        '[data-row-field]',
      )) {
        const key = control.dataset['rowField'] ?? '';
        control.name = rowField(list, i, key);
        control.id =
          control instanceof HTMLInputElement && control.type === 'radio'
            ? id(`${key}-${control.value}`)
            : id(key);
        const hint = row.querySelector(`[data-row-hint="${key}"]`);
        control.setAttribute(
          'aria-describedby',
          [...(hint ? [hint.id] : []), `error-${id(key)}`].join(' '),
        );
      }
      for (const label of row.querySelectorAll<HTMLLabelElement>('label[data-row-label]')) {
        const [key = '', value] = (label.dataset['rowLabel'] ?? '').split(':');
        label.htmlFor = value === undefined ? id(key) : id(`${key}-${value}`);
      }
      const removeButton = row.querySelector<HTMLButtonElement>('[data-row-remove]');
      if (removeButton) {
        removeButton.hidden = all.length <= min;
        removeButton.setAttribute('aria-label', tr(REMOVE[list], { n }));
      }
    });
    addButton.hidden = all.length >= max;
  }

  function addRow(): HTMLElement {
    const frag = template.content.cloneNode(true) as DocumentFragment;
    const row = frag.querySelector<HTMLElement>('[data-row]');
    if (!row) throw new Error(`Missing the row of ${list}`);
    ol.append(row);
    renumber();
    onChange();
    return row;
  }

  addButton.addEventListener('click', () => {
    const row = addRow();
    row.querySelector<HTMLElement>('input, select')?.focus();
    row.scrollIntoView({ block: 'nearest' });
  });

  ol.addEventListener('click', (e) => {
    const removeButton = e.target instanceof Element && e.target.closest('[data-row-remove]');
    const row = removeButton && removeButton.closest<HTMLElement>('[data-row]');
    if (!row) return;
    const i = rows().indexOf(row);
    row.remove();
    renumber();
    onChange();
    const rest = rows();
    (
      rest[Math.min(i, rest.length - 1)]?.querySelector<HTMLElement>('input, select') ?? addButton
    ).focus();
  });

  function setRows(n: number) {
    const wanted = Math.min(max, Math.max(min, n));
    for (const row of rows().slice(wanted)) row.remove();
    while (rows().length < wanted) addRow();
    renumber();
    onChange();
  }

  function reset() {
    for (const row of rows()) row.remove();
    setRows(min);
  }

  reset();
  return { reset, setRows };
}

export function setUpRows(
  form: HTMLFormElement,
  tr: Translate,
  onChange: () => void,
): Readonly<Record<RowList, Rows>> {
  const lists = {} as Record<RowList, Rows>;
  for (const list of ROW_LISTS) {
    const box = form.querySelector<HTMLElement>(`[data-rows="${list}"]`);
    if (!box) throw new Error(`Missing the list ${list}`);
    lists[list] = setUpList(box, list, tr, onChange);
  }
  return lists;
}
