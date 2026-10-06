export const round2 = (euros: number): number => Math.round((euros + Number.EPSILON) * 100) / 100;

export interface Range {
  readonly min: number;
  readonly max: number;
}

export const exact = (v: number): Range => ({ min: round2(v), max: round2(v) });

export const between = (a: number, b: number): Range => ({
  min: round2(Math.min(a, b)),
  max: round2(Math.max(a, b)),
});

export const num = (n: number, dec = 2): string =>
  new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
    useGrouping: 'always',
  }).format(n);

export const days = (n: number): string =>
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' }).format(n);
