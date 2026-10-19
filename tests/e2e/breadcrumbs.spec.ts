import { test, expect, type APIRequestContext } from '@playwright/test';
import { DEFAULT_LANG, LANGS, type Lang } from '../../src/i18n/languages';

const published = (Object.keys(LANGS) as Lang[]).filter((lang) => LANGS[lang].published);
const homeOf = (lang: Lang) => (lang === DEFAULT_LANG ? '/' : `/${lang}/`);

// Every page the sitemap lists in a language but its home: the build decides which, so a new page
// joins the check.
const below = async (request: APIRequestContext, lang: Lang) => {
  const index = await (await request.get('sitemap-index.xml')).text();
  const parts = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');
  const urls: string[] = [];
  for (const part of parts) {
    const xml = await (await request.get(new URL(part).pathname.slice(1))).text();
    urls.push(
      ...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? '').pathname),
    );
  }
  const own = (path: string) =>
    lang === DEFAULT_LANG
      ? !published.some((other) => other !== DEFAULT_LANG && path.startsWith(homeOf(other)))
      : path.startsWith(homeOf(lang));
  return urls.filter((path) => own(path) && path !== homeOf(lang));
};

for (const lang of published) {
  test(`every ${lang} page below the home shows its trail and fits 360 px without scrolling sideways`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const paths = await below(request, lang);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      await page.goto(path.slice(1));
      const trail = page.locator('main nav.crumbs');
      await expect(trail, path).toBeVisible();
      await expect(trail.locator('a').first(), path).toHaveAttribute('href', homeOf(lang));
      await expect(trail.locator('[aria-current="page"]'), path).toHaveCount(1);
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(wide, path).toBe(0);
    }
  });
}

test('the Spanish trail is named for the reader', async ({ page }) => {
  await page.goto('finiquito/');
  const trail = page.getByRole('navigation', { name: 'Estás en' });
  await expect(trail.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
});

test('the home has no trail', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('nav.crumbs')).toHaveCount(0);
});
