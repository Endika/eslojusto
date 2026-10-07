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
}

export interface PendingCheckout {
  readonly nonce: string;
  readonly sessionId: string | null;
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
  return stored.readsLeft > 0 ? 'valid' : 'exhausted';
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

export function createPassStore(store: KeyValueStore) {
  return {
    pass(): StoredPass | null {
      const v = readJson(store, STORAGE_KEYS.pass);
      if (!v || typeof v['token'] !== 'string' || typeof v['expiresAt'] !== 'number') return null;
      const left = v['readsLeft'];
      return {
        token: v['token'],
        expiresAt: v['expiresAt'],
        readsLeft: Number.isInteger(left) ? Math.min(PASS_READS, left as number) : PASS_READS,
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
    quota(): string | null {
      return store.get(STORAGE_KEYS.quota);
    },
    saveQuota(token: string): void {
      store.set(STORAGE_KEYS.quota, token);
    },
    checkout(): PendingCheckout | null {
      const v = readJson(store, STORAGE_KEYS.checkout);
      if (!v || typeof v['nonce'] !== 'string' || !NONCE.test(v['nonce'])) return null;
      const sid = v['sessionId'];
      return {
        nonce: v['nonce'],
        sessionId: typeof sid === 'string' && SESSION_ID.test(sid) ? sid : null,
      };
    },
    saveCheckout(checkout: PendingCheckout): void {
      store.set(STORAGE_KEYS.checkout, JSON.stringify(checkout));
    },
  };
}
export type PassStore = ReturnType<typeof createPassStore>;

// 32 random url-safe characters: enough that a leaked session id alone can't redeem a pass.
export function newNonce(random: (count: number) => Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return Array.from(random(32), (b) => alphabet[b & 63]).join('');
}
