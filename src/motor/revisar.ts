import { comparar, type ResultadoPartida } from './comparar';
import type { Fecha } from './fecha';
import { calcularIndemnizacion } from './indemnizacion';
import {
  partidaDescuentoPreaviso,
  partidaPagasExtra,
  partidaPreavisoEmpresa,
  partidaSalarioPendiente,
  partidaVacaciones,
  salarioAnual,
} from './liquidacion';
import type { EntradaFiniquito, MotivoCero, Partida, PartidaId } from './tipos';
import { validar, type ErrorEntrada } from './validar';

export type CifrasEmpresa = Partial<Record<PartidaId, number>>;

export type CodigoNoRevisado =
  'neto' | 'pluses' | 'pagas_adicionales' | 'causa_despido' | 'salarios_tramitacion';

const NO_REVISADO: Record<CodigoNoRevisado, string> = {
  neto: 'El neto: retenciones de IRPF y cotizaciones',
  pluses: 'Pluses, complementos, horas extra y comisiones de tu convenio o contrato',
  pagas_adicionales: 'Pagas extra además de las dos ordinarias',
  causa_despido: 'Si la causa de despido está justificada, algo que decide un juzgado',
  salarios_tramitacion: 'Salarios de tramitación',
};

export interface Revision {
  readonly partidas: readonly ResultadoPartida[];
  readonly referenciaImprocedente: number | null;
  readonly noRevisado: readonly string[];
  // The same list as codes, for the UI to translate.
  readonly noRevisadoCodigos: readonly CodigoNoRevisado[];
}

function motivoCero(e: EntradaFiniquito): MotivoCero | undefined {
  if (e.causa === 'dimision' || e.causa === 'disciplinario') return e.causa;
  if (e.causa === 'fin_temporal' && e.tipoTemporal !== 'circunstancias') return e.tipoTemporal;
  return undefined;
}

function partidaIndemnizacion(e: EntradaFiniquito): Partida {
  const motivo = motivoCero(e);
  const r = calcularIndemnizacion({
    causa: e.causa,
    fechaAlta: e.fechaAlta,
    fechaBaja: e.fechaBaja,
    salarioAnual: salarioAnual(e),
    tipoTemporal: e.tipoTemporal,
  });
  return {
    id: 'indemnizacion',
    titulo: 'Indemnización',
    sentido: 'abono',
    rango: r.rango,
    calculo: r.detalle,
    dependeDeConvenio: false,
    segunTuDato: false,
    fuentes: r.fuentes,
    ...(motivo === undefined ? {} : { motivoCero: motivo }),
  };
}

export function revisarFiniquito(
  e: EntradaFiniquito,
  cifras: CifrasEmpresa,
  hoy?: Fecha,
): { ok: true; revision: Revision } | { ok: false; errores: readonly ErrorEntrada[] } {
  const errores = validar(e, hoy);
  if (errores.length > 0) return { ok: false, errores };

  const partidas = [
    partidaSalarioPendiente(e),
    partidaVacaciones(e),
    partidaPagasExtra(e),
    partidaIndemnizacion(e),
    partidaPreavisoEmpresa(e),
    partidaDescuentoPreaviso(e),
  ]
    .filter((p): p is Partida => p !== null)
    .map((p) => comparar(p, cifras[p.id] ?? null));

  const referenciaImprocedente =
    e.causa === 'disciplinario'
      ? calcularIndemnizacion({
          causa: 'improcedente',
          fechaAlta: e.fechaAlta,
          fechaBaja: e.fechaBaja,
          salarioAnual: salarioAnual(e),
        }).importe
      : null;

  const noRevisadoCodigos: CodigoNoRevisado[] = [
    'neto',
    'pluses',
    ...(e.numeroPagas > 2 ? (['pagas_adicionales'] as const) : []),
    'causa_despido',
    'salarios_tramitacion',
  ];
  const noRevisado = noRevisadoCodigos.map((c) => NO_REVISADO[c]);

  return {
    ok: true,
    revision: { partidas, referenciaImprocedente, noRevisado, noRevisadoCodigos },
  };
}
