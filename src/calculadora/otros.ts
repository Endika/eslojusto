import type { Traducir } from '../i18n/cliente';

// The rows of «Otros trabajos»: one per contract, each with its own names and ids so its
// error sits next to it. Rows are renumbered after a removal so the names stay 0, 1, 2…
export function prepararOtros(form: HTMLFormElement, tr: Traducir, alCambiar: () => void) {
  const lista = form.querySelector<HTMLElement>('[data-otros-lista]');
  const plantilla = form.querySelector<HTMLTemplateElement>('template[data-plantilla="otro"]');
  const anadir = form.querySelector<HTMLButtonElement>('[data-otro-anadir]');
  if (!lista || !plantilla || !anadir) throw new Error('Falta la lista de otros contratos');

  const filas = () => [...lista.querySelectorAll<HTMLElement>('[data-otro]')];

  function numerar() {
    const todas = filas();
    todas.forEach((fila, i) => {
      fila.dataset['otro'] = String(i);
      const n = String(i + 1);
      const leyenda = fila.querySelector('[data-otro-leyenda]');
      if (leyenda) leyenda.textContent = tr('cli.otros.contrato', { n });
      for (const dato of ['fechaAlta', 'fechaBaja'] as const) {
        const nombre = `otrosContratos.${i}.${dato}`;
        const id = `otro-${i}-${dato}`;
        const entrada = fila.querySelector<HTMLInputElement>(`[data-dato="${dato}"]`);
        const etiqueta = fila.querySelector<HTMLLabelElement>(`[data-etiqueta="${dato}"]`);
        const errata = fila.querySelector<HTMLElement>(`[data-errata="${dato}"]`);
        if (!entrada || !etiqueta || !errata) continue;
        entrada.name = nombre;
        entrada.id = id;
        etiqueta.htmlFor = id;
        errata.id = `error-${id}`;
        errata.dataset['errorDe'] = nombre;
        entrada.setAttribute('aria-describedby', errata.id);
        // The visible label says only «Alta» or «Baja»; the name carries the row number.
        entrada.setAttribute(
          'aria-label',
          tr(dato === 'fechaAlta' ? 'cli.otros.alta' : 'cli.otros.baja', { n }),
        );
      }
      const quitar = fila.querySelector<HTMLButtonElement>('[data-otro-quitar]');
      if (quitar) {
        quitar.hidden = todas.length === 1;
        quitar.setAttribute('aria-label', tr('cli.otros.quitar', { n }));
      }
    });
  }

  function nueva(): HTMLElement {
    const frag = plantilla?.content.cloneNode(true) as DocumentFragment;
    const fila = frag.querySelector<HTMLElement>('[data-otro]');
    if (!fila) throw new Error('Falta la fila de otro contrato');
    lista?.append(fila);
    numerar();
    alCambiar();
    return fila;
  }

  anadir.addEventListener('click', () => {
    const fila = nueva();
    fila.querySelector('input')?.focus();
    fila.scrollIntoView({ block: 'nearest' });
  });

  lista.addEventListener('click', (e) => {
    const quitar = e.target instanceof Element && e.target.closest('[data-otro-quitar]');
    const fila = quitar && quitar.closest<HTMLElement>('[data-otro]');
    if (!fila) return;
    const i = filas().indexOf(fila);
    fila.remove();
    numerar();
    const resto = filas();
    (resto[Math.min(i, resto.length - 1)]?.querySelector('input') ?? anadir).focus();
  });

  // Choosing «Sí» always shows one row to fill in.
  function vaciar() {
    for (const fila of filas()) fila.remove();
    nueva();
  }
  vaciar();
  return { vaciar };
}
