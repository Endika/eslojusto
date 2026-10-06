import { entre, exacto, type Rango } from './dinero';
import { diasNaturales, max, ordinal, sumarDias, sumarMesesRecortando, type Fecha } from './fecha';
import { FUENTES, type Fuente } from './fuentes';
import { salarioAnual } from './liquidacion';
import type { Causa, EntradaFiniquito, OtrosContratos, PeriodoCotizado } from './tipos';

// 2026 figures. Review every 1 January and whenever new PGE are passed.
export const PARO_2026 = {
  // Ley 31/2022 DA 90.ª (PGE 2023, prorrogados); SEPE «Cuantías anuales».
  ipremMensual: 600,
  // IPREM × 7/6; art. 270.3 LGSS, último párrafo.
  ipremTopes: 700,
  // 80 % / 107 % × 700; art. 270.3 LGSS.
  topeMin: { 0: 560, 1: 749 },
  // 175 % / 200 % / 225 % × 700; art. 270.3 LGSS.
  topeMax: { 0: 1225, 1: 1400, 2: 1575 },
  // Orden PJC/297/2026, art. 2.2.
  baseMinAtep: 1424.4,
  // Orden PJC/297/2026, art. 2.1; RDL 3/2026, art. 3.
  baseMax: 5101.2,
  // Art. 270.2 LGSS (redacción vigente desde el 01/01/2023).
  pctTramo1: 0.7,
  // Art. 270.2 LGSS (redacción vigente desde el 01/01/2023).
  pctTramo2: 0.6,
  // Art. 270.2 LGSS: «los ciento ochenta primeros días».
  diasTramo1: 180,
  // 4,70 % contingencias comunes (Orden PJC/297/2026, art. 4.a) + 0,15 % MEI (art. 16).
  cotizacionTrabajador: 0.0485,
  // Art. 269.1 LGSS, primera fila de la escala.
  carenciaDias: 360,
  // Art. 270.1 LGSS: base de los últimos 180 días; sin ellos en este contrato no hay cifra.
  diasBase: 180,
  // [días cotizados desde, días de prestación]; art. 269.1 LGSS.
  escala: [
    [2160, 720],
    [1980, 660],
    [1800, 600],
    [1620, 540],
    [1440, 480],
    [1260, 420],
    [1080, 360],
    [900, 300],
    [720, 240],
    [540, 180],
    [360, 120],
  ],
} as const;

const P = PARO_2026;

// 2 = «2 o más»; null = sin respuesta.
export type Hijos = 0 | 1 | 2 | null;

export interface CifrasParo {
  readonly tramo1: Rango;
  readonly tramo2: Rango;
  readonly cotizacion: Rango;
}

// al_menos: only this contract is known. exacta: other contracts given and no paro drawn since.
// hasta: other contracts given and paro maybe drawn since, so some of those days may be used up.
export type DuracionParo =
  | { readonly tipo: 'al_menos'; readonly dias: number }
  | { readonly tipo: 'exacta'; readonly dias: number }
  | { readonly tipo: 'hasta'; readonly dias: number; readonly razon: string };

export type EstimacionParo =
  | {
      readonly derecho: 'no';
      readonly motivo: string;
      readonly fuentes: readonly Fuente[];
    }
  | {
      readonly derecho: 'si';
      readonly motivo: string;
      readonly carencia:
        'cubierta_por_este_contrato' | 'cubierta_con_otros_contratos' | 'depende_vida_laboral';
      // This contract alone, inside the 6-year window.
      readonly diasContrato: number;
      readonly duracionMinimaDias: number;
      // This contract plus the others, overlaps merged, inside the same window.
      readonly diasCotizados: number;
      readonly duracion: DuracionParo;
      readonly tramo2: boolean;
      readonly cifras: CifrasParo | null;
      // Why `cifras` is null: under 180 days the base mixes in another job; a salary below the
      // full-time minimum base is almost surely part-time, whose base and caps we cannot know.
      readonly sinCifras: SinCifras | null;
      readonly fuentes: readonly Fuente[];
    };

export type SinCifras = 'contrato_corto' | 'base_bajo_minimo';

// Truncates to cents like the SEPE simulator; the epsilon absorbs float noise such as 1750 × 0.7.
export const trunc2 = (x: number): number => Math.floor(x * 100 + 1e-6) / 100;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

const MOTIVO: Record<Causa, string> = {
  dimision: 'El cese voluntario no es situación legal de desempleo (art. 267.2.a LGSS).',
  fin_temporal:
    'El fin del contrato temporal es situación legal de desempleo si no lo terminó el trabajador (art. 267.1.a.6.º LGSS).',
  objetivo: 'El despido objetivo es situación legal de desempleo (art. 267.1.a.4.º LGSS).',
  improcedente: 'El despido es situación legal de desempleo (art. 267.1.a.3.º LGSS).',
  disciplinario:
    'El despido disciplinario es situación legal de desempleo aunque no se impugne (arts. 267.1.a.3.º y 268.4 LGSS).',
};

const RAZON_HASTA =
  'Si cobraste paro después de alguno de estos contratos, esos días ya se usaron y puede ser menos (art. 269.2 LGSS).';

const inicioVentana = (baja: Fecha): Fecha => sumarDias(sumarMesesRecortando(baja, -72), 1);

export function diasCotizadosContrato(alta: Fecha, baja: Fecha): number {
  return diasNaturales(max(alta, inicioVentana(baja)), baja);
}

// Union of the periods clipped to the 6-year window ending at `baja`; a day worked in two jobs counts once.
export function diasCotizados(baja: Fecha, periodos: readonly PeriodoCotizado[]): number {
  const desde = ordinal(inicioVentana(baja));
  const hasta = ordinal(baja);
  const tramos = periodos
    .map((p): [number, number] => [
      Math.max(ordinal(p.fechaAlta), desde),
      Math.min(ordinal(p.fechaBaja), hasta),
    ])
    .filter(([a, b]) => a <= b)
    .sort(([a], [b]) => a - b);
  let total = 0;
  let fin = -Infinity;
  for (const [a, b] of tramos) {
    if (b <= fin) continue;
    total += b - Math.max(a, fin + 1) + 1;
    fin = b;
  }
  return total;
}

export function duracionDias(dias: number): number {
  return P.escala.find(([desde]) => dias >= desde)?.[1] ?? 0;
}

export function baseMensual(e: EntradaFiniquito): number {
  return clamp(trunc2(salarioAnual(e) / 12), P.baseMinAtep, P.baseMax);
}

export function cuantias(base: number, hijos: 0 | 1 | 2): { c1: number; c2: number; ss: number } {
  const lo = P.topeMin[Math.min(hijos, 1) as 0 | 1];
  const hi = P.topeMax[hijos];
  return {
    c1: clamp(trunc2(base * P.pctTramo1), lo, hi),
    c2: clamp(trunc2(base * P.pctTramo2), lo, hi),
    ss: trunc2(base * P.cotizacionTrabajador),
  };
}

// Approximate gross total over the minimum duration; secondary data, always «al menos».
export const totalAproximado = (c1: number, c2: number, dur: number): number =>
  (c1 * Math.min(dur, P.diasTramo1)) / 30 + (c2 * Math.max(dur - P.diasTramo1, 0)) / 30;

function cifras(base: number, hijos: Hijos): CifrasParo {
  if (hijos !== null) {
    const { c1, c2, ss } = cuantias(base, hijos);
    return { tramo1: exacto(c1), tramo2: exacto(c2), cotizacion: exacto(ss) };
  }
  const a = cuantias(base, 0);
  const b = cuantias(base, 2);
  return { tramo1: entre(a.c1, b.c1), tramo2: entre(a.c2, b.c2), cotizacion: exacto(a.ss) };
}

// `otros` absent or with no rows keeps the «al menos» reading of this contract alone.
export function calcularParo(
  e: EntradaFiniquito,
  hijos: Hijos,
  otros?: OtrosContratos,
): EstimacionParo {
  if (e.causa === 'dimision')
    return { derecho: 'no', motivo: MOTIVO.dimision, fuentes: [FUENTES.lgss267] };

  const d = diasCotizadosContrato(e.fechaAlta, e.fechaBaja);
  const filas = otros?.contratos ?? [];
  const total =
    filas.length === 0
      ? d
      : diasCotizados(e.fechaBaja, [{ fechaAlta: e.fechaAlta, fechaBaja: e.fechaBaja }, ...filas]);
  const sinParoDespues = filas.length > 0 && otros?.paroCobradoDespues === false;
  const duracion: DuracionParo =
    filas.length === 0
      ? { tipo: 'al_menos', dias: duracionDias(d) }
      : sinParoDespues
        ? { tipo: 'exacta', dias: duracionDias(total) }
        : { tipo: 'hasta', dias: duracionDias(total), razon: RAZON_HASTA };
  const sinCifras: SinCifras | null =
    d < P.diasBase
      ? 'contrato_corto'
      : salarioAnual(e) / 12 < P.baseMinAtep
        ? 'base_bajo_minimo'
        : null;
  return {
    derecho: 'si',
    motivo: MOTIVO[e.causa],
    carencia:
      d >= P.carenciaDias
        ? 'cubierta_por_este_contrato'
        : sinParoDespues && total >= P.carenciaDias
          ? 'cubierta_con_otros_contratos'
          : 'depende_vida_laboral',
    diasContrato: d,
    duracionMinimaDias: duracionDias(d),
    diasCotizados: total,
    duracion,
    tramo2: duracion.dias > P.diasTramo1,
    cifras: sinCifras === null ? cifras(baseMensual(e), hijos) : null,
    sinCifras,
    fuentes: [
      FUENTES.lgss267,
      // Art. 268: the disciplinary rule and, for every cause, the 15-day deadline.
      FUENTES.lgss268,
      FUENTES.lgss269,
      FUENTES.lgss270,
      FUENTES.ordenCotizacion2026,
      FUENTES.sepeCuantias,
    ],
  };
}
