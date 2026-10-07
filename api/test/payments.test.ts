import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import {
  checkoutParams,
  isRevoked,
  readsUsed,
  toSessionSnapshot,
} from '../src/adapters/stripe-payments';
import { issuePass, startCheckout, type PassDeps } from '../src/domain/payments';
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
