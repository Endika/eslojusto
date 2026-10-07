import type { Claims, TokenSigner } from './ports';
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
  // `next` is the token to hand back after a successful read.
  | { readonly ok: true; readonly next: () => string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

export const utcDay = (epochMs: number): string => new Date(epochMs).toISOString().slice(0, 10);

export function passClaims(sessionId: string, expiresAt: number, used: number): Claims {
  return { typ: 'pass', sid: sessionId, exp: expiresAt, used };
}

export function passExpiry(sessionCreated: number): number {
  return sessionCreated + PASS_DAYS * DAY_SECONDS;
}

export function checkAllowance(
  allowance: Allowance,
  signer: TokenSigner,
  nowMs: number,
): AllowanceCheck {
  if (allowance.type === 'pass') {
    const c = signer.verify(allowance.token);
    if (
      !isRecord(c) ||
      c['typ'] !== 'pass' ||
      typeof c['sid'] !== 'string' ||
      !isCount(c['exp']) ||
      !isCount(c['used'])
    )
      return { ok: false, code: 'pass_invalid' };
    const { sid, exp, used } = c;
    if (nowMs >= exp * 1000) return { ok: false, code: 'pass_expired' };
    if (used >= PASS_READS) return { ok: false, code: 'pass_exhausted' };
    return { ok: true, next: () => signer.sign(passClaims(sid, exp, used + 1)) };
  }

  const today = utcDay(nowMs);
  let used = 0;
  if (allowance.token !== null) {
    const c = signer.verify(allowance.token);
    if (!isRecord(c) || c['typ'] !== 'quota' || typeof c['day'] !== 'string' || !isCount(c['used']))
      return { ok: false, code: 'invalid_request' };
    if (c['day'] === today) used = c['used'];
  }
  if (used >= FREE_READS_PER_DAY) return { ok: false, code: 'daily_limit_reached' };
  return { ok: true, next: () => signer.sign({ typ: 'quota', day: today, used: used + 1 }) };
}
