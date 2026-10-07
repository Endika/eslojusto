import { PARAMETER_NAMES, STRIPE_PRICE_ENV } from '../config';
import { consoleLogger, systemClock } from '../adapters/runtime';
import { loadParameters } from '../adapters/ssm-parameters';
import { createStripeCheckout } from '../adapters/stripe-payments';
import { createTurnstileVerifier } from '../adapters/turnstile';
import { handleCheckout } from '../http/payments';
import { unavailable } from './unavailable';
import type { HttpEvent, HttpResponse } from '../http/common';

let deps: ReturnType<typeof load> | undefined;
const load = async () => {
  const { stripeSecretKey, turnstileSecretKey } = await loadParameters({
    stripeSecretKey: PARAMETER_NAMES.stripeSecretKey,
    turnstileSecretKey: PARAMETER_NAMES.turnstileSecretKey,
  });
  const priceId = process.env[STRIPE_PRICE_ENV];
  if (!priceId) throw new Error('Missing Stripe price id');
  return {
    checkout: createStripeCheckout(stripeSecretKey, priceId),
    captcha: createTurnstileVerifier(turnstileSecretKey, 'checkout'),
  };
};

export async function handler(event: HttpEvent): Promise<HttpResponse> {
  let loaded;
  try {
    loaded = await (deps ??= load());
  } catch {
    deps = undefined;
    return unavailable('checkout', event);
  }
  return handleCheckout(event, { ...loaded, logger: consoleLogger, clock: systemClock });
}
