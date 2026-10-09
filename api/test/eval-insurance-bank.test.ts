import { describe, expect, it } from 'vitest';
import { INSURANCE_MERGE_RULES } from '../src/domain/insurance-merge';
import { INSURANCE_SECTIONS } from '../src/domain/insurance-schema';
import {
  INSURANCE_PERSON_KEYS,
  INSURANCE_TEMPLATE_IDS,
  isInsuranceTemplatePage,
  type InsuranceBankCase,
} from '../eval/insurance-schema';
import { FOOTER, SHEET } from '../eval/schema';
import { bankTemplate, expectFilled, INSURANCE_BANK } from './support/bank';

const templatesOf = (c: InsuranceBankCase) =>
  c.pages.filter(isInsuranceTemplatePage).map((p) => p.template);

describe('the bank of insurance packs', () => {
  it('names each case after its file and gives it a rule to exercise', () => {
    const ids = INSURANCE_BANK.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of INSURANCE_BANK) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.description, c.id).toMatch(/\bLCS\b|Ley|art\./);
    }
  });

  it('holds 10 packs and marks five hard ones for the AI pass, the unreadable one among them', () => {
    expect(INSURANCE_BANK).toHaveLength(10);
    expect(INSURANCE_BANK.filter((c) => c.eval)).toHaveLength(5);
    for (const c of INSURANCE_BANK.filter((x) => x.expected.extraction.outcome === 'nothing_read'))
      expect(c.eval, c.id).toBe(true);
  });

  it('gives every template placeholder a value, row by row in repeated blocks', () => {
    for (const c of INSURANCE_BANK)
      for (const page of c.pages.filter(isInsuranceTemplatePage))
        expectFilled(c.id, bankTemplate(page.template), page.data);
  });

  it('expects only fields the insurance response carries and lists its schema has', () => {
    const fields = new Set(Object.keys(INSURANCE_MERGE_RULES));
    const lists = Object.fromEntries(
      Object.values(INSURANCE_SECTIONS).flatMap((s) =>
        Object.entries(s.lists).map(([name, spec]) => [name, new Set(Object.keys(spec.item))]),
      ),
    );
    for (const c of INSURANCE_BANK) {
      for (const name of Object.keys(c.expected.extraction.fields))
        expect(fields, `${c.id}: ${name}`).toContain(name);
      for (const [name, rows] of Object.entries(c.expected.extraction.lists))
        for (const row of rows)
          for (const key of Object.keys(row))
            expect(lists[name], `${c.id}: ${name}.${key}`).toContain(key);
    }
  });

  it('covers the spread the review needs', () => {
    const inputs = INSURANCE_BANK.map((c) => c.expected.input);
    expect(inputs.filter((i) => i.line === 'home').length).toBeGreaterThanOrEqual(2);
    expect(inputs.filter((i) => i.line === 'car').length).toBeGreaterThanOrEqual(4);
    expect(
      inputs.filter((i) => i.line === 'car' && i.notice !== null).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      INSURANCE_BANK.filter((c) => templatesOf(c).includes('insurance/renewal-es')).length,
    ).toBeGreaterThanOrEqual(2);
    const findings = new Set(
      INSURANCE_BANK.flatMap((c) => c.expected.review.findings.map((f) => `${f.id}:${f.status}`)),
    );
    for (const s of [
      'non_renewal:open',
      'change_notice:on_time',
      'change_notice:late',
      'premium:up',
      'premium:down',
      'premium:same',
      'distance_withdrawal:open',
      'distance_withdrawal:review_it',
      'distance_withdrawal_compulsory:not_applicable',
      'distance_withdrawal_voluntary:review_it',
    ])
      expect(findings).toContain(s);
    expect(INSURANCE_BANK.map((c) => c.expected.review.scope)).toContainEqual({
      inScope: false,
      reason: 'life',
    });
    expect(INSURANCE_BANK.flatMap(templatesOf).some((t) => !t.endsWith('-es'))).toBe(true);
    expect(INSURANCE_BANK.some((c) => c.expected.extraction.outcome === 'nothing_read')).toBe(true);
  });

  it('keeps the person keys it scans for in the AI pass', () => {
    const keys = new Set(
      INSURANCE_BANK.flatMap((c) => c.pages.flatMap((p) => Object.keys(p.data))),
    );
    for (const key of INSURANCE_PERSON_KEYS) expect(keys).toContain(key);
  });
});

describe('the insurance templates', () => {
  it.each(INSURANCE_TEMPLATE_IDS)(
    '%s says where it comes from and carries the footer on every sheet',
    (id) => {
      const html = bankTemplate(id);
      expect(html).toMatch(/^<!--[\s\S]*Source:[\s\S]*Licence:[\s\S]*-->/);
      const sheets = html.match(SHEET)?.length ?? 0;
      expect(sheets).toBeGreaterThanOrEqual(1);
      expect(html.split(FOOTER).length - 1).toBe(sheets);
    },
  );

  it('every template is used by some case', () => {
    const used = new Set(INSURANCE_BANK.flatMap(templatesOf));
    for (const id of INSURANCE_TEMPLATE_IDS) expect(used).toContain(id);
  });
});
