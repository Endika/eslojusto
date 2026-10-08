// Deep equality of the findings of two readings; plain data only.
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (k) =>
      Object.hasOwn(b, k) &&
      same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

export type Across<Question extends string, World extends string, F> =
  | { readonly kind: 'single'; readonly finding: F }
  | {
      readonly kind: 'readings';
      readonly question: Question;
      readonly readings: readonly { readonly when: World; readonly finding: F }[];
    };

// Assesses one point in each world; when every world agrees the answer did not matter.
export function assessAcross<Question extends string, World extends string, F>(
  question: Question,
  worlds: readonly World[],
  assess: (world: World) => F,
): Across<Question, World, F> {
  const readings = worlds.map((when) => ({ when, finding: assess(when) }));
  const [first, ...rest] = readings;
  if (first === undefined) throw new RangeError(`No reading to assess for ${question}`);
  if (rest.every((r) => same(r.finding, first.finding)))
    return { kind: 'single', finding: first.finding };
  return { kind: 'readings', question, readings };
}
