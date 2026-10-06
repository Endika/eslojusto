import { describe, expect, it } from 'vitest';
import {
  diasNaturales,
  mesesAniversario,
  mesesCompletosYResto,
  mesesProrrateados,
  parseFecha as f,
  sumarMesesRecortando,
  aIso,
} from '../../src/motor/fecha';

describe('diasNaturales', () => {
  it.each([
    ['2010-03-01', '2026-09-15', 6043],
    ['2024-01-01', '2024-04-01', 92],
    ['2012-02-11', '2012-02-12', 2],
    ['2018-05-03', '2026-07-20', 3001],
    ['2024-02-29', '2025-02-28', 366],
    ['2026-10-06', '2026-10-06', 1],
  ])('%s → %s = %i días (ambos incluidos)', (a, b, n) => {
    expect(diasNaturales(f(a), f(b))).toBe(n);
  });
});

describe('mesesProrrateados (guía CGPJ §4.a)', () => {
  it.each([
    ['2025-01-01', '2025-02-02', 2], // ejemplo literal de la guía
    ['2025-01-01', '2025-03-04', 3], // ejemplo literal de la guía
    ['2016-01-01', '2016-04-01', 4], // ejemplo literal de la guía
    ['2010-03-01', '2026-09-15', 199], // CGPJ
    ['1990-01-01', '2026-06-30', 438], // CGPJ
    ['2025-06-15', '2026-10-02', 16], // CGPJ
    ['2018-05-03', '2026-07-20', 99], // CGPJ
    ['2020-01-01', '2025-12-31', 72], // CGPJ
    ['2025-01-31', '2025-02-28', 2], // CGPJ, alta un 31
    ['2025-01-31', '2025-03-01', 2], // CGPJ
    ['2025-01-31', '2025-04-30', 4], // CGPJ
    ['2024-02-29', '2025-02-28', 13], // CGPJ, alta en bisiesto
    ['2025-01-30', '2025-02-28', 2], // CGPJ
    ['2025-01-16', '2025-02-14', 1], // CGPJ
    ['2020-03-15', '2026-03-13', 72], // CGPJ
    ['1999-05-31', '2008-02-29', 106], // CGPJ, alta un 31 y baja en bisiesto
    ['2013-12-30', '2026-02-28', 147], // CGPJ
    ['1993-11-20', '2026-06-19', 391], // CGPJ
    ['2012-02-11', '2012-02-11', 1],
  ])('%s → %s = %i meses', (a, b, n) => {
    expect(mesesProrrateados(f(a), f(b))).toBe(n);
  });

  it('diverge a la baja del CGPJ en el aniversario exacto con día de alta ≠ 1', () => {
    // La herramienta del CGPJ da 2, 73 y 169; su propia guía da 1, 72 y 168.
    expect(mesesProrrateados(f('2025-01-16'), f('2025-02-15'))).toBe(1);
    expect(mesesProrrateados(f('2020-03-15'), f('2026-03-14'))).toBe(72);
    expect(mesesProrrateados(f('2012-10-10'), f('2026-10-09'))).toBe(168);
  });
});

describe('fechas', () => {
  it('recorta al último día del mes', () => {
    expect(aIso(sumarMesesRecortando(f('2025-01-31'), 1))).toBe('2025-02-28');
    expect(aIso(sumarMesesRecortando(f('2024-01-31'), 1))).toBe('2024-02-29');
  });
  it('rechaza fechas que no existen', () => {
    expect(() => f('2025-02-29')).toThrow(RangeError);
    expect(() => f('2025-13-01')).toThrow(RangeError);
    expect(() => f('1-1-2025')).toThrow(RangeError);
  });
});

describe('mesesCompletosYResto', () => {
  it.each([
    ['2014-02-15', '2015-07-16', 17, 2],
    ['2014-02-15', '2015-07-14', 17, 0],
    ['2025-01-31', '2025-02-28', 1, 1],
  ])('%s → %s = %i meses y %i días', (a, b, completos, resto) => {
    expect(mesesCompletosYResto(f(a), f(b))).toEqual({ completos, resto });
  });
});

describe('mesesAniversario', () => {
  it.each([
    ['2026-03-15', '2026-10-14', 7],
    ['2026-03-15', '2026-06-30', 3 + 16 / 30],
    ['2026-03-15', '2026-03-15', 1 / 30],
  ])('%s → %s = %f meses', (a, b, meses) => {
    expect(mesesAniversario(f(a), f(b))).toBeCloseTo(meses, 10);
  });
});
