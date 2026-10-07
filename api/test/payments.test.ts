import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { checkoutParams, toSessionSnapshot } from '../src/adapters/stripe-payments';
import { issuePass, PASS_PRICE_CENTS, startCheckout, type PassDeps } from '../src/domain/payments';
import type { SessionSnapshot } from '../src/domain/ports';
import { FakeCheckout, FakeClock, FakePayments } from './support/fakes';

const signer = createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256');
const PRICE = 'price_test_pass';
const NONCE = 'n0nce-generated-by-the-browser';
const CREATED = Date.UTC(2026, 9, 6, 12) / 1000;

const paid: SessionSnapshot = {
  id: 'cs_test_paid',
  mode: 'payment',
  status: 'complete',
  paymentStatus: 'paid',
  currency: 'eur',
  clientReferenceId: NONCE,
  created: CREATED,
  amountSubtotal: PASS_PRICE_CENTS,
  lineItems: [{ priceId: PRICE, unitAmount: PASS_PRICE_CENTS, quantity: 1 }],
};

const deps = (session: SessionSnapshot | null, clock = new FakeClock()): PassDeps => ({
  payments: new FakePayments(session ? { [session.id]: session } : {}),
  signer,
  clock,
  priceId: PRICE,
});

describe('issuePass', () => {
  it('issues a 7-day pass with no reads used for a paid session', async () => {
    const response = await issuePass(paid.id, NONCE, deps(paid));
    if (response.code !== 'ok') throw new Error(response.code);
    expect(response.expiresAt).toBe(CREATED + 7 * 86_400);
    expect(signer.verify(response.pass)).toEqual({
      typ: 'pass',
      sid: paid.id,
      exp: CREATED + 7 * 86_400,
      used: 0,
    });
  });

  it('is idempotent for the same session', async () => {
    const first = await issuePass(paid.id, NONCE, deps(paid));
    const later = await issuePass(paid.id, NONCE, deps(paid, new FakeClock(Date.now() + 1000)));
    expect(later).toEqual(first);
  });

  it('accepts a session paid in full with a promotion code', async () => {
    const free = { ...paid, paymentStatus: 'no_payment_required' };
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
    ['another currency', { currency: 'usd' }, 'price_mismatch'],
    ['another amount', { amountSubtotal: 100 }, 'price_mismatch'],
    [
      'another price',
      { lineItems: [{ priceId: 'price_other', unitAmount: PASS_PRICE_CENTS, quantity: 1 }] },
      'price_mismatch',
    ],
    [
      'two passes in one session',
      { lineItems: [{ priceId: PRICE, unitAmount: PASS_PRICE_CENTS, quantity: 2 }] },
      'price_mismatch',
    ],
    ['no line items', { lineItems: [] }, 'price_mismatch'],
    ['a session paid over a week ago', { created: CREATED - 8 * 86_400 }, 'pass_expired'],
  ] as const)('refuses %s', async (_, change, code) => {
    const session = change === null ? null : { ...paid, ...change };
    expect(await issuePass(paid.id, NONCE, deps(session))).toEqual({ code });
  });

  it('reports Stripe being down', async () => {
    const down: PassDeps = { ...deps(paid), payments: new FakePayments({}, true) };
    expect(await issuePass(paid.id, NONCE, down)).toEqual({ code: 'payment_provider_unavailable' });
  });
});

describe('startCheckout', () => {
  it('returns the session to keep before redirecting', async () => {
    const checkout = new FakeCheckout();
    const response = await startCheckout(NONCE, { checkout });
    expect(response).toMatchObject({ code: 'ok', url: expect.stringMatching(/^https:\/\//) });
    expect(checkout.nonces).toEqual([NONCE]);
  });

  it('reports Stripe being down', async () => {
    expect(await startCheckout(NONCE, { checkout: new FakeCheckout(true) })).toEqual({
      code: 'payment_provider_unavailable',
    });
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

  it('maps a retrieved session to a snapshot', () => {
    const session = {
      id: 'cs_test_paid',
      mode: 'payment',
      status: 'complete',
      payment_status: 'paid',
      currency: 'eur',
      client_reference_id: NONCE,
      created: CREATED,
      amount_subtotal: 499,
      line_items: { data: [{ quantity: 1, price: { id: PRICE, unit_amount: 499 } }] },
    } as unknown as Stripe.Checkout.Session;
    expect(toSessionSnapshot(session)).toEqual(paid);
  });
});
