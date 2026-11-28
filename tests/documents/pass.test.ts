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
const ok = { nonce: 'n'.repeat(32), sessionId: 'cs_test_a' };
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
  it('reads a session id whose encoding uses the url-safe characters', () => {
    const sid = '>>>>>>?????~~~~~~';
    expect(passClaims(passToken({ typ: 'pass', sid, exp: NOW }))?.sessionId).toBe(sid);
    expect(passToken({ typ: 'pass', sid, exp: NOW })).toMatch(/[-_]/);
  });
  it('refuses anything else', () => {
    const [, payload = ''] = pass(0).token.split('.');
    const same = (token: string) => passClaims(token);
    expect(same('v2.x.y')).toBeNull();
    expect(same(`v2.${payload}.sig`)).toBeNull();
    expect(same(`v1.${payload}.`)).toBeNull();
    expect(same('v1..sig')).toBeNull();
    expect(same(`v1.${payload}`)).toBeNull();
    expect(same('v1.not-json.sig')).toBeNull();
    expect(same(passToken({ typ: 'quota', day: '2026-10-07', used: 1 }))).toBeNull();
    expect(same(`${pass(0).token}.extra`)).toBeNull();
  });
  it.each([
    ['null', null],
    ['a number', 5],
    ['no type', { sid: 'cs_test_a', exp: NOW }],
    ['another type', { typ: 'quota', sid: 'cs_test_a', exp: NOW }],
    ['a session id that is no string', { typ: 'pass', sid: 5, exp: NOW }],
    ['no session id', { typ: 'pass', exp: NOW }],
    ['an expiry that is no integer', { typ: 'pass', sid: 'cs_test_a', exp: 1.5 }],
    ['an expiry that is a string', { typ: 'pass', sid: 'cs_test_a', exp: '9' }],
    ['no expiry', { typ: 'pass', sid: 'cs_test_a' }],
  ])('refuses claims with %s', (_name, claims) => {
    expect(passClaims(passToken(claims as object))).toBeNull();
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
  it('expires at the earlier of the claimed and the stored expiry, to the millisecond', () => {
    const claimed = pass(15, NOW + 100);
    expect(passState({ ...claimed, expiresAt: NOW + 200 }, (NOW + 100) * 1000 - 1)).toBe('valid');
    expect(passState({ ...claimed, expiresAt: NOW + 200 }, (NOW + 100) * 1000)).toBe('expired');
    expect(passState({ ...claimed, expiresAt: NOW + 50 }, (NOW + 50) * 1000)).toBe('expired');
    expect(passState({ ...claimed, expiresAt: NOW + 50 }, (NOW + 50) * 1000 - 1)).toBe('valid');
  });
  it('records the reads the API reports, and reads an old entry as a full pass', () => {
    const store = memoryStore();
    const passes = createPassStore(store, () => NOW * 1000);
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
    const passes = createPassStore(store, () => NOW * 1000);
    passes.savePass(pass(1));
    passes.saveQuota('v1.q.s');
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_abc' });
    expect([...store.data.keys()].toSorted()).toEqual(Object.values(STORAGE_KEYS).toSorted());
    expect(passes.pass()).toEqual(pass(1));
    expect(passes.quota()).toBe('v1.q.s');
    expect(passes.checkouts()).toMatchObject([{ nonce: 'n'.repeat(32), sessionId: 'cs_test_abc' }]);
  });
  it('drops an expired pass and a free-reads counter from another day once read', () => {
    const store = memoryStore();
    const passes = createPassStore(store, () => (NOW + 7200) * 1000);
    passes.savePass(pass(3));
    const counter = (day: string) =>
      `v1.${Buffer.from(JSON.stringify({ typ: 'quota', day, used: 1 })).toString('base64url')}.s`;
    passes.saveQuota(counter('2026-10-06'));
    expect(passes.pass()).toBeNull();
    expect(passes.quota()).toBeNull();
    expect([...store.data.keys()]).toEqual([]);
    passes.saveQuota(counter('2026-10-07'));
    expect(passes.quota()).toBe(counter('2026-10-07'));
  });
  it('keeps every unredeemed payment, newest first, and drops one once redeemed', () => {
    const passes = createPassStore(memoryStore(), () => NOW * 1000);
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
  it('forgets the last payment by emptying its key', () => {
    const store = memoryStore();
    const passes = createPassStore(store, () => NOW * 1000);
    passes.addCheckout({ nonce: 'a'.repeat(32), sessionId: 'cs_test_a' });
    passes.removeCheckout('cs_test_a');
    expect(store.data.has(STORAGE_KEYS.checkout)).toBe(false);
  });
  it('keeps a payment once when it is added again', () => {
    const passes = createPassStore(memoryStore(), () => NOW * 1000);
    passes.addCheckout({ nonce: 'a'.repeat(32), sessionId: 'cs_test_a' });
    passes.addCheckout({ nonce: 'a'.repeat(32), sessionId: 'cs_test_b' });
    expect(passes.checkouts().map((c) => c.sessionId)).toEqual(['cs_test_b']);
  });
  it('forgets a payment never finished after a week, to the second, and a redeemed one at its expiry', () => {
    const week = 7 * 86_400;
    const checkouts = (checkout: object) => {
      const store = memoryStore();
      store.set(STORAGE_KEYS.checkout, JSON.stringify([checkout]));
      return createPassStore(store, () => NOW * 1000).checkouts();
    };
    const base = { nonce: 'a'.repeat(32), sessionId: 'cs_test_a' };
    expect(checkouts({ ...base, startedAt: NOW - week })).toHaveLength(1);
    expect(checkouts({ ...base, startedAt: NOW - week - 1 })).toHaveLength(0);
    expect(checkouts({ ...base, redeemed: true, expiresAt: NOW + 1 })).toHaveLength(1);
    expect(checkouts({ ...base, redeemed: true, expiresAt: NOW })).toHaveLength(0);
  });
  it.each([
    ['a number', 5],
    ['a string', 'text'],
    ['null', null],
    ['a nonce that is no string', { nonce: ['n'.repeat(32)], sessionId: 'cs_test_a' }],
    ['a nonce of the wrong shape', { nonce: 'n'.repeat(10), sessionId: 'cs_test_a' }],
    ['a session id that is no string', { nonce: 'n'.repeat(32), sessionId: ['cs_test_a'] }],
    ['a session id of the wrong shape', { nonce: 'n'.repeat(32), sessionId: 'cs_prod_a' }],
    ['a redeemed flag that is not true', { ...ok, redeemed: false, expiresAt: NOW + 60 }],
    ['a redeemed payment with no expiry', { ...ok, redeemed: true }],
    ['a redeemed payment with a text expiry', { ...ok, redeemed: true, expiresAt: '9' }],
    ['a start that is no integer', { ...ok, startedAt: 'now' }],
    ['a start that is a fraction', { ...ok, startedAt: 1.5 }],
  ])('drops a stored payment with %s', (_name, entry) => {
    const store = memoryStore();
    store.set(STORAGE_KEYS.checkout, JSON.stringify([entry]));
    expect(createPassStore(store, () => NOW * 1000).checkouts()).toEqual([]);
  });
  it('keeps a stored payment that is well formed, redeemed or not', () => {
    const entries = [
      { ...ok, startedAt: NOW },
      { ...ok, redeemed: true, expiresAt: NOW + 60 },
    ];
    const store = memoryStore();
    store.set(STORAGE_KEYS.checkout, JSON.stringify(entries));
    expect(createPassStore(store, () => NOW * 1000).checkouts()).toEqual(entries);
  });
  it.each([
    ['null', 'null'],
    ['no token', JSON.stringify({ expiresAt: NOW + 60 })],
    ['a token that is no string', JSON.stringify({ token: 5, expiresAt: NOW + 60 })],
    ['no expiry', JSON.stringify({ token: pass(1).token })],
    ['an expiry that is a string', JSON.stringify({ token: pass(1).token, expiresAt: '9' })],
  ])('reads a stored pass with %s as none', (_name, raw) => {
    const store = memoryStore();
    store.set(STORAGE_KEYS.pass, raw);
    expect(createPassStore(store, () => NOW * 1000).pass()).toBeNull();
  });
  it('has no pass to update or retire when none is stored', () => {
    const store = memoryStore();
    const passes = createPassStore(store, () => NOW * 1000);
    passes.updateReads(3);
    passes.retirePass();
    expect(store.data.size).toBe(0);
  });
  it('keeps a counter it cannot read the day of', () => {
    const passes = createPassStore(memoryStore(), () => NOW * 1000);
    const old = Buffer.from(JSON.stringify({ typ: 'quota', day: '2020-01-01' })).toString(
      'base64url',
    );
    for (const token of [`v2.${old}.s`, 'v1..s', 'text']) {
      passes.saveQuota(token);
      expect(passes.quota(), token).toBe(token);
    }
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
    const passes = createPassStore(memoryStore(), () => NOW * 1000);
    passes.saveQuota('q');
    passes.forgetQuota();
    expect(passes.quota()).toBeNull();
  });
  it('reads damaged or foreign values as nothing', () => {
    const store = memoryStore();
    const passes = createPassStore(store, () => NOW * 1000);
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
