export const redondear = (euros: number): number =>
  Math.round((euros + Number.EPSILON) * 100) / 100;

export interface Rango {
  readonly minimo: number;
  readonly maximo: number;
}

export const exacto = (v: number): Rango => ({ minimo: redondear(v), maximo: redondear(v) });

export const entre = (a: number, b: number): Rango => ({
  minimo: redondear(Math.min(a, b)),
  maximo: redondear(Math.max(a, b)),
});

export const num = (n: number, dec = 2): string =>
  new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
    useGrouping: 'always',
  }).format(n);

export const dias = (n: number): string =>
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' }).format(n);
