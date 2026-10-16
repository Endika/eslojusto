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

test('its language menu switches to the same page in Spanish, and closes on Escape', async ({
  page,
}) => {
  await page.goto('eu/empleada-de-hogar/');
  const menu = page.locator('.language-menu');
  await menu.locator('summary').click();
  const links = menu.locator('.language-menu__list a');
  await expect(links).toHaveText(['Español', 'Euskara']);
  await expect(links.nth(1)).toHaveAttribute('aria-current', 'page');
  await expect(links.nth(0)).toHaveAttribute('hreflang', 'es');
  await page.keyboard.press('Escape');
  await expect(links.nth(0)).toBeHidden();
  await menu.locator('summary').click();
  await page.locator('h1').click();
  await expect(links.nth(0)).toBeHidden();
  await menu.locator('summary').click();
  await links.nth(0).click();
  // The page then marks its first tab in the hash.
  await expect(page).toHaveURL(/\/empleada-de-hogar\/(#[a-z-]+)?$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('the case pages are under review too, and link within the language', async ({ page }) => {
  for (const path of [
    'eu/paro/',
    'eu/finiquito/baja-voluntaria/',
    'eu/paro/despido-disciplinario/',
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator('.review-banner')).toBeVisible();
  }
  await page.goto('eu/finiquito/baja-voluntaria/');
  await expect(page.locator('.next-pages a').first()).toHaveAttribute('href', '/eu/finiquito/');
});

test('the ERTE page works under review too, with its script and the hub in the language', async ({
  page,
}) => {
  await page.goto('eu/paro/');
  await page.locator('a[href="/eu/paro/erte/"]').first().click();
  await expect(page).toHaveURL(/\/eu\/paro\/erte\/$/);
  await expect(page.locator('.review-banner')).toBeVisible();
  await page.locator('#regime-force_majeure').check();
  await page.locator('#measure-suspension').check();
  await page.locator('#base').fill('1.500,00');
  await page.locator('#children-0').check();
  await page.locator('#erte-form button[type="submit"]').click();
  await expect(page.locator('#erte-result [data-result-blocks] h3').first()).toBeVisible();
  await expect(page.locator('#erte-result')).toContainText('1.050');
});

test('the Spanish pages neither link nor offer it', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('.review-banner')).toHaveCount(0);
  await expect(page.locator('.language-menu')).toHaveCount(0);
  await expect(page.locator('link[hreflang="eu"]')).toHaveCount(0);
  await expect(page.locator('#other-languages')).toHaveCount(0);
});

test('the sitemap leaves it out', async ({ request }) => {
  const index = await (await request.get('sitemap-0.xml')).text();
  expect(index).toContain('<loc>');
  expect(index).not.toContain('/eu/');
});
