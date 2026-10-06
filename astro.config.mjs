import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { IDIOMA_POR_DEFECTO, idiomasConstruidos } from './src/i18n/idiomas.ts';
import { ACTUALIZADO } from './src/contenido/actualizado.ts';

const base = process.env.BASE ?? '/';
const raiz = base.replace(/\/?$/, '/');

export default defineConfig({
  site: process.env.SITE ?? 'https://eslojusto.es',
  base,
  trailingSlash: 'always',
  // Published languages only; ar-test joins under PRUEBA_RTL=1 to prove the RTL layout.
  i18n: {
    locales: idiomasConstruidos(),
    defaultLocale: IDIOMA_POR_DEFECTO,
    routing: { prefixDefaultLocale: false },
  },
  // The pseudo-locale is never indexed, not even in a PRUEBA_RTL=1 build.
  integrations: [
    sitemap({
      filter: (pagina) => !pagina.includes('/ar-test/'),
      serialize: (item) => {
        const ruta = `/${new URL(item.url).pathname.slice(raiz.length)}`;
        return ACTUALIZADO[ruta] ? { ...item, lastmod: ACTUALIZADO[ruta] } : item;
      },
    }),
  ],
  // The stylesheet goes inline so the first paint waits on the HTML alone; the CSP allows inline
  // styles. Inlined fonts or scripts would land as data: or inline code that the CSP rejects.
  build: { inlineStylesheets: 'always' },
  vite: { build: { assetsInlineLimit: 0 } },
});
