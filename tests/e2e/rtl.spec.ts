import { test, expect, type Page } from '@playwright/test';

// Runs only against a TEST_RTL=1 build: the ar-test pseudo-locale proves the mirrored layout.

async function toTheResult(page: Page) {
  const next = () => page.locator('[data-next]').click();
  await page.locator('#cause-resignation').check();
  await next();
  await page.locator('#startDate').fill('2025-01-01');
  await page.locator('#endDate').fill('2026-09-15');
  await next();
  await page.locator('#prorated-yes').check();
  await next();
  await page.locator('#monthlySalary').fill('1.850,00');
  await next();
  await page.locator('#holidayDaysTaken').fill('0');
  await next();
  await next();
  await page.locator('#figure_pending_salary').fill('1.234,56');
  await page.locator('[data-submit]').click();
  await expect(page.locator('#resultado')).toBeVisible();
}

test('the page declares ar-test and right to left', async ({ page }) => {
  await page.goto('ar-test/finiquito/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar-test');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[hreflang]')).toHaveCount(0);
});

test('the tab rail sits on the left edge and the punched holes on the right', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('ar-test/finiquito/');
  const rail = await page.locator('.tabs').boundingBox();
  expect(rail && rail.x + rail.width <= 1440 / 2).toBe(true);

  const sheet = page.locator('#sheet-causa');
  const box = await sheet.boundingBox();
  const hole = await sheet.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const before = getComputedStyle(el, '::before');
    return r.right - parseFloat(before.right) - parseFloat(before.width) / 2;
  });
  expect(box && hole > box.x + box.width / 2).toBe(true);

  const tab = await page.locator('.header .logo:visible .logo__tab').boundingBox();
  const mark = await page.locator('.header .logo:visible .logo__mark').boundingBox();
  expect(tab && mark && tab.x + tab.width / 2 < mark.x + mark.width / 2).toBe(true);
});

test('no horizontal scroll at 360 px, on the sheets and on the result', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('ar-test/finiquito/');
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await overflow()).toBeLessThanOrEqual(0);
  await toTheResult(page);
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test('amounts stay in Spanish format and left to right', async ({ page }) => {
  await page.goto('ar-test/finiquito/');
  await toTheResult(page);
  const salary = page.locator('[data-item][data-state]').first();
  const employer = salary.locator('[data-employer] bdi');
  await expect(employer).toHaveText(/^1\.234,56\s€$/);
  await expect(employer).toHaveAttribute('dir', 'ltr');
  await expect(salary.locator('[data-range] bdi')).toHaveText(/^925,00\s€$/);
});

test('the home page has no horizontal scroll at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('ar-test/');
  await expect(page.locator('.card').first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
