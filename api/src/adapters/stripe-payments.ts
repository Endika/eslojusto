import Stripe from 'stripe';
import { CHECKOUT_CANCEL_PATH, CHECKOUT_SUCCESS_PATH, SITE_ORIGIN } from '../config';
import type { CheckoutCreator, PaymentVerifier, SessionSnapshot } from '../domain/ports';

export function toSessionSnapshot(session: Stripe.Checkout.Session): SessionSnapshot {
  return {
    id: session.id,
    mode: session.mode,
    status: session.status,
    paymentStatus: session.payment_status,
    currency: session.currency,
    clientReferenceId: session.client_reference_id,
    created: session.created,
    amountSubtotal: session.amount_subtotal,
    lineItems: (session.line_items?.data ?? []).map((item) => ({
      priceId: item.price?.id ?? null,
      unitAmount: item.price?.unit_amount ?? null,
      quantity: item.quantity,
    })),
  };
}

export function checkoutParams(
  nonce: string,
  priceId: string,
): [Stripe.Checkout.SessionCreateParams, Stripe.RequestOptions] {
  return [
    {
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      // A filter on the methods enabled in the Dashboard, which is how Bizum must be offered.
      allowed_payment_method_types: ['card', 'bizum'],
      allow_promotion_codes: true,
      client_reference_id: nonce,
      locale: 'es',
      success_url: `${SITE_ORIGIN}${CHECKOUT_SUCCESS_PATH}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_ORIGIN}${CHECKOUT_CANCEL_PATH}`,
    },
    // Retrying with the same nonce returns the same session instead of a second one.
    { idempotencyKey: `checkout-${nonce}` },
  ];
}

export function createStripePayments(
  secretKey: string,
  priceId: string,
): CheckoutCreator & PaymentVerifier {
  const stripe = new Stripe(secretKey, { maxNetworkRetries: 1, timeout: 8000 });
  return {
    async create(nonce) {
      const session = await stripe.checkout.sessions.create(...checkoutParams(nonce, priceId));
      if (!session.url) throw new Error('Checkout Session without a URL');
      return { sessionId: session.id, url: session.url };
    },
    async findSession(sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ['line_items'],
        });
        return toSessionSnapshot(session);
      } catch (error) {
        if (
          error instanceof Stripe.errors.StripeInvalidRequestError &&
          error.code === 'resource_missing'
        )
          return null;
        throw error;
      }
    },
  };
}
