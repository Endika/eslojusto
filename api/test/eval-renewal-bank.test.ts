import { describe, expect, it } from 'vitest';
import { RENEWAL_MERGE_RULES } from '../src/domain/renewal-merge';
import { RENEWAL_SECTIONS } from '../src/domain/renewal-schema';
import { FOOTER, SHEET } from '../eval/schema';
import { RENEWAL_PERSON_KEYS, RENEWAL_TEMPLATE_IDS, renewalPageKind } from '../eval/renewal-schema';
import { bankSheetsOf, bankTemplate, expectFilled, RENEWAL_BANK } from './support/bank';
import { expectOfType, specsOf } from './support/bank-values';

const PRICE_FIELDS = /^(current|next)(Power|Energy)(P[123])?$/;

describe('the bank of renewal letters', () => {
  it('names each case after its file', () => {
    const ids = RENEWAL_BANK.map((c) => c.id);
    expect(ids).toEqual(['single-price-letter']);
    for (const c of RENEWAL_BANK) expect(c.id).toMatch(/^[a-z0-9-]+$/);
  });

  it('gives every template placeholder a value, row by row in repeated blocks', () => {
    for (const c of RENEWAL_BANK)
      for (const page of c.pages) expectFilled(c.id, bankTemplate(page.template), page.data);
  });

  it('expects only fields the renewal response carries, each of its type', () => {
    const fields = new Set(Object.keys(RENEWAL_MERGE_RULES));
    const specs = specsOf(RENEWAL_SECTIONS, RENEWAL_MERGE_RULES);
    for (const c of RENEWAL_BANK)
      for (const [name, value] of Object.entries(c.expected.extraction.fields)) {
        if (PRICE_FIELDS.test(name)) {
          expect(typeof value, `${c.id}: ${name}`).toBe('number');
        } else if (name === 'powerUnit') {
          expect(['per_kw_day', 'per_kw_year']).toContain(value);
        } else {
          expect(fields, `${c.id}: ${name}`).toContain(name);
          expectOfType(`${c.id}: ${name}`, specs.fields[name], value);
        }
      }
  });

  it('expects the letter read as a letter, and no supply code or name in its fields', () => {
    for (const c of RENEWAL_BANK) {
      expect(c.pages.map(renewalPageKind)).toEqual(['price_change_notice']);
      expect(c.expected.extraction.fields).not.toHaveProperty('fixedPrice');
      expect(JSON.stringify(c.expected)).not.toMatch(/ES\d{4}|Persona/);
    }
  });

  it('keeps the person keys it scans for in the AI pass', () => {
    const keys = new Set(RENEWAL_BANK.flatMap((c) => c.pages.flatMap((p) => Object.keys(p.data))));
    for (const key of RENEWAL_PERSON_KEYS) expect(keys).toContain(key);
  });
});

describe('the renewal templates', () => {
  it.each(RENEWAL_TEMPLATE_IDS)(
    '%s says where it comes from and carries the footer on every sheet',
    (id) => {
      const html = bankTemplate(id);
      expect(html).toMatch(/^<!--[\s\S]*Source:[\s\S]*Licence:[\s\S]*-->/);
      const sheets = html.match(SHEET)?.length ?? 0;
      expect(sheets).toBe(bankSheetsOf(id));
      expect(html.split(FOOTER).length - 1).toBe(sheets);
    },
  );
});
