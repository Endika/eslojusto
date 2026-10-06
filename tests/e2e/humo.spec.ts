import { test, expect } from '@playwright/test';
test('la portada carga en español', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});
