import { comparar as compararFechas, diasDelMes, sumarDias, type Fecha } from './fecha';
import type { EntradaFiniquito, PeriodoCotizado } from './tipos';

export type CodigoErrorEntrada =
  | 'fecha_alta_no_valida'
  | 'fecha_baja_no_valida'
  | 'baja_antes_de_alta'
  | 'baja_muy_lejana'
  | 'salario_fuera_de_rango'
  | 'pagas_fuera_de_rango'
  | 'importe_paga_fuera_de_rango'
  | 'vacaciones_anuales_fuera_de_rango'
  | 'vacaciones_disfrutadas_fuera_de_rango'
  | 'preaviso_fuera_de_rango'
  | 'falta_tipo_temporal';

// `codigo` is what the UI translates; `mensaje` is the same text in Spanish, for the engine's callers.
export type ErrorEntrada = {
  readonly campo: keyof EntradaFiniquito;
  readonly codigo: CodigoErrorEntrada;
  readonly mensaje: string;
};

const MAX_SALARIO = 1_000_000;
const DIAS_FUTURO = 365;

export function hoyLocal(): Fecha {
  const ahora = new Date();
  return { y: ahora.getFullYear(), m: ahora.getMonth() + 1, d: ahora.getDate() };
}

const fechaValida = (f: Fecha): boolean =>
  Number.isInteger(f.y) &&
  Number.isInteger(f.m) &&
  Number.isInteger(f.d) &&
  f.m >= 1 &&
  f.m <= 12 &&
  f.d >= 1 &&
  f.d <= diasDelMes(f.y, f.m);

const entero = (n: number, min: number, max: number): boolean =>
  Number.isInteger(n) && n >= min && n <= max;

export function validar(e: EntradaFiniquito, hoy: Fecha = hoyLocal()): readonly ErrorEntrada[] {
  const errores: ErrorEntrada[] = [];
  const err = (campo: keyof EntradaFiniquito, codigo: CodigoErrorEntrada, mensaje: string) =>
    errores.push({ campo, codigo, mensaje });

  if (!fechaValida(e.fechaAlta))
    err('fechaAlta', 'fecha_alta_no_valida', 'La fecha de alta no es válida');
  if (!fechaValida(e.fechaBaja))
    err('fechaBaja', 'fecha_baja_no_valida', 'La fecha de baja no es válida');
  else if (fechaValida(e.fechaAlta) && compararFechas(e.fechaBaja, e.fechaAlta) < 0)
    err('fechaBaja', 'baja_antes_de_alta', 'La fecha de baja es anterior a la de alta');
  else if (compararFechas(e.fechaBaja, sumarDias(hoy, DIAS_FUTURO)) > 0)
    err(
      'fechaBaja',
      'baja_muy_lejana',
      'La fecha de baja no puede estar a más de un año en el futuro',
    );

  if (!Number.isFinite(e.salarioMensual) || e.salarioMensual <= 0 || e.salarioMensual > MAX_SALARIO)
    err(
      'salarioMensual',
      'salario_fuera_de_rango',
      'El salario mensual debe ser mayor que 0 y no pasar de 1.000.000 €',
    );

  if (!entero(e.numeroPagas, 0, 6))
    err('numeroPagas', 'pagas_fuera_de_rango', 'El número de pagas debe estar entre 0 y 6');

  const pagaObligatoria = !e.pagasProrrateadas && e.numeroPagas > 0;
  if (
    !Number.isFinite(e.importePaga) ||
    e.importePaga > MAX_SALARIO ||
    (pagaObligatoria ? e.importePaga <= 0 : e.importePaga < 0)
  )
    err(
      'importePaga',
      'importe_paga_fuera_de_rango',
      'El importe de la paga extra debe ser mayor que 0 y no pasar de 1.000.000 €',
    );

  if (
    !Number.isFinite(e.diasVacacionesAnuales) ||
    e.diasVacacionesAnuales < 0 ||
    e.diasVacacionesAnuales > 60
  )
    err(
      'diasVacacionesAnuales',
      'vacaciones_anuales_fuera_de_rango',
      'Los días de vacaciones al año deben estar entre 0 y 60',
    );
  const disfrutadas = e.diasVacacionesDisfrutadas;
  if (
    disfrutadas !== null &&
    (!Number.isFinite(disfrutadas) || disfrutadas < 0 || disfrutadas > 60)
  )
    err(
      'diasVacacionesDisfrutadas',
      'vacaciones_disfrutadas_fuera_de_rango',
      'Los días de vacaciones disfrutados deben estar entre 0 y 60',
    );

  const preaviso = [
    ['diasPreavisoRecibidos', e.diasPreavisoRecibidos],
    ['diasPreavisoConvenio', e.diasPreavisoConvenio],
    ['diasPreavisoDados', e.diasPreavisoDados],
  ] as const;
  for (const [campo, valor] of preaviso) {
    if (valor !== undefined && (!Number.isFinite(valor) || valor < 0 || valor > 90))
      err(campo, 'preaviso_fuera_de_rango', 'Los días de preaviso deben estar entre 0 y 90');
  }

  if (e.causa === 'fin_temporal' && e.tipoTemporal === undefined)
    err('tipoTemporal', 'falta_tipo_temporal', 'Indica el tipo de contrato temporal');

  return errores;
}

export type CodigoErrorOtroContrato =
  | 'otro_contrato_fecha_alta_no_valida'
  | 'otro_contrato_fecha_baja_no_valida'
  | 'otro_contrato_baja_antes_de_alta'
  | 'otro_contrato_baja_posterior';

export type ErrorOtroContrato = {
  readonly campo: `otrosContratos.${number}.${keyof PeriodoCotizado}`;
  readonly fila: number;
  readonly codigo: CodigoErrorOtroContrato;
  readonly mensaje: string;
};

// Separate from `validar` so the finiquito review never depends on these optional rows.
export function validarOtrosContratos(
  e: EntradaFiniquito,
  contratos: readonly PeriodoCotizado[],
): readonly ErrorOtroContrato[] {
  const errores: ErrorOtroContrato[] = [];
  const bajaValida = fechaValida(e.fechaBaja);
  contratos.forEach((o, fila) => {
    const err = (dato: keyof PeriodoCotizado, codigo: CodigoErrorOtroContrato, mensaje: string) =>
      errores.push({ campo: `otrosContratos.${fila}.${dato}`, fila, codigo, mensaje });
    const altaValida = fechaValida(o.fechaAlta);
    if (!altaValida)
      err(
        'fechaAlta',
        'otro_contrato_fecha_alta_no_valida',
        'La fecha de alta de este contrato no es válida',
      );
    if (!fechaValida(o.fechaBaja))
      err(
        'fechaBaja',
        'otro_contrato_fecha_baja_no_valida',
        'La fecha de baja de este contrato no es válida',
      );
    else if (altaValida && compararFechas(o.fechaBaja, o.fechaAlta) < 0)
      err(
        'fechaBaja',
        'otro_contrato_baja_antes_de_alta',
        'La fecha de baja de este contrato es anterior a la de alta',
      );
    else if (bajaValida && compararFechas(o.fechaBaja, e.fechaBaja) > 0)
      err(
        'fechaBaja',
        'otro_contrato_baja_posterior',
        'La fecha de baja de este contrato es posterior a la del contrato que estás revisando',
      );
  });
  return errores;
}
