import type { Fecha } from './fecha';
import type { Rango } from './dinero';
import type { Fuente } from './fuentes';

export type Causa = 'dimision' | 'fin_temporal' | 'objetivo' | 'improcedente' | 'disciplinario';
export type TipoTemporal = 'circunstancias' | 'sustitucion' | 'formativo';

export type Devengo = 'anual' | 'semestral' | 'no_lo_se';
export type PartidaId =
  | 'salario_pendiente'
  | 'vacaciones'
  | 'pagas_extra'
  | 'indemnizacion'
  | 'preaviso_empresa'
  | 'descuento_preaviso';

// Another contract in the last 6 years, as the person reads it in their vida laboral.
export interface PeriodoCotizado {
  readonly fechaAlta: Fecha;
  readonly fechaBaja: Fecha;
}

// Kept out of EntradaFiniquito on purpose: these dates never reach the measurement catalogue.
export interface OtrosContratos {
  readonly contratos: readonly PeriodoCotizado[];
  // null = «No lo sé».
  readonly paroCobradoDespues: boolean | null;
}

export interface EntradaFiniquito {
  readonly causa: Causa;
  readonly tipoTemporal?: TipoTemporal;
  readonly fechaAlta: Fecha;
  readonly fechaBaja: Fecha;
  readonly salarioMensual: number;
  readonly pagasProrrateadas: boolean;
  readonly numeroPagas: number;
  readonly importePaga: number;
  readonly devengoPagas: Devengo;
  readonly diasVacacionesAnuales: number;
  readonly diasVacacionesDisfrutadas: number | null;
  readonly diasPreavisoRecibidos?: number;
  readonly diasPreavisoConvenio?: number;
  readonly diasPreavisoDados?: number;
}

// Why a severance item is legally zero; the UI words each cause differently.
export type MotivoCero = 'dimision' | 'disciplinario' | 'sustitucion' | 'formativo';

export interface Partida {
  readonly id: PartidaId;
  readonly titulo: string;
  readonly sentido: 'abono' | 'descuento';
  readonly rango: Rango | null;
  readonly calculo: string;
  readonly dependeDeConvenio: boolean;
  readonly segunTuDato: boolean;
  readonly fuentes: readonly Fuente[];
  readonly motivoCero?: MotivoCero;
  // Set when `rango` is null for want of an answer the person gave as «No lo sé», not the agreement.
  readonly faltaDato?: 'dias_disfrutados';
}
