import type { Page } from '@playwright/test';

// Moves to the next sheet and waits out the page turn: it moves in steps, so a click during it can
// land beside its target.
export async function nextSheet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}
