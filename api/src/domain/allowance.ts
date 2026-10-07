import type { Claims, SessionSnapshot, TokenSigner } from './ports';
import type { ErrorCode } from './results';

export const FREE_READS_PER_DAY = 2;
export const PASS_READS = 15;
export const PASS_DAYS = 7;
const DAY_SECONDS = 86_400;

export type Allowance =
  | { readonly type: 'free'; readonly token: string | null }
  | { readonly type: 'pass'; readonly token: string };

export type AllowanceCheck =
  | { readonly ok: false; readonly code: ErrorCode }
  // Free reads: `next` is the quota token to hand back after a successful read.
  | { readonly ok: true; readonly type: 'free'; readonly next: () => string }
  // Passes: the count lives in Stripe, so the token itself never changes.
  | { readonly ok: true; readonly type: 'pass'; readonly sessionId: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

export const utcDay = (epochMs: number): string => new Date(epochMs).toISOString().slice(0, 10);

export function passClaims(sessionId: string, expiresAt: number): Claims {
  return { typ: 'pass', sid: sessionId, exp: expiresAt };
}

export function passExpiry(sessionCreated: number): number {
  return sessionCreated + PASS_DAYS * DAY_SECONDS;
}

// Signature and dates only; a pass is checked against Stripe once the captcha has passed.
export function checkAllowance(
  allowance: Allowance,
  signer: TokenSigner,
  nowMs: number,
): AllowanceCheck {
  if (allowance.type === 'pass') {
    const c = signer.verify(allowance.token);
    if (!isRecord(c) || c['typ'] !== 'pass' || typeof c['sid'] !== 'string' || !isCount(c['exp']))
      return { ok: false, code: 'pass_invalid' };
    if (nowMs >= c['exp'] * 1000) return { ok: false, code: 'pass_expired' };
    return { ok: true, type: 'pass', sessionId: c['sid'] };
  }

  // Cooperative: without storage, a browser that drops or replays this token starts over.
  const today = utcDay(nowMs);
  let used = 0;
  if (allowance.token !== null) {
    const c = signer.verify(allowance.token);
    if (!isRecord(c) || c['typ'] !== 'quota' || typeof c['day'] !== 'string' || !isCount(c['used']))
      return { ok: false, code: 'invalid_request' };
    if (c['day'] === today) used = c['used'];
  }
  if (used >= FREE_READS_PER_DAY) return { ok: false, code: 'daily_limit_reached' };
  return {
    ok: true,
    type: 'free',
    next: () => signer.sign({ typ: 'quota', day: today, used: used + 1 }),
  };
}

// Whether a session still grants a pass at all; reads left are counted separately.
export function passSessionProblem(session: SessionSnapshot, nowMs: number): ErrorCode | null {
  if (session.revoked) return 'pass_revoked';
  if (
    session.mode !== 'payment' ||
    session.status !== 'complete' ||
    session.paymentStatus === 'unpaid'
  )
    return 'payment_not_complete';
  if (nowMs >= passExpiry(session.created) * 1000) return 'pass_expired';
  return null;
}

export const readsLeft = (session: SessionSnapshot): number =>
  Math.max(0, PASS_READS - session.readsUsed);
