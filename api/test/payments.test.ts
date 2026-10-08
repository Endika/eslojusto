import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import {
  checkoutParams,
  createStripeCheckout,
  createStripeSessions,
  isRestrictedKey,
  isRevoked,
  readsUsed,
  toSessionSnapshot,
} from '../src/adapters/stripe-payments';
import {
  createVerifyMemo,
  issuePass,
  startCheckout,
  verifyPass,
  VERIFY_MEMO_MS,
  type PassDeps,
} from '../src/domain/payments';
import { passClaims } from '../src/domain/allowance';
import type { SessionSnapshot } from '../src/domain/ports';
import {
  CREATED,
  FakeCaptcha,
  FakeCheckout,
  FakeClock,
  FakePayments,
  NONCE,
  paidSession,
  PRICE,
} from './support/fakes';

const signer = createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256');
const paid = paidSession();

const deps = (session: SessionSnapshot | null, clock = new FakeClock()): PassDeps => ({
  payments: new FakePayments(session ? { [session.id]: session } : {}),
  signer,
  clock,
  priceId: PRICE,
});

describe('issuePass', () => {
  it('issues a 7-day pass for a paid session, with its reads left', async () => {
    const response = await issuePass(paid.id, NONCE, deps(paidSession({ readsUsed: 6 })));
    if (response.code !== 'ok') throw new Error(response.code);
    expect(response.expiresAt).toBe(CREATED + 7 * 86_400);
    expect(response.readsLeft).toBe(9);
    expect(signer.verify(response.pass)).toEqual({
      typ: 'pass',
      sid: paid.id,
      exp: CREATED + 7 * 86_400,
    });
  });

  it('is idempotent and never resets the reads used', async () => {
    const spent = paidSession({ readsUsed: 15 });
    const first = await issuePass(spent.id, NONCE, deps(spent));
    const later = await issuePass(spent.id, NONCE, deps(spent, new FakeClock(Date.now() + 1000)));
    expect(later).toEqual(first);
    // A spent pass still unlocks the report and the letter; only reads are over.
    expect(first).toMatchObject({ code: 'ok', readsLeft: 0 });
  });

  it('accepts a session paid in full with a promotion code', async () => {
    const free = paidSession({ paymentStatus: 'no_payment_required' });
    expect((await issuePass(free.id, NONCE, deps(free))).code).toBe('ok');
  });

  it.each([
    ['an unknown session', null, 'session_not_found'],
    [
      'someone else’s nonce',
      { clientReferenceId: 'another-browser-nonce-0000' },
      'session_mismatch',
    ],
    ['an open session', { status: 'open', paymentStatus: 'unpaid' }, 'payment_not_complete'],
    ['an unpaid complete session', { paymentStatus: 'unpaid' }, 'payment_not_complete'],
    ['a subscription', { mode: 'subscription' }, 'payment_not_complete'],
    ['a refunded or disputed payment', { revoked: true }, 'pass_revoked'],
    ['another currency', { currency: 'usd' }, 'price_mismatch'],
    ['another amount', { amountSubtotal: 100 }, 'price_mismatch'],
    [
      'another price',
      { lineItems: [{ priceId: 'price_other', unitAmount: 499, quantity: 1 }] },
      'price_mismatch',
    ],
    [
      'two passes in one session',
      { lineItems: [{ priceId: PRICE, unitAmount: 499, quantity: 2 }] },
      'price_mismatch',
    ],
    ['no line items', { lineItems: [] }, 'price_mismatch'],
    ['a session paid over a week ago', { created: CREATED - 8 * 86_400 }, 'pass_expired'],
  ] as const)('refuses %s', async (_, change, code) => {
    const session = change === null ? null : paidSession(change as Partial<SessionSnapshot>);
    expect(await issuePass(paid.id, NONCE, deps(session))).toEqual({ code });
  });

  it('reports Stripe being down', async () => {
    const down: PassDeps = { ...deps(paid), payments: new FakePayments({}, 'find') };
    expect(await issuePass(paid.id, NONCE, down)).toEqual({ code: 'payment_provider_unavailable' });
  });
});

describe('startCheckout', () => {
  it('verifies the captcha, then returns the session to keep before redirecting', async () => {
    const checkout = new FakeCheckout();
    const captcha = new FakeCaptcha();
    const response = await startCheckout(NONCE, 'turnstile-token', { checkout, captcha });
    expect(response).toMatchObject({ code: 'ok', url: expect.stringMatching(/^https:\/\//) });
    expect(captcha.tokens).toEqual(['turnstile-token']);
    expect(checkout.nonces).toEqual([NONCE]);
    expect(checkout.returns).toEqual(['final_pay']);
  });

  it('asks Stripe to return the person to the review they pay from', async () => {
    const checkout = new FakeCheckout();
    await startCheckout(NONCE, 't', { checkout, captcha: new FakeCaptcha() }, 'rental');
    expect(checkout.returns).toEqual(['rental']);
  });

  it('creates nothing without a valid captcha', async () => {
    const checkout = new FakeCheckout();
    expect(
      await startCheckout(NONCE, 'bad', { checkout, captcha: new FakeCaptcha(false) }),
    ).toEqual({ code: 'captcha_failed' });
    expect(checkout.nonces).toEqual([]);
  });

  it('reports Stripe being down', async () => {
    expect(
      await startCheckout(NONCE, 't', {
        checkout: new FakeCheckout(true),
        captcha: new FakeCaptcha(),
      }),
    ).toEqual({ code: 'payment_provider_unavailable' });
  });
});

describe('Stripe adapter', () => {
  it('accepts only a restricted key, never the full secret key', () => {
    expect(isRestrictedKey('rk_test_51Abc')).toBe(true);
    expect(isRestrictedKey('rk_live_51Abc')).toBe(true);
    for (const key of ['sk_test_51Abc', 'sk_live_51Abc', 'pk_live_51Abc', 'rk_test_', ''])
      expect(isRestrictedKey(key)).toBe(false);
    expect(() => createStripeSessions('sk_live_51Abc')).toThrow();
    expect(() => createStripeCheckout('sk_live_51Abc', PRICE)).toThrow();
    expect(() => createStripeSessions('rk_test_51Abc')).not.toThrow();
  });

  it('creates a one-off card or Bizum payment for the configured price', () => {
    const [params, options] = checkoutParams(NONCE, PRICE);
    expect(params).toMatchObject({
      mode: 'payment',
      line_items: [{ price: PRICE, quantity: 1 }],
      allowed_payment_method_types: ['card', 'bizum'],
      allow_promotion_codes: true,
      client_reference_id: NONCE,
    });
    expect(params.success_url).toBe(
      'https://eslojusto.es/finiquito/?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(options).toEqual({ idempotencyKey: `checkout-${NONCE}` });
    expect(checkoutParams(NONCE, PRICE)).toEqual([params, options]);
    expect(checkoutParams(NONCE, PRICE, 'final_pay')).toEqual([params, options]);
  });

  it('returns a rental payment to /alquiler/, under a key of its own', () => {
    const [params, options] = checkoutParams(NONCE, PRICE, 'rental');
    expect(params.success_url).toBe(
      'https://eslojusto.es/alquiler/?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(params.cancel_url).toBe('https://eslojusto.es/alquiler/');
    expect(options).toEqual({ idempotencyKey: `checkout-rental-${NONCE}` });
  });

  it('returns an employment payment to /contrato/, under a key of its own', () => {
    const [params, options] = checkoutParams(NONCE, PRICE, 'employment');
    expect(params.success_url).toBe(
      'https://eslojusto.es/contrato/?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(params.cancel_url).toBe('https://eslojusto.es/contrato/');
    expect(options).toEqual({ idempotencyKey: `checkout-employment-${NONCE}` });
  });

  const session = (extra: Record<string, unknown> = {}) =>
    ({
      id: 'cs_test_paid',
      mode: 'payment',
      status: 'complete',
      payment_status: 'paid',
      currency: 'eur',
      client_reference_id: NONCE,
      created: CREATED,
      amount_subtotal: 499,
      metadata: {},
      payment_intent: null,
      line_items: { data: [{ quantity: 1, price: { id: PRICE, unit_amount: 499 } }] },
      ...extra,
    }) as unknown as Stripe.Checkout.Session;

  it('maps a retrieved session to a snapshot', () => {
    expect(toSessionSnapshot(session())).toEqual(paid);
    expect(toSessionSnapshot(session({ metadata: { reads_used: '7' } })).readsUsed).toBe(7);
  });

  it('reads the counter it writes and treats anything else as spent', () => {
    expect(readsUsed(null)).toBe(0);
    expect(readsUsed({})).toBe(0);
    expect(readsUsed({ reads_used: '3' })).toBe(3);
    for (const junk of ['-1', '1.5', 'x', '', '9999'])
      expect(readsUsed({ reads_used: junk })).toBe(15);
  });

  const withCharge = (charge: Record<string, unknown>, status = 'succeeded') =>
    session({
      payment_intent: {
        status,
        latest_charge: { refunded: false, amount_refunded: 0, disputed: false, ...charge },
      },
    });

  it('revokes a refunded, partly refunded, disputed or cancelled payment', () => {
    expect(isRevoked(withCharge({}))).toBe(false);
    expect(isRevoked(withCharge({ refunded: true, amount_refunded: 499 }))).toBe(true);
    expect(isRevoked(withCharge({ amount_refunded: 100 }))).toBe(true);
    expect(isRevoked(withCharge({ disputed: true }))).toBe(true);
    expect(isRevoked(withCharge({}, 'canceled'))).toBe(true);
  });

  it('never revokes a 100 % promotion-code session, which has no payment', () => {
    expect(
      isRevoked(session({ payment_intent: null, payment_status: 'no_payment_required' })),
    ).toBe(false);
  });
});

describe('verifyPass', () => {
  const EXPIRY = CREATED + 7 * 86_400;
  const token = signer.sign(passClaims(paid.id, EXPIRY));
  const verifyDeps = (session: SessionSnapshot | null, clock = new FakeClock()) => {
    const payments = new FakePayments(session ? { [session.id]: session } : {});
    let lookups = 0;
    const counting = {
      findSession: (id: string) => {
        lookups += 1;
        return payments.findSession(id);
      },
      recordReads: payments.recordReads.bind(payments),
    };
    return {
      deps: {
        ...deps(session, clock),
        payments: counting,
        memo: createVerifyMemo(),
        hash: (t: string) => `h:${t}`,
      },
      lookups: () => lookups,
    };
  };

  it('a pass the API signed, for a paid session: its expiry and reads left', async () => {
    const { deps: d } = verifyDeps(paidSession({ readsUsed: 4 }));
    expect(await verifyPass(token, d)).toEqual({ code: 'ok', expiresAt: EXPIRY, readsLeft: 11 });
  });

  it('a pass with no reads left still unlocks', async () => {
    const { deps: d } = verifyDeps(paidSession({ readsUsed: 15 }));
    expect(await verifyPass(token, d)).toMatchObject({ code: 'ok', readsLeft: 0 });
  });

  it('a tampered pass is invalid, and Stripe is never asked', async () => {
    const [v, payload, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ typ: 'pass', sid: paid.id, exp: EXPIRY + 86_400 * 365 }),
    ).toString('base64url');
    const { deps: d, lookups } = verifyDeps(paid);
    expect(await verifyPass(`${v}.${forged}.${sig}`, d)).toEqual({ code: 'pass_invalid' });
    expect(await verifyPass(`${v}.${payload}.${sig}x`, d)).toEqual({ code: 'pass_invalid' });
    expect(await verifyPass('not-a-token', d)).toEqual({ code: 'pass_invalid' });
    expect(lookups()).toBe(0);
  });

  it('a free-read quota token is no pass', async () => {
    const quota = signer.sign({ typ: 'quota', day: '2026-10-07', used: 1 });
    const { deps: d } = verifyDeps(paid);
    expect(await verifyPass(quota, d)).toEqual({ code: 'pass_invalid' });
  });

  it('an expired pass', async () => {
    const { deps: d } = verifyDeps(paid, new FakeClock(EXPIRY * 1000));
    expect(await verifyPass(token, d)).toEqual({ code: 'pass_expired' });
  });

  it('a refunded, disputed or cancelled payment revokes it', async () => {
    const { deps: d } = verifyDeps(paidSession({ revoked: true }));
    expect(await verifyPass(token, d)).toEqual({ code: 'pass_revoked' });
  });

  it('a session Stripe does not find is unconfirmed, never invalid; one never paid is', async () => {
    expect(await verifyPass(token, verifyDeps(null).deps)).toEqual({ code: 'pass_unconfirmed' });
    expect(
      await verifyPass(token, verifyDeps(paidSession({ paymentStatus: 'unpaid' })).deps),
    ).toEqual({ code: 'pass_invalid' });
  });

  it('Stripe down: the provider is unavailable, never ok', async () => {
    const d = {
      ...deps(paid),
      payments: new FakePayments({}, 'find'),
      memo: createVerifyMemo(),
      hash: (t: string) => t,
    };
    expect(await verifyPass(token, d)).toEqual({ code: 'payment_provider_unavailable' });
  });

  it('remembers a success for a minute, and only a success', async () => {
    const clock = new FakeClock();
    const { deps: d, lookups } = verifyDeps(paid, clock);
    await verifyPass(token, d);
    await verifyPass(token, d);
    expect(lookups()).toBe(1);
    clock.ms += VERIFY_MEMO_MS;
    await verifyPass(token, d);
    expect(lookups()).toBe(2);
    const revoked = verifyDeps(paidSession({ revoked: true }));
    await verifyPass(token, revoked.deps);
    await verifyPass(token, revoked.deps);
    expect(revoked.lookups()).toBe(2);
  });
});
