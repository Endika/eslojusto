import { DEFAULT_LANG, type Lang } from '../../i18n/languages';
import type { RentalPagesCopy } from './es';

export * from './es';

// Each language's words, by its file: es.ts, eu.ts… A language without one reads in Spanish, which
// only an unpublished language may do.
const COPIES = import.meta.glob<RentalPagesCopy>('./[a-z][a-z].ts', {
  eager: true,
  import: 'RENTAL_COPY',
});

export const rentalPagesCopy = (lang: Lang): RentalPagesCopy => {
  const copy = COPIES[`./${lang}.ts`] ?? COPIES[`./${DEFAULT_LANG}.ts`];
  if (!copy) throw new Error('No rental pages copy');
  return copy;
};
