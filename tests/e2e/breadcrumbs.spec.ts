import { test, expect, type APIRequestContext } from '@playwright/test';

// Every page the sitemap lists but the home: the build decides which, so a new page joins the check.
const below = async (request: APIRequestContext) => {
  const index = await (await request.get('sitemap-index.xml')).text();
  const parts = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');
  const urls: string[] = [];
  for (const part of parts) {
    const xml = await (await request.get(new URL(part).pathname.slice(1))).text();
    urls.push(
      ...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? '').pathname),
    );
  }
  return urls.filter((path) => path !== '/');
};

test('every page below the home shows its trail and fits 360 px without scrolling sideways', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const paths = await below(request);
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    await page.goto(path.slice(1));
    const trail = page.getByRole('navigation', { name: 'Estás en' });
    await expect(trail, path).toBeVisible();
    await expect(trail.getByRole('link', { name: 'Inicio' }), path).toHaveAttribute('href', '/');
    await expect(trail.locator('[aria-current="page"]'), path).toHaveCount(1);
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(wide, path).toBe(0);
  }
});

test('the home has no trail', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('nav.crumbs')).toHaveCount(0);
});
