import type { Estado, ResultadoPartida } from '../motor/comparar';
import type { Rango } from '../motor/dinero';
import type { Fuente } from '../motor/fuentes';
import { PARO_2026, type DuracionParo, type EstimacionParo, type Hijos } from '../motor/paro';
import type { Revision } from '../motor/revisar';
import type { Causa, Partida, PartidaId } from '../motor/tipos';
import type { ClaveCliente, Traducir } from '../i18n/cliente';
import { estadoParo } from '../medicion/eventos';
import type { ErrorCampo } from './formulario';
import { formatoEntero, formatoEuros, formatoEurosEnteros } from './numero';

export const TONO: Record<PartidaId, string> = {
  salario_pendiente: 'salario',
  vacaciones: 'vacaciones',
  pagas_extra: 'salario',
  indemnizacion: 'causa',
  preaviso_empresa: 'vacaciones',
  descuento_preaviso: 'vacaciones',
};

const NUMERO: Record<string, string> = { causa: '01', salario: '03', vacaciones: '04' };

export type EstadoVisible = Estado | 'sin_indemnizacion';

// A severance the law sets at zero, with no employer figure to compare, is not a finding.
export function estadoVisible(r: ResultadoPartida): EstadoVisible {
  const { partida } = r;
  return partida.id === 'indemnizacion' && partida.rango?.maximo === 0 && r.cifraEmpresa === null
    ? 'sin_indemnizacion'
    : r.estado;
}

// A disciplinary dismissal is zero only if it is upheld, so its line carries the reference figure.
const disciplinarioNeutro = (r: ResultadoPartida, referencia: number | null) =>
  estadoVisible(r) === 'sin_indemnizacion' &&
  r.partida.motivoCero === 'disciplinario' &&
  referencia !== null;

function estadoYCifra(
  r: ResultadoPartida,
  referencia: number | null,
): { clave: ClaveCliente; importe: number } {
  if (disciplinarioNeutro(r, referencia))
    return { clave: 'cli.estado.sin_indemnizacion_disciplinario', importe: referencia ?? 0 };
  if (r.estado === 'no_comprobable' && r.partida.faltaDato === 'dias_disfrutados')
    return { clave: 'cli.estado.no_comprobable_dias', importe: 0 };
  return { clave: `cli.estado.${estadoVisible(r)}`, importe: r.diferencia ?? 0 };
}

export function textoEstado(r: ResultadoPartida, tr: Traducir, referencia: number | null = null) {
  const { clave, importe } = estadoYCifra(r, referencia);
  return tr(clave, { importe: formatoEuros(importe) });
}

// «2015-11-13» → «13-11-2015».
const fechaFuente = (iso: string) => iso.split('-').reverse().join('-');

// An amount keeps its Spanish format and reads left to right, also inside right-to-left text.
function cifra(n: number, formato: (n: number) => string = formatoEuros): HTMLElement {
  const bdi = document.createElement('bdi');
  bdi.dir = 'ltr';
  bdi.textContent = formato(n);
  return bdi;
}

type Pieza = string | Node;

// Fills a translated template, putting each `{variable}` amount in its own isolated element.
// A variable can also be a piece already built, such as «unos 1.225 €».
function piezasConCifras(
  plantilla: string,
  cifras: Record<string, number | Pieza[]>,
  formato?: (n: number) => string,
): Pieza[] {
  return plantilla.split(/\{(\w+)\}/).flatMap((parte, i): Pieza[] => {
    if (i % 2 === 0) return [parte];
    const v = cifras[parte];
    if (v === undefined) return [`{${parte}}`];
    return typeof v === 'number' ? [cifra(v, formato)] : v;
  });
}

function ponerConCifras(
  el: HTMLElement,
  plantilla: string,
  cifras: Record<string, number | Pieza[]>,
  formato?: (n: number) => string,
): void {
  el.replaceChildren(...piezasConCifras(plantilla, cifras, formato));
}

function ponerRango(el: HTMLElement, partida: Partida, tr: Traducir): void {
  const { rango } = partida;
  const descuento = partida.sentido === 'descuento';
  if (rango === null)
    el.textContent = tr(
      partida.faltaDato === 'dias_disfrutados' ? 'cli.rango.dias' : 'cli.rango.convenio',
    );
  else if (descuento) el.replaceChildren(cifra(rango.maximo));
  else if (rango.minimo === rango.maximo) el.replaceChildren(cifra(rango.minimo));
  else ponerConCifras(el, tr('cli.rango.entre'), { minimo: rango.minimo, maximo: rango.maximo });
}

function plantilla(contenedor: HTMLElement, nombre: string): DocumentFragment {
  const t = contenedor.querySelector<HTMLTemplateElement>(`template[data-plantilla="${nombre}"]`);
  if (!t) throw new Error(`Falta la plantilla ${nombre}`);
  return t.content.cloneNode(true) as DocumentFragment;
}

function poner(raiz: ParentNode, selector: string, texto: string): HTMLElement {
  const el = raiz.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Falta ${selector}`);
  el.textContent = texto;
  return el;
}

function pintarPartida(
  contenedor: HTMLElement,
  r: ResultadoPartida,
  referenciaImprocedente: number | null,
  tr: Traducir,
): DocumentFragment {
  const { partida } = r;
  const descuento = partida.sentido === 'descuento';
  const frag = plantilla(contenedor, 'partida');
  const hoja = frag.querySelector<HTMLElement>('[data-partida]');
  if (!hoja) throw new Error('Falta [data-partida]');
  const idTitulo = `partida-${partida.id}`;
  hoja.dataset['partida'] = partida.id;
  hoja.dataset['tono'] = TONO[partida.id];
  const estado = estadoVisible(r);
  const neutro = estado === 'sin_indemnizacion';
  hoja.dataset['estado'] = estado;
  poner(hoja, '[data-pestana-numero]', NUMERO[TONO[partida.id]] ?? '');
  hoja.setAttribute('aria-labelledby', idTitulo);
  poner(hoja, '[data-titulo]', tr(`cli.partida.${partida.id}`)).id = idTitulo;
  const { clave, importe } = estadoYCifra(r, referenciaImprocedente);
  ponerConCifras(poner(hoja, '[data-estado-texto]', ''), tr(clave), { importe });
  hoja
    .querySelector('[data-marca] use')
    ?.setAttributeNS(null, 'href', `#marca-${estado.replace(/_/g, '-')}`);
  poner(
    hoja,
    '[data-rango-etiqueta]',
    tr(descuento ? 'cli.rango.maximo_descuento' : 'cli.rango.minimo'),
  );
  ponerRango(poner(hoja, '[data-rango]', ''), partida, tr);
  const empresa = poner(hoja, '[data-empresa]', tr('cli.sin_cifra'));
  if (r.cifraEmpresa !== null) empresa.replaceChildren(cifra(r.cifraEmpresa));
  const cifras = hoja.querySelector<HTMLElement>('[data-cifras]');
  if (cifras) cifras.hidden = neutro;
  const cita = hoja.querySelector<HTMLElement>('[data-cita]');
  const fuente = partida.fuentes[0];
  if (cita && neutro && fuente) {
    const a = plantilla(contenedor, 'fuente').querySelector('a');
    if (a) {
      a.href = fuente.url;
      a.textContent = fuente.norma;
      cita.replaceChildren(a);
      cita.hidden = false;
    }
  }
  poner(hoja, '[data-calculo]', partida.calculo);
  const segun = hoja.querySelector<HTMLElement>('[data-segun]');
  if (segun) segun.hidden = !partida.segunTuDato;
  const convenio = hoja.querySelector<HTMLElement>('[data-convenio]');
  if (convenio) convenio.hidden = !(partida.dependeDeConvenio && partida.rango !== null);
  const referencia = hoja.querySelector<HTMLElement>('[data-referencia]');
  if (referencia) {
    const aplica =
      partida.id === 'indemnizacion' &&
      referenciaImprocedente !== null &&
      !disciplinarioNeutro(r, referenciaImprocedente);
    referencia.hidden = !aplica;
    if (aplica)
      ponerConCifras(referencia, tr('cli.referencia_improcedente'), {
        importe: referenciaImprocedente,
      });
  }
  const lista = hoja.querySelector<HTMLElement>('[data-fuentes]');
  if (lista) ponerFuentes(contenedor, lista, partida.fuentes, tr);
  return frag;
}

function ponerFuentes(
  contenedor: HTMLElement,
  lista: HTMLElement,
  fuentes: readonly Fuente[],
  tr: Traducir,
): void {
  lista.replaceChildren(
    ...fuentes.map((fuente) => {
      const li = plantilla(contenedor, 'fuente');
      const a = li.querySelector('a');
      if (a) {
        a.href = fuente.url;
        a.textContent = fuente.norma;
      }
      const vigencia = li.querySelector<HTMLElement>('[data-vigencia]');
      if (vigencia) {
        vigencia.textContent = tr('cli.fuente.vigente', {
          fecha: fechaFuente(fuente.vigenteDesde),
        });
        vigencia.hidden = false;
      }
      return li;
    }),
  );
}

// «unos 1.225 €», or «entre 1.225 € y 1.575 €» when the children are unknown.
function aproximado(r: Rango, tr: Traducir): Pieza[] {
  const enteros = { minimo: Math.round(r.minimo), maximo: Math.round(r.maximo) };
  return enteros.minimo === enteros.maximo
    ? piezasConCifras(tr('cli.paro.unos'), { importe: enteros.minimo }, formatoEurosEnteros)
    : piezasConCifras(tr('cli.rango.entre'), enteros, formatoEurosEnteros);
}

const DIAS_MAXIMOS = PARO_2026.escala[0][1];

// The duration sentence. 720 days is the legal ceiling, so it is never «al menos» nor «puede ser
// más»; «hasta» keeps its own caveat; 0 days never reads «hasta 0».
export function claveDuracion(d: DuracionParo): ClaveCliente {
  if (d.dias === 0) return 'cli.paro.duracion.depende';
  if (d.tipo === 'hasta') return 'cli.paro.duracion.hasta';
  if (d.dias >= DIAS_MAXIMOS) return 'cli.paro.duracion.maximo';
  return `cli.paro.duracion.${d.tipo}`;
}

// Unpaid holidays add days, so «puede salir algo más» only fits where more is still possible.
export const conNotaVacaciones = (d: DuracionParo): boolean =>
  d.dias > 0 && d.dias < DIAS_MAXIMOS && d.tipo !== 'hasta';

// The paro sheet: whether the cause gives paro, roughly how much and for how long, in the same
// words for every figure: «unos», «al menos», «hasta», never an exact promise.
export function pintarParo(
  hoja: HTMLElement,
  p: EstimacionParo,
  causa: Causa,
  hijos: Hijos,
  tr: Traducir,
): void {
  const contenedor = hoja.closest<HTMLElement>('[data-revision]') ?? hoja;
  hoja.dataset['estado'] = estadoParo(p);
  const si = p.derecho === 'si';
  poner(hoja, '[data-paro-estado-texto]', tr(si ? 'cli.paro.estado.si' : 'cli.paro.estado.no'));
  hoja
    .querySelector('[data-paro-marca] use')
    ?.setAttributeNS(null, 'href', si ? '#marca-paro-si' : '#marca-sin-indemnizacion');
  for (const el of hoja.querySelectorAll<HTMLElement>('[data-paro-si]')) el.hidden = !si;
  for (const el of hoja.querySelectorAll<HTMLElement>('[data-paro-no]')) el.hidden = si;
  const fuentes = hoja.querySelector<HTMLElement>('[data-paro-fuentes]');
  if (fuentes) ponerFuentes(contenedor, fuentes, p.fuentes, tr);
  poner(hoja, '[data-paro-motivo]', tr(`cli.paro.motivo.${causa}`));
  if (p.derecho === 'no') return;

  const cuantia = poner(hoja, '[data-paro-cuantia]', '');
  const descuento = poner(hoja, '[data-paro-descuento]', '');
  const sinHijos = poner(hoja, '[data-paro-sin-hijos]', tr('cli.paro.cuantia.sin_hijos'));
  descuento.hidden = p.cifras === null;
  const jornada = hoja.querySelector<HTMLElement>('[data-paro-jornada]');
  if (jornada) jornada.hidden = p.cifras === null;
  sinHijos.hidden = true;
  if (p.cifras === null)
    cuantia.textContent = tr(
      p.sinCifras === 'base_bajo_minimo' ? 'cli.paro.sin_cifras_base' : 'cli.paro.sin_cifras',
    );
  else {
    const { tramo1, tramo2, cotizacion } = p.cifras;
    // With no duration known yet, both stretches are shown: it may well pass 180 days.
    const dos = p.tramo2 || p.duracion.dias === 0;
    ponerConCifras(cuantia, tr(dos ? 'cli.paro.cuantia.dos' : 'cli.paro.cuantia.uno'), {
      tramo1: aproximado(tramo1, tr),
      tramo2: aproximado(tramo2, tr),
    });
    ponerConCifras(
      descuento,
      tr('cli.paro.descuento'),
      { ss: Math.round(cotizacion.minimo) },
      formatoEurosEnteros,
    );
    sinHijos.hidden =
      hijos !== null ||
      (Math.round(tramo1.minimo) === Math.round(tramo1.maximo) &&
        (!dos || Math.round(tramo2.minimo) === Math.round(tramo2.maximo)));
  }

  const { duracion } = p;
  const dias = formatoEntero(duracion.dias);
  const meses = formatoEntero(duracion.dias / 30);
  poner(hoja, '[data-paro-duracion]', tr(claveDuracion(duracion), { dias, meses }));
  poner(hoja, '[data-paro-duracion-nota]', tr('cli.paro.duracion.vacaciones')).hidden =
    !conNotaVacaciones(duracion);

  const conOtros = duracion.tipo !== 'al_menos';
  poner(
    hoja,
    '[data-paro-carencia]',
    p.carencia === 'cubierta_por_este_contrato'
      ? tr('cli.paro.carencia.este')
      : p.carencia === 'cubierta_con_otros_contratos'
        ? tr('cli.paro.carencia.otros', { dias: formatoEntero(p.diasCotizados) })
        : conOtros
          ? tr('cli.paro.carencia.depende_otros', { dias: formatoEntero(p.diasCotizados) })
          : tr('cli.paro.carencia.depende', { dias: formatoEntero(p.diasContrato) }),
  );
}

export function pintarRevision(contenedor: HTMLElement, r: Revision, tr: Traducir): void {
  const partidas = contenedor.querySelector('[data-partidas]');
  const noRevisado = contenedor.querySelector('[data-no-revisado]');
  if (!partidas || !noRevisado) throw new Error('Falta el contenedor del resultado');
  partidas.replaceChildren(
    ...r.partidas.map((p) => pintarPartida(contenedor, p, r.referenciaImprocedente, tr)),
  );
  noRevisado.replaceChildren(
    ...r.noRevisadoCodigos.map((codigo) => {
      const li = document.createElement('li');
      li.textContent = tr(`cli.no_revisado.${codigo}`);
      return li;
    }),
  );
}

export function pintarErrores(
  form: HTMLFormElement,
  errores: readonly ErrorCampo[],
  tr: Traducir,
): void {
  for (const p of form.querySelectorAll<HTMLElement>('[data-error-de]')) {
    p.textContent = '';
    p.hidden = true;
  }
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  for (const el of form.querySelectorAll<HTMLElement>('[data-con-error]'))
    delete el.dataset['conError'];

  for (const { campo, codigo } of errores) {
    const p = form.querySelector<HTMLElement>(`[data-error-de="${campo}"]`);
    if (p) {
      p.textContent = tr(`cli.error.${codigo}`);
      p.hidden = false;
      p.closest<HTMLElement>('[data-campo]')?.setAttribute('data-con-error', '');
    }
    for (const el of form.querySelectorAll(`[name="${campo}"]`))
      el.setAttribute('aria-invalid', 'true');
  }
}
