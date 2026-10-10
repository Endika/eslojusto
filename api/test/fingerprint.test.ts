import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fingerprint, sha256, supplyNumber } from '../src/domain/fingerprint';

// Made-up supply codes: their check letters are not valid.
const SUPPLY = 'ES0000111122223333BB';

describe('sha256', () => {
  it.each([
    ['nothing', ''],
    ['a short text', 'abc'],
    ['a supply code', SUPPLY],
    ['a text that fills a block exactly', 'x'.repeat(55)],
    ['a text over one block', 'x'.repeat(56)],
    ['several blocks', 'Factura de la luz '.repeat(20)],
    ['accented letters', 'energía eléctrica'],
  ])('matches node:crypto for %s', (_, text) => {
    expect(sha256(text)).toBe(createHash('sha256').update(text).digest('hex'));
  });
});

describe('supplyNumber', () => {
  it.each([
    ['as printed', SUPPLY],
    ['in groups', 'ES 0000 1111 2222 3333 BB'],
    ['in lower case', 'es0000111122223333bb'],
    ['with dots and dashes', 'ES-0000.1111.2222.3333-BB'],
    ['with a border point', 'ES0000111122223333BB0F'],
  ])('reads one %s as the same code', (_, raw) => {
    expect(supplyNumber(raw)).toBe(SUPPLY);
  });

  it.each([
    ['another country', 'PT0000111122223333BB'],
    ['a digit short', 'ES000011112222333BB'],
    ['digits for letters', 'ES000011112222333312'],
    ['an IBAN', 'ES0021000418450200051332'],
    ['a word', 'no consta'],
  ])('finds none in %s', (_, raw) => {
    expect(supplyNumber(raw)).toBeNull();
  });
});

describe('fingerprint', () => {
  it('is the first 16 hex digits of the code’s SHA-256, never the code', () => {
    const print = fingerprint(SUPPLY);
    expect(print).toMatch(/^[0-9a-f]{16}$/);
    expect(print).toBe(createHash('sha256').update(SUPPLY).digest('hex').slice(0, 16));
    expect(print).not.toContain('0000111122223333');
  });

  it('tells two supplies apart', () => {
    expect(fingerprint(SUPPLY)).not.toBe(fingerprint('ES0000111122223334BB'));
  });
});
