import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PERSON_KEYS } from '../eval/schema';
import { BANK } from './support/bank';

// Every person in the bank is invented, and so are their identifiers: each DNI or NIE carries a
// wrong check letter and each IBAN wrong check digits, so none can belong to anyone.

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

function validDni(id: string): boolean {
  const m = /^([XYZ]|\d)(\d{7})([A-Z])$/.exec(id.replace(/[\s-]/g, '').toUpperCase());
  if (!m) return false;
  const lead = { X: '0', Y: '1', Z: '2' }[m[1] as 'X' | 'Y' | 'Z'] ?? m[1];
  return DNI_LETTERS[Number(`${lead}${m[2]}`) % 23] === m[3];
}

function validIban(iban: string): boolean {
  const s = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const moved = `${s.slice(4)}${s.slice(0, 4)}`.replace(/[A-Z]/g, (ch) =>
    String(ch.charCodeAt(0) - 55),
  );
  let r = 0;
  for (const digit of moved) r = (r * 10 + Number(digit)) % 97;
  return r === 1;
}

const ROOTS = ['../eval/cases/', '../eval/templates/', '../../scripts/rental-bank/'];
const FILES = ROOTS.flatMap((root) => {
  const dir = new URL(root, import.meta.url);
  return readdirSync(dir).map((name) => ({
    name: `${root}${name}`,
    text: readFileSync(new URL(name, dir), 'utf8'),
  }));
});

const DNI_LIKE = /\b(?:\d{8}|[XYZ]\d{7})-?[A-Z]\b/g;
const IBAN_LIKE = /\bES\d{2}(?: ?\d{4}){5}\b/g;

describe('the checks themselves', () => {
  // Identifiers built here with their right check letter and digits, then spoiled by one.
  const dni = (n: string) => `${n}${DNI_LETTERS[Number(n) % 23]}`;
  const iban = (bban: string) => {
    let r = 0;
    for (const digit of `${bban}142800`) r = (r * 10 + Number(digit)) % 97;
    return `ES${String(98 - r).padStart(2, '0')}${bban}`;
  };
  const shift = (ch: string, set: string) => set[(set.indexOf(ch) + 1) % set.length] ?? ch;

  it.each(['00000001', '45000000', '99999999'])('accept a DNI with its letter: %s', (n) => {
    const id = dni(n);
    expect(validDni(id)).toBe(true);
    expect(validDni(`${id.slice(0, 8)}${shift(id.slice(8), DNI_LETTERS)}`)).toBe(false);
  });

  it('read a NIE as its DNI with X, Y or Z for 0, 1 or 2', () => {
    const id = dni('10000007');
    expect(validDni(`Y${id.slice(1)}`)).toBe(true);
    expect(validDni(`X${id.slice(1)}`)).toBe(false);
  });

  it.each(['00000000000000000001', '21000000990000000000'])(
    'accept an IBAN with its digits: %s',
    (bban) => {
      const id = iban(bban);
      expect(validIban(id)).toBe(true);
      expect(
        validIban(
          `${id.slice(0, 2)}${String((Number(id.slice(2, 4)) + 1) % 100).padStart(2, '0')}${id.slice(4)}`,
        ),
      ).toBe(false);
    },
  );
});

describe('the synthetic bank', () => {
  it('holds DNIs and IBANs to check, and every one of them is invalid', () => {
    const dnis = FILES.flatMap((f) =>
      [...f.text.matchAll(DNI_LIKE)].map((m) => ({ file: f.name, id: m[0] })),
    );
    const ibans = FILES.flatMap((f) =>
      [...f.text.matchAll(IBAN_LIKE)].map((m) => ({ file: f.name, id: m[0] })),
    );
    expect(dnis.length).toBeGreaterThan(BANK.length);
    expect(ibans.length).toBeGreaterThanOrEqual(BANK.length);
    for (const { file, id } of dnis) expect(validDni(id), `${file}: ${id}`).toBe(false);
    for (const { file, id } of ibans) expect(validIban(id), `${file}: ${id}`).toBe(false);
  });

  it('names only invented people', () => {
    for (const c of BANK)
      for (const page of c.pages)
        for (const key of ['landlordName', 'tenantName', 'signatory'] as const) {
          const name = page.data[key];
          if (name !== undefined)
            expect(name, `${c.id}: ${key}`).toMatch(/^Persona \w+ Ficticia [A-Z]$/);
        }
  });

  it('keeps the person keys it scans for in the AI pass', () => {
    const keys = new Set(BANK.flatMap((c) => c.pages.flatMap((p) => Object.keys(p.data))));
    for (const key of PERSON_KEYS) expect(keys).toContain(key);
  });
});
