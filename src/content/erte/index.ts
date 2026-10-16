import { DEFAULT_LANG, type Lang } from '../../i18n/languages';
import type { ErteCopy } from './copy';

export * from './es';
export type { ErteBlock, ErteCopy, ErteView } from './copy';

// Each language's copy, by its file: es.ts, eu.ts… A language without one reads in Spanish, which
// only an unpublished language may do.
const COPIES = import.meta.glob<ErteCopy>('./[a-z][a-z].ts', { eager: true, import: 'ERTE' });

export const erteCopy = (lang: Lang): ErteCopy => {
  const copy = COPIES[`./${lang}.ts`] ?? COPIES[`./${DEFAULT_LANG}.ts`];
  if (!copy) throw new Error('No ERTE copy');
  return copy;
};
