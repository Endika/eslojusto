import { isNonce, isSessionId, issuePass, startCheckout, type PassDeps } from '../domain/payments';
import type { CaptchaVerifier, CheckoutCreator, Clock, Logger } from '../domain/ports';
import { handle, type HttpEvent, type HttpResponse } from './common';

const MAX_TOKEN_LENGTH = 2048;

export function handleCheckout(
  event: HttpEvent,
  deps: {
    readonly checkout: CheckoutCreator;
    readonly captcha: CaptchaVerifier;
    readonly logger: Logger;
    readonly clock: Clock;
  },
): Promise<HttpResponse> {
  return handle('checkout', event, deps, async (body) => {
    const { nonce, captchaToken } = body;
    if (
      !isNonce(nonce) ||
      typeof captchaToken !== 'string' ||
      captchaToken.length === 0 ||
      captchaToken.length > MAX_TOKEN_LENGTH
    )
      return { code: 'invalid_request' };
    return startCheckout(nonce, captchaToken, deps);
  });
}

export function handlePass(
  event: HttpEvent,
  deps: PassDeps & { readonly logger: Logger },
): Promise<HttpResponse> {
  return handle('pass', event, deps, async (body) => {
    const { sessionId, nonce } = body;
    if (!isSessionId(sessionId) || !isNonce(nonce)) return { code: 'invalid_request' };
    return issuePass(sessionId, nonce, deps);
  });
}
