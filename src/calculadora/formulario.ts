import { parseFecha, type Fecha } from '../motor/fecha';
import type { Hijos } from '../motor/paro';
import type { CifrasEmpresa } from '../motor/revisar';
import type {
  Causa,
  Devengo,
  EntradaFiniquito,
  OtrosContratos,
  PartidaId,
  PeriodoCotizado,
  TipoTemporal,
} from '../motor/tipos';
import {
  validar,
  validarOtrosContratos,
  type CodigoErrorEntrada,
  type CodigoErrorOtroContrato,
} from '../motor/validar';
import { parseImporte } from './numero';

// Fields the form itself requires before the engine sees them.
const OBLIGATORIOS = [
  'causa',
  'tipoTemporal',
  'fechaAlta',
  'fechaBaja',
  'salarioMensual',
  'pagasProrrateadas',
  'numeroPagas',
  'importePaga',
  'diasVacacionesAnuales',
  'diasVacacionesDisfrutadas',
] as const;
type Obligatorio = (typeof OBLIGATORIOS)[number];

export type CodigoError =
  | CodigoErrorEntrada
  | CodigoErrorOtroContrato
  | 'falta_hijos'
  | 'falta_paroCobradoDespues'
  | `falta_${Obligatorio}`
  | 'falta_dato'
  | 'fecha_no_valida'
  | 'cifra_no_valida';

// The UI translates `codigo` through the dictionary key `cli.error.<codigo>`.
export interface ErrorCampo {
  readonly campo: string;
  readonly codigo: CodigoError;
}

export const HOJAS = [
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
] as const;
export type Hoja = (typeof HOJAS)[number];

export const PARTIDAS: readonly PartidaId[] = [
  'salario_pendiente',
  'vacaciones',
  'pagas_extra',
  'indemnizacion',
  'preaviso_empresa',
  'descuento_preaviso',
];

export const campoCifra = (id: PartidaId) => `cifra_${id}`;

export const CAMPOS: Record<Hoja, readonly string[]> = {
  causa: ['causa'],
  temporal: ['tipoTemporal'],
  fechas: ['fechaAlta', 'fechaBaja'],
  prorrateo: ['pagasProrrateadas'],
  salario: ['salarioMensual'],
  pagas: ['numeroPagas', 'importePaga', 'devengoPagas'],
  vacaciones: [
    'diasVacacionesAnuales',
    'diasVacacionesDisfrutadas',
    'diasPreavisoRecibidos',
    'diasPreavisoConvenio',
    'diasPreavisoDados',
  ],
  hijos: ['hijos'],
  otros: ['otrosContratos', 'paroCobradoDespues'],
  finiquito: PARTIDAS.map(campoCifra),
};

// A row field such as «otrosContratos.0.fechaAlta» belongs to its list, «otrosContratos».
export const campoBase = (campo: string): string => campo.split('.')[0] ?? campo;

export const hojaDeCampo = (campo: string): Hoja =>
  HOJAS.find((h) => CAMPOS[h].includes(campoBase(campo))) ?? 'causa';

// The paro sheets only apply when the cause can give a right to paro.
export const preguntaParo = (causa: string | null): boolean => !!causa && causa !== 'dimision';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const POR_DEFECTO: EntradaFiniquito = {
  causa: 'improcedente',
  fechaAlta: { y: 2000, m: 1, d: 1 },
  fechaBaja: { y: 2000, m: 12, d: 31 },
  salarioMensual: 1000,
  pagasProrrateadas: true,
  numeroPagas: 2,
  importePaga: 0,
  devengoPagas: 'no_lo_se',
  diasVacacionesAnuales: 30,
  diasVacacionesDisfrutadas: null,
};

interface Lectura {
  readonly parcial: Partial<Mutable<EntradaFiniquito>>;
  readonly cifras: CifrasEmpresa;
  readonly errores: ErrorCampo[];
}

// FormData leaves out disabled controls, so a field that does not apply never reaches the engine.
function leer(form: HTMLFormElement): Lectura {
  const datos = new FormData(form);
  const parcial: Partial<Mutable<EntradaFiniquito>> = {};
  const cifras: Mutable<CifrasEmpresa> = {};
  const errores: ErrorCampo[] = [];
  const texto = (campo: string): string | null => {
    const v = datos.get(campo);
    return typeof v === 'string' ? v : null;
  };
  const presente = (campo: string) => datos.has(campo);
  const falta = (campo: string) =>
    errores.push({
      campo,
      codigo: (OBLIGATORIOS as readonly string[]).includes(campo)
        ? (`falta_${campo}` as CodigoError)
        : 'falta_dato',
    });

  const causa = texto('causa');
  if (causa) parcial.causa = causa as Causa;
  else falta('causa');

  if (presente('tipoTemporal') || parcial.causa === 'fin_temporal') {
    const t = texto('tipoTemporal');
    if (t) parcial.tipoTemporal = t as TipoTemporal;
    else falta('tipoTemporal');
  }

  for (const campo of ['fechaAlta', 'fechaBaja'] as const) {
    const t = texto(campo)?.trim() ?? '';
    if (t === '') {
      falta(campo);
      continue;
    }
    let f: Fecha;
    try {
      f = parseFecha(t);
    } catch {
      errores.push({ campo, codigo: 'fecha_no_valida' });
      continue;
    }
    parcial[campo] = f;
  }

  const prorrateo = texto('pagasProrrateadas');
  if (prorrateo === 'si' || prorrateo === 'no') parcial.pagasProrrateadas = prorrateo === 'si';
  else falta('pagasProrrateadas');

  // «No lo sé» disables the number, so the engine gets null and marks the item as not checkable.
  const vacacionesNoLoSe = texto('diasVacacionesDisfrutadasNoLoSe') === 'si';
  if (vacacionesNoLoSe) parcial.diasVacacionesDisfrutadas = null;

  const devengo = texto('devengoPagas');
  if (devengo) parcial.devengoPagas = devengo as Devengo;

  const numericos = [
    ['salarioMensual', true],
    ['numeroPagas', true],
    ['importePaga', true],
    ['diasVacacionesAnuales', true],
    ['diasVacacionesDisfrutadas', true],
    ['diasPreavisoRecibidos', false],
    ['diasPreavisoConvenio', false],
    ['diasPreavisoDados', false],
  ] as const;
  for (const [campo, obligatorio] of numericos) {
    const t = texto(campo);
    if (t === null) continue;
    const n = parseImporte(t);
    if (n === null) {
      const exigido = campo === 'importePaga' ? parcial.numeroPagas !== 0 : obligatorio;
      if (exigido) falta(campo);
    } else if (Number.isNaN(n)) errores.push({ campo, codigo: 'cifra_no_valida' });
    else parcial[campo] = n;
  }

  for (const id of PARTIDAS) {
    const t = texto(campoCifra(id));
    if (t === null) continue;
    const n = parseImporte(t);
    if (n === null) continue;
    if (Number.isNaN(n)) errores.push({ campo: campoCifra(id), codigo: 'cifra_no_valida' });
    else cifras[id] = n;
  }

  return { parcial, cifras, errores };
}

function completar(parcial: Partial<EntradaFiniquito>): EntradaFiniquito {
  const e: Mutable<EntradaFiniquito> = { ...POR_DEFECTO, ...parcial };
  if (e.pagasProrrateadas) e.importePaga = 0;
  return e;
}

export const entradaProvisional = (form: HTMLFormElement): EntradaFiniquito =>
  completar(leer(form).parcial);

export function leerFormulario(
  form: HTMLFormElement,
): { entrada: EntradaFiniquito; cifras: CifrasEmpresa } | { errores: ErrorCampo[] } {
  const { parcial, cifras, errores } = leer(form);
  if (errores.length > 0) return { errores };
  return { entrada: completar(parcial), cifras };
}

export interface DatosParo {
  readonly hijos: Hijos;
  readonly otros: OtrosContratos;
}

const HIJOS: Record<string, Hijos> = { '0': 0, '1': 1, '2': 2, no_dice: null };

// The two paro sheets. Rows count only when «Sí, añadir fechas» is chosen; their dates never
// leave this page.
function leerParo(form: HTMLFormElement): { datos: DatosParo; errores: ErrorCampo[] } {
  const datos = new FormData(form);
  const texto = (campo: string): string | null => {
    const v = datos.get(campo);
    return typeof v === 'string' ? v : null;
  };
  const errores: ErrorCampo[] = [];

  const h = texto('hijos');
  const hijos = h !== null && h in HIJOS ? (HIJOS[h] ?? null) : null;
  if (h === null || !(h in HIJOS)) errores.push({ campo: 'hijos', codigo: 'falta_hijos' });

  const contratos: PeriodoCotizado[] = [];
  let paroCobradoDespues: boolean | null = null;
  if (texto('otrosContratos') === 'si') {
    // The question sits above the rows, so its error comes first.
    const p = texto('paroCobradoDespues');
    if (p === 'si' || p === 'no') paroCobradoDespues = p === 'si';
    else if (p !== 'no_lo_se')
      errores.push({ campo: 'paroCobradoDespues', codigo: 'falta_paroCobradoDespues' });

    // Each parsed row keeps the index it has on screen, so an engine error lands on its row.
    const filas: number[] = [];
    const deFilas: ErrorCampo[] = [];
    for (const fila of form.querySelectorAll<HTMLElement>('[data-otro]')) {
      const i = Number(fila.dataset['otro']);
      const fechas: Partial<Record<keyof PeriodoCotizado, Fecha>> = {};
      for (const dato of ['fechaAlta', 'fechaBaja'] as const) {
        const campo = `otrosContratos.${i}.${dato}`;
        const t = texto(campo)?.trim() ?? '';
        if (t === '') {
          deFilas.push({ campo, codigo: 'falta_dato' });
          continue;
        }
        try {
          fechas[dato] = parseFecha(t);
        } catch {
          deFilas.push({ campo, codigo: 'fecha_no_valida' });
        }
      }
      if (fechas.fechaAlta && fechas.fechaBaja) {
        contratos.push({ fechaAlta: fechas.fechaAlta, fechaBaja: fechas.fechaBaja });
        filas.push(i);
      }
    }
    const e = completar(leer(form).parcial);
    for (const { fila, campo, codigo } of validarOtrosContratos(e, contratos)) {
      const i = filas[fila] ?? fila;
      deFilas.push({ campo: campo.replace(/^otrosContratos\.\d+/, `otrosContratos.${i}`), codigo });
    }
    // Screen order: row by row, the start date before the end date.
    const orden = (c: string) => {
      const [, fila = '0', dato = ''] = c.split('.');
      return Number(fila) * 2 + (dato === 'fechaBaja' ? 1 : 0);
    };
    errores.push(...deFilas.sort((a, b) => orden(a.campo) - orden(b.campo)));
  }
  return { datos: { hijos, otros: { contratos, paroCobradoDespues } }, errores };
}

// For the result: null when the cause gives no paro, so its sheets were never asked.
export function leerDatosParo(
  form: HTMLFormElement,
): { datos: DatosParo | null } | { errores: ErrorCampo[] } {
  if (!preguntaParo(new FormData(form).get('causa') as string | null)) return { datos: null };
  const { datos, errores } = leerParo(form);
  return errores.length > 0 ? { errores } : { datos };
}

export function erroresDeHoja(form: HTMLFormElement, hoja: Hoja, hoy?: Fecha): ErrorCampo[] {
  if (hoja === 'hijos' || hoja === 'otros') {
    const campos = CAMPOS[hoja];
    return leerParo(form).errores.filter((e) => campos.includes(campoBase(e.campo)));
  }
  const { parcial, errores } = leer(form);
  const campos = CAMPOS[hoja];
  const propios = errores.filter((e) => campos.includes(e.campo));
  const conError = new Set(propios.map((e) => e.campo));
  const delMotor = validar(completar(parcial), hoy)
    .filter((e) => campos.includes(e.campo) && !conError.has(e.campo) && e.campo in parcial)
    .map(({ campo, codigo }) => ({ campo, codigo }));
  return [...propios, ...delMotor];
}
