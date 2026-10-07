import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEYS,
  canDownload,
  createPassStore,
  newNonce,
  passClaims,
  passState,
} from '../../src/documents/pass';
import { NONCE } from '../../src/documents/contract';
import { memoryStore, passToken } from './fixtures';

const NOW = Date.UTC(2026, 9, 7) / 1000;
const pass = (readsLeft: number, exp = NOW + 3600) => ({
  token: passToken({ typ: 'pass', sid: 'cs_test_a', exp }),
  expiresAt: exp,
  readsLeft,
});

describe('passClaims', () => {
  it('reads the claims of a v1 token', () => {
    expect(passClaims(pass(3).token)).toEqual({
      sessionId: 'cs_test_a',
      expiresAt: NOW + 3600,
    });
  });
  it('refuses anything else', () => {
    expect(passClaims('v2.x.y')).toBeNull();
    expect(passClaims('v1.not-json.sig')).toBeNull();
    expect(passClaims(passToken({ typ: 'quota', day: '2026-10-07', used: 1 }))).toBeNull();
    expect(passClaims(`${pass(0).token}.extra`)).toBeNull();
  });
});

describe('passState', () => {
  const now = NOW * 1000;
  it('valid, used up, expired or none', () => {
    expect(passState(pass(15), now)).toBe('valid');
    expect(passState(pass(0), now)).toBe('exhausted');
    expect(passState(pass(15, NOW - 1), now)).toBe('expired');
    expect(passState(null, now)).toBe('none');
    expect(passState({ token: 'garbage', expiresAt: NOW + 10, readsLeft: 15 }, now)).toBe('none');
  });
  it('records the reads the API reports, and reads an old entry as a full pass', () => {
    const store = memoryStore();
    const passes = createPassStore(store);
    passes.savePass(pass(15));
    passes.updateReads(4);
    expect(passes.pass()?.readsLeft).toBe(4);
    store.set(STORAGE_KEYS.pass, JSON.stringify({ token: 't', expiresAt: NOW }));
    expect(passes.pass()?.readsLeft).toBe(15);
    passes.forgetPass();
    expect(passes.pass()).toBeNull();
  });
  it('a used-up pass still downloads; an expired one does not', () => {
    expect(canDownload('valid')).toBe(true);
    expect(canDownload('exhausted')).toBe(true);
    expect(canDownload('expired')).toBe(false);
    expect(canDownload('none')).toBe(false);
  });
});

describe('createPassStore', () => {
  it('keeps the pass, the quota and the checkout under their own keys', () => {
    const store = memoryStore();
    const passes = createPassStore(store);
    passes.savePass(pass(1));
    passes.saveQuota('v1.q.s');
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_abc' });
    expect([...store.data.keys()].toSorted()).toEqual(Object.values(STORAGE_KEYS).toSorted());
    expect(passes.pass()).toEqual(pass(1));
    expect(passes.quota()).toBe('v1.q.s');
    expect(passes.checkouts()).toMatchObject([{ nonce: 'n'.repeat(32), sessionId: 'cs_test_abc' }]);
  });
  it('keeps every unredeemed payment, newest first, and drops one once redeemed', () => {
    const passes = createPassStore(memoryStore());
    passes.addCheckout({ nonce: 'a'.repeat(32), sessionId: 'cs_test_a' });
    passes.addCheckout({ nonce: 'b'.repeat(32), sessionId: 'cs_test_b' });
    expect(passes.checkouts().map((c) => c.sessionId)).toEqual(['cs_test_b', 'cs_test_a']);
    passes.removeCheckout('cs_test_b');
    expect(passes.checkouts().map((c) => c.sessionId)).toEqual(['cs_test_a']);
    for (let i = 0; i < 8; i++)
      passes.addCheckout({ nonce: `${i}`.repeat(32), sessionId: `cs_test_${i}` });
    expect(passes.checkouts()).toHaveLength(5);
  });
  it('keeps a redeemed payment until its pass expires', () => {
    let now = Date.UTC(2026, 9, 7);
    const passes = createPassStore(memoryStore(), () => now);
    passes.addCheckout({ nonce: 'a'.repeat(32), sessionId: 'cs_test_a' });
    passes.markRedeemed('cs_test_a', now / 1000 + 60);
    expect(passes.checkouts()).toEqual([
      {
        nonce: 'a'.repeat(32),
        sessionId: 'cs_test_a',
        startedAt: now / 1000,
        redeemed: true,
        expiresAt: now / 1000 + 60,
      },
    ]);
    now += 61_000;
    expect(passes.checkouts()).toEqual([]);
  });
  it('a retired pass downloads but reads no more', () => {
    const passes = createPassStore(memoryStore(), () => NOW * 1000);
    passes.savePass(pass(9));
    passes.retirePass();
    expect(passes.pass()?.usable).toBe(false);
    expect(passState(passes.pass(), NOW * 1000)).toBe('exhausted');
  });
  it('reads a payment stored by an earlier version of the page', () => {
    const store = memoryStore();
    store.set(
      STORAGE_KEYS.checkout,
      JSON.stringify({ nonce: 'n'.repeat(32), sessionId: 'cs_test_x' }),
    );
    expect(createPassStore(store).checkouts()).toEqual([
      { nonce: 'n'.repeat(32), sessionId: 'cs_test_x' },
    ]);
  });
  it('forgets the quota', () => {
    const passes = createPassStore(memoryStore());
    passes.saveQuota('q');
    passes.forgetQuota();
    expect(passes.quota()).toBeNull();
  });
  it('reads damaged or foreign values as nothing', () => {
    const store = memoryStore();
    const passes = createPassStore(store);
    store.set(STORAGE_KEYS.pass, '{');
    store.set(STORAGE_KEYS.checkout, JSON.stringify({ nonce: 'short', sessionId: 'x' }));
    expect(passes.pass()).toBeNull();
    expect(passes.checkouts()).toEqual([]);
    store.set(
      STORAGE_KEYS.checkout,
      JSON.stringify([{ nonce: 'n'.repeat(32), sessionId: 'evil' }]),
    );
    expect(passes.checkouts()).toEqual([]);
    store.set(STORAGE_KEYS.checkout, '{');
    expect(passes.checkouts()).toEqual([]);
  });
});

describe('newNonce', () => {
  it('is 32 url-safe characters the API accepts', () => {
    const nonce = newNonce((n) => crypto.getRandomValues(new Uint8Array(n)));
    expect(nonce).toHaveLength(32);
    expect(nonce).toMatch(NONCE);
  });
});
