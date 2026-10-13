// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js/dist/module.slim.no-external', () => {
  throw new TypeError('Failed to fetch dynamically imported module');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('a library that fails to load', () => {
  it('measures nothing and leaves no rejection behind', async () => {
    vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_test');
    const { startAnalytics, track } = await import('../../src/analytics/posthog');
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      track('js_error', { kind: 'TypeError', source: 'unknown' });
      await expect(startAnalytics()).resolves.toBeDefined();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });
});
