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
