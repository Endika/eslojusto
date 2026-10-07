import { ESCALATION_MODEL, PARAMETER_NAMES, PRIMARY_MODEL } from '../config';
import { bedrockInvoke, createBedrockReader } from '../adapters/bedrock-reader';
import { createHmacSigner } from '../adapters/hmac-signer';
import { pdfInspector } from '../adapters/pdf-inspector';
import { consoleLogger, systemClock } from '../adapters/runtime';
import { loadParameters } from '../adapters/ssm-parameters';
import { createTurnstileVerifier } from '../adapters/turnstile';
import { handleExtract } from '../http/extract';
import { unavailable } from './unavailable';
import type { HttpEvent, HttpResponse } from '../http/common';

const reader = createBedrockReader(bedrockInvoke());

let secrets: ReturnType<typeof load> | undefined;
const load = () =>
  loadParameters({
    tokenKey: PARAMETER_NAMES.tokenKey,
    turnstileSecretKey: PARAMETER_NAMES.turnstileSecretKey,
  });

export async function handler(event: HttpEvent): Promise<HttpResponse> {
  let loaded;
  try {
    loaded = await (secrets ??= load());
  } catch {
    secrets = undefined;
    return unavailable('extract', event);
  }
  return handleExtract(event, {
    reader,
    pdf: pdfInspector,
    captcha: createTurnstileVerifier(loaded.turnstileSecretKey),
    signer: createHmacSigner(loaded.tokenKey),
    clock: systemClock,
    logger: consoleLogger,
    models: { primary: PRIMARY_MODEL, escalation: ESCALATION_MODEL },
  });
}
