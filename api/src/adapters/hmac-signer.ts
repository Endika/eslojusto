import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Claims, TokenSigner } from '../domain/ports';

const VERSION = 'v1';
const MAX_TOKEN_LENGTH = 1024;
const MIN_KEY_BYTES = 32;

const b64url = (data: Buffer | string): string => Buffer.from(data).toString('base64url');

export function createHmacSigner(key: string): TokenSigner {
  if (Buffer.byteLength(key) < MIN_KEY_BYTES) throw new Error('Token key too short');
  const mac = (payload: string): Buffer =>
    createHmac('sha256', key).update(`${VERSION}.${payload}`).digest();

  return {
    sign(claims: Claims) {
      const payload = b64url(JSON.stringify(claims));
      return `${VERSION}.${payload}.${b64url(mac(payload))}`;
    },
    verify(token: string) {
      if (token.length > MAX_TOKEN_LENGTH) return null;
      const [version, payload, signature, ...rest] = token.split('.');
      if (version !== VERSION || !payload || !signature || rest.length > 0) return null;
      const given = Buffer.from(signature, 'base64url');
      const expected = mac(payload);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
      } catch {
        return null;
      }
    },
  };
}
