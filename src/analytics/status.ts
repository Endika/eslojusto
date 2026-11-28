// The status every reading of a point gives, or `readings` when a «No lo sé» splits them.
export function soleStatus<T extends string>(statuses: ReadonlySet<T>): T | 'readings' {
  const [only, ...others] = statuses;
  return only !== undefined && others.length === 0 ? only : 'readings';
}
