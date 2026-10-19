import { test, expect } from '@playwright/test';

// Basque stands for every published translation: indexed, announced and working like Spanish.

test('a translated page is indexed and names every language with hreflang', async ({ page }) => {
  await page.goto('eu/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'eu');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/eu\/$/);
  await expect(page.locator('link[hreflang]')).toHaveCount(11);
  await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute('href', /\/$/);
});

test('an RTL translation reads right to left', async ({ page }) => {
  await page.goto('ar/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('every section is translated', async ({ page }) => {
  const response = await page.goto('eu/empleada-de-hogar/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test('its language menu switches to the same page in Spanish, and closes on Escape', async ({
  page,
}) => {
  await page.goto('eu/empleada-de-hogar/');
  const menu = page.locator('.language-menu');
  await menu.locator('summary').click();
  const links = menu.locator('.language-menu__list a');
  await expect(links).toHaveCount(10);
  await expect(links.filter({ hasText: 'Euskara' })).toHaveAttribute('aria-current', 'page');
  await expect(links.nth(0)).toHaveAttribute('hreflang', 'es');
  await page.keyboard.press('Escape');
  await expect(links.nth(0)).toBeHidden();
  await menu.locator('summary').click();
  // Outside the open menu, which with ten languages covers the title on a phone.
  const viewport = page.viewportSize() ?? { width: 360, height: 640 };
  await page.mouse.click(4, viewport.height - 4);
  await expect(links.nth(0)).toBeHidden();
  await menu.locator('summary').click();
  await links.nth(0).click();
  // The page then marks its first tab in the hash.
  await expect(page).toHaveURL(/\/empleada-de-hogar\/(#[a-z-]+)?$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('the case pages are translated, and link within the language', async ({ page }) => {
  for (const path of [
    'eu/paro/',
    'eu/finiquito/baja-voluntaria/',
    'eu/paro/despido-disciplinario/',
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  }
  await page.goto('eu/finiquito/baja-voluntaria/');
  await expect(page.locator('.next-pages a').first()).toHaveAttribute('href', '/eu/finiquito/');
});

test('the ERTE page works translated, with its script and the hub in the language', async ({
  page,
}) => {
  await page.goto('eu/paro/');
  await page.locator('a[href="/eu/paro/erte/"]').first().click();
  await expect(page).toHaveURL(/\/eu\/paro\/erte\/$/);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await page.locator('#regime-force_majeure').check();
  await page.locator('#measure-suspension').check();
  await page.locator('#base').fill('1.500,00');
  await page.locator('#children-0').check();
  await page.locator('#erte-form button[type="submit"]').click();
  await expect(page.locator('#erte-result [data-result-blocks] h3').first()).toBeVisible();
  await expect(page.locator('#erte-result')).toContainText('1.050');
});

test('the rental topics are translated, with their own sections', async ({ page }) => {
  await page.goto('eu/alquiler/');
  await page.locator('a[href="/eu/alquiler/fianza/"]').first().click();
  await expect(page).toHaveURL(/\/eu\/alquiler\/fianza\/$/);
  await expect(page.locator('#fianza-legal')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  for (const path of [
    'eu/alquiler/subida/',
    'eu/alquiler/devolucion-fianza/',
    'eu/alquiler/gastos/',
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
  }
});

test('the legal pages are translated, and say the Spanish text binds', async ({ page }) => {
  await page.goto('eu/');
  await page.locator('footer a[href="/eu/aviso-legal/"]').click();
  await expect(page).toHaveURL(/\/eu\/aviso-legal\/$/);
  await expect(page.locator('.document__head a[hreflang="es"]')).toHaveAttribute(
    'href',
    '/aviso-legal/',
  );
  await page.goto('eu/privacidad/');
  await expect(page.locator('.document__head a[hreflang="es"]')).toHaveAttribute(
    'href',
    '/privacidad/',
  );
  await page.goto('privacidad/');
  await expect(page.locator('.document__head a[hreflang="es"]')).toHaveCount(0);
});

test('the translated final pay page carries its guide, linking cases within the language', async ({
  page,
}) => {
  await page.goto('eu/finiquito/');
  await expect(page.locator('#guide-title')).toBeVisible();
  await expect(
    page.locator('.guide a[href="/eu/finiquito/baja-voluntaria/"]').first(),
  ).toBeAttached();
});

test('the Spanish pages link it and offer it in the menu', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('link[hreflang="eu"]')).toHaveAttribute('href', /\/eu\/$/);
  await expect(page.locator('.language-menu .language-menu__list a')).toHaveCount(10);
});

test('the sitemap lists it', async ({ request }) => {
  const index = await (await request.get('sitemap-0.xml')).text();
  expect(index).toContain('/eu/finiquito/');
});

test.describe('a visitor whose browser reads English', () => {
  test.use({ locale: 'en-GB' });

  test('is offered the page in English on Spanish, never redirected', async ({ page }) => {
    await page.goto('finiquito/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    const offer = page.locator('.other-language');
    await expect(offer.locator('a[hreflang="en"]')).toHaveAttribute('href', '/en/finiquito/');
    await offer.locator('.other-language__close').click();
    await expect(offer).toHaveCount(0);
  });
});
