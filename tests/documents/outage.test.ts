import { describe, expect, it } from 'vitest';
import { createOutageMemory, OUTAGE_KEY, OUTAGE_MS } from '../../src/documents/outage';
import { memoryStore } from './fixtures';

describe('the memory of an unavailable reading', () => {
  it('lasts an hour from when it happened, and is then forgotten', () => {
    let now = Date.UTC(2026, 9, 7, 10);
    const store = memoryStore();
    const outage = createOutageMemory(store, () => now);
    expect(outage.active()).toBe(false);
    outage.remember();
    now += OUTAGE_MS - 1;
    expect(outage.active()).toBe(true);
    now += 1;
    expect(outage.active()).toBe(false);
    expect(store.get(OUTAGE_KEY)).toBeNull();
  });

  it('ignores a value it did not write, or one from the future', () => {
    const now = Date.UTC(2026, 9, 7, 10);
    for (const value of ['soon', '-1', String(now + 60_000)]) {
      const store = memoryStore();
      store.set(OUTAGE_KEY, value);
      expect(createOutageMemory(store, () => now).active(), value).toBe(false);
    }
  });
});
