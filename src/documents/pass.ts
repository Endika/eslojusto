import { NONCE, PASS_READS, SESSION_ID } from './contract';
import type { KeyValueStore } from './ports';

// Browser storage keys. Each one holds something the person asked for: their free-read count,
// the pass they paid for, and the payment they started, so the pass can be fetched again.
export const STORAGE_KEYS = {
  quota: 'eslojusto-lecturas',
  pass: 'eslojusto-pase',
  checkout: 'eslojusto-pago',
} as const;

export interface StoredPass {
  readonly token: string;
  // Epoch seconds, as the API returns it.
  readonly expiresAt: number;
  // What the API last said the pass has left; Stripe keeps the real count.
  readonly readsLeft: number;
  // False once the API refused it and it could not be fetched again: it still unlocks the
  // report and the letter until it expires, but is no longer sent with a read.
  readonly usable?: false;
}

// A payment started from this browser. Once redeemed it stays, with its pass's expiry, so the
// API can hand the same pass out again for the same session and nonce.
export interface PendingCheckout {
  readonly nonce: string;
  readonly sessionId: string;
  readonly redeemed?: true;
  // Epoch seconds; set once redeemed.
  readonly expiresAt?: number;
}

const MAX_PENDING_CHECKOUTS = 5;

function isPendingCheckout(v: unknown): v is PendingCheckout {
  if (typeof v !== 'object' || v === null) return false;
  const { nonce, sessionId, redeemed, expiresAt } = v as Record<string, unknown>;
  return (
    typeof nonce === 'string' &&
    NONCE.test(nonce) &&
    typeof sessionId === 'string' &&
    SESSION_ID.test(sessionId) &&
    (redeemed === undefined || (redeemed === true && Number.isInteger(expiresAt)))
  );
}

export interface PassClaims {
  readonly sessionId: string;
  readonly expiresAt: number;
}

function base64UrlJson(part: string): unknown {
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')), (c) =>
      c.charCodeAt(0),
    );
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

// Reads the claims of a `v1.<payload>.<signature>` pass. Only the server can check the signature;
// the page reads the claims to know whether the pass is worth sending at all.
export function passClaims(token: string): PassClaims | null {
  const [version, payload, signature, ...rest] = token.split('.');
  if (version !== 'v1' || !payload || !signature || rest.length > 0) return null;
  const c = base64UrlJson(payload);
  if (typeof c !== 'object' || c === null) return null;
  const { typ, sid, exp } = c as Record<string, unknown>;
  if (typ !== 'pass' || typeof sid !== 'string' || !Number.isInteger(exp)) return null;
  return { sessionId: sid, expiresAt: exp as number };
}

export type PassState = 'none' | 'valid' | 'exhausted' | 'expired';

export function passState(stored: StoredPass | null, nowMs: number): PassState {
  if (!stored) return 'none';
  const claims = passClaims(stored.token);
  if (!claims) return 'none';
  if (nowMs >= Math.min(claims.expiresAt, stored.expiresAt) * 1000) return 'expired';
  return stored.readsLeft > 0 && stored.usable !== false ? 'valid' : 'exhausted';
}

// A report or letter needs an unexpired pass; reads also need uses left.
export const canDownload = (state: PassState) => state === 'valid' || state === 'exhausted';

const readJson = (store: KeyValueStore, key: string): Record<string, unknown> | null => {
  const raw = store.get(key);
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export function createPassStore(store: KeyValueStore, now: () => number = () => Date.now()) {
  const write = (list: readonly PendingCheckout[]) =>
    list.length > 0
      ? store.set(STORAGE_KEYS.checkout, JSON.stringify(list))
      : store.remove(STORAGE_KEYS.checkout);
  return {
    pass(): StoredPass | null {
      const v = readJson(store, STORAGE_KEYS.pass);
      if (!v || typeof v['token'] !== 'string' || typeof v['expiresAt'] !== 'number') return null;
      const left = v['readsLeft'];
      return {
        token: v['token'],
        expiresAt: v['expiresAt'],
        readsLeft: Number.isInteger(left) ? Math.min(PASS_READS, left as number) : PASS_READS,
        ...(v['usable'] === false ? { usable: false as const } : {}),
      };
    },
    savePass(pass: StoredPass): void {
      store.set(STORAGE_KEYS.pass, JSON.stringify(pass));
    },
    // Records what the API says is left, or forgets a pass it no longer honours.
    updateReads(readsLeft: number): void {
      const current = this.pass();
      if (current) this.savePass({ ...current, readsLeft });
    },
    forgetPass(): void {
      store.remove(STORAGE_KEYS.pass);
    },
    // Keeps the downloads until the pass expires, but sends it with no more reads.
    retirePass(): void {
      const current = this.pass();
      if (current) this.savePass({ ...current, usable: false });
    },
    forgetQuota(): void {
      store.remove(STORAGE_KEYS.quota);
    },
    quota(): string | null {
      return store.get(STORAGE_KEYS.quota);
    },
    saveQuota(token: string): void {
      store.set(STORAGE_KEYS.quota, token);
    },
    // Payments started from this browser, newest first: the ones not yet turned into a pass, and
    // the redeemed ones until their pass expires. Each keeps its own nonce, so a new payment never
    // loses the way to redeem, or fetch again, an earlier one.
    checkouts(): PendingCheckout[] {
      const raw = store.get(STORAGE_KEYS.checkout);
      let list: unknown;
      try {
        list = raw === null ? [] : JSON.parse(raw);
      } catch {
        return [];
      }
      const nowSeconds = now() / 1000;
      return (Array.isArray(list) ? list : [list])
        .filter(isPendingCheckout)
        .filter((c) => !c.redeemed || (c.expiresAt ?? 0) > nowSeconds);
    },
    addCheckout(checkout: PendingCheckout): void {
      const rest = this.checkouts().filter((c) => c.nonce !== checkout.nonce);
      write([checkout, ...rest].slice(0, MAX_PENDING_CHECKOUTS));
    },
    markRedeemed(sessionId: string, expiresAt: number): void {
      write(
        this.checkouts().map((c) =>
          c.sessionId === sessionId ? { ...c, redeemed: true as const, expiresAt } : c,
        ),
      );
    },
    removeCheckout(sessionId: string): void {
      write(this.checkouts().filter((c) => c.sessionId !== sessionId));
    },
  };
}
export type PassStore = ReturnType<typeof createPassStore>;

// 32 random url-safe characters: enough that a leaked session id alone can't redeem a pass.
export function newNonce(random: (count: number) => Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return Array.from(random(32), (b) => alphabet[b & 63]).join('');
}
