import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { DEFAULT_LANG, builtLangs } from './src/i18n/languages.ts';
import { LAST_UPDATED } from './src/content/updated.ts';

const base = process.env.BASE ?? '/';
const root = base.replace(/\/?$/, '/');

export default defineConfig({
  site: process.env.SITE ?? 'https://eslojusto.es',
  base,
  trailingSlash: 'always',
  // Published languages only; ar-test joins under TEST_RTL=1 to prove the RTL layout.
  i18n: {
    locales: builtLangs(),
    defaultLocale: DEFAULT_LANG,
    routing: { prefixDefaultLocale: false },
  },
  // The pseudo-locale is never indexed, not even in a TEST_RTL=1 build.
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/ar-test/'),
      serialize: (item) => {
        const path = `/${new URL(item.url).pathname.slice(root.length)}`;
        return LAST_UPDATED[path] ? { ...item, lastmod: LAST_UPDATED[path] } : item;
      },
    }),
  ],
  // The stylesheet goes inline so the first paint waits on the HTML alone; the CSP allows inline
  // styles. Inlined fonts or scripts would land as data: or inline code that the CSP rejects.
  build: { inlineStylesheets: 'always' },
  vite: { build: { assetsInlineLimit: 0 } },
});
