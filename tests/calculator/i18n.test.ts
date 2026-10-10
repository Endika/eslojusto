import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { es, type Key } from '../../src/i18n/es';
import { CREDIT_READING, DICTIONARIES, INSURANCE_READING, clientStrings, t } from '../../src/i18n';
import { LANGS, builtLangs, type Lang } from '../../src/i18n/languages';
import { translator } from '../../src/i18n/client';
import { statusText } from '../../src/calculator/render';
import { reviewFinalPay } from '../../src/engine/review';
import { validate, validateOtherContracts } from '../../src/engine/validate';
import type { FinalPayInput } from '../../src/engine/types';
import { forbiddenIn } from '../support/forbidden';

const langs = Object.keys(LANGS) as Lang[];
const keys = Object.keys(es) as Key[];

describe('published languages', () => {
  it('Spanish is the only published language', () => {
    expect(LANGS.es.published).toBe(true);
    expect(langs.filter((i) => LANGS[i].published)).toEqual(['es']);
  });

  it.each(langs.filter((i) => LANGS[i].published))('%s has every key', (lang) => {
    for (const key of keys) expect(DICTIONARIES[lang][key], key).toBeTruthy();
  });

  it('a normal build builds only the published languages', () => {
    expect(builtLangs({})).toEqual(['es']);
    expect(builtLangs({ TEST_RTL: '1' })).toEqual(['es', 'ar-test']);
  });
});

describe('t()', () => {
  it('interpolates {importe}', () => {
    expect(t('es', 'client.status.below_minimum', { importe: '12,30 €' })).toBe(
      'Por debajo del mínimo legal: faltan 12,30 €',
    );
  });
  it('leaves a variable it does not receive untouched', () => {
    expect(t('es', 'client.status.below_minimum')).toBe(
      'Por debajo del mínimo legal: faltan {importe}',
    );
  });
});

describe('ar-test pseudo-locale', () => {
  it('is RTL, unpublished and wraps every string in Arabic marks', () => {
    expect(LANGS['ar-test']).toMatchObject({ dir: 'rtl', published: false });
    for (const key of keys) {
      const text = DICTIONARIES['ar-test'][key];
      expect(text, key).toMatch(/^[؀-ۿ]/);
      expect(text, key).toContain(es[key]);
    }
  });
  it('keeps the variables', () => {
    expect(t('ar-test', 'client.status.below_minimum', { importe: '1.234,56 €' })).toContain(
      'faltan 1.234,56 €',
    );
  });
});

describe('client strings', () => {
  it('the browser translator reads the strings the page writes', () => {
    const tr = translator({ 'client.status.matches': 'Coincide con el mínimo legal' });
    expect(tr('client.status.matches')).toBe('Coincide con el mínimo legal');
  });

  it('every engine error carries a code with its text in es.ts', () => {
    const invalid: FinalPayInput = {
      cause: 'fixed_term_end',
      startDate: { y: 2026, m: 5, d: 1 },
      endDate: { y: 2026, m: 4, d: 1 },
      monthlySalary: 0,
      extraPayProrated: false,
      extraPayCount: 9,
      extraPayAmount: -1,
      extraPayAccrual: 'unknown',
      holidayUnit: 'calendar',
      annualHolidayDays: 99,
      holidayDaysTaken: -1,
      noticeDaysReceived: 200,
    };
    const errors = validate(invalid, { y: 2026, m: 10, d: 6 });
    expect(errors.length).toBeGreaterThan(5);
    for (const { code } of errors) expect(es[`client.error.${code}`]).toBeTruthy();
  });

  it('every other-contract error carries its text in es.ts', () => {
    const e: FinalPayInput = {
      cause: 'objective_dismissal',
      startDate: { y: 2026, m: 1, d: 1 },
      endDate: { y: 2026, m: 8, d: 31 },
      monthlySalary: 2000,
      extraPayProrated: true,
      extraPayCount: 2,
      extraPayAmount: 0,
      extraPayAccrual: 'unknown',
      holidayUnit: 'calendar',
      annualHolidayDays: 30,
      holidayDaysTaken: 0,
    };
    const errors = validateOtherContracts(e, [
      { startDate: { y: 2024, m: 2, d: 30 }, endDate: { y: 2024, m: 13, d: 1 } },
      { startDate: { y: 2025, m: 5, d: 1 }, endDate: { y: 2025, m: 4, d: 1 } },
      { startDate: { y: 2025, m: 5, d: 1 }, endDate: { y: 2026, m: 12, d: 1 } },
    ]);
    expect(new Set(errors.map((x) => x.code)).size).toBe(4);
    for (const { code } of errors) expect(es[`client.error.${code}`]).toBeTruthy();
  });

  it('the status comes from the dictionary with the amount in Spanish format', () => {
    const r = reviewFinalPay(
      {
        cause: 'unfair_dismissal',
        startDate: { y: 2020, m: 1, d: 1 },
        endDate: { y: 2026, m: 9, d: 15 },
        monthlySalary: 2000,
        extraPayProrated: true,
        extraPayCount: 2,
        extraPayAmount: 0,
        extraPayAccrual: 'unknown',
        holidayUnit: 'calendar',
        annualHolidayDays: 30,
        holidayDaysTaken: 0,
      },
      { severance: 1 },
      { y: 2026, m: 10, d: 6 },
    );
    if (!r.ok) throw new Error('invalid input');
    const p = r.review.items.find((x) => x.item.id === 'severance');
    if (!p) throw new Error('no severance');
    const tr = (c: Parameters<typeof t>[1], v?: Record<string, string | number>) =>
      t('ar-test', c, v);
    expect(statusText(p, tr)).toMatch(/faltan \d{1,3}(\.\d{3})*,\d{2}\s€/);
  });
});

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? [p, ...files(p)] : [p];
  });

const normalBuild = existsSync('dist') && process.env['TEST_RTL'] !== '1';

describe.skipIf(!normalBuild)('a normal build does not publish ar-test', () => {
  const all = normalBuild ? files('dist') : [];
  it('there is no /ar-test/ route', () => {
    expect(all.filter((p) => p.split(/[\\/]/).includes('ar-test'))).toEqual([]);
  });
  it('no HTML, sitemap or script mentions ar-test', () => {
    const texts = all.filter((p) => /\.(html|xml|js|txt)$/.test(p));
    expect(texts.length).toBeGreaterThan(0);
    for (const p of texts) expect(readFileSync(p, 'utf8'), p).not.toContain('ar-test');
  });
  it('only the 404 carries noindex', () => {
    const noindexed = all.filter(
      (p) =>
        p.endsWith('.html') &&
        readFileSync(p, 'utf8').includes('<meta name="robots" content="noindex">'),
    );
    expect(noindexed.map((p) => p.split(/[\\/]/).pop())).toEqual(['404.html']);
  });
  it('every page links its Spanish version with hreflang and no other', () => {
    const html = all.filter((p) => p.endsWith('.html'));
    for (const p of html) {
      const text = readFileSync(p, 'utf8');
      const links = [...text.matchAll(/<link[^>]*hreflang="([^"]+)"/g)].map((m) => m[1]);
      // The 404 answers at any address: it is never indexed and announces no alternates.
      const expected = text.includes('<meta name="robots" content="noindex">')
        ? []
        : ['es', 'x-default'];
      expect(links.toSorted(), p).toEqual(expected);
    }
  });
});

describe('client strings', () => {
  it('a build without the documents API ships none of their strings', () => {
    const keys = Object.keys(clientStrings('es'));
    expect(keys.length).toBeGreaterThan(100);
    expect(keys.every((k) => k.startsWith('client.'))).toBe(true);
    expect(keys.some((k) => k.startsWith('client.documents.'))).toBe(false);
  });
  it('the rental review ships its strings only on its own page', () => {
    expect(Object.keys(clientStrings('es')).some((k) => k.startsWith('client.rental.'))).toBe(
      false,
    );
    expect(clientStrings('es', { rental: true })['client.rental.status.depends']).toBe('Depende');
  });

  it('the employment contract review ships its strings only on its own page', () => {
    expect(Object.keys(clientStrings('es')).some((k) => k.startsWith('client.employment.'))).toBe(
      false,
    );
    expect(clientStrings('es', { employment: true })['client.employment.status.depends']).toBe(
      'Depende',
    );
  });
  it('the household review ships no string to any page until one asks for them', () => {
    const household = (strings: Partial<Record<string, string>>) =>
      Object.keys(strings).filter((k) => k.startsWith('client.household.'));
    for (const options of [{}, { documents: true }, { rental: true }, { employment: true }])
      expect(household(clientStrings('es', options))).toEqual([]);
    expect(
      clientStrings('es', { household: true })['client.household.calculation.notice.days'],
    ).toContain('{required}');
  });

  it('the insurance review ships its strings only on its own page', () => {
    expect(Object.keys(clientStrings('es')).some((k) => k.startsWith('client.insurance.'))).toBe(
      false,
    );
    expect(clientStrings('es', { insurance: true })['client.insurance.status.review_it']).toBe(
      'Revísalo',
    );
  });

  it('the credit review ships its strings only on its own page', () => {
    expect(Object.keys(clientStrings('es')).some((k) => k.startsWith('client.credit.'))).toBe(
      false,
    );
    expect(clientStrings('es', { credit: true })['client.credit.status.matches']).toBe('Coincide');
  });

  it('the credit page ships none of the final pay strings, only what every page reads', () => {
    const keys = Object.keys(clientStrings('es', { credit: true }));
    expect(keys).toContain('client.theme.to_dark');
    expect(keys).toContain('client.other_language.text');
    expect(keys.filter((k) => k.startsWith('client.warning.'))).toEqual([]);
  });

  it('the credit page reads documents in words its own copy allows, without the report', () => {
    const strings = clientStrings('es', { credit: true, documents: true });
    const keys = Object.keys(strings);
    expect(keys).toContain('client.documents.kind.credit_agreement');
    expect(keys).toContain('client.documents.error.daily_limit_reached');
    expect(
      keys.filter((k) => /^client\.documents\.(report|letter|notice|verify)\./.test(k)),
    ).toEqual([]);
    expect(
      Object.values(strings).flatMap((text) =>
        forbiddenIn('dist/financiacion/index.html', text ?? '').map(String),
      ),
    ).toEqual([]);
  });

  it('ships the credit and the insurance documents’ words only on their own page', () => {
    const named = (set: ReadonlySet<string>) => [...set].filter((k) => k in es);
    expect(named(CREDIT_READING)).toEqual([...CREDIT_READING]);
    expect(named(INSURANCE_READING)).toEqual([...INSURANCE_READING]);
    // Every document word that names one of their kinds is in one of the two sets.
    expect(
      keys.filter(
        (k) =>
          /^client\.documents\.(kind|source|field|skipped)\..*(credit|amortization|early_repayment|revolving|card_|insurance)/.test(
            k,
          ) &&
          !CREDIT_READING.has(k) &&
          !INSURANCE_READING.has(k),
      ),
    ).toEqual([]);
    const shipped = (flags: Parameters<typeof clientStrings>[1]) =>
      Object.keys(clientStrings('es', { documents: true, ...flags }));
    const sectionWords = (k: string) => CREDIT_READING.has(k) || INSURANCE_READING.has(k);
    for (const flags of [{}, { rental: true }, { employment: true }])
      expect(shipped(flags).filter(sectionWords)).toEqual([]);
    expect(shipped({ credit: true }).filter(sectionWords).sort()).toEqual(
      [...CREDIT_READING].sort(),
    );
    expect(shipped({ insurance: true }).filter(sectionWords).sort()).toEqual(
      [...INSURANCE_READING].sort(),
    );
  });

  it('the mortgage review ships its strings only on its own page', () => {
    expect(Object.keys(clientStrings('es')).some((k) => k.startsWith('client.mortgage.'))).toBe(
      false,
    );
    expect(clientStrings('es', { mortgage: true })['client.mortgage.status.review_it']).toBe(
      'Revísalo',
    );
  });

  it('the mortgage page ships none of the final pay strings, only what every page reads', () => {
    const keys = Object.keys(clientStrings('es', { mortgage: true }));
    expect(keys).toContain('client.theme.to_dark');
    expect(keys).toContain('client.other_language.text');
    expect(keys.filter((k) => k.startsWith('client.warning.'))).toEqual([]);
    expect(keys.filter((k) => k.startsWith('client.credit.'))).toEqual([]);
  });

  it('a build with it ships them', () => {
    expect(clientStrings('es', { documents: true })['client.documents.mark']).toBe(
      'Leído del documento · confianza {nivel}',
    );
  });
});
