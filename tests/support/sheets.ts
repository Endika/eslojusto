import { expect, type Page } from '@playwright/test';

// Moves to the next sheet and waits out the page turn: it moves in steps, so a click during it can
// land beside its target.
export async function nextSheet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

// No page is ever wider than the screen.
export async function noSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

// On a 360 × 640 phone, the sheet on screen sits whole above the buttons and inside the screen:
// nothing to scroll to. On a wider screen, only that nothing is wider than it.
export async function fitsScreen(page: Page): Promise<void> {
  await noSideScroll(page);
  if ((page.viewportSize()?.width ?? 0) > 360) return;
  const box = await page.evaluate(() => {
    const visible = [...document.querySelectorAll<HTMLElement>('[data-sheet]')].find(
      (s) => !s.hidden,
    );
    const actions = document.querySelector<HTMLElement>('.actions');
    if (!visible || !actions) return null;
    const s = visible.getBoundingClientRect();
    const a = actions.getBoundingClientRect();
    return {
      id: visible.dataset['sheet'],
      height: Math.round(s.height),
      bottom: s.bottom,
      actionsTop: a.top,
      actionsBottom: a.bottom,
      screen: innerHeight,
    };
  });
  expect(box).not.toBeNull();
  if (box) {
    expect
      .soft(box.bottom, `the ${box.id} sheet (${box.height} px) ends above the buttons`)
      .toBeLessThanOrEqual(box.actionsTop + 1);
    expect
      .soft(box.actionsBottom, `the buttons are on screen on the ${box.id} sheet`)
      .toBeLessThanOrEqual(box.screen + 1);
  }
}
