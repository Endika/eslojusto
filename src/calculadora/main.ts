import { traductorDeLaPagina } from '../i18n/cliente';
import {
  camposCambiados,
  cuboSegundosSeccion,
  instantanea,
  propsRevision,
  type CampoMedible,
  type Instantanea,
  type Props,
  type Seccion,
} from '../medicion/eventos';
import { medir } from '../medicion/posthog';
import { calcularParo } from '../motor/paro';
import { revisarFiniquito } from '../motor/revisar';
import type { PartidaId } from '../motor/tipos';
import {
  HOJAS,
  PARTIDAS,
  campoBase,
  campoCifra,
  entradaProvisional,
  erroresDeHoja,
  hojaDeCampo,
  leerDatosParo,
  leerFormulario,
  preguntaParo,
  type ErrorCampo,
} from './formulario';
import { prepararOtros } from './otros';
import { pintarErrores, pintarParo, pintarRevision } from './render';

// A step is one sheet; a section (one tab, one ground colour) can own more than one step.
const PASOS = [...HOJAS, 'resultado'] as const;
type Paso = (typeof PASOS)[number];
const SECCION: Record<Paso, string> = {
  causa: 'causa',
  temporal: 'causa',
  fechas: 'fechas',
  prorrateo: 'salario',
  salario: 'salario',
  pagas: 'salario',
  vacaciones: 'vacaciones',
  hijos: 'vacaciones',
  otros: 'vacaciones',
  finiquito: 'finiquito',
  resultado: 'resultado',
};
const ULTIMA_HOJA = HOJAS.length - 1;
const RESULTADO = PASOS.length - 1;

function exigir<T extends Element>(el: T | null, que: string): T {
  if (!el) throw new Error(`Falta ${que}`);
  return el;
}

const form = exigir(document.querySelector<HTMLFormElement>('#calculadora'), 'el formulario');
const resultado = exigir(document.querySelector<HTMLElement>('#resultado'), 'el resultado');
const revision = exigir(resultado.querySelector<HTMLElement>('[data-revision]'), 'la revisión');
const hojaParo = exigir(resultado.querySelector<HTMLElement>('[data-paro]'), 'la hoja del paro');
const tituloResultado = exigir(
  document.querySelector<HTMLElement>('#resultado-titulo'),
  'el título del resultado',
);
const botonAtras = exigir(form.querySelector<HTMLButtonElement>('[data-atras]'), 'Atrás');
const botonSiguiente = exigir(
  form.querySelector<HTMLButtonElement>('[data-siguiente]'),
  'Siguiente',
);
const botonRevisar = exigir(form.querySelector<HTMLButtonElement>('[data-revisar]'), 'Revisar');
const acciones = exigir(form.querySelector<HTMLElement>('.acciones'), 'las acciones');
const hojas = HOJAS.map((h) => exigir(form.querySelector<HTMLElement>(`[data-hoja="${h}"]`), h));
// A tab is a link once its section is reached and plain text before; it swaps element on change.
const pestanas = [...document.querySelectorAll<HTMLElement>('[data-pestana]')];
const tr = traductorDeLaPagina();
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');

let actual = 0;
let alcanzada = 0;

// Measurement state for this page view. The catalogue's «section» is the sheet: when each
// sheet and the whole run started, how many revisions were made, and the previous answers,
// kept here only to name what changed.
let seccionVista: Seccion | null = null;
let entradaEnSeccion = 0;
let inicio: number | null = null;
let intentos = 0;
let anterior: Instantanea | null = null;
const segundosDesde = (t: number) => (performance.now() - t) / 1000;
const seccionDe = (i: number): Seccion => PASOS[i] ?? 'causa';

function medirErrores(errores: readonly ErrorCampo[]) {
  for (const { campo } of errores)
    medir('error_validacion', {
      seccion: hojaDeCampo(campo),
      campo: campoBase(campo) as CampoMedible,
    });
}

function medirCompletada(seccion: Seccion) {
  medir('seccion_completada', {
    seccion,
    segundos: cuboSegundosSeccion(segundosDesde(entradaEnSeccion)),
  });
}

const indiceDe = (hash: string): number => {
  const i = PASOS.indexOf(hash.replace(/^#/, '') as Paso);
  return i < 0 ? 0 : i;
};

// Conditional sheets: the temporal type only for a fixed-term contract, extra pay only when
// it is not already spread over the monthly payslip, and the paro questions only when the
// cause can give a right to paro.
function aplica(i: number): boolean {
  const datos = new FormData(form);
  if (PASOS[i] === 'temporal') return datos.get('causa') === 'fin_temporal';
  if (PASOS[i] === 'pagas') return datos.get('pagasProrrateadas') === 'no';
  if (PASOS[i] === 'hijos' || PASOS[i] === 'otros')
    return preguntaParo(datos.get('causa') as string | null);
  return true;
}

function paso(desde: number, sentido: 1 | -1): number {
  let i = desde + sentido;
  while (i > 0 && i < RESULTADO && !aplica(i)) i += sentido;
  return i;
}

function activar(contenedor: HTMLElement, activo: boolean) {
  contenedor.hidden = !activo;
  for (const control of contenedor.querySelectorAll<HTMLInputElement>('input'))
    control.disabled = !activo;
}

function aplicarCondiciones() {
  const datos = new FormData(form);
  const causa = String(datos.get('causa') ?? '');
  for (const el of form.querySelectorAll<HTMLElement>('[data-si-causa]'))
    activar(el, (el.dataset['siCausa'] ?? '').split(' ').includes(causa));
  const otrosElegido = String(datos.get('otrosContratos') ?? '');
  for (const el of form.querySelectorAll<HTMLElement>('[data-si-otros]'))
    activar(el, el.dataset['siOtros'] === otrosElegido);
  const prorrateo = String(datos.get('pagasProrrateadas') ?? '');
  for (const el of form.querySelectorAll<HTMLElement>('[data-si-prorrateo]'))
    activar(el, el.dataset['siProrrateo'] === prorrateo);
  // The salary hint depends on the prorrateo answer, which the sheet before it asks.
  for (const el of form.querySelectorAll<HTMLElement>('[data-pista-si]')) {
    const pista = el.querySelector('.pista');
    const texto = el.dataset[prorrateo === 'si' ? 'pistaSi' : 'pistaNo'];
    if (pista && texto) pista.textContent = texto;
  }
  for (const casilla of form.querySelectorAll<HTMLInputElement>('[data-sin-dato]')) {
    const entrada = form.querySelector<HTMLInputElement>(`[name="${casilla.dataset['sinDato']}"]`);
    if (entrada) {
      entrada.disabled = casilla.checked;
      if (casilla.checked) entrada.value = '';
    }
  }
}

// Asks for the employer's figure only for the items this case produces.
function prepararCifras() {
  const r = revisarFiniquito(entradaProvisional(form), {});
  const ids = new Set(r.ok ? r.revision.partidas.map((p) => p.partida.id) : []);
  for (const id of PARTIDAS) {
    const caja = exigir(form.querySelector<HTMLElement>(`[data-cifra="${id}"]`), id);
    const entrada = exigir(form.querySelector<HTMLInputElement>(`[name="${campoCifra(id)}"]`), id);
    caja.hidden = !ids.has(id);
    entrada.disabled = !ids.has(id);
  }
}

function comoPestana(el: HTMLElement, enlace: boolean): HTMLElement {
  if (el instanceof HTMLAnchorElement === enlace) return el;
  const otro = document.createElement(enlace ? 'a' : 'span');
  for (const { name, value } of el.attributes) otro.setAttribute(name, value);
  otro.append(...el.childNodes);
  el.replaceWith(otro);
  return otro;
}

function pintarPestanas() {
  const seccionActual = SECCION[PASOS[actual] ?? 'causa'];
  pestanas.forEach((el, i) => {
    const id = el.dataset['pestana'] ?? 'causa';
    const primero = PASOS.findIndex((p) => SECCION[p] === id);
    const disponible = primero <= alcanzada;
    const esActual = id === seccionActual;
    const p = comoPestana(el, disponible);
    pestanas[i] = p;
    if (disponible) {
      p.setAttribute('href', `#${PASOS[primero]}`);
      p.removeAttribute('aria-disabled');
    } else {
      p.removeAttribute('href');
      p.setAttribute('aria-disabled', 'true');
    }
    p.dataset['estado'] = esActual ? 'actual' : disponible ? 'hecha' : 'pendiente';
    if (esActual) p.setAttribute('aria-current', 'step');
    else p.removeAttribute('aria-current');
  });
}

function mostrar(i: number, opciones: { historia?: 'push' | 'replace'; foco?: boolean } = {}) {
  let destino = Math.max(0, Math.min(i, alcanzada));
  if (!aplica(destino)) destino = paso(destino, -1);
  const primeraVez = actual < 0;
  const cambia = destino !== actual;
  actual = destino;
  const id = PASOS[actual] ?? 'causa';

  hojas.forEach((h, j) => (h.hidden = j !== actual));
  resultado.hidden = actual !== RESULTADO;
  acciones.hidden = actual === RESULTADO;
  botonAtras.hidden = actual === 0;
  botonSiguiente.hidden = actual >= ULTIMA_HOJA;
  botonRevisar.hidden = actual !== ULTIMA_HOJA;
  document.body.dataset['seccion'] = SECCION[id];
  if (id !== seccionVista) {
    seccionVista = id;
    entradaEnSeccion = performance.now();
    inicio ??= entradaEnSeccion;
    medir('seccion_vista', { seccion: seccionVista });
  }
  if (actual === ULTIMA_HOJA) prepararCifras();
  pintarPestanas();

  if (opciones.historia === 'push') history.pushState(null, '', `#${id}`);
  else if (opciones.historia === 'replace') history.replaceState(null, '', `#${id}`);

  const visible = actual === RESULTADO ? resultado : hojas[actual];
  if (cambia && !primeraVez && visible && !sinMovimiento.matches) {
    visible.classList.remove('pasa');
    void visible.offsetWidth;
    visible.classList.add('pasa');
  }
  if (cambia && !primeraVez) window.scrollTo({ top: 0 });
  if (opciones.foco) {
    const titulo = actual === RESULTADO ? tituloResultado : visible?.querySelector('h2');
    titulo?.focus({ preventScroll: true });
  }
}

function enfocarError(errores: readonly ErrorCampo[]) {
  const primero = errores[0];
  if (!primero) return;
  form.querySelector<HTMLInputElement>(`[name="${primero.campo}"]:not([disabled])`)?.focus();
  // Inside the scrolling list of other contracts, the slip sits below its input.
  form.querySelector(`[data-error-de="${primero.campo}"]`)?.scrollIntoView({ block: 'nearest' });
}

function avanzar() {
  const hoja = HOJAS[actual];
  if (!hoja) return;
  const errores = erroresDeHoja(form, hoja);
  pintarErrores(form, errores, tr);
  if (errores.length > 0) {
    medirErrores(errores);
    enfocarError(errores);
    return;
  }
  const siguiente = paso(actual, 1);
  medirCompletada(hoja);
  alcanzada = Math.max(alcanzada, siguiente);
  mostrar(siguiente, { historia: 'push', foco: true });
}

function irAlError(errores: readonly ErrorCampo[]) {
  medirErrores(errores);
  pintarErrores(form, errores, tr);
  const primero = errores[0];
  if (!primero) return;
  mostrar(HOJAS.indexOf(hojaDeCampo(primero.campo)), { historia: 'push' });
  enfocarError(errores);
}

function revisar() {
  const leido = leerFormulario(form);
  if ('errores' in leido) return irAlError(leido.errores);
  const r = revisarFiniquito(leido.entrada, leido.cifras);
  if (!r.ok) return irAlError(r.errores);
  const paro = leerDatosParo(form);
  if ('errores' in paro) return irAlError(paro.errores);
  const estimacion = calcularParo(leido.entrada, paro.datos?.hijos ?? null, paro.datos?.otros);
  pintarErrores(form, [], tr);
  pintarRevision(revision, r.revision, tr);
  pintarParo(hojaParo, estimacion, leido.entrada.causa, paro.datos?.hijos ?? null, tr);
  medirCompletada(seccionDe(actual));
  intentos += 1;
  const foto = instantanea(leido.entrada, leido.cifras);
  medir(
    'revision_hecha',
    propsRevision({
      revision: r.revision,
      entrada: leido.entrada,
      intento: intentos,
      cambios: camposCambiados(anterior, foto),
      segundos: segundosDesde(inicio ?? entradaEnSeccion),
      paro: estimacion,
      otrosContratos: paro.datos?.otros.contratos.length ?? 0,
    }),
  );
  anterior = foto;
  alcanzada = RESULTADO;
  mostrar(RESULTADO, { historia: 'push', foco: true });
}

// Any move to an earlier step: the Back button, a tab or the browser's back.
function volver(i: number, opciones: Parameters<typeof mostrar>[1]) {
  const antes = actual;
  mostrar(i, opciones);
  if (actual < antes) medir('atras', { de: seccionDe(antes), a: seccionDe(actual) });
}

// The furthest sheet a visitor may open: every sheet before it answers cleanly.
function primeraIncompleta(): number {
  const i = HOJAS.findIndex((h, j) => aplica(j) && erroresDeHoja(form, h).length > 0);
  return i < 0 ? ULTIMA_HOJA : i;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (actual < ULTIMA_HOJA) avanzar();
  else revisar();
});
botonSiguiente.addEventListener('click', avanzar);
botonAtras.addEventListener('click', () =>
  volver(paso(actual, -1), { historia: 'push', foco: true }),
);

form.addEventListener('change', aplicarCondiciones);
form.addEventListener('input', () => {
  if (alcanzada === RESULTADO) {
    alcanzada = ULTIMA_HOJA;
    pintarPestanas();
  }
});

document.querySelector('.pestanas')?.addEventListener('click', (e) => {
  const a = e.target instanceof Element && e.target.closest('a[data-pestana]');
  if (!(a instanceof HTMLAnchorElement)) return;
  e.preventDefault();
  volver(indiceDe(a.hash), { historia: 'push', foco: true });
});

window.addEventListener('popstate', () => volver(indiceDe(location.hash), {}));

// `toggle` does not bubble, so it is caught on the way down.
document.addEventListener(
  'toggle',
  (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.open) return;
    if (d.hasAttribute('data-ayuda'))
      medir('ayuda_abierta', { tema: d.id as Props<'ayuda_abierta'>['tema'] });
    const partida = d.closest<HTMLElement>('[data-partida]')?.dataset['partida'];
    if (d.hasAttribute('data-detalle') && partida)
      medir('detalle_abierto', { partida: partida as PartidaId });
  },
  true,
);

exigir(resultado.querySelector('[data-reiniciar]'), 'Empezar de nuevo').addEventListener(
  'click',
  () => {
    medir('empezar_de_nuevo', {});
    form.reset();
    otros.vaciar();
    pintarErrores(form, [], tr);
    aplicarCondiciones();
    alcanzada = 0;
    mostrar(0, { historia: 'push', foco: true });
  },
);

const otros = prepararOtros(form, tr, aplicarCondiciones);
aplicarCondiciones();
alcanzada = primeraIncompleta();
actual = -1;
mostrar(Math.min(indiceDe(location.hash), alcanzada), { historia: 'replace' });
