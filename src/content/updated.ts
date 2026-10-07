import { PATH as RENT_INDICES, lastChanged } from './rent-indices';

// The day each page's content last changed, for the sitemap's lastmod. Update a page's date only
// when its content changes: a date that moves on every build teaches Google to ignore it.
export const LAST_UPDATED: Readonly<Record<string, string>> = {
  '/': '2026-10-07',
  '/finiquito/': '2026-10-07',
  '/aviso-legal/': '2026-10-07',
  '/privacidad/': '2026-10-07',
  // Moves with the INE's newest figure on the page and with each check of its norms.
  [RENT_INDICES]: lastChanged(),
};
