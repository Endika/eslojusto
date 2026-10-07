import { PARAMETER_NAMES, STRIPE_PRICE_ENV } from '../config';
import { consoleLogger, systemClock } from '../adapters/runtime';
import { loadParameters } from '../adapters/ssm-parameters';
import { createStripePayments } from '../adapters/stripe-payments';
import { handleCheckout } from '../http/payments';
import { unavailable } from './unavailable';
import type { HttpEvent, HttpResponse } from '../http/common';

let payments: ReturnType<typeof load> | undefined;
const load = async () => {
  const { stripeSecretKey } = await loadParameters({
    stripeSecretKey: PARAMETER_NAMES.stripeSecretKey,
  });
  const priceId = process.env[STRIPE_PRICE_ENV];
  if (!priceId) throw new Error('Missing Stripe price id');
  return createStripePayments(stripeSecretKey, priceId);
};

export async function handler(event: HttpEvent): Promise<HttpResponse> {
  let checkout;
  try {
    checkout = await (payments ??= load());
  } catch {
    payments = undefined;
    return unavailable('checkout', event);
  }
  return handleCheckout(event, { checkout, logger: consoleLogger, clock: systemClock });
}
