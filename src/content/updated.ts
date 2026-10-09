import { PATH as RENT_INDICES, lastChanged } from './rent-indices';

// The day each page's content last changed, for the sitemap's lastmod. Update a page's date only
// when its content changes: a date that moves on every build teaches Google to ignore it.
// /alquiler/ exists only in a PUBLIC_RENTAL=1 build. The Astro config reads this file in Node,
// before any import.meta.env, so the switch is read from the process as the build sets it.
const rentalBuild = process.env['PUBLIC_RENTAL'] === '1';
// /contrato/ likewise exists only in a PUBLIC_EMPLOYMENT=1 build.
const employmentBuild = process.env['PUBLIC_EMPLOYMENT'] === '1';
// /paro/erte/ likewise exists only in a PUBLIC_ERTE=1 build.
const erteBuild = process.env['PUBLIC_ERTE'] === '1';
// /empleada-de-hogar/ likewise exists only in a PUBLIC_HOUSEHOLD=1 build.
const householdBuild = process.env['PUBLIC_HOUSEHOLD'] === '1';

export const LAST_UPDATED: Readonly<Record<string, string>> = {
  '/': '2026-10-07',
  '/finiquito/': '2026-10-09',
  '/aviso-legal/': '2026-10-07',
  '/privacidad/': '2026-10-07',
  // Moves with the INE's newest figure on the page and with each check of its norms.
  [RENT_INDICES]: lastChanged(),
  '/finiquito/baja-voluntaria/': '2026-10-07',
  '/finiquito/despido-improcedente/': '2026-10-07',
  '/finiquito/fin-de-contrato/': '2026-10-07',
  '/finiquito/firmar-no-conforme/': '2026-10-07',
  '/finiquito/despido-objetivo/': '2026-10-07',
  '/paro/': '2026-10-07',
  '/paro/por-tiempo-trabajado/': '2026-10-07',
  '/paro/baja-voluntaria/': '2026-10-07',
  '/paro/despido-disciplinario/': '2026-10-07',
  ...(rentalBuild
    ? {
        '/alquiler/': '2026-10-09',
        '/alquiler/subida/': '2026-10-09',
        '/alquiler/decreto-2026/': '2026-10-09',
        '/alquiler/honorarios-inmobiliaria/': '2026-10-09',
        '/alquiler/fianza/': '2026-10-09',
        '/alquiler/devolucion-fianza/': '2026-10-09',
        '/alquiler/gastos/': '2026-10-09',
      }
    : {}),
  ...(employmentBuild ? { '/contrato/': '2026-10-08' } : {}),
  ...(erteBuild ? { '/paro/erte/': '2026-10-09' } : {}),
  ...(householdBuild ? { '/empleada-de-hogar/': '2026-10-09' } : {}),
};
