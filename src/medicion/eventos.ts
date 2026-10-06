import type { EstimacionParo } from '../motor/paro';
import type { CifrasEmpresa, Revision } from '../motor/revisar';
import type { Causa, EntradaFiniquito, PartidaId, TipoTemporal } from '../motor/tipos';
import { PREGUNTAS } from '../contenido/temas';

// Every property is a code from a closed list, a small count or a bucket: nothing a person
// types can fit in one. `eventoValido` enforces it at runtime before anything is sent.

// One per sheet of the form, conditional ones included, plus the result.
export const SECCIONES = [
  'causa',
  'temporal',
  'fechas',
  'prorrateo',
  'salario',
  'pagas',
  'vacaciones',
  'hijos',
  'otros',
  'finiquito',
  'resultado',
] as const;
export type Seccion = (typeof SECCIONES)[number];

const PARTIDAS = [
  'salario_pendiente',
  'vacaciones',
  'pagas_extra',
  'indemnizacion',
  'preaviso_empresa',
  'descuento_preaviso',
] as const satisfies readonly PartidaId[];

const CAMPOS_ENTRADA = [
  'causa',
  'tipoTemporal',
  'fechaAlta',
  'fechaBaja',
  'salarioMensual',
  'pagasProrrateadas',
  'numeroPagas',
  'importePaga',
  'devengoPagas',
  'diasVacacionesAnuales',
  'diasVacacionesDisfrutadas',
  'diasPreavisoRecibidos',
  'diasPreavisoConvenio',
  'diasPreavisoDados',
] as const satisfies readonly (keyof EntradaFiniquito)[];

// Fails the typecheck when the engine gains an input field or an item the catalogue lacks.
type Falta<Todos, Listados> = Exclude<Todos, Listados> extends never ? true : never;
const _todosLosCampos: Falta<keyof EntradaFiniquito, (typeof CAMPOS_ENTRADA)[number]> = true;
const _todasLasPartidas: Falta<PartidaId, (typeof PARTIDAS)[number]> = true;
void _todosLosCampos;
void _todasLasPartidas;

// The paro answers, by name only: an error on one of them names the field, never the answer.
// They are left out of `instantanea`, so `cambios` never lists them either.
const CAMPOS_PARO = ['hijos', 'otrosContratos', 'paroCobradoDespues'] as const;

const cifra = (id: PartidaId) => `cifra_${id}` as const;
export const CAMPOS_MEDIBLES = [...CAMPOS_ENTRADA, ...PARTIDAS.map(cifra), ...CAMPOS_PARO] as const;
export type CampoMedible = (typeof CAMPOS_MEDIBLES)[number];

export const TEMAS_AYUDA = PREGUNTAS.map((id) => `faq-${id}` as const);

const CAUSAS = [
  'dimision',
  'fin_temporal',
  'objetivo',
  'improcedente',
  'disciplinario',
] as const satisfies readonly Causa[];
const TIPOS_TEMPORAL = [
  'circunstancias',
  'sustitucion',
  'formativo',
  'no_aplica',
] as const satisfies readonly (TipoTemporal | 'no_aplica')[];
const PAGAS = ['prorrateadas', 'anual', 'semestral', 'no_lo_se', 'sin_pagas'] as const;
const RESULTADOS = ['falta', 'todo_coincide', 'solo_no_comprobable', 'sin_cifras'] as const;
// Whether the paro sheet showed amounts; never the children, the dates or the amounts.
const PARO = ['no_aplica', 'con_cifras', 'sin_cifras'] as const;
const OTROS_CONTRATOS = ['0', '1', '2', '3+'] as const;
export type EstadoParo = (typeof PARO)[number];

export const estadoParo = (p: EstimacionParo): EstadoParo =>
  p.derecho === 'no' ? 'no_aplica' : p.cifras === null ? 'sin_cifras' : 'con_cifras';
export type Resultado = (typeof RESULTADOS)[number];

export const TIPOS_ERROR = [
  'Error',
  'TypeError',
  'ReferenceError',
  'RangeError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
  'AbortError',
  'InvalidStateError',
  'NotFoundError',
  'NotAllowedError',
  'NotSupportedError',
  'NetworkError',
  'QuotaExceededError',
  'SecurityError',
  'otro',
] as const;

const SEGUNDOS_SECCION = ['<10', '10-30', '30-60', '60-180', '>180'] as const;
const SEGUNDOS_REVISION = ['<60', '60-180', '180-600', '>600'] as const;
const DIFERENCIA = ['0', '<100', '100-500', '500-2000', '>2000'] as const;
const INTENTO = ['1', '2', '3+'] as const;

// The first bucket holds what is below the first limit; each next one, up to its limit inclusive.
function cubo<T extends string>(x: number, limites: readonly number[], etiquetas: readonly T[]): T {
  const i = x < (limites[0] ?? 0) ? 0 : limites.findIndex((l, j) => j > 0 && x <= l);
  return etiquetas[i < 0 ? etiquetas.length - 1 : i] as T;
}

export const cuboSegundosSeccion = (s: number) => cubo(s, [10, 30, 60, 180], SEGUNDOS_SECCION);
export const cuboSegundosRevision = (s: number) => cubo(s, [60, 180, 600], SEGUNDOS_REVISION);
export const cuboDiferencia = (euros: number) =>
  euros <= 0 ? '0' : cubo(euros, [100, 500, 2000], DIFERENCIA.slice(1));
export const cuboIntento = (n: number) => (n <= 1 ? '1' : n === 2 ? '2' : '3+');
export const cuboOtrosContratos = (n: number) =>
  n <= 0 ? '0' : n === 1 ? '1' : n === 2 ? '2' : '3+';

type Regla =
  | { readonly valores: readonly string[] }
  | { readonly patron: RegExp }
  | { readonly entero: readonly [number, number] }
  | { readonly si_no: true }
  | { readonly lista: readonly string[] };

const de = <const T extends readonly string[]>(valores: T) => ({ valores });
const seccion = de(SECCIONES);
const cuenta = { entero: [0, 6] } as const;

// A primary language subtag (ISO 639), or 'desconocido'.
const IDIOMA = { patron: /^(?:[a-z]{2,3}|desconocido)$/ } as const;
// A script's file name and line; a name made only of digits or symbols is refused.
export const ORIGEN_SCRIPT = /^[\w.-]*[a-z][\w.-]*\.(?:m?js|html):\d{1,6}$/i;
const ORIGEN = { patron: new RegExp(`${ORIGEN_SCRIPT.source}|^desconocido$`, 'i') } as const;

export const CATALOGO = {
  idioma_navegador: { idioma: IDIOMA },
  idioma_traducido: { idioma: IDIOMA },
  seccion_vista: { seccion },
  seccion_completada: { seccion, segundos: de(SEGUNDOS_SECCION) },
  atras: { de: seccion, a: seccion },
  error_validacion: { seccion, campo: de(CAMPOS_MEDIBLES) },
  ayuda_abierta: { tema: de(TEMAS_AYUDA) },
  revision_hecha: {
    causa: de(CAUSAS),
    tipo_temporal: de(TIPOS_TEMPORAL),
    pagas: de(PAGAS),
    cifras_metidas: cuenta,
    por_debajo: cuenta,
    coinciden: cuenta,
    por_encima: cuenta,
    no_comprobables: cuenta,
    descuento_mayor: { si_no: true },
    diferencia: de(DIFERENCIA),
    resultado: de(RESULTADOS),
    intento: de(INTENTO),
    cambios: { lista: CAMPOS_MEDIBLES },
    segundos: de(SEGUNDOS_REVISION),
    paro: de(PARO),
    otros_contratos: de(OTROS_CONTRATOS),
  },
  detalle_abierto: { partida: de(PARTIDAS) },
  empezar_de_nuevo: {},
  error_js: { tipo: de(TIPOS_ERROR), origen: ORIGEN },
} as const satisfies Record<string, Record<string, Regla>>;

export type Evento = keyof typeof CATALOGO;

type Valor<R> = R extends { valores: readonly (infer V)[] }
  ? V
  : R extends { patron: RegExp }
    ? string
    : R extends { entero: unknown }
      ? number
      : R extends { si_no: true }
        ? boolean
        : R extends { lista: readonly (infer V)[] }
          ? readonly V[]
          : never;

export type Props<E extends Evento> = {
  -readonly [K in keyof (typeof CATALOGO)[E]]: Valor<(typeof CATALOGO)[E][K]>;
};

function cumple(regla: Regla, v: unknown): boolean {
  if ('valores' in regla) return typeof v === 'string' && regla.valores.includes(v);
  if ('patron' in regla) return typeof v === 'string' && regla.patron.test(v);
  if ('entero' in regla)
    return (
      Number.isInteger(v) && (v as number) >= regla.entero[0] && (v as number) <= regla.entero[1]
    );
  if ('si_no' in regla) return typeof v === 'boolean';
  return (
    Array.isArray(v) &&
    new Set(v).size === v.length &&
    v.every((x) => typeof x === 'string' && regla.lista.includes(x))
  );
}

export function eventoValido(nombre: string, props: unknown): boolean {
  if (!Object.hasOwn(CATALOGO, nombre)) return false;
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return false;
  const reglas: Record<string, Regla> = CATALOGO[nombre as Evento];
  const claves = Object.keys(props);
  return (
    claves.length === Object.keys(reglas).length &&
    claves.every(
      (k) =>
        Object.hasOwn(reglas, k) &&
        cumple(reglas[k] as Regla, (props as Record<string, unknown>)[k]),
    )
  );
}

export function resultadoDe(r: Revision): Resultado {
  const estados = r.partidas.map((p) => p.estado);
  if (estados.some((e) => e === 'por_debajo' || e === 'descuento_mayor')) return 'falta';
  if (r.partidas.every((p) => p.cifraEmpresa === null)) return 'sin_cifras';
  return estados.some((e) => e === 'coincide' || e === 'por_encima' || e === 'descuento_dentro')
    ? 'todo_coincide'
    : 'solo_no_comprobable';
}

// What the visitor answered, field by field, kept in this page only to tell which names changed.
export type Instantanea = Readonly<Partial<Record<CampoMedible, string>>>;

export function instantanea(e: EntradaFiniquito, cifras: CifrasEmpresa): Instantanea {
  const foto: Partial<Record<CampoMedible, string>> = {};
  for (const campo of CAMPOS_ENTRADA)
    if (e[campo] !== undefined) foto[campo] = JSON.stringify(e[campo]);
  for (const id of PARTIDAS) if (cifras[id] !== undefined) foto[cifra(id)] = String(cifras[id]);
  return foto;
}

export const camposCambiados = (antes: Instantanea | null, ahora: Instantanea): CampoMedible[] =>
  antes === null ? [] : CAMPOS_MEDIBLES.filter((c) => antes[c] !== ahora[c]);

export function propsRevision(datos: {
  revision: Revision;
  entrada: EntradaFiniquito;
  intento: number;
  cambios: readonly CampoMedible[];
  segundos: number;
  paro: EstimacionParo;
  otrosContratos: number;
}): Props<'revision_hecha'> {
  const { revision, entrada: e } = datos;
  const cuantas = (estado: string) => revision.partidas.filter((p) => p.estado === estado).length;
  const falta = revision.partidas
    .filter((p) => p.estado === 'por_debajo')
    .reduce((suma, p) => suma + (p.diferencia ?? 0), 0);
  return {
    causa: e.causa,
    tipo_temporal: e.causa === 'fin_temporal' ? (e.tipoTemporal ?? 'no_aplica') : 'no_aplica',
    pagas: e.pagasProrrateadas
      ? 'prorrateadas'
      : e.numeroPagas === 0
        ? 'sin_pagas'
        : e.devengoPagas,
    cifras_metidas: revision.partidas.filter((p) => p.cifraEmpresa !== null).length,
    por_debajo: cuantas('por_debajo'),
    coinciden: cuantas('coincide'),
    por_encima: cuantas('por_encima'),
    no_comprobables: cuantas('no_comprobable'),
    descuento_mayor: cuantas('descuento_mayor') > 0,
    diferencia: cuboDiferencia(falta),
    resultado: resultadoDe(revision),
    intento: cuboIntento(datos.intento),
    cambios: [...datos.cambios],
    segundos: cuboSegundosRevision(datos.segundos),
    paro: estadoParo(datos.paro),
    otros_contratos: cuboOtrosContratos(datos.otrosContratos),
  };
}
