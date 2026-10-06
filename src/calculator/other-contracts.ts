import type { Translate } from '../i18n/client';

// The rows of «Otros trabajos» (other jobs): one per contract, each with its own names and ids so its
// error sits next to it. Rows are renumbered after a removal so the names stay 0, 1, 2…
export function setUpOtherContracts(form: HTMLFormElement, tr: Translate, onChange: () => void) {
  const list = form.querySelector<HTMLElement>('[data-other-list]');
  const template = form.querySelector<HTMLTemplateElement>(
    'template[data-template="other-contract"]',
  );
  const addButton = form.querySelector<HTMLButtonElement>('[data-other-add]');
  if (!list || !template || !addButton) throw new Error('Missing the list of other contracts');

  const rows = () => [...list.querySelectorAll<HTMLElement>('[data-other-contract]')];

  function renumber() {
    const all = rows();
    all.forEach((row, i) => {
      row.dataset['otherContract'] = String(i);
      const n = String(i + 1);
      const legend = row.querySelector('[data-other-legend]');
      if (legend) legend.textContent = tr('client.other_contracts.contract', { n });
      for (const key of ['startDate', 'endDate'] as const) {
        const name = `otherContracts.${i}.${key}`;
        const id = `other-contract-${i}-${key}`;
        const input = row.querySelector<HTMLInputElement>(`[data-row-field="${key}"]`);
        const label = row.querySelector<HTMLLabelElement>(`[data-row-label="${key}"]`);
        const slip = row.querySelector<HTMLElement>(`[data-row-error="${key}"]`);
        if (!input || !label || !slip) continue;
        input.name = name;
        input.id = id;
        label.htmlFor = id;
        slip.id = `error-${id}`;
        slip.dataset['errorFor'] = name;
        input.setAttribute('aria-describedby', slip.id);
        // The visible label says only «Alta» or «Baja» (start or end); the name carries the row number.
        input.setAttribute(
          'aria-label',
          tr(key === 'startDate' ? 'client.other_contracts.start' : 'client.other_contracts.end', {
            n,
          }),
        );
      }
      const removeButton = row.querySelector<HTMLButtonElement>('[data-other-remove]');
      if (removeButton) {
        removeButton.hidden = all.length === 1;
        removeButton.setAttribute('aria-label', tr('client.other_contracts.remove', { n }));
      }
    });
  }

  function addRow(): HTMLElement {
    const frag = template?.content.cloneNode(true) as DocumentFragment;
    const row = frag.querySelector<HTMLElement>('[data-other-contract]');
    if (!row) throw new Error('Missing the other contract row');
    list?.append(row);
    renumber();
    onChange();
    return row;
  }

  addButton.addEventListener('click', () => {
    const row = addRow();
    row.querySelector('input')?.focus();
    row.scrollIntoView({ block: 'nearest' });
  });

  list.addEventListener('click', (e) => {
    const removeButton = e.target instanceof Element && e.target.closest('[data-other-remove]');
    const row = removeButton && removeButton.closest<HTMLElement>('[data-other-contract]');
    if (!row) return;
    const i = rows().indexOf(row);
    row.remove();
    renumber();
    const rest = rows();
    (rest[Math.min(i, rest.length - 1)]?.querySelector('input') ?? addButton).focus();
  });

  // Choosing «Sí» (yes) always shows one row to fill in.
  function reset() {
    for (const row of rows()) row.remove();
    addRow();
  }
  reset();
  return { reset };
}
