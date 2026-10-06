import { es, type Clave } from './es';
import type { Idioma } from './idiomas';
import { interpolar, type Variables } from './interpolar';

export type { Clave } from './es';
export type { Idioma } from './idiomas';

// Arabic-script markers around the Spanish text: every string reads right to left, and an
// untranslated one (a literal left in a component) stands out at a glance.
const pseudoRtl = (texto: string): string => `ع\u200f ${texto} \u200fع`;

export const DICCIONARIOS: Record<Idioma, Readonly<Record<Clave, string>>> = {
  es,
  'ar-test': Object.fromEntries(
    Object.entries(es).map(([clave, texto]) => [clave, pseudoRtl(texto)]),
  ) as Record<Clave, string>,
};

export function t(idioma: Idioma, clave: Clave, vars?: Variables): string {
  return interpolar(DICCIONARIOS[idioma][clave], vars);
}

// The strings the browser scripts need, for the page to ship as JSON.
export const textosCliente = (idioma: Idioma): Partial<Record<Clave, string>> =>
  Object.fromEntries(
    Object.entries(DICCIONARIOS[idioma]).filter(([clave]) => clave.startsWith('cli.')),
  );
