import { test, expect } from '@playwright/test';
test('the home page loads in Spanish', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});
