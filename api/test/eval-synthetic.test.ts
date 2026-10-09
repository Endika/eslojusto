import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMPLOYMENT_PERSON_KEYS } from '../eval/employment-schema';
import { PERSON_KEYS } from '../eval/schema';
import { BANK, EMPLOYMENT_BANK } from './support/bank';

// Every person and company in the banks is invented, and so are their identifiers: each DNI or NIE
// carries a wrong check letter, and each IBAN, Social Security number (NAF), employer account code
// (CCC) and CIF wrong check digits, so none can belong to anyone.

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

// A NAF or a CCC: province, number and two check digits, the remainder by 97 of the first two.
// Read both ways the number may be taken, a valid one under either counts as valid.
function validMod97(id: string, numberDigits: number): boolean {
  const digits = id.replace(/[\s/-]/g, '');
  if (digits.length !== 2 + numberDigits + 2) return false;
  const province = BigInt(digits.slice(0, 2));
  const number = BigInt(digits.slice(2, 2 + numberDigits));
  const check = BigInt(digits.slice(2 + numberDigits));
  return [10n ** 7n, 10n ** 8n].some((scale) => (province * scale + number) % 97n === check);
}
const validNaf = (id: string): boolean => validMod97(id, 8);
const validCcc = (id: string): boolean => validMod97(id, 7);

const CIF_LETTERS = 'JABCDEFGHI';

// The control of a CIF: digits in even places doubled and their figures summed, plus the odd
// ones; ten minus the last figure, as a digit or as a letter.
function validCif(id: string): boolean {
  const m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(id.toUpperCase());
  if (!m) return false;
  let sum = 0;
  [...(m[2] ?? '')].forEach((ch, i) => {
    const n = Number(ch) * (i % 2 === 0 ? 2 : 1);
    sum += Math.floor(n / 10) + (n % 10);
  });
  const control = (10 - (sum % 10)) % 10;
  return m[3] === String(control) || m[3] === CIF_LETTERS[control];
}

const ROOTS = ['../eval/cases/', '../eval/templates/', '../../scripts/rental-bank/'];

function filesUnder(root: string, dir: URL): { name: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(`${root}${entry.name}/`, new URL(`${entry.name}/`, dir))
      : [{ name: `${root}${entry.name}`, text: readFileSync(new URL(entry.name, dir), 'utf8') }],
  );
}
const FILES = ROOTS.flatMap((root) => filesUnder(root, new URL(root, import.meta.url)));
const EMPLOYMENT_FILES = FILES.filter((f) => f.name.includes('/employment/'));
// The household cases are golden inputs of the engine, kept beside its tests, not eval packs.
const HOUSEHOLD_ROOT = '../../tests/engine/household/cases/';
const HOUSEHOLD_FILES = filesUnder(HOUSEHOLD_ROOT, new URL(HOUSEHOLD_ROOT, import.meta.url));

const DNI_LIKE = /\b(?:\d{8}|[XYZ]\d{7})-?[A-Z]\b/g;
const IBAN_LIKE = /\bES\d{2}(?: ?\d{4}){5}\b/g;
const NAF_LIKE = /\b\d{2}[ /-]?\d{8}[ /-]?\d{2}\b/g;
const CCC_LIKE = /\b\d{2}[ /-]\d{7}[ /-]\d{2}\b/g;
const CIF_LIKE = /\b[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]\b/g;

const found = (files: readonly { name: string; text: string }[], pattern: RegExp) =>
  files.flatMap((f) => [...f.text.matchAll(pattern)].map((m) => ({ file: f.name, id: m[0] })));

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

describe('the checks of employment identifiers', () => {
  const mod97 = (province: string, number: string) =>
    `${province}${number}${String(Number((BigInt(province) * 10n ** 8n + BigInt(number)) % 97n)).padStart(2, '0')}`;

  it('accept a NAF with its check digits and refuse it with others', () => {
    const naf = mod97('28', '12345678');
    expect(validNaf(naf)).toBe(true);
    expect(
      validNaf(`${naf.slice(0, 10)}${String((Number(naf.slice(10)) + 1) % 97).padStart(2, '0')}`),
    ).toBe(false);
  });

  it('accept a CCC with its check digits', () => {
    const p = 28n;
    const n = 1234567n;
    const ccc = `28 1234567 ${String(Number((p * 10n ** 7n + n) % 97n)).padStart(2, '0')}`;
    expect(validCcc(ccc)).toBe(true);
    expect(validCcc(`${ccc.slice(0, 11)}${ccc.endsWith('96') ? '00' : '96'}`)).toBe(false);
  });

  it('accept a CIF with its control digit or letter, and refuse another', () => {
    // 1234567: 2+2+6+4+(1+0)+6+(1+4) = 26, control 4, letter D.
    expect(validCif('B12345674')).toBe(true);
    expect(validCif('Q1234567D')).toBe(true);
    expect(validCif('B12345675')).toBe(false);
  });
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

  it('holds employment NAFs, CCCs and CIFs to check, and every one of them is invalid', () => {
    const nafs = found(EMPLOYMENT_FILES, NAF_LIKE);
    const cccs = found(EMPLOYMENT_FILES, CCC_LIKE);
    const cifs = found(EMPLOYMENT_FILES, CIF_LIKE);
    for (const list of [nafs, cccs, cifs])
      expect(list.length).toBeGreaterThan(EMPLOYMENT_BANK.length);
    for (const { file, id } of nafs) expect(validNaf(id), `${file}: ${id}`).toBe(false);
    for (const { file, id } of cccs) expect(validCcc(id), `${file}: ${id}`).toBe(false);
    for (const { file, id } of cifs) expect(validCif(id), `${file}: ${id}`).toBe(false);
  });

  it('holds household cases with no identifier of any kind, valid or not', () => {
    expect(HOUSEHOLD_FILES.length).toBeGreaterThanOrEqual(15);
    for (const pattern of [DNI_LIKE, IBAN_LIKE, NAF_LIKE, CCC_LIKE, CIF_LIKE])
      expect(found(HOUSEHOLD_FILES, pattern)).toEqual([]);
    for (const { name, text } of HOUSEHOLD_FILES)
      expect(text, name).not.toMatch(/@|https?:\/\/|\+34|\b[6-9]\d{8}\b/);
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

  it('names only invented workers, people replaced and household employers', () => {
    for (const c of EMPLOYMENT_BANK)
      for (const page of c.pages)
        for (const key of ['workerName', 'replacedName', 'employerPersonName'] as const) {
          const name = page.data[key];
          if (name !== undefined)
            expect(name, `${c.id}: ${key}`).toMatch(/^Persona \w+ Ficticia [A-Z]$/);
        }
  });

  it('names only companies that say they are invented', () => {
    for (const c of EMPLOYMENT_BANK)
      for (const page of c.pages) {
        const name = page.data['companyName'];
        if (name !== undefined) expect(name, c.id).toMatch(/Ficticia/);
      }
  });

  it('keeps the employment person keys it scans for in the AI pass', () => {
    const keys = new Set(
      EMPLOYMENT_BANK.flatMap((c) => c.pages.flatMap((p) => Object.keys(p.data))),
    );
    for (const key of EMPLOYMENT_PERSON_KEYS) expect(keys).toContain(key);
  });

  it('keeps the person keys it scans for in the AI pass', () => {
    const keys = new Set(BANK.flatMap((c) => c.pages.flatMap((p) => Object.keys(p.data))));
    for (const key of PERSON_KEYS) expect(keys).toContain(key);
  });
});
