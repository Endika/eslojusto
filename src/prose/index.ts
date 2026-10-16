import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import { DEFAULT_LANG, type Lang } from '../i18n/languages';

// Long prose, with markup and figures woven in, is written once per language rather than cut into
// dictionary keys: src/prose/<lang>/<page>.astro, a translated copy of the Spanish file. A page
// not yet translated reads in Spanish, which only an unpublished language may do; a test holds a
// published one to every page.
const FILES = import.meta.glob<{ default: AstroComponentFactory }>('./*/*.astro', {
  eager: true,
});

export const prose = (lang: Lang, page: string): AstroComponentFactory => {
  const file = FILES[`./${lang}/${page}.astro`] ?? FILES[`./${DEFAULT_LANG}/${page}.astro`];
  if (!file) throw new Error(`No prose for ${page}`);
  return file.default;
};
