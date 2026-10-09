import { expect, type Locator } from '@playwright/test';

// A read draws and encodes every photo before it is sent, which on a loaded runner can outlast the
// default wait. Its outcome is waited for until it shows, and only then must it hold the focus: a
// focus check alone gives up on an element that is not there yet.
export async function expectShownAndFocused(target: Locator, timeout = 30_000): Promise<void> {
  await expect(target).toBeVisible({ timeout });
  await expect(target).toBeFocused();
}
