export function required<T extends Element>(el: T | null, what: string): T {
  if (!el) throw new Error(`Missing ${what}`);
  return el;
}
