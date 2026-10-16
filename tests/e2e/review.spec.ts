import { test, expect } from '@playwright/test';

// Runs only against a REVIEW_LANGS=eu build: Basque is served to its reviewer, never announced.

test('a page under review is served noindexed, behind the banner', async ({ page }) => {
  await page.goto('eu/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'eu');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[hreflang]')).toHaveCount(0);
  const banner = page.locator('.review-banner');
  await expect(banner).toBeVisible();
  await expect(banner.locator('a')).toHaveAttribute('href', '/');
});

test('every section the build has is under review too', async ({ page }) => {
  const response = await page.goto('eu/empleada-de-hogar/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('.review-banner a')).toHaveAttribute('href', '/empleada-de-hogar/');
});

test('the Spanish pages neither link nor offer it', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('.review-banner')).toHaveCount(0);
  await expect(page.locator('link[hreflang="eu"]')).toHaveCount(0);
  await expect(page.locator('#other-languages')).toHaveCount(0);
});

test('the sitemap leaves it out', async ({ request }) => {
  const index = await (await request.get('sitemap-0.xml')).text();
  expect(index).toContain('<loc>');
  expect(index).not.toContain('/eu/');
});
