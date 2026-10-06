import type { Clave } from './es';
import { interpolar, type Variables } from './interpolar';

export type ClaveCliente = Extract<Clave, `cli.${string}`>;
export type Traducir = (clave: ClaveCliente, vars?: Variables) => string;

export const traductor =
  (textos: Partial<Record<string, string>>): Traducir =>
  (clave, vars) =>
    interpolar(textos[clave] ?? clave, vars);

// Base.astro writes the page language's `cli.` strings into #textos; the scripts read them here.
export function traductorDeLaPagina(): Traducir {
  const datos = document.getElementById('textos')?.textContent ?? '{}';
  return traductor(JSON.parse(datos) as Record<string, string>);
}
