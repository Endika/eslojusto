import { describe, expect, it } from 'vitest';
import { calcularIndemnizacion } from '../../src/motor/indemnizacion';
import { parseFecha as f } from '../../src/motor/fecha';

const anual = (mensual: number) => mensual * 12;
const caso = (
  causa: 'improcedente' | 'objetivo',
  alta: string,
  baja: string,
  salarioAnual: number,
) => calcularIndemnizacion({ causa, fechaAlta: f(alta), fechaBaja: f(baja), salarioAnual });

describe('improcedente — oráculo CGPJ', () => {
  it.each([
    ['2010-03-01', '2026-09-15', 30000, 47178.08, false],
    ['1990-01-01', '2026-06-30', 40000, 109315.07, false], // tramo 1 > 720 días: manda el tramo 1
    ['2000-01-01', '2026-09-30', 35000, 69041.1, true], // 1031,5 días → tope 720
    ['2025-06-15', '2026-10-02', 22000, 2652.05, false],
    ['2024-01-01', '2024-04-01', 18000, 542.47, false],
    ['2005-01-01', '2026-09-30', 50000, 98630.14, true],
    ['2012-02-11', '2012-02-12', 20000, 356.16, false], // doble cómputo de la guía §4.b
    ['2018-05-03', '2026-07-20', anual(1500), 13426.03, false],
    ['1985-02-01', '2026-08-31', 28000, 93493.15, false], // 1218,75 días, bajo 1260
  ])('%s → %s, %i €/año = %f €', (alta, baja, salario, esperado, tope) => {
    const r = caso('improcedente', alta, baja, salario);
    expect(r.importe).toBe(esperado);
    expect(r.topeAplicado).toBe(tope);
  });

  it('1260 días como máximo absoluto', () => {
    const r = caso('improcedente', '1970-01-01', '2026-09-30', 36500);
    expect(r.diasDeSalario).toBe(1260);
    expect(r.importe).toBe(126000);
  });
});

describe('objetivo — oráculo CGPJ', () => {
  it.each([
    ['2010-03-01', '2026-09-15', 30000, 27260.27, false],
    ['1990-01-01', '2026-06-30', 40000, 39452.05, true],
    ['2000-01-01', '2026-09-30', 35000, 34520.55, true],
    ['2025-06-15', '2026-10-02', 22000, 1607.31, false],
    ['2024-01-01', '2024-04-01', 18000, 328.77, false],
    ['2018-05-03', '2026-07-20', anual(1500), 8136.99, false],
  ])('%s → %s, %i €/año = %f €', (alta, baja, salario, esperado, tope) => {
    const r = caso('objetivo', alta, baja, salario);
    expect(r.importe).toBe(esperado);
    expect(r.topeAplicado).toBe(tope);
  });
});

describe('fin de contrato temporal (guía §9)', () => {
  const temporal = (
    alta: string,
    baja: string,
    tipoTemporal?: 'circunstancias' | 'sustitucion' | 'formativo',
  ) =>
    calcularIndemnizacion({
      causa: 'fin_temporal',
      fechaAlta: f(alta),
      fechaBaja: f(baja),
      salarioAnual: 36500,
      tipoTemporal,
    });

  it('12 días por año en proporción a los días reales desde 2015', () => {
    // 100 € diarios × 365 días × 12/365 = 1200 €
    expect(temporal('2025-01-01', '2025-12-31').importe).toBe(1200);
    // 100 × 181 × 12/365 = 595,07
    expect(temporal('2026-01-01', '2026-06-30').importe).toBe(595.07);
  });
  it.each([
    ['2011-06-01', '2012-05-31', 366, 8],
    ['2012-06-01', '2013-05-31', 365, 9],
    ['2013-06-01', '2014-05-31', 365, 10],
    ['2014-06-01', '2015-05-31', 365, 11],
    ['2015-01-01', '2015-12-31', 365, 12],
  ])('contrato de %s a %s (%i días) → %i días por año', (alta, baja, dias, n) => {
    const r = temporal(alta, baja);
    expect(r.importe).toBe(Math.round(((100 * dias * n) / 365) * 100) / 100);
    expect(r.detalle).toContain(`${n}/365`);
  });
  it('sustitución y formativo no tienen indemnización', () => {
    expect(temporal('2025-01-01', '2025-12-31', 'sustitucion').importe).toBe(0);
    expect(temporal('2025-01-01', '2025-12-31', 'formativo').importe).toBe(0);
  });
});

describe('sin indemnización', () => {
  it.each(['dimision', 'disciplinario'] as const)('%s → 0', (causa) => {
    const r = calcularIndemnizacion({
      causa,
      fechaAlta: f('2015-01-01'),
      fechaBaja: f('2026-01-01'),
      salarioAnual: 30000,
    });
    expect(r.importe).toBe(0);
    expect(r.fuentes.length).toBeGreaterThan(0);
  });
});

describe('rango por desacuerdo entre la calculadora del CGPJ y su guía', () => {
  it('resto de 2 días: la guía suma un mes y la calculadora no', () => {
    const imp = caso('improcedente', '2014-02-15', '2015-07-16', 35938);
    expect(imp.importe).toBe(4873.78);
    expect(imp.rango).toEqual({ minimo: 4603.02, maximo: 4873.78 });
    const obj = caso('objetivo', '2014-02-15', '2015-07-16', 35938);
    expect(obj.importe).toBe(2953.81);
    expect(obj.rango).toEqual({ minimo: 2789.71, maximo: 2953.81 });
  });
  it('aniversario exacto con inicio distinto del día 1: la calculadora suma un mes', () => {
    const r = caso('improcedente', '2012-10-10', '2026-10-09', 21900);
    expect(r.importe).toBe(27720);
    expect(r.rango).toEqual({ minimo: 27720, maximo: 27885 });
  });
  it('fuera del borde el rango es el propio importe y no hay nota', () => {
    const r = caso('improcedente', '2010-03-01', '2026-09-15', 30000);
    expect(r.rango).toEqual({ minimo: r.importe, maximo: r.importe });
    expect(r.detalle).not.toContain('La calculadora del CGPJ');
  });
  it('la nota aparece solo cuando el rango no es degenerado', () => {
    const r = caso('objetivo', '2014-02-15', '2015-07-16', 35938);
    expect(r.detalle).toContain(
      'La calculadora del CGPJ y su guía cuentan distinto los meses en este caso (un mes de diferencia); por eso damos un margen entre ambas cifras.',
    );
  });
  it('sin cómputo de meses el rango es exacto', () => {
    const r = calcularIndemnizacion({
      causa: 'dimision',
      fechaAlta: f('2015-01-01'),
      fechaBaja: f('2026-01-01'),
      salarioAnual: 30000,
    });
    expect(r.rango).toEqual({ minimo: 0, maximo: 0 });
  });
});

describe('la primera fuente de una indemnización cero es la norma que la deja en cero', () => {
  const base = { fechaAlta: f('2015-01-01'), fechaBaja: f('2026-01-01'), salarioAnual: 30000 };
  it.each([
    ['dimision', undefined, 'et49_1d', 'Estatuto de los Trabajadores, art. 49.1.d'],
    ['disciplinario', undefined, 'et55', 'Estatuto de los Trabajadores, art. 55.7'],
    ['fin_temporal', 'sustitucion', 'et49_1c', 'Estatuto de los Trabajadores, art. 49.1.c'],
    ['fin_temporal', 'formativo', 'et49_1c', 'Estatuto de los Trabajadores, art. 49.1.c'],
  ] as const)('%s %s → %s', (causa, tipoTemporal, id, norma) => {
    const r = calcularIndemnizacion({ ...base, causa, tipoTemporal });
    expect(r.importe).toBe(0);
    expect(r.fuentes[0]?.id).toBe(id);
    expect(r.fuentes[0]?.norma).toBe(norma);
  });
  it('el disciplinario conserva el art. 56 para la referencia de improcedente', () => {
    const r = calcularIndemnizacion({ ...base, causa: 'disciplinario' });
    expect(r.fuentes.map((x) => x.id)).toContain('et56');
  });
});
