import { SITE_HOSTNAME } from '../config';
import type { CaptchaVerifier } from '../domain/ports';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_ACTION = 'extract';

export function isAcceptedVerdict(verdict: unknown): boolean {
  if (typeof verdict !== 'object' || verdict === null) return false;
  const v = verdict as Record<string, unknown>;
  return (
    v['success'] === true && v['hostname'] === SITE_HOSTNAME && v['action'] === TURNSTILE_ACTION
  );
}

// Siteverify rejects a token it has already seen, so each read costs a fresh challenge.
export function createTurnstileVerifier(secret: string): CaptchaVerifier {
  return {
    async verify(token) {
      try {
        const response = await fetch(SITEVERIFY, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ secret, response: token }),
          signal: AbortSignal.timeout(5000),
        });
        return response.ok && isAcceptedVerdict(await response.json());
      } catch {
        return false;
      }
    },
  };
}
