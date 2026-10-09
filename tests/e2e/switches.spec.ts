import { test, expect } from '@playwright/test';

// A default build, with every section switch off, has nothing of the household review: no route,
// no home card, no sitemap entry and no link or text about it anywhere.
test('without PUBLIC_HOUSEHOLD there is no household page', async ({ request }) => {
  const response = await request.get('empleada-de-hogar/');
  expect(response.status()).toBe(404);
});

test('without PUBLIC_HOUSEHOLD the home page, the legal pages and the sitemap say nothing of it', async ({
  page,
  request,
}) => {
  for (const path of ['', 'privacidad/', 'aviso-legal/', 'finiquito/', 'paro/']) {
    await page.goto(path);
    const html = (await page.content()).toLowerCase();
    expect(html, path).not.toContain('empleada de hogar');
    expect(html, path).not.toContain('empleada-de-hogar');
    expect(html, path).not.toContain('household');
  }
  const sitemap = await (await request.get('sitemap-0.xml')).text();
  expect(sitemap).not.toContain('empleada-de-hogar');
});
