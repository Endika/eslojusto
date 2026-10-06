import { describe, expect, it } from 'vitest';
import { parseFecha as f } from '../../src/motor/fecha';
import type { EntradaFiniquito } from '../../src/motor/tipos';
import {
  partidaDescuentoPreaviso,
  partidaPagasExtra,
  partidaPreavisoEmpresa,
  partidaSalarioPendiente,
  partidaVacaciones,
  salarioAnual,
} from '../../src/motor/liquidacion';
import { comparar } from '../../src/motor/comparar';

const base: EntradaFiniquito = {
  causa: 'dimision',
  fechaAlta: f('2020-03-01'),
  fechaBaja: f('2026-10-15'),
  salarioMensual: 1500,
  pagasProrrateadas: false,
  numeroPagas: 2,
  importePaga: 1500,
  devengoPagas: 'anual',
  diasVacacionesAnuales: 30,
  diasVacacionesDisfrutadas: 0,
};
const con = (o: Partial<EntradaFiniquito>): EntradaFiniquito => ({ ...base, ...o });
const pagas = (e: EntradaFiniquito) => {
  const p = partidaPagasExtra(e);
  if (p === null) throw new Error('sin partida de pagas');
  return p;
};

describe('salario anual', () => {
  it('14 pagas', () => expect(salarioAnual(base)).toBe(21000));
  it('prorrateadas', () =>
    expect(salarioAnual(con({ pagasProrrateadas: true, salarioMensual: 1750 }))).toBe(21000));
});

describe('salario pendiente', () => {
  it('15 días de octubre: entre 1500×15/31 y 1500×15/30', () => {
    expect(partidaSalarioPendiente(base).rango).toEqual({ minimo: 725.81, maximo: 750 });
  });
  it('el texto da el margen de menor a mayor', () => {
    expect(partidaSalarioPendiente(base).calculo).toContain('de 725,81 € a 750,00 €');
  });
  it('mes completo = salario mensual', () => {
    expect(partidaSalarioPendiente(con({ fechaBaja: f('2026-10-31') })).rango).toEqual({
      minimo: 1500,
      maximo: 1500,
    });
  });
  it('alta en el mismo mes cuenta desde el alta', () => {
    const r = partidaSalarioPendiente(
      con({ fechaAlta: f('2026-10-11'), fechaBaja: f('2026-10-15') }),
    ).rango;
    expect(r).toEqual({ minimo: 241.94, maximo: 250 });
  });
});

describe('vacaciones', () => {
  it('30 días/año, 288 días trabajados en 2026, ninguno disfrutado', () => {
    // por días 30 × 288/365 = 23,671; por meses 30 × 9,5/12 = 23,75; diario entre 50 y 21000/365 = 57,534
    // mínimo 23,671 × 50 = 1183,56; máximo 23,75 × 57,534 = 1366,44
    const p = partidaVacaciones(base);
    expect(p.rango).toEqual({ minimo: 1183.56, maximo: 1366.44 });
    expect(p.dependeDeConvenio).toBe(true);
    expect(p.segunTuDato).toBe(false);
  });
  it('más disfrutadas que devengadas → no comprobable, nunca negativo', () => {
    const p = partidaVacaciones(con({ fechaBaja: f('2026-02-01'), diasVacacionesDisfrutadas: 15 }));
    expect(p.rango).toBeNull();
  });
  it('convenio con 31 días → según tu dato', () => {
    expect(partidaVacaciones(con({ diasVacacionesAnuales: 31 })).segunTuDato).toBe(true);
  });
});

describe('pagas extra', () => {
  it('prorrateadas o sin pagas → no hay partida', () => {
    expect(partidaPagasExtra(con({ pagasProrrateadas: true }))).toBeNull();
    expect(partidaPagasExtra(con({ numeroPagas: 0 }))).toBeNull();
  });
  it('devengo anual a 15-10-2026', () => {
    // verano: por días 107/365 × 1500 = 439,73, por meses 3,5/12 × 1500 = 437,50
    // Navidad: por días 288/365 × 1500 = 1183,56, por meses 9,5/12 × 1500 = 1187,50
    // por días 439,73 + 1183,56 = 1623,29; por meses 437,50 + 1187,50 = 1625,00
    expect(partidaPagasExtra(base)?.rango).toEqual({ minimo: 1623.29, maximo: 1625 });
  });
  it('devengo semestral a 15-10-2026', () => {
    // verano ya cobrada: 0; Navidad 01-07→31-12: por días 107/184 × 1500 = 872,28, por meses 3,5/6 × 1500 = 875
    expect(partidaPagasExtra(con({ devengoPagas: 'semestral' }))?.rango).toEqual({
      minimo: 872.28,
      maximo: 875,
    });
  });
  it('no lo sé → rango entre ambos', () => {
    expect(partidaPagasExtra(con({ devengoPagas: 'no_lo_se' }))?.rango).toEqual({
      minimo: 872.28, // semestral por días
      maximo: 1625, // anual por meses
    });
  });
});

describe('pagas extra: bordes', () => {
  it('una sola paga: rango entre verano y Navidad', () => {
    expect(partidaPagasExtra(con({ numeroPagas: 1 }))?.rango).toEqual({
      minimo: 437.5,
      maximo: 1187.5,
    });
  });
  it('una sola paga, no lo sé: cubre las cuatro opciones', () => {
    expect(partidaPagasExtra(con({ numeroPagas: 1, devengoPagas: 'no_lo_se' }))?.rango).toEqual({
      minimo: 0,
      maximo: 1187.5,
    });
  });
  it('semestral en marzo: verano 01-01→30-06', () => {
    expect(
      partidaPagasExtra(con({ devengoPagas: 'semestral', fechaBaja: f('2026-03-15') }))?.rango,
    ).toEqual({ minimo: 613.26, maximo: 625 }); // 74/181 × 1500 y 2,5/6 × 1500
  });
  it('anual en marzo', () => {
    expect(partidaPagasExtra(con({ fechaBaja: f('2026-03-15') }))?.rango).toEqual({
      // verano 258/365 o 8,5/12; Navidad 74/365 o 2,5/12 (× 1500)
      minimo: 1364.38,
      maximo: 1375,
    });
  });
});

describe('vacaciones: año bisiesto', () => {
  it('289 días de 366', () => {
    expect(partidaVacaciones(con({ fechaBaja: f('2024-10-15') })).rango).toEqual({
      minimo: 1184.43, // 30 × 289/366 × 50
      maximo: 1366.44, // 30 × 9,5/12 × 57,534
    });
  });
});

describe('devengo por meses: nunca un hallazgo inventado', () => {
  const dosMil = con({ salarioMensual: 2000, importePaga: 2000, fechaBaja: f('2026-01-31') });
  it('pagas anuales a 31-01 por meses (7/12 + 1/12 de 2000) entran en el mínimo', () => {
    // por días 215/365 + 31/365 = 1347,95; por meses 2000 × 8/12 = 1333,33
    const r = partidaPagasExtra(dosMil)?.rango;
    expect(r).toEqual({ minimo: 1333.33, maximo: 1347.95 });
    expect(comparar(pagas(dosMil), 1333.33).estado).toBe('coincide');
  });
  it('pagas anuales a 31-08 por meses entran en el mínimo', () => {
    // verano 2/12 × 2000 = 333,33; Navidad 8/12 × 2000 = 1333,33
    const p = pagas(con({ ...dosMil, fechaBaja: f('2026-08-31') }));
    expect(comparar(p, 1666.67).estado).toBe('coincide');
  });
  it('vacaciones a 31-01 a 2,5 días por mes entran en el mínimo', () => {
    // 2,5 días × 2000/30 = 166,67; por días 30 × 31/365 × 2000/30 = 169,86
    const p = partidaVacaciones(dosMil);
    expect(p.rango?.minimo).toBe(166.67);
    expect(comparar(p, 166.67).estado).toBe('coincide');
    expect(p.calculo).toContain('por días naturales o por meses');
  });
});

describe('meses contados desde el alta', () => {
  const alta = con({ fechaAlta: f('2026-03-15'), fechaBaja: f('2026-10-14') });
  it('vacaciones: 7 meses de aniversario entran en el mínimo', () => {
    // por días 30 × 214/365 = 17,589; por meses de calendario 30 × (17/30 + 6 + 14/30)/12 = 17,583;
    // desde el alta 15-03 → 14-10 = 7 meses justos, 30 × 7/12 = 17,5
    // mínimo 17,5 × 50 = 875,00; máximo 17,589 × 21000/365 = 1011,97
    const p = partidaVacaciones(alta);
    expect(p.rango).toEqual({ minimo: 875, maximo: 1011.97 });
    expect(comparar(p, 875).estado).toBe('coincide');
    expect(p.calculo).toContain('por meses desde el alta, × 7/12 = 17,5 días devengados');
  });
  it('pagas anuales: la Navidad desde el alta, el verano sin cambio', () => {
    // verano 01-07→14-10 (el alta queda fuera): por días 106/365 × 1500 = 435,62, por meses 3,467/12 × 1500 = 433,33
    // Navidad 15-03→14-10: por días 214/365 × 1500 = 879,45, por meses 7,033/12 × 1500 = 879,17, desde el alta 7/12 × 1500 = 875
    // por días 1315,07; por meses 1312,50; desde el alta 433,33 + 875 = 1308,33
    const p = pagas(alta);
    expect(p.rango).toEqual({ minimo: 1308.33, maximo: 1315.07 });
    expect(comparar(p, 1308.33).estado).toBe('coincide');
    expect(p.calculo).toContain('7/12 meses desde el alta = 875,00 €');
  });
  it('con el alta fuera del periodo no hay tercera cuenta', () => {
    expect(partidaVacaciones(base).calculo).not.toContain('desde el alta');
    expect(pagas(base).calculo).toContain('se muestran las dos cuentas');
  });
});

describe('una misma cuenta para las dos pagas', () => {
  it('anual a 15-10: el rango no mezcla días en una paga y meses en la otra', () => {
    // antes, por paga: 437,50 + 1183,56 = 1621,06 a 439,73 + 1187,50 = 1627,23
    // ahora: por días 1623,29, por meses 1625,00
    const p = pagas(base);
    expect(p.rango).toEqual({ minimo: 1623.29, maximo: 1625 });
    expect(comparar(p, 1622.28).estado).toBe('por_debajo');
    expect(p.calculo).toContain('Cada cuenta se aplica igual a las dos pagas');
  });
});

describe('vacaciones disfrutadas desconocidas', () => {
  it('null → no comprobable, y lo dice', () => {
    const p = partidaVacaciones(con({ diasVacacionesDisfrutadas: null }));
    expect(p.rango).toBeNull();
    expect(p.faltaDato).toBe('dias_disfrutados');
    expect(p.calculo).toContain(
      'Sin saber cuántos días has disfrutado este año no se puede comprobar',
    );
  });
});

describe('paga cobrada en el mes de la baja', () => {
  it('semestral, baja 31-12: la de Navidad puede ir en la nómina de diciembre', () => {
    const e = con({
      causa: 'fin_temporal',
      fechaAlta: f('2026-01-01'),
      fechaBaja: f('2026-12-31'),
      devengoPagas: 'semestral',
      importePaga: 2000,
    });
    const p = pagas(e);
    expect(p.rango).toEqual({ minimo: 0, maximo: 2000 });
    expect(comparar(p, 0).estado).toBe('coincide');
    expect(p.calculo).toContain('La paga de Navidad se suele cobrar en diciembre');
  });
  it('anual, baja 30-06: la de verano parte de 0, la de Navidad no', () => {
    // Navidad: 181/365 × 1500 = 743,84 o 6/12 × 1500 = 750; verano hasta 1500
    const p = pagas(con({ fechaBaja: f('2026-06-30') }));
    expect(p.rango).toEqual({ minimo: 743.84, maximo: 2250 });
    expect(p.calculo).toContain('La paga de verano se suele cobrar en junio o julio');
  });
  it('fuera de junio, julio y diciembre no se rebaja', () => {
    expect(partidaPagasExtra(base)?.calculo).not.toContain('se suele cobrar');
  });
});

describe('preaviso', () => {
  it('más preaviso del exigido → 0, nunca negativo', () => {
    expect(
      partidaPreavisoEmpresa(con({ causa: 'objetivo', diasPreavisoRecibidos: 20 }))?.rango,
    ).toEqual({ minimo: 0, maximo: 0 });
  });
  it('objetivo sin preaviso: 15 días', () => {
    const p = partidaPreavisoEmpresa(con({ causa: 'objetivo', diasPreavisoRecibidos: 0 }));
    expect(p?.rango).toEqual({ minimo: 750, maximo: 863.01 });
  });
  it('objetivo con 15 días de preaviso → 0', () => {
    expect(
      partidaPreavisoEmpresa(con({ causa: 'objetivo', diasPreavisoRecibidos: 15 }))?.rango,
    ).toEqual({ minimo: 0, maximo: 0 });
  });
  it('temporal de menos de un año no tiene preaviso', () => {
    expect(
      partidaPreavisoEmpresa(con({ causa: 'fin_temporal', fechaAlta: f('2026-01-01') })),
    ).toBeNull();
  });
  it('dimisión sin dato de convenio → descuento no comprobable', () => {
    const p = partidaDescuentoPreaviso(base);
    expect(p?.sentido).toBe('descuento');
    expect(p?.rango).toBeNull();
  });
  it('dimisión con 15 días de convenio y 5 dados → descuento máximo 10 días', () => {
    expect(
      partidaDescuentoPreaviso(con({ diasPreavisoConvenio: 15, diasPreavisoDados: 5 }))?.rango,
    ).toEqual({ minimo: 0, maximo: 575.34 });
  });
});
