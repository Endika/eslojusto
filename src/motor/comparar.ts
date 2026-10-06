import { redondear } from './dinero';
import type { Partida } from './tipos';

export const MARGEN_EUROS = 1;

export type Estado =
  | 'por_debajo'
  | 'coincide'
  | 'por_encima'
  | 'descuento_mayor'
  | 'descuento_dentro'
  | 'no_comprobable'
  | 'sin_cifra_empresa';

export interface ResultadoPartida {
  readonly partida: Partida;
  readonly cifraEmpresa: number | null;
  readonly estado: Estado;
  readonly diferencia: number | null;
}

export function comparar(partida: Partida, cifraEmpresa: number | null): ResultadoPartida {
  const r = (estado: Estado, diferencia: number | null = null): ResultadoPartida => ({
    partida,
    cifraEmpresa,
    estado,
    diferencia,
  });
  const { rango } = partida;
  if (rango === null) return r('no_comprobable');
  if (cifraEmpresa === null) return r('sin_cifra_empresa');
  if (partida.sentido === 'descuento') {
    const exceso = redondear(cifraEmpresa - rango.maximo);
    return exceso > MARGEN_EUROS ? r('descuento_mayor', exceso) : r('descuento_dentro');
  }
  const falta = redondear(rango.minimo - cifraEmpresa);
  if (falta > MARGEN_EUROS) return r('por_debajo', falta);
  if (redondear(cifraEmpresa - rango.maximo) > MARGEN_EUROS) return r('por_encima');
  return r('coincide');
}
