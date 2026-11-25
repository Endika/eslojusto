// Half a cent rounds away from zero. Reading the cents at 12 significant digits first drops
// the binary error that turns 8.325 into 832.4999…; EPSILON was too small for it above 1 €.
export const round2 = (euros: number): number =>
  (Math.sign(euros) * Math.round(Number((Math.abs(euros) * 100).toPrecision(12)))) / 100;

export interface Range {
  readonly min: number;
  readonly max: number;
}

export const exact = (v: number): Range => ({ min: round2(v), max: round2(v) });

export const between = (a: number, b: number): Range => ({
  min: round2(Math.min(a, b)),
  max: round2(Math.max(a, b)),
});
