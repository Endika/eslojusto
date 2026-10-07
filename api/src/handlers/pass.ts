import { PARAMETER_NAMES, STRIPE_PRICE_ENV } from '../config';
import { createHmacSigner } from '../adapters/hmac-signer';
import { consoleLogger, systemClock } from '../adapters/runtime';
import { loadParameters } from '../adapters/ssm-parameters';
import { createStripeSessions } from '../adapters/stripe-payments';
import { handlePass } from '../http/payments';
import { unavailable } from './unavailable';
import type { HttpEvent, HttpResponse } from '../http/common';

let deps: ReturnType<typeof load> | undefined;
const load = async () => {
  const { stripeRestrictedKey, tokenKey } = await loadParameters({
    stripeRestrictedKey: PARAMETER_NAMES.stripeRestrictedKey,
    tokenKey: PARAMETER_NAMES.tokenKey,
  });
  const priceId = process.env[STRIPE_PRICE_ENV];
  if (!priceId) throw new Error('Missing Stripe price id');
  return {
    payments: createStripeSessions(stripeRestrictedKey),
    signer: createHmacSigner(tokenKey),
    priceId,
  };
};

export async function handler(event: HttpEvent): Promise<HttpResponse> {
  let loaded;
  try {
    loaded = await (deps ??= load());
  } catch {
    deps = undefined;
    return unavailable('pass', event);
  }
  return handlePass(event, { ...loaded, clock: systemClock, logger: consoleLogger });
}
