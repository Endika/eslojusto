export type Variables = Readonly<Record<string, string | number>>;

// `{name}` takes its variable; a placeholder without one stays, so a template can be split later.
// Placeholder names live in the dictionary's Spanish values (`{importe}`, `{dias}`…), so callers
// pass them under those names.
export const interpolate = (template: string, vars: Variables = {}): string =>
  template.replace(/\{(\w+)\}/g, (mark, name: string) =>
    name in vars ? String(vars[name]) : mark,
  );
