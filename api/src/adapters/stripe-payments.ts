import Stripe from 'stripe';
import { CHECKOUT_CANCEL_PATH, CHECKOUT_SUCCESS_PATH, SITE_ORIGIN } from '../config';
import { PASS_READS } from '../domain/allowance';
import type { CheckoutCreator, PaymentVerifier, SessionSnapshot } from '../domain/ports';

export const READS_METADATA_KEY = 'reads_used';

// Only this code writes the counter; anything else in it counts as a spent pass.
export function readsUsed(metadata: Stripe.Metadata | null): number {
  const raw = metadata?.[READS_METADATA_KEY];
  if (raw === undefined) return 0;
  return /^\d{1,3}$/.test(raw) ? Number(raw) : PASS_READS;
}

// A refund (even partial) or a dispute on the charge withdraws the pass. A 100 % promotion
// code leaves no payment to refund.
export function isRevoked(session: Stripe.Checkout.Session): boolean {
  const intent = session.payment_intent;
  if (intent === null || typeof intent === 'string') return false;
  const charge = intent.latest_charge;
  if (intent.status === 'canceled') return true;
  if (charge === null || typeof charge === 'string') return false;
  return charge.refunded || charge.amount_refunded > 0 || charge.disputed;
}

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
    readsUsed: readsUsed(session.metadata),
    revoked: isRevoked(session),
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

// Only a restricted key, never the account's full secret key, may reach a Lambda.
export function isRestrictedKey(key: string): boolean {
  return /^rk_(test|live)_[A-Za-z0-9]+$/.test(key);
}

const client = (restrictedKey: string): Stripe => {
  if (!isRestrictedKey(restrictedKey)) throw new Error('Not a Stripe restricted key');
  return new Stripe(restrictedKey, { maxNetworkRetries: 1, timeout: 8000 });
};

export function createStripeCheckout(restrictedKey: string, priceId: string): CheckoutCreator {
  const stripe = client(restrictedKey);
  return {
    async create(nonce) {
      const session = await stripe.checkout.sessions.create(...checkoutParams(nonce, priceId));
      if (!session.url) throw new Error('Checkout Session without a URL');
      return { sessionId: session.id, url: session.url };
    },
  };
}

export function createStripeSessions(restrictedKey: string): PaymentVerifier {
  const stripe = client(restrictedKey);
  return {
    async findSession(sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ['line_items', 'payment_intent.latest_charge'],
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
    async recordReads(sessionId, used) {
      await stripe.checkout.sessions.update(sessionId, {
        metadata: { [READS_METADATA_KEY]: String(used) },
      });
    },
  };
}
