import { SITE_HOSTNAME } from '../config';
import type { CaptchaVerifier } from '../domain/ports';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// The widget's `action`, so a token solved for one endpoint can't be spent on another.
export type TurnstileAction = 'extract' | 'checkout';

export function isAcceptedVerdict(verdict: unknown, action: TurnstileAction): boolean {
  if (typeof verdict !== 'object' || verdict === null) return false;
  const v = verdict as Record<string, unknown>;
  return v['success'] === true && v['hostname'] === SITE_HOSTNAME && v['action'] === action;
}

// Siteverify rejects a token it has already seen, so each request costs a fresh challenge.
export function createTurnstileVerifier(secret: string, action: TurnstileAction): CaptchaVerifier {
  return {
    async verify(token) {
      try {
        const response = await fetch(SITEVERIFY, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ secret, response: token }),
          signal: AbortSignal.timeout(5000),
        });
        return response.ok && isAcceptedVerdict(await response.json(), action);
      } catch {
        return false;
      }
    },
  };
}
