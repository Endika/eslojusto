import { afterEach, describe, expect, it, vi } from 'vitest';

describe('a build without the documents API', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it('has no document events: they are refused like any unknown event', async () => {
    vi.stubEnv('PUBLIC_API_EXTRACT_URL', '');
    vi.resetModules();
    const { CATALOGUE, isValidEvent } = await import('../../src/analytics/events');
    expect(Object.keys(CATALOGUE)).not.toContain('extraction_completed');
    expect(Object.keys(CATALOGUE)).toContain('review_completed');
    expect(isValidEvent('checkout_started', {})).toBe(false);
  });
});
