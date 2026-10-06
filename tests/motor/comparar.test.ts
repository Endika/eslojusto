import { describe, expect, it } from 'vitest';
import { comparar } from '../../src/motor/comparar';
import type { Partida } from '../../src/motor/tipos';

const abono = (minimo: number, maximo: number): Partida => ({
  id: 'vacaciones',
  titulo: 'Vacaciones',
  sentido: 'abono',
  rango: { minimo, maximo },
  calculo: '',
  dependeDeConvenio: false,
  segunTuDato: false,
  fuentes: [],
});

describe('comparar', () => {
  it.each([
    [1000, 1100, 900, 'por_debajo', 100],
    [1000, 1100, 999.5, 'coincide', null], // redondeo, dentro del margen de 1 €
    [1000, 1100, 1050, 'coincide', null],
    [1000, 1100, 1101, 'coincide', null],
    [1000, 1100, 1200, 'por_encima', null],
    [1000.01, 1100, 999.01, 'coincide', null],
    [1000.01, 1100, 999, 'por_debajo', 1.01],
    [1000, 1100.2, 1101.2, 'coincide', null],
  ])('[%f, %f] con %f → %s', (min, max, cifra, estado, dif) => {
    const r = comparar(abono(min, max), cifra);
    expect(r.estado).toBe(estado);
    if (dif !== null) expect(r.diferencia).toBe(dif);
  });
  it('sin rango → no comprobable aunque haya cifra', () => {
    expect(comparar({ ...abono(0, 0), rango: null }, 500).estado).toBe('no_comprobable');
  });
  it('sin cifra → sin_cifra_empresa', () => {
    expect(comparar(abono(1, 2), null).estado).toBe('sin_cifra_empresa');
  });
  it('descuento mayor que el permitido', () => {
    const d: Partida = { ...abono(0, 500), id: 'descuento_preaviso', sentido: 'descuento' };
    expect(comparar(d, 700)).toMatchObject({ estado: 'descuento_mayor', diferencia: 200 });
    expect(comparar(d, 400).estado).toBe('descuento_dentro');
  });
  it('descuento: el margen de 1 € se aplica sobre el hueco redondeado', () => {
    const d: Partida = { ...abono(0, 500.1), id: 'descuento_preaviso', sentido: 'descuento' };
    expect(comparar(d, 501.1).estado).toBe('descuento_dentro');
    expect(comparar(d, 501.11)).toMatchObject({ estado: 'descuento_mayor', diferencia: 1.01 });
  });
});
