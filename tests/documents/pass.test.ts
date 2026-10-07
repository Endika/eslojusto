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
const pass = (used: number, exp = NOW + 3600) => ({
  token: passToken({ typ: 'pass', sid: 'cs_test_a', exp, used }),
  expiresAt: exp,
});

describe('passClaims', () => {
  it('reads the claims of a v1 token', () => {
    expect(passClaims(pass(3).token)).toEqual({
      sessionId: 'cs_test_a',
      expiresAt: NOW + 3600,
      used: 3,
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
    expect(passState(pass(0), now)).toBe('valid');
    expect(passState(pass(15), now)).toBe('exhausted');
    expect(passState(pass(0, NOW - 1), now)).toBe('expired');
    expect(passState(null, now)).toBe('none');
    expect(passState({ token: 'garbage', expiresAt: NOW + 10 }, now)).toBe('none');
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
    passes.saveCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_abc' });
    expect([...store.data.keys()].toSorted()).toEqual(Object.values(STORAGE_KEYS).toSorted());
    expect(passes.pass()).toEqual(pass(1));
    expect(passes.quota()).toBe('v1.q.s');
    expect(passes.checkout()).toEqual({ nonce: 'n'.repeat(32), sessionId: 'cs_test_abc' });
  });
  it('reads damaged or foreign values as nothing', () => {
    const store = memoryStore();
    const passes = createPassStore(store);
    store.set(STORAGE_KEYS.pass, '{');
    store.set(STORAGE_KEYS.checkout, JSON.stringify({ nonce: 'short', sessionId: 'x' }));
    expect(passes.pass()).toBeNull();
    expect(passes.checkout()).toBeNull();
    store.set(STORAGE_KEYS.checkout, JSON.stringify({ nonce: 'n'.repeat(32), sessionId: 'evil' }));
    expect(passes.checkout()).toEqual({ nonce: 'n'.repeat(32), sessionId: null });
  });
});

describe('newNonce', () => {
  it('is 32 url-safe characters the API accepts', () => {
    const nonce = newNonce((n) => crypto.getRandomValues(new Uint8Array(n)));
    expect(nonce).toHaveLength(32);
    expect(nonce).toMatch(NONCE);
  });
});
