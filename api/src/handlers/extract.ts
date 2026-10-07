import { ESCALATION_MODEL, PARAMETER_NAMES, PRIMARY_MODEL } from '../config';
import { bedrockInvoke, createBedrockReader } from '../adapters/bedrock-reader';
import { createHmacSigner } from '../adapters/hmac-signer';
import { pdfInspector } from '../adapters/pdf-inspector';
import { consoleLogger, systemClock } from '../adapters/runtime';
import { loadParameters } from '../adapters/ssm-parameters';
import { createStripeSessions } from '../adapters/stripe-payments';
import { createTurnstileVerifier } from '../adapters/turnstile';
import { handleExtract } from '../http/extract';
import { unavailable } from './unavailable';
import type { HttpEvent, HttpResponse } from '../http/common';

const reader = createBedrockReader(bedrockInvoke());

let deps: ReturnType<typeof load> | undefined;
const load = async () => {
  const { tokenKey, turnstileSecretKey, stripeRestrictedKey } = await loadParameters({
    tokenKey: PARAMETER_NAMES.tokenKey,
    turnstileSecretKey: PARAMETER_NAMES.turnstileSecretKey,
    stripeRestrictedKey: PARAMETER_NAMES.stripeRestrictedKey,
  });
  return {
    captcha: createTurnstileVerifier(turnstileSecretKey, 'extract'),
    signer: createHmacSigner(tokenKey),
    payments: createStripeSessions(stripeRestrictedKey),
  };
};

export async function handler(event: HttpEvent): Promise<HttpResponse> {
  let loaded;
  try {
    loaded = await (deps ??= load());
  } catch {
    deps = undefined;
    return unavailable('extract', event);
  }
  return handleExtract(event, {
    ...loaded,
    reader,
    pdf: pdfInspector,
    clock: systemClock,
    logger: consoleLogger,
    models: { primary: PRIMARY_MODEL, escalation: ESCALATION_MODEL },
  });
}
