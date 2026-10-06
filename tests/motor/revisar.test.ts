import { describe, expect, it } from 'vitest';
import { exacto } from '../../src/motor/dinero';
import { parseFecha as f } from '../../src/motor/fecha';
import { revisarFiniquito, type CifrasEmpresa } from '../../src/motor/revisar';
import type { EntradaFiniquito } from '../../src/motor/tipos';

const HOY = f('2026-10-06');
const base: EntradaFiniquito = {
  causa: 'improcedente',
  fechaAlta: f('2010-03-01'),
  fechaBaja: f('2026-09-15'),
  salarioMensual: 2500,
  pagasProrrateadas: true,
  numeroPagas: 0,
  importePaga: 0,
  devengoPagas: 'no_lo_se',
  diasVacacionesAnuales: 30,
  diasVacacionesDisfrutadas: 10,
};
const con = (o: Partial<EntradaFiniquito>): EntradaFiniquito => ({ ...base, ...o });

const revisar = (e: EntradaFiniquito, c: CifrasEmpresa = {}) => {
  const r = revisarFiniquito(e, c, HOY);
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.revision;
};

describe('revisarFiniquito', () => {
  it('(a) improcedente con 40.000 € de indemnización: por debajo', () => {
    const p = revisar(base, { indemnizacion: 40000 }).partidas.find(
      (x) => x.partida.id === 'indemnizacion',
    );
    expect(p?.estado).toBe('por_debajo');
    expect(p?.diferencia).toBe(7178.08);
  });

  it('(b) baja anterior al alta → error en fechaBaja', () => {
    const r = revisarFiniquito(con({ fechaBaja: f('2009-01-01') }), {}, HOY);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores).toEqual([
        {
          campo: 'fechaBaja',
          codigo: 'baja_antes_de_alta',
          mensaje: 'La fecha de baja es anterior a la de alta',
        },
      ]);
    }
  });

  it('(c) fin temporal sin tipo → error', () => {
    const r = revisarFiniquito(con({ causa: 'fin_temporal' }), {}, HOY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.map((x) => x.campo)).toContain('tipoTemporal');
  });

  it('(d) disciplinario: referencia improcedente y indemnización a 0', () => {
    const rev = revisar(con({ causa: 'disciplinario' }));
    expect(rev.referenciaImprocedente).toBeGreaterThan(0);
    const ind = rev.partidas.find((x) => x.partida.id === 'indemnizacion');
    expect(ind?.partida.rango).toEqual(exacto(0));
    expect(ind?.partida.motivoCero).toBe('disciplinario');
    expect(ind?.partida.fuentes[0]?.id).toBe('et55');
  });

  it.each([
    [{ causa: 'dimision' }, 'dimision', 'et49_1d'],
    [{ causa: 'fin_temporal', tipoTemporal: 'sustitucion' }, 'sustitucion', 'et49_1c'],
    [{ causa: 'fin_temporal', tipoTemporal: 'formativo' }, 'formativo', 'et49_1c'],
    [{ causa: 'fin_temporal', tipoTemporal: 'circunstancias' }, undefined, 'et49_1c'],
    [{ causa: 'improcedente' }, undefined, 'et56'],
  ] as const)('motivo de indemnización cero para %o', (o, motivo, fuente) => {
    const ind = revisar(con(o)).partidas.find((x) => x.partida.id === 'indemnizacion');
    expect(ind?.partida.motivoCero).toBe(motivo);
    expect(ind?.partida.fuentes[0]?.id).toBe(fuente);
  });

  it('(e) un finiquito correcto no sale nunca por debajo', () => {
    const entradas: EntradaFiniquito[] = [
      base,
      con({ causa: 'disciplinario' }),
      con({ causa: 'objetivo', diasPreavisoRecibidos: 5 }),
      con({ causa: 'fin_temporal', tipoTemporal: 'circunstancias' }),
      con({ causa: 'fin_temporal', tipoTemporal: 'formativo', fechaAlta: f('2024-01-10') }),
      con({
        causa: 'dimision',
        pagasProrrateadas: false,
        numeroPagas: 2,
        importePaga: 2500,
        diasPreavisoConvenio: 15,
        diasPreavisoDados: 3,
      }),
      con({ causa: 'objetivo', pagasProrrateadas: false, numeroPagas: 1, importePaga: 2500 }),
    ];
    for (const e of entradas) {
      const sinCifras = revisar(e);
      const cifras: CifrasEmpresa = {};
      for (const p of sinCifras.partidas) {
        if (p.partida.rango) cifras[p.partida.id] = p.partida.rango.maximo;
      }
      const rev = revisar(e, cifras);
      expect(rev.partidas.filter((x) => x.estado === 'por_debajo')).toEqual([]);
    }
  });

  it('(f) noRevisado incluye siempre el neto', () => {
    for (const e of [base, con({ causa: 'dimision' })]) {
      expect(revisar(e).noRevisado).toContain('El neto: retenciones de IRPF y cotizaciones');
    }
  });

  it('pagas extra adicionales solo si hay más de dos', () => {
    const linea = 'Pagas extra además de las dos ordinarias';
    expect(revisar(base).noRevisado).not.toContain(linea);
    const e = con({ pagasProrrateadas: false, numeroPagas: 3, importePaga: 2500 });
    expect(revisar(e).noRevisado).toContain(linea);
  });

  it('rechaza una baja a más de un año vista', () => {
    const r = revisarFiniquito(con({ fechaBaja: f('2028-01-01') }), {}, HOY);
    expect(r.ok).toBe(false);
  });

  it.each([
    ['2014-02-15', '2015-07-16', 3000, 4610.96],
    ['2012-10-10', '2026-10-09', 1825, 27885],
  ])('indemnización en zona CGPJ: %s → %s con %f coincide con %f', (alta, baja, mensual, cifra) => {
    const rev = revisar(con({ fechaAlta: f(alta), fechaBaja: f(baja), salarioMensual: mensual }), {
      indemnizacion: cifra,
    });
    const ind = rev.partidas.find((x) => x.partida.id === 'indemnizacion');
    expect(ind?.estado).toBe('coincide');
    expect(ind?.partida.rango?.minimo).not.toBe(ind?.partida.rango?.maximo);
  });
});
