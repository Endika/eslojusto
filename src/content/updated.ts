import { LANGS } from '../i18n/languages';
import { PATH as RENT_INDICES, lastChanged } from './rent-indices';

// The day each page's content last changed, for the sitemap's lastmod. Update a page's date only
// when its content changes: a date that moves on every build teaches Google to ignore it.
export const LAST_UPDATED: Readonly<Record<string, string>> = {
  '/': '2026-10-14',
  '/finiquito/': '2026-10-09',
  '/aviso-legal/': '2026-10-11',
  '/privacidad/': '2026-10-14',
  // Moves with the INE's newest figure on the page and with each check of its norms.
  [RENT_INDICES]: lastChanged(),
  '/finiquito/baja-voluntaria/': '2026-10-07',
  '/finiquito/despido-improcedente/': '2026-10-07',
  '/finiquito/fin-de-contrato/': '2026-10-07',
  '/finiquito/firmar-no-conforme/': '2026-10-07',
  '/finiquito/despido-objetivo/': '2026-10-07',
  '/paro/': '2026-10-09',
  '/paro/por-tiempo-trabajado/': '2026-10-07',
  '/paro/baja-voluntaria/': '2026-10-07',
  '/paro/despido-disciplinario/': '2026-10-07',
  '/alquiler/': '2026-10-09',
  '/alquiler/subida/': '2026-10-09',
  '/alquiler/decreto-2026/': '2026-10-09',
  '/alquiler/honorarios-inmobiliaria/': '2026-10-09',
  '/alquiler/fianza/': '2026-10-09',
  '/alquiler/devolucion-fianza/': '2026-10-09',
  '/alquiler/gastos/': '2026-10-09',
  '/contrato/': '2026-10-09',
  '/paro/erte/': '2026-10-09',
  '/empleada-de-hogar/': '2026-10-09',
  '/seguros/': '2026-10-11',
  '/financiacion/': '2026-10-11',
  '/hipoteca/': '2026-10-11',
  '/facturas/': '2026-10-14',
  '/facturas/luz/': '2026-10-14',
  '/facturas/permanencia/': '2026-10-14',
};

// A page in another language changes when its Spanish one does: `/eu/paro/` reads `/paro/`.
const LANG_PREFIX = new RegExp(`^/(${Object.keys(LANGS).join('|')})(?=/)`);
export const lastUpdated = (path: string): string | undefined =>
  LAST_UPDATED[path.replace(LANG_PREFIX, '')];
