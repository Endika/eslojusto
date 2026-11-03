import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { DEFAULT_LANG, LANGS, builtLangs } from './src/i18n/languages.ts';
import { lastUpdated } from './src/content/updated.ts';
import { wholeDatesInHtml } from './src/scripts/whole-dates.ts';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE ?? '/';
const root = base.replace(/\/?$/, '/');
const unpublished = Object.keys(LANGS).filter((lang) => !LANGS[lang].published);

export default defineConfig({
  site: process.env.SITE ?? 'https://eslojusto.es',
  base,
  trailingSlash: 'always',
  // Published languages, and ar-test under TEST_RTL=1 to prove the RTL layout.
  i18n: {
    locales: builtLangs(),
    defaultLocale: DEFAULT_LANG,
    routing: { prefixDefaultLocale: false },
  },
  // An unpublished language is never indexed: ar-test under TEST_RTL=1.
  integrations: [
    {
      name: 'whole-dates',
      hooks: {
        'astro:build:done': async ({ dir }) => {
          const root = fileURLToPath(dir);
          const files = await readdir(root, { recursive: true });
          for (const file of files.filter((f) => f.endsWith('.html'))) {
            const path = `${root}${file}`;
            await writeFile(path, wholeDatesInHtml(await readFile(path, 'utf8')));
          }
        },
      },
    },
    sitemap({
      filter: (page) =>
        !unpublished.some((lang) => new URL(page).pathname.startsWith(`${root}${lang}/`)),
      serialize: (item) => {
        const path = `/${new URL(item.url).pathname.slice(root.length)}`;
        const lastmod = lastUpdated(path);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
  // The stylesheet goes inline so the first paint waits on the HTML alone; the CSP allows inline
  // styles. Inlined fonts or scripts would land as data: or inline code that the CSP rejects.
  build: { inlineStylesheets: 'always' },
  vite: {
    build: { assetsInlineLimit: 0 },
    // A face that misses the first paint stays out of that page instead of swapping in late,
    // which would reflow the text and shift everything below it.
    plugins: [
      {
        name: 'font-display-optional',
        transform: (code, id) =>
          /@fontsource-variable\/.+\.css$/.test(id)
            ? code.replaceAll('font-display: swap', 'font-display: optional')
            : undefined,
      },
    ],
  },
});
