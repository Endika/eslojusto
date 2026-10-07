import { isNonce, isSessionId, issuePass, startCheckout, type PassDeps } from '../domain/payments';
import type { CheckoutCreator, Clock, Logger } from '../domain/ports';
import { handle, type HttpEvent, type HttpResponse } from './common';

export function handleCheckout(
  event: HttpEvent,
  deps: { readonly checkout: CheckoutCreator; readonly logger: Logger; readonly clock: Clock },
): Promise<HttpResponse> {
  return handle('checkout', event, deps, async (body) => {
    const { nonce } = body;
    if (!isNonce(nonce)) return { code: 'invalid_request' };
    return startCheckout(nonce, deps);
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
