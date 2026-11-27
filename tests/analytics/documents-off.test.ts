import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('a build without the documents API', () => {
  // Imported before the test, so the modules it loads are not counted as covered by it.
  let events: typeof import('../../src/analytics/events');
  beforeAll(async () => {
    vi.stubEnv('PUBLIC_API_EXTRACT_URL', '');
    vi.resetModules();
    events = await import('../../src/analytics/events');
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it('has no document events: they are refused like any unknown event', () => {
    const { CATALOGUE, isValidEvent } = events;
    expect(Object.keys(CATALOGUE)).not.toContain('extraction_completed');
    expect(Object.keys(CATALOGUE)).toContain('review_completed');
    expect(isValidEvent('checkout_started', { offer: 'claim' })).toBe(false);
  });
});
