import { describe, expect, it } from 'vitest';
import type { Rango } from '../../src/motor/dinero';
import {
  desdeOrdinal,
  diasDelMes,
  ordinal,
  parseFecha as f,
  type Fecha,
} from '../../src/motor/fecha';
import {
  calcularParo,
  cuantias,
  diasCotizados,
  PARO_2026,
  totalAproximado,
  trunc2,
  type EstimacionParo,
  type Hijos,
} from '../../src/motor/paro';
import type {
  Causa,
  EntradaFiniquito,
  OtrosContratos,
  PeriodoCotizado,
  TipoTemporal,
} from '../../src/motor/tipos';
import { validar, validarOtrosContratos } from '../../src/motor/validar';
import { salarioAnual } from '../../src/motor/liquidacion';

const base: EntradaFiniquito = {
  causa: 'objetivo',
  fechaAlta: f('2024-01-01'),
  fechaBaja: f('2026-09-30'),
  salarioMensual: 2000,
  pagasProrrateadas: false,
  numeroPagas: 2,
  importePaga: 2000,
  devengoPagas: 'anual',
  diasVacacionesAnuales: 30,
  diasVacacionesDisfrutadas: 0,
};

const entrada = (
  causa: Causa,
  alta: string,
  baja: string,
  salario: number,
  pagas: 14 | 12,
  tipoTemporal?: TipoTemporal,
): EntradaFiniquito => ({
  ...base,
  causa,
  ...(tipoTemporal ? { tipoTemporal } : {}),
  fechaAlta: f(alta),
  fechaBaja: f(baja),
  salarioMensual: salario,
  pagasProrrateadas: pagas === 12,
  numeroPagas: pagas === 12 ? 0 : 2,
  importePaga: pagas === 12 ? 0 : salario,
});

type Si = Extract<EstimacionParo, { derecho: 'si' }>;

const si = (e: EntradaFiniquito, hijos: Hijos, otros?: OtrosContratos): Si => {
  const r = calcularParo(e, hijos, otros);
  if (r.derecho !== 'si') throw new Error('se esperaba derecho: si');
  return r;
};

const cifras = (r: Si) => {
  if (r.cifras === null) throw new Error('se esperaban cifras');
  return r.cifras;
};

const cerca = (rango: Rango, v: number) => {
  expect(rango.minimo).toBeCloseTo(v, 2);
  expect(rango.maximo).toBeCloseTo(v, 2);
};

describe('paro: casos de §10', () => {
  it('1: dimisión, sin derecho y sin cifras aunque la carencia y la base darían paro', () => {
    const r = calcularParo(entrada('dimision', '2024-01-01', '2026-09-30', 2000, 14), 0);
    expect(r.derecho).toBe('no');
    expect(r).not.toHaveProperty('cifras');
    expect(r.fuentes.map((x) => x.id)).toEqual(['lgss267']);
    if (r.derecho === 'no') expect(r.motivo).toContain('art. 267.2.a');
  });

  const caso2 = entrada('fin_temporal', '2025-09-01', '2026-08-31', 1800, 14, 'circunstancias');

  it('2: fin temporal, 365 días, 120 días de paro, tope de 1 hijo y sin tramo 2', () => {
    const r = si(caso2, 1);
    expect(r.diasContrato).toBe(365);
    expect(r.carencia).toBe('cubierta_por_este_contrato');
    expect(r.duracionMinimaDias).toBe(120);
    expect(r.tramo2).toBe(false);
    cerca(cifras(r).tramo1, 1400);
    cerca(cifras(r).cotizacion, 101.85);
  });

  it('2b: igual con 0 hijos, tope de 1.225', () => {
    const r = si(caso2, 0);
    cerca(cifras(r).tramo1, 1225);
    cerca(cifras(r).cotizacion, 101.85);
  });

  it('3a: 359 días, la carencia depende de la vida laboral pero hay cifras', () => {
    const r = si(entrada('fin_temporal', '2025-10-06', '2026-09-29', 2000, 14, 'sustitucion'), 0);
    expect(r.diasContrato).toBe(359);
    expect(r.carencia).toBe('depende_vida_laboral');
    expect(r.duracionMinimaDias).toBe(0);
    cerca(cifras(r).tramo1, 1225);
    cerca(cifras(r).tramo2, 1225);
    cerca(cifras(r).cotizacion, 113.16);
  });

  it('3b: 360 días, carencia cubierta y 120 días', () => {
    const r = si(entrada('fin_temporal', '2025-10-05', '2026-09-29', 2000, 14, 'sustitucion'), 0);
    expect(r.diasContrato).toBe(360);
    expect(r.carencia).toBe('cubierta_por_este_contrato');
    expect(r.duracionMinimaDias).toBe(120);
  });

  it('4: despido objetivo con el SMI, ningún tope actúa', () => {
    const r = si(entrada('objetivo', '2023-03-15', '2026-09-30', 1221, 14), 0);
    expect(r.diasContrato).toBe(1296);
    expect(r.duracionMinimaDias).toBe(420);
    expect(r.tramo2).toBe(true);
    cerca(cifras(r).tramo1, 997.15);
    cerca(cifras(r).tramo2, 854.7);
    cerca(cifras(r).cotizacion, 69.08);
  });

  it('5: despido improcedente, ventana de 6 años y base recortada al máximo', () => {
    const r = si(entrada('improcedente', '2015-01-01', '2026-09-30', 6000, 12), 2);
    expect(r.diasContrato).toBe(2191);
    expect(r.duracionMinimaDias).toBe(720);
    cerca(cifras(r).tramo1, 1575);
    cerca(cifras(r).tramo2, 1575);
    cerca(cifras(r).cotizacion, 247.4);
  });

  const caso6 = entrada('disciplinario', '2022-01-10', '2026-09-30', 2500, 12);

  it('6: despido disciplinario da derecho, 540 días y tope de 1 hijo', () => {
    const r = si(caso6, 1);
    expect(r.diasContrato).toBe(1725);
    expect(r.duracionMinimaDias).toBe(540);
    cerca(cifras(r).tramo1, 1400);
    cerca(cifras(r).tramo2, 1400);
    cerca(cifras(r).cotizacion, 121.25);
    expect(r.fuentes.map((x) => x.id)).toContain('lgss268');
  });

  it('6b: igual con 0 hijos', () => {
    const r = si(caso6, 0);
    cerca(cifras(r).tramo1, 1225);
    cerca(cifras(r).tramo2, 1225);
    cerca(cifras(r).cotizacion, 121.25);
  });

  it('7: cambio en el día 180 sin tope y total aproximado', () => {
    const r = si(entrada('objetivo', '2024-09-01', '2026-09-30', 1600, 12), 0);
    expect(r.diasContrato).toBe(760);
    expect(r.duracionMinimaDias).toBe(240);
    expect(r.tramo2).toBe(true);
    const c = cifras(r);
    cerca(c.tramo1, 1120);
    cerca(c.tramo2, 960);
    cerca(c.cotizacion, 77.6);
    expect(totalAproximado(c.tramo1.minimo, c.tramo2.minimo, r.duracionMinimaDias)).toBeCloseTo(
      8640,
      2,
    );
  });

  it('8: formativo de 183 días, justo en el tope sin superarlo', () => {
    const r = si(entrada('fin_temporal', '2026-04-01', '2026-09-30', 1500, 14, 'formativo'), 0);
    expect(r.diasContrato).toBe(183);
    expect(r.carencia).toBe('depende_vida_laboral');
    expect(r.duracionMinimaDias).toBe(0);
    const c = cifras(r);
    cerca(c.tramo1, 1225);
    cerca(c.tramo2, 1050);
    cerca(c.cotizacion, 84.87);
  });

  it('trunc2 trunca céntimos sin comerse uno por el ruido de coma flotante', () => {
    expect(trunc2(1650.55 * 0.7)).toBe(1155.38);
    expect(trunc2(1750 * 0.0485)).toBe(84.87);
    // 1425 × 0.7 is 997.4999999999999 in binary floating point.
    expect(trunc2(1425 * 0.7)).toBe(997.5);
    expect(cuantias(1425, 0).c1).toBe(997.5);
  });

  it('9: tope mínimo en cuantias (no alcanzable a jornada completa)', () => {
    const h0 = cuantias(700, 0);
    expect(h0.c1).toBeCloseTo(560, 2);
    expect(h0.c2).toBeCloseTo(560, 2);
    const h1 = cuantias(700, 1);
    expect(h1.c1).toBeCloseTo(749, 2);
    expect(h1.c2).toBeCloseTo(749, 2);
  });

  it('hijos sin respuesta: rango entre el tope de 0 hijos y el de 2 o más', () => {
    const c = cifras(si(caso6, null));
    expect(c.tramo1.minimo).toBeCloseTo(1225, 2);
    expect(c.tramo1.maximo).toBeCloseTo(1575, 2);
    expect(c.tramo2.minimo).toBeCloseTo(1225, 2);
    expect(c.tramo2.maximo).toBeCloseTo(1500, 2);
    cerca(c.cotizacion, 121.25);
  });

  it('sin 180 días en este contrato no hay cifras', () => {
    const r = si(entrada('objetivo', '2026-04-04', '2026-09-30', 2000, 14), 0);
    expect(r.diasContrato).toBe(180);
    expect(r.cifras).not.toBeNull();
    const corto = si(entrada('objetivo', '2026-04-05', '2026-09-30', 2000, 14), 0);
    expect(corto.cifras).toBeNull();
    expect(corto.sinCifras).toBe('contrato_corto');
  });

  // Below the 2026 minimum base a full-time job cannot be: it is almost surely part-time.
  it('800 €/mes en 12 pagas: sin cifras, por estar bajo la base mínima', () => {
    const r = si(entrada('objetivo', '2020-01-01', '2026-09-30', 800, 12), 1);
    expect(r.cifras).toBeNull();
    expect(r.sinCifras).toBe('base_bajo_minimo');
    expect(r.duracion).toEqual({ tipo: 'al_menos', dias: 720 });
  });

  it('1.500 € en 14 pagas: con cifras', () => {
    const r = si(entrada('objetivo', '2020-01-01', '2026-09-30', 1500, 14), 1);
    expect(r.sinCifras).toBeNull();
    cerca(cifras(r).tramo1, 1225);
  });

  it('el SMI en 14 pagas (1.424,50 €) aún llega a la base mínima', () => {
    expect(si(entrada('objetivo', '2023-03-15', '2026-09-30', 1221, 14), 0).sinCifras).toBeNull();
  });

  it('con derecho, el art. 268 está entre las fuentes: lo cita el plazo de 15 días', () => {
    const r = si(entrada('objetivo', '2020-01-01', '2026-09-30', 1500, 14), 0);
    expect(r.fuentes.map((x) => x.id)).toContain('lgss268');
  });
});

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

const PROHIBIDAS = /firma|reclama|demanda|está bien|es correcto|tienes derecho/i;

describe('paro: propiedad (300 entradas con semilla)', () => {
  const g = prng(20261006);
  const casos = Array.from({ length: 300 }, () => {
    const causa = g.uno<Causa>([
      'dimision',
      'fin_temporal',
      'objetivo',
      'improcedente',
      'disciplinario',
    ]);
    const baja = desdeOrdinal(g.entero(ordinal(f('2026-01-01')), ordinal(f('2026-12-31'))));
    // Bias towards short contracts so the 180 and 360 day borders get exercised.
    const atras = g.r() < 0.5 ? g.entero(0, 400) : g.entero(0, 12000);
    const alta = desdeOrdinal(ordinal(baja) - atras);
    const prorrateadas = g.r() < 0.4;
    const salario = g.entero(80000, 800000) / 100;
    const e: EntradaFiniquito = {
      ...base,
      causa,
      ...(causa === 'fin_temporal'
        ? { tipoTemporal: g.uno<TipoTemporal>(['circunstancias', 'sustitucion', 'formativo']) }
        : {}),
      fechaAlta: alta,
      fechaBaja: baja,
      salarioMensual: salario,
      pagasProrrateadas: prorrateadas,
      numeroPagas: prorrateadas ? 0 : g.uno([0, 1, 2, 2, 3, 4]),
      importePaga: prorrateadas ? 0 : g.entero(0, 800000) / 100,
    };
    const hijos = g.uno<Hijos>([0, 1, 2, null]);
    return { e, hijos, r: calcularParo(e, hijos) };
  });

  it('derecho «no» si y solo si la causa es la dimisión', () => {
    for (const { e, r } of casos) expect(r.derecho === 'no').toBe(e.causa === 'dimision');
  });

  it('sin cifras con menos de 180 días o con un salario bajo la base mínima', () => {
    for (const { e, r } of casos) {
      if (r.derecho !== 'si') continue;
      const bajo = salarioAnual(e) / 12 < PARO_2026.baseMinAtep;
      expect(r.cifras === null).toBe(r.diasContrato < 180 || bajo);
      expect(r.sinCifras).toBe(
        r.diasContrato < 180 ? 'contrato_corto' : bajo ? 'base_bajo_minimo' : null,
      );
    }
  });

  it('cifras dentro de los topes y tramo 1 ≥ tramo 2', () => {
    for (const { r, hijos } of casos) {
      if (r.derecho !== 'si' || r.cifras === null) continue;
      const lo = hijos === null ? PARO_2026.topeMin[0] : PARO_2026.topeMin[hijos === 0 ? 0 : 1];
      const hi = hijos === null ? PARO_2026.topeMax[2] : PARO_2026.topeMax[hijos];
      const { tramo1, tramo2, cotizacion } = r.cifras;
      for (const t of [tramo1, tramo2]) {
        expect(t.minimo).toBeGreaterThanOrEqual(lo);
        expect(t.maximo).toBeLessThanOrEqual(hi);
        expect(t.minimo).toBeLessThanOrEqual(t.maximo);
      }
      expect(tramo1.minimo).toBeGreaterThanOrEqual(tramo2.minimo);
      expect(tramo1.maximo).toBeGreaterThanOrEqual(tramo2.maximo);
      expect(cotizacion.minimo).toBeGreaterThanOrEqual(69.08);
      expect(cotizacion.maximo).toBeLessThanOrEqual(247.4);
    }
  });

  it('duración y carencia coherentes con los días del contrato', () => {
    for (const { r } of casos) {
      if (r.derecho !== 'si') continue;
      expect(r.diasContrato).toBeLessThanOrEqual(2192);
      expect(r.duracionMinimaDias).toBeLessThanOrEqual(720);
      expect(r.duracionMinimaDias === 0).toBe(r.diasContrato < 360);
      expect(r.carencia === 'cubierta_por_este_contrato').toBe(r.diasContrato >= 360);
      expect(r.tramo2).toBe(r.duracionMinimaDias > 180);
    }
  });

  it('los motivos citan su artículo y no usan palabras prohibidas', () => {
    for (const { r } of casos) {
      expect(r.motivo).toMatch(/art(s)?\. 26[78]/);
      expect(r.motivo).not.toMatch(PROHIBIDAS);
    }
  });

  it('el muestreo cubre los bordes', () => {
    const dias = casos.flatMap(({ r }) => (r.derecho === 'si' ? [r.diasContrato] : []));
    expect(dias.some((d) => d < 180)).toBe(true);
    expect(dias.some((d) => d >= 180 && d < 360)).toBe(true);
    expect(dias.some((d) => d >= 2160)).toBe(true);
  });
});

const periodo = (alta: string, baja: string): PeriodoCotizado => ({
  fechaAlta: f(alta),
  fechaBaja: f(baja),
});

const conOtros = (
  contratos: readonly PeriodoCotizado[],
  paroCobradoDespues: boolean | null,
): OtrosContratos => ({ contratos, paroCobradoDespues });

describe('paro: otros contratos en los últimos 6 años', () => {
  // This contract: 2025-01-01 → 2026-06-30 = 365 + 181 = 546 days.
  const largo = entrada('objetivo', '2025-01-01', '2026-06-30', 2000, 14);

  it('un trabajo a la vez que este no suma días: el solape cuenta una vez', () => {
    // 2025-06-01 → 2025-12-31 lies wholly inside this contract.
    const r = si(largo, 0, conOtros([periodo('2025-06-01', '2025-12-31')], false));
    expect(r.diasContrato).toBe(546);
    expect(r.diasCotizados).toBe(546);
    expect(r.duracion).toEqual({ tipo: 'exacta', dias: 180 });
  });

  it('un solape parcial suma solo los días nuevos', () => {
    // 2024-07-01 → 2025-03-31 overlaps Jan–Mar 2025; new days are Jul–Dec 2024 = 184.
    const r = si(largo, 0, conOtros([periodo('2024-07-01', '2025-03-31')], false));
    expect(r.diasCotizados).toBe(546 + 184);
    expect(r.duracion).toEqual({ tipo: 'exacta', dias: 240 });
  });

  it('dos otros contratos solapados entre sí, repetidos y contiguos cuentan cada día una vez', () => {
    const dias = diasCotizados(f('2026-06-30'), [
      periodo('2023-01-01', '2023-12-31'),
      periodo('2023-06-01', '2024-03-31'),
      periodo('2023-06-01', '2024-03-31'),
      periodo('2024-04-01', '2024-04-30'),
    ]);
    // Union 2023-01-01 → 2024-04-30: 365 + 121 (2024 is leap: 31 + 29 + 31 + 30).
    expect(dias).toBe(486);
  });

  it('sin validar, un periodo que pasa de la baja se recorta y uno al revés no suma', () => {
    const dias = diasCotizados(f('2026-06-30'), [
      periodo('2026-06-01', '2026-12-31'),
      periodo('2025-05-01', '2025-04-01'),
    ]);
    expect(dias).toBe(30);
  });

  // Window for a baja on 2026-09-30: 2020-10-01 → 2026-09-30.
  // This contract: 2025-10-01 → 2026-09-30 = 365 days.
  const anio = entrada('objetivo', '2025-10-01', '2026-09-30', 2000, 14);

  it('un periodo entero fuera de la ventana de 6 años no cuenta', () => {
    const r = si(anio, 0, conOtros([periodo('2019-01-01', '2020-09-30')], false));
    expect(r.diasCotizados).toBe(365);
    expect(r.duracion).toEqual({ tipo: 'exacta', dias: 120 });
  });

  it('un periodo partido por el borde de la ventana cuenta desde el primer día de la ventana', () => {
    // 2020-09-01 → 2020-10-31: only 2020-10-01 → 2020-10-31 = 31 days are inside.
    const r = si(anio, 0, conOtros([periodo('2020-09-01', '2020-10-31')], false));
    expect(r.diasCotizados).toBe(365 + 31);
  });

  // Ekin's example: three 8-month contracts that together reach the 720-day row.
  //   this one   2026-01-01 → 2026-08-31: 31+28+31+30+31+30+31+31 = 243 days
  //   other A    2025-03-01 → 2025-10-31: 31+30+31+30+31+31+30+31 = 245 days
  //   other B    2024-03-01 → 2024-10-31: same months, 245 days
  //   total 243 + 245 + 245 = 733 ≥ 720 → 240 days of benefit (art. 269.1).
  //   Window for 2026-08-31 starts 2020-09-01, so nothing is clipped.
  // Alone, 243 days give no duration (< 360), but ≥ 180 so the figures still show.
  const ocho = entrada('fin_temporal', '2026-01-01', '2026-08-31', 1600, 12, 'circunstancias');
  const ochoOtros = [periodo('2025-03-01', '2025-10-31'), periodo('2024-03-01', '2024-10-31')];

  it('tres contratos de 8 meses: sin paro cobrado después, 240 días exactos', () => {
    const r = si(ocho, 0, conOtros(ochoOtros, false));
    expect(r.diasContrato).toBe(243);
    expect(r.duracionMinimaDias).toBe(0);
    expect(r.diasCotizados).toBe(733);
    expect(r.carencia).toBe('cubierta_con_otros_contratos');
    expect(r.duracion).toEqual({ tipo: 'exacta', dias: 240 });
    expect(r.tramo2).toBe(true);
    cerca(cifras(r).tramo1, 1120);
    cerca(cifras(r).tramo2, 960);
  });

  it('tres contratos de 8 meses: con paro cobrado después, hasta 240 días y la razón', () => {
    const r = si(ocho, 0, conOtros(ochoOtros, true));
    expect(r.diasCotizados).toBe(733);
    expect(r.carencia).toBe('depende_vida_laboral');
    expect(r.duracion.tipo).toBe('hasta');
    expect(r.duracion.dias).toBe(240);
    if (r.duracion.tipo === 'hasta') {
      expect(r.duracion.razon).toContain('art. 269.2');
      expect(r.duracion.razon).not.toMatch(PROHIBIDAS);
    }
  });

  it('tres contratos de 8 meses: «No lo sé» se trata como «hasta»', () => {
    const r = si(ocho, 0, conOtros(ochoOtros, null));
    expect(r.carencia).toBe('depende_vida_laboral');
    expect(r.duracion).toMatchObject({ tipo: 'hasta', dias: 240 });
  });

  it('sin otros contratos se mantiene «al menos» solo por este trabajo', () => {
    for (const otros of [undefined, conOtros([], true), conOtros([], false)]) {
      const r = si(ocho, 0, otros);
      expect(r.duracion).toEqual({ tipo: 'al_menos', dias: 0 });
      expect(r.diasCotizados).toBe(243);
      expect(r.carencia).toBe('depende_vida_laboral');
    }
    expect(si(anio, 0).duracion).toEqual({ tipo: 'al_menos', dias: 120 });
  });

  it('las cifras siguen exigiendo 180 días en este contrato, sumen lo que sumen los otros', () => {
    // 179 days in this contract plus a long earlier one.
    const corto = entrada('objetivo', '2026-04-05', '2026-09-30', 2000, 14);
    const r = si(corto, 0, conOtros([periodo('2022-01-01', '2026-03-31')], false));
    expect(r.diasContrato).toBe(179);
    expect(r.diasCotizados).toBeGreaterThanOrEqual(1620);
    expect(r.cifras).toBeNull();
  });

  it('la dimisión sigue sin derecho aunque haya otros contratos', () => {
    const e = entrada('dimision', '2026-01-01', '2026-08-31', 1600, 12);
    expect(calcularParo(e, 0, conOtros(ochoOtros, false)).derecho).toBe('no');
  });
});

describe('paro: validarOtrosContratos', () => {
  const e = entrada('objetivo', '2025-01-01', '2026-06-30', 2000, 14);

  it('acepta filas dentro del pasado de este contrato, también simultáneas o terminadas el mismo día', () => {
    expect(
      validarOtrosContratos(e, [
        periodo('2020-01-01', '2020-12-31'),
        periodo('2025-06-01', '2026-06-30'),
        periodo('2026-06-30', '2026-06-30'),
      ]),
    ).toEqual([]);
  });

  it('rechaza por fila una baja anterior al alta y una baja posterior a la de este contrato', () => {
    const errores = validarOtrosContratos(e, [
      periodo('2020-01-01', '2020-12-31'),
      periodo('2023-05-01', '2023-04-30'),
      periodo('2026-01-01', '2026-07-01'),
    ]);
    expect(errores.map(({ campo, fila, codigo }) => ({ campo, fila, codigo }))).toEqual([
      { campo: 'otrosContratos.1.fechaBaja', fila: 1, codigo: 'otro_contrato_baja_antes_de_alta' },
      { campo: 'otrosContratos.2.fechaBaja', fila: 2, codigo: 'otro_contrato_baja_posterior' },
    ]);
    for (const { mensaje } of errores) expect(mensaje).not.toMatch(PROHIBIDAS);
  });

  it('rechaza fechas imposibles por fila', () => {
    const errores = validarOtrosContratos(e, [
      { fechaAlta: { y: 2024, m: 2, d: 30 }, fechaBaja: { y: 2024, m: 13, d: 1 } },
    ]);
    expect(errores.map((x) => x.codigo)).toEqual([
      'otro_contrato_fecha_alta_no_valida',
      'otro_contrato_fecha_baja_no_valida',
    ]);
    expect(errores.map((x) => x.campo)).toEqual([
      'otrosContratos.0.fechaAlta',
      'otrosContratos.0.fechaBaja',
    ]);
  });

  it('validar del finiquito no cambia', () => {
    expect(validar(e, f('2026-10-06'))).toEqual([]);
  });
});

describe('paro: propiedad con otros contratos (300 entradas con semilla)', () => {
  const g = prng(20261007);
  // Brute force: the set of worked days inside the window.
  const referencia = (baja: Fecha, periodos: readonly PeriodoCotizado[]): number => {
    const y = baja.y - 6;
    const primero = ordinal({ y, m: baja.m, d: Math.min(baja.d, diasDelMes(y, baja.m)) }) + 1;
    const dias = new Set<number>();
    for (const p of periodos) {
      const hasta = Math.min(ordinal(p.fechaBaja), ordinal(baja));
      for (let n = Math.max(ordinal(p.fechaAlta), primero); n <= hasta; n++) dias.add(n);
    }
    return dias.size;
  };

  const casos = Array.from({ length: 300 }, () => {
    const baja = desdeOrdinal(g.entero(ordinal(f('2026-01-01')), ordinal(f('2026-12-31'))));
    const alta = desdeOrdinal(ordinal(baja) - (g.r() < 0.6 ? g.entero(0, 400) : g.entero(0, 3000)));
    const e: EntradaFiniquito = {
      ...base,
      causa: g.uno<Causa>(['objetivo', 'improcedente', 'disciplinario']),
      fechaAlta: alta,
      fechaBaja: baja,
    };
    const fila = (): PeriodoCotizado => {
      const fin = ordinal(baja) - g.entero(0, 2600);
      return { fechaAlta: desdeOrdinal(fin - g.entero(0, 900)), fechaBaja: desdeOrdinal(fin) };
    };
    const filas = Array.from({ length: g.entero(1, 4) }, fila);
    return { e, filas, extra: fila(), paro: g.uno<boolean | null>([true, false, null]) };
  });

  it('las filas generadas son válidas', () => {
    for (const { e, filas, extra } of casos)
      expect(validarOtrosContratos(e, [...filas, extra])).toEqual([]);
  });

  it('los días cotizados son la unión exacta dentro de la ventana', () => {
    for (const { e, filas } of casos) {
      const todos = [{ fechaAlta: e.fechaAlta, fechaBaja: e.fechaBaja }, ...filas];
      const r = si(e, 0, conOtros(filas, false));
      expect(r.diasCotizados).toBe(referencia(e.fechaBaja, todos));
      expect(r.diasCotizados).toBeGreaterThanOrEqual(r.diasContrato);
      expect(r.diasCotizados).toBeLessThanOrEqual(2192);
    }
  });

  it('añadir un contrato nunca reduce la duración mostrada como máximo', () => {
    for (const { e, filas, extra, paro } of casos) {
      const sinOtros = si(e, 0).duracion.dias;
      const antes = si(e, 0, conOtros(filas, paro)).duracion;
      const despues = si(e, 0, conOtros([...filas, extra], paro)).duracion;
      expect(antes.dias).toBeGreaterThanOrEqual(sinOtros);
      expect(despues.dias).toBeGreaterThanOrEqual(antes.dias);
      expect(despues.tipo).toBe(paro === false ? 'exacta' : 'hasta');
    }
  });

  it('el estado de la duración y la carencia siguen a la respuesta sobre el paro', () => {
    for (const { e, filas, paro } of casos) {
      const r = si(e, 0, conOtros(filas, paro));
      expect(r.duracionMinimaDias).toBe(si(e, 0).duracionMinimaDias);
      expect(r.tramo2).toBe(r.duracion.dias > 180);
      if (r.diasContrato >= 360) expect(r.carencia).toBe('cubierta_por_este_contrato');
      else if (paro === false && r.diasCotizados >= 360)
        expect(r.carencia).toBe('cubierta_con_otros_contratos');
      else expect(r.carencia).toBe('depende_vida_laboral');
    }
  });
});
