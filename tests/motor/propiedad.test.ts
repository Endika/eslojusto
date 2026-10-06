import { describe, expect, it } from 'vitest';
import { comparar, type Estado } from '../../src/motor/comparar';
import { redondear } from '../../src/motor/dinero';
import {
  aIso,
  desdeOrdinal,
  diasDelMes,
  diasNaturales,
  max,
  min,
  ordinal,
  parseFecha as f,
  type Fecha,
} from '../../src/motor/fecha';
import { calcularIndemnizacion } from '../../src/motor/indemnizacion';
import { salarioAnual } from '../../src/motor/liquidacion';
import { revisarFiniquito, type CifrasEmpresa } from '../../src/motor/revisar';
import type { Causa, EntradaFiniquito, PartidaId, TipoTemporal } from '../../src/motor/tipos';

const HOY = f('2026-10-06');
const CASOS = 500;

// mulberry32: small, seeded and deterministic.
function prng(semilla: number) {
  let a = semilla;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entero = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const uno = <T>(xs: readonly T[]): T => xs[entero(0, xs.length - 1)] as T;
  return { r, entero, uno };
}

type Metodo = 'dias' | 'meses' | 'aniversario';
const METODOS: readonly Metodo[] = ['dias', 'meses', 'aniversario'];

// Independent of the engine: whole calendar months count 1, a partial month its days / 30.
function mesesOraculo(desde: Fecha, hasta: Fecha): number {
  let total = 0;
  for (
    let y = desde.y, m = desde.m;
    y * 12 + m <= hasta.y * 12 + hasta.m;
    m === 12 ? (y++, (m = 1)) : m++
  ) {
    const ini = y === desde.y && m === desde.m ? desde.d : 1;
    const fin = y === hasta.y && m === hasta.m ? hasta.d : diasDelMes(y, m);
    const dias = fin - ini + 1;
    total += dias === diasDelMes(y, m) ? 1 : Math.min(1, dias / 30);
  }
  return total;
}

// Independent of the engine: months by anniversary of `desde` (day clipped to the month's end), leftover days / 30.
function mesesAniversarioOraculo(desde: Fecha, hasta: Fecha): number {
  const vispera = (k: number) => {
    const t = desde.y * 12 + desde.m - 1 + k;
    const y = Math.floor(t / 12);
    const m = (t % 12) + 1;
    return ordinal({ y, m, d: Math.min(desde.d, diasDelMes(y, m)) }) - 1;
  };
  let k = 0;
  while (vispera(k + 1) <= ordinal(hasta)) k++;
  return k + (ordinal(hasta) - vispera(k)) / 30;
}

function devengo(
  desde: Fecha,
  hasta: Fecha,
  ini: Fecha,
  fin: Fecha,
  mesesPeriodo: number,
  m: Metodo,
) {
  const d = max(desde, ini);
  const h = min(hasta, fin);
  if (ordinal(h) < ordinal(d)) return 0;
  if (m === 'dias') return diasNaturales(d, h) / diasNaturales(ini, fin);
  // Counting from the alta only applies when it falls inside the period; from the period start it is calendar months.
  return m === 'meses'
    ? mesesOraculo(d, h) / mesesPeriodo
    : mesesAniversarioOraculo(d, h) / mesesPeriodo;
}

function generar(g: ReturnType<typeof prng>): EntradaFiniquito {
  const causa = g.uno<Causa>([
    'dimision',
    'fin_temporal',
    'objetivo',
    'improcedente',
    'disciplinario',
  ]);
  const alta = desdeOrdinal(g.entero(ordinal(f('1985-01-01')), ordinal(f('2026-09-30'))));
  const baja = desdeOrdinal(g.entero(ordinal(alta), ordinal(f('2027-06-30'))));
  const prorrateadas = g.r() < 0.3;
  const numeroPagas = g.uno([0, 1, 2, 2, 2, 3, 4]);
  const salario = g.entero(80000, 600000) / 100;
  return {
    causa,
    ...(causa === 'fin_temporal'
      ? { tipoTemporal: g.uno<TipoTemporal>(['circunstancias', 'sustitucion', 'formativo']) }
      : {}),
    fechaAlta: alta,
    fechaBaja: baja,
    salarioMensual: salario,
    pagasProrrateadas: prorrateadas,
    numeroPagas,
    importePaga: prorrateadas || numeroPagas === 0 ? 0 : g.entero(50000, 600000) / 100,
    devengoPagas: g.uno(['anual', 'semestral', 'no_lo_se'] as const),
    diasVacacionesAnuales: g.entero(22, 35),
    diasVacacionesDisfrutadas: g.r() < 0.1 ? null : g.entero(0, 30),
    ...(g.r() < 0.7 ? { diasPreavisoRecibidos: g.entero(0, 30) } : {}),
    ...(g.r() < 0.6 ? { diasPreavisoConvenio: g.entero(0, 30) } : {}),
    ...(g.r() < 0.6 ? { diasPreavisoDados: g.entero(0, 30) } : {}),
  };
}

function vacacionesPendientes(e: EntradaFiniquito, m: Metodo): number | null {
  if (e.diasVacacionesDisfrutadas === null) return null;
  const { y } = e.fechaBaja;
  const fraccion = devengo(e.fechaAlta, e.fechaBaja, { y, m: 1, d: 1 }, { y, m: 12, d: 31 }, 12, m);
  return e.diasVacacionesAnuales * fraccion - e.diasVacacionesDisfrutadas;
}

type Esquema = 'anual' | 'semestral';

// Fraction of each paga accrued in the open period, by one method for both pagas.
function fraccionesPagas(e: EntradaFiniquito, esquema: Esquema, m: Metodo) {
  const { y, m: mes } = e.fechaBaja;
  const primer = mes <= 6;
  let verano = 0;
  let navidad = 0;
  if (esquema === 'anual') {
    const iniV = primer ? y - 1 : y;
    verano = devengo(
      e.fechaAlta,
      e.fechaBaja,
      { y: iniV, m: 7, d: 1 },
      { y: iniV + 1, m: 6, d: 30 },
      12,
      m,
    );
    navidad = devengo(e.fechaAlta, e.fechaBaja, { y, m: 1, d: 1 }, { y, m: 12, d: 31 }, 12, m);
  } else if (primer) {
    verano = devengo(e.fechaAlta, e.fechaBaja, { y, m: 1, d: 1 }, { y, m: 6, d: 30 }, 6, m);
  } else {
    navidad = devengo(e.fechaAlta, e.fechaBaja, { y, m: 7, d: 1 }, { y, m: 12, d: 31 }, 6, m);
  }
  return { verano, navidad };
}

// A paga due in the month of leaving may already be in that month's payslip.
const cobrable = (mes: number) => ({ verano: mes === 6 || mes === 7, navidad: mes === 12 });

// Every pagas figure a legitimate employer could write: scheme × method × which paga × already paid.
function pagasLegitimas(e: EntradaFiniquito): number[] {
  const esquemas: Esquema[] =
    e.devengoPagas === 'no_lo_se' ? ['anual', 'semestral'] : [e.devengoPagas];
  const puede = cobrable(e.fechaBaja.m);
  const figuras: number[] = [];
  for (const esquema of esquemas) {
    for (const m of METODOS) {
      const f = fraccionesPagas(e, esquema, m);
      const verano = puede.verano ? [f.verano, 0] : [f.verano];
      const navidad = puede.navidad ? [f.navidad, 0] : [f.navidad];
      const totales =
        e.numeroPagas === 1
          ? [...verano, ...navidad]
          : verano.flatMap((v) => navidad.map((n) => v + n));
      figuras.push(...totales.map((t) => e.importePaga * t));
    }
  }
  return figuras;
}

// What an employer paying the legal amount by one method would put in the finiquito.
function cifrasEmpresa(e: EntradaFiniquito, m: Metodo, g: ReturnType<typeof prng>): CifrasEmpresa {
  const { y, m: mes } = e.fechaBaja;
  const anual = salarioAnual(e);
  const dia = g.uno([e.salarioMensual / 30, anual / 365]);
  const c: CifrasEmpresa = {};

  const desdeMes = max({ y, m: mes, d: 1 }, e.fechaAlta);
  const trabajados = diasNaturales(desdeMes, e.fechaBaja);
  c.salario_pendiente =
    m === 'dias'
      ? (e.salarioMensual * trabajados) / diasDelMes(y, mes)
      : Math.min(e.salarioMensual, (e.salarioMensual * trabajados) / 30);

  const pendientes = vacacionesPendientes(e, m);
  if (pendientes !== null && pendientes >= 0) c.vacaciones = pendientes * dia;

  if (!e.pagasProrrateadas && e.numeroPagas > 0) {
    const esquema =
      e.devengoPagas === 'no_lo_se' ? g.uno(['anual', 'semestral'] as const) : e.devengoPagas;
    let { verano, navidad } = fraccionesPagas(e, esquema, m);
    const puede = cobrable(mes);
    if (puede.verano && g.r() < 0.5) verano = 0;
    if (puede.navidad && g.r() < 0.5) navidad = 0;
    const partes = e.numeroPagas === 1 ? g.uno([verano, navidad]) : verano + navidad;
    c.pagas_extra = e.importePaga * partes;
  }

  c.indemnizacion = calcularIndemnizacion({
    causa: e.causa,
    fechaAlta: e.fechaAlta,
    fechaBaja: e.fechaBaja,
    salarioAnual: anual,
    tipoTemporal: e.tipoTemporal,
  }).importe;

  const faltanEmpresa = Math.max(0, 15 - (e.diasPreavisoRecibidos ?? 0));
  c.preaviso_empresa = faltanEmpresa * dia;
  if (e.diasPreavisoConvenio !== undefined) {
    c.descuento_preaviso = Math.max(0, e.diasPreavisoConvenio - (e.diasPreavisoDados ?? 0)) * dia;
  }
  for (const k of Object.keys(c) as PartidaId[]) c[k] = redondear(c[k] ?? 0);
  return c;
}

function entradas(): { e: EntradaFiniquito; g: ReturnType<typeof prng> }[] {
  const g = prng(20261006);
  return Array.from({ length: CASOS }, () => ({ e: generar(g), g }));
}

const revisar = (e: EntradaFiniquito, c: CifrasEmpresa = {}) => {
  const r = revisarFiniquito(e, c, HOY);
  if (!r.ok) throw new Error(`${aIso(e.fechaAlta)} ${JSON.stringify(r.errores)}`);
  return r.revision;
};

const MALOS: readonly Estado[] = ['por_debajo', 'descuento_mayor'];

describe('propiedad: nunca un hallazgo inventado (500 entradas con semilla)', () => {
  const casos = entradas();

  it.each(METODOS)(
    'una empresa que paga por %s nunca sale por debajo ni con descuento de más',
    (metodo) => {
      for (const { e, g } of casos) {
        const rev = revisar(e, cifrasEmpresa(e, metodo, g));
        const malos = rev.partidas.filter((p) => MALOS.includes(p.estado));
        expect(malos.map((p) => [p.partida.id, p.cifraEmpresa, p.partida.rango, e])).toEqual([]);
      }
    },
  );

  it('el margen de 1 €: el mínimo y 0,99 menos no salen por debajo; 1,01 menos sí', () => {
    for (const { e } of casos) {
      for (const p of revisar(e).partidas) {
        const { rango, sentido } = p.partida;
        if (rango === null || sentido !== 'abono') continue;
        expect(comparar(p.partida, rango.minimo).estado).not.toBe('por_debajo');
        expect(comparar(p.partida, redondear(rango.minimo - 0.99)).estado).not.toBe('por_debajo');
        if (rango.minimo >= 1.01) {
          expect(comparar(p.partida, redondear(rango.minimo - 1.01))).toMatchObject({
            estado: 'por_debajo',
            diferencia: 1.01,
          });
        }
      }
    }
  });

  it('sin ensanchar: 1,01 € fuera de la cuenta legítima más estrecha sí sale', () => {
    for (const { e } of casos) {
      const legitimas: Partial<Record<PartidaId, number[]>> = {};
      if (!e.pagasProrrateadas && e.numeroPagas > 0) legitimas.pagas_extra = pagasLegitimas(e);
      const pendientes = METODOS.map((m) => vacacionesPendientes(e, m));
      const conocidas = pendientes.filter((p) => p !== null);
      if (conocidas.length > 0 && Math.max(...conocidas) >= 0) {
        const dias = [e.salarioMensual / 30, salarioAnual(e) / 365];
        legitimas.vacaciones = conocidas.flatMap((p) => dias.map((d) => Math.max(0, p) * d));
      }
      for (const p of revisar(e).partidas) {
        const figuras = legitimas[p.partida.id];
        if (figuras === undefined) continue;
        const bajo = redondear(Math.min(...figuras));
        const alto = redondear(Math.max(...figuras));
        const caso = JSON.stringify([p.partida.id, p.partida.rango, bajo, alto, e]);
        if (bajo >= 1.01) {
          expect(comparar(p.partida, redondear(bajo - 1.01)).estado, caso).toBe('por_debajo');
        }
        // One cent of slack: the oracle adds fractions before multiplying, so a half-cent can round the other way.
        expect(comparar(p.partida, redondear(alto + 1.02)).estado, caso).toBe('por_encima');
      }
    }
  });

  it('ningún rango invertido ni negativo', () => {
    for (const { e } of casos) {
      for (const p of revisar(e).partidas) {
        const { rango } = p.partida;
        if (rango === null) continue;
        expect(rango.minimo).toBeGreaterThanOrEqual(0);
        expect(rango.maximo).toBeGreaterThanOrEqual(rango.minimo);
      }
    }
  });
});
