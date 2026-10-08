import {
  isNonce,
  isSessionId,
  issuePass,
  startCheckout,
  verifyPass,
  type PassDeps,
  type VerifyMemo,
} from '../domain/payments';
import type { CaptchaVerifier, CheckoutCreator, Clock, Logger } from '../domain/ports';
import type { ReviewKind } from '../domain/reviews';
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
    const { nonce, captchaToken, returnTo } = body;
    if (
      !isNonce(nonce) ||
      typeof captchaToken !== 'string' ||
      captchaToken.length === 0 ||
      captchaToken.length > MAX_TOKEN_LENGTH ||
      (returnTo !== undefined && returnTo !== 'rental')
    )
      return { code: 'invalid_request' };
    const review: ReviewKind = returnTo ?? 'final_pay';
    return startCheckout(nonce, captchaToken, deps, review);
  });
}

// `{ sessionId, nonce }` issues the pass; `{ pass }` alone verifies one the browser holds.
export function handlePass(
  event: HttpEvent,
  deps: PassDeps & {
    readonly logger: Logger;
    readonly memo: VerifyMemo;
    readonly hash: (token: string) => string;
  },
): Promise<HttpResponse> {
  return handle('pass', event, deps, async (body, metrics) => {
    const { sessionId, nonce, pass } = body;
    if (pass !== undefined) {
      metrics.verify = true;
      if (
        sessionId !== undefined ||
        nonce !== undefined ||
        typeof pass !== 'string' ||
        pass.length === 0 ||
        pass.length > MAX_TOKEN_LENGTH
      )
        return { code: 'invalid_request' };
      return verifyPass(pass, deps);
    }
    if (!isSessionId(sessionId) || !isNonce(nonce)) return { code: 'invalid_request' };
    return issuePass(sessionId, nonce, deps);
  });
}
