import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';

const signer = createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256');

describe('createHmacSigner', () => {
  it('round-trips claims and signs deterministically', () => {
    const claims = { typ: 'pass', sid: 'cs_test_a', exp: 1, used: 0 };
    const token = signer.sign(claims);
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(signer.sign(claims)).toBe(token);
    expect(signer.verify(token)).toEqual(claims);
  });

  it.each([
    ['an empty string', ''],
    ['another version', signer.sign({ a: 1 }).replace(/^v1/, 'v2')],
    ['a missing signature', signer.sign({ a: 1 }).split('.').slice(0, 2).join('.')],
    ['an extra segment', `${signer.sign({ a: 1 })}.x`],
    ['a truncated signature', signer.sign({ a: 1 }).slice(0, -2)],
    ['an oversized token', `v1.${'a'.repeat(2000)}.b`],
  ])('rejects %s', (_, token) => {
    expect(signer.verify(token)).toBeNull();
  });

  it('refuses a short key', () => {
    expect(() => createHmacSigner('short')).toThrow();
  });
});
