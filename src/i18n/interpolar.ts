export type Variables = Readonly<Record<string, string | number>>;

// `{nombre}` takes its variable; a placeholder without one stays, so a template can be split later.
export const interpolar = (plantilla: string, vars: Variables = {}): string =>
  plantilla.replace(/\{(\w+)\}/g, (marca, nombre: string) =>
    nombre in vars ? String(vars[nombre]) : marca,
  );
