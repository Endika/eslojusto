// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js/dist/module.slim.no-external', () => {
  throw new TypeError('Failed to fetch dynamically imported module');
});

// Imported before the test, so the modules it loads are not counted as covered by it.
let posthog: typeof import('../../src/analytics/posthog');
beforeAll(async () => {
  vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_test');
  posthog = await import('../../src/analytics/posthog');
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('a library that fails to load', () => {
  it('measures nothing and leaves no rejection behind', async () => {
    const { startAnalytics, track } = posthog;
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      track('js_error', { kind: 'TypeError', frames: [], version: '0.0.0', message: '', step: '' });
      await expect(startAnalytics()).resolves.toBeDefined();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });
});
