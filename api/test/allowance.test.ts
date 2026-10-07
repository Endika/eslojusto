import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import {
  checkAllowance,
  FREE_READS_PER_DAY,
  PASS_READS,
  passClaims,
  passExpiry,
} from '../src/domain/allowance';

const signer = createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256');
const now = Date.UTC(2026, 9, 7, 23, 30);
const exp = Date.UTC(2026, 9, 14, 10) / 1000;

const next = (check: ReturnType<typeof checkAllowance>) => {
  if (!check.ok) throw new Error(check.code);
  return signer.verify(check.next());
};

describe('free reads', () => {
  it('start at zero without a token and count up to the daily limit', () => {
    let token: string | null = null;
    for (let used = 1; used <= FREE_READS_PER_DAY; used += 1) {
      const check = checkAllowance({ type: 'free', token }, signer, now);
      if (!check.ok) throw new Error(check.code);
      token = check.next();
      expect(signer.verify(token)).toEqual({ typ: 'quota', day: '2026-10-07', used });
    }
    expect(checkAllowance({ type: 'free', token }, signer, now)).toEqual({
      ok: false,
      code: 'daily_limit_reached',
    });
  });

  it('reset on a new UTC day', () => {
    const spent = signer.sign({ typ: 'quota', day: '2026-10-07', used: FREE_READS_PER_DAY });
    const tomorrow = now + 60 * 60 * 1000;
    expect(next(checkAllowance({ type: 'free', token: spent }, signer, tomorrow))).toEqual({
      typ: 'quota',
      day: '2026-10-08',
      used: 1,
    });
  });

  it('refuse a forged or foreign token', () => {
    const forged = signer.sign({ typ: 'quota', day: '2026-10-07', used: 0 }).replace(/.$/, 'A');
    const pass = signer.sign(passClaims('cs_test_a', exp, 0));
    for (const token of [forged, pass, 'garbage'])
      expect(checkAllowance({ type: 'free', token }, signer, now).ok).toBe(false);
  });
});

describe('passes', () => {
  it('count reads up to the limit and keep their expiry', () => {
    const token = signer.sign(passClaims('cs_test_a', exp, PASS_READS - 1));
    expect(next(checkAllowance({ type: 'pass', token }, signer, now))).toEqual({
      typ: 'pass',
      sid: 'cs_test_a',
      exp,
      used: PASS_READS,
    });
    const spent = signer.sign(passClaims('cs_test_a', exp, PASS_READS));
    expect(checkAllowance({ type: 'pass', token: spent }, signer, now)).toEqual({
      ok: false,
      code: 'pass_exhausted',
    });
  });

  it('expire', () => {
    const token = signer.sign(passClaims('cs_test_a', exp, 0));
    expect(checkAllowance({ type: 'pass', token }, signer, exp * 1000)).toEqual({
      ok: false,
      code: 'pass_expired',
    });
  });

  it('refuse a quota token, a tampered pass or another key’s pass', () => {
    const quota = signer.sign({ typ: 'quota', day: '2026-10-07', used: 0 });
    const genuine = signer.sign(passClaims('cs_test_a', exp, 0));
    const [v, payload, sig] = genuine.split('.');
    const richer = Buffer.from(
      JSON.stringify(passClaims('cs_test_a', exp + 86_400 * 365, 0)),
    ).toString('base64url');
    const other = createHmacSigner('another-key-that-is-long-enough-for-hmac').sign(
      passClaims('cs_test_a', exp, 0),
    );
    for (const token of [quota, `${v}.${richer}.${sig}`, `${v}.${payload}.${sig}x`, other])
      expect(checkAllowance({ type: 'pass', token }, signer, now)).toEqual({
        ok: false,
        code: 'pass_invalid',
      });
  });

  it('last seven days from the payment', () => {
    expect(passExpiry(1_000)).toBe(1_000 + 7 * 86_400);
  });
});
