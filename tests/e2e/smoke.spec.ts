import { test, expect } from '@playwright/test';
test('the home page loads in Spanish', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('a page inside another site’s frame stays blank', async ({ page, baseURL }) => {
  await page.goto('./');
  await expect(page.locator('main')).toBeVisible();
  await page.setContent(`<iframe src="${baseURL}" width="800" height="600"></iframe>`);
  const framed = page.frameLocator('iframe');
  await expect(framed.locator('main')).toBeAttached();
  await expect(framed.locator('html')).toHaveCSS('display', 'none');
  await expect(framed.locator('main')).toBeHidden();
});
