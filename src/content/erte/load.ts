import type { ErteCopy } from './copy';
import { ERTE } from './es';

// The browser's copy of the page's language: Spanish ships in the script, any other is a chunk of
// its own, fetched only on its page.
const OTHERS = import.meta.glob<ErteCopy>(['./[a-z][a-z].ts', '!./es.ts'], { import: 'ERTE' });

export const loadErteCopy = async (lang: string): Promise<ErteCopy> =>
  (await OTHERS[`./${lang}.ts`]?.()) ?? ERTE;
