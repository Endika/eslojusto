import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/domain/documents';
import { MORTGAGE_MERGE_RULES } from '../src/domain/mortgage-merge';
import { MORTGAGE_SECTIONS } from '../src/domain/mortgage-schema';
import {
  isMortgageTemplatePage,
  MORTGAGE_PERSON_KEYS,
  MORTGAGE_TEMPLATE_IDS,
  type MortgageBankCase,
} from '../eval/mortgage-schema';
import { FOOTER, SHEET } from '../eval/schema';
import { bankSheetsOf, bankTemplate, expectFilled, MORTGAGE_BANK } from './support/bank';

const templatesOf = (c: MortgageBankCase) =>
  c.pages.filter(isMortgageTemplatePage).map((p) => p.template);

const imagesOf = (c: MortgageBankCase) =>
  c.pages.reduce((n, p) => n + (isMortgageTemplatePage(p) ? bankSheetsOf(p.template) : 1), 0);

// A deed of forty folios, of which the person uploaded the pages that looked useful.
const isLong = (c: MortgageBankCase) =>
  c.pages.some((p) => String(p.data['folioText'] ?? '').endsWith('de 40'));

const rowsOf = (c: MortgageBankCase, list: string) => c.expected.extraction.lists[list] ?? [];

describe('the bank of mortgage packs', () => {
  it('names each case after its file and gives it a rule to exercise', () => {
    const ids = MORTGAGE_BANK.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of MORTGAGE_BANK) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.description, c.id).toMatch(/\bLCCI\b|Ley|STS|art\./);
    }
  });

  it('holds 31 packs and marks fifteen hard ones for the AI pass, the unreadable and the long among them', () => {
    expect(MORTGAGE_BANK).toHaveLength(31);
    const hard = MORTGAGE_BANK.filter((c) => c.eval);
    expect(hard).toHaveLength(15);
    for (const c of MORTGAGE_BANK.filter(
      (x) => x.expected.extraction.outcome === 'nothing_read' || isLong(x),
    ))
      expect(c.eval, c.id).toBe(true);
    // Four of them run past nine images: the two long deeds and two full deeds with their bills.
    expect(hard.filter((c) => imagesOf(c) > 9)).toHaveLength(4);
  });

  it('fits every pack in what the API accepts', () => {
    for (const c of MORTGAGE_BANK) expect(imagesOf(c), c.id).toBeLessThanOrEqual(LIMITS.maxImages);
  });

  it('gives every template placeholder a value, row by row in repeated blocks', () => {
    for (const c of MORTGAGE_BANK)
      for (const page of c.pages.filter(isMortgageTemplatePage))
        expectFilled(c.id, bankTemplate(page.template), page.data);
  });

  it('expects only fields the mortgage response carries and lists the mortgage schema has', () => {
    const fields = new Set(Object.keys(MORTGAGE_MERGE_RULES));
    const lists = Object.fromEntries(
      Object.values(MORTGAGE_SECTIONS).flatMap((s) =>
        Object.entries(s.lists).map(([name, spec]) => [name, new Set(Object.keys(spec.item))]),
      ),
    );
    for (const c of MORTGAGE_BANK) {
      for (const name of Object.keys(c.expected.extraction.fields))
        expect(fields, `${c.id}: ${name}`).toContain(name);
      for (const [name, rows] of Object.entries(c.expected.extraction.lists))
        for (const row of rows)
          for (const key of Object.keys(row))
            expect(lists[name], `${c.id}: ${name}.${key}`).toContain(key);
    }
  });

  it('covers the spread the review needs', () => {
    const deeds = new Set(MORTGAGE_BANK.map((c) => c.expected.input.deedOn));
    for (const day of ['2018-12-18', '2019-06-15', '2019-06-16']) expect(deeds, day).toContain(day);
    const years = new Set([...deeds].map((d) => d.slice(0, 4)));
    for (const year of ['2005', '2010', '2012', '2015', '2021', '2024'])
      expect(years, year).toContain(year);

    const inputs = MORTGAGE_BANK.map((c) => c.expected.input);
    for (const rate of ['fixed', 'variable', 'mixed'] as const)
      expect(inputs.some((i) => i.rateType === rate)).toBe(true);
    for (const clause of ['present', 'absent', 'unknown'] as const)
      expect(inputs.some((i) => i.expensesClause === clause)).toBe(true);
    const floors = inputs.flatMap((i) =>
      i.clauses
        .filter((x) => x.label === 'floor_clause')
        .map((x) => `${i.deedOn.slice(0, 4)}:${x.floorPercent}`),
    );
    expect(floors).toEqual(expect.arrayContaining(['2010:3', '2020:1']));
    expect(inputs.some((i) => i.clauses.some((x) => x.label === 'irph'))).toBe(true);
    const points = new Set(
      MORTGAGE_BANK.map((c) => c.expected.extraction.fields['defaultMarginPoints']),
    );
    for (const n of [2, 3, 10]) expect(points).toContain(n);

    expect(MORTGAGE_BANK.some((c) => rowsOf(c, 'notaryInvoices').some((r) => r['mixed']))).toBe(
      true,
    );
    expect(
      MORTGAGE_BANK.some((c) => {
        const concepts = rowsOf(c, 'notaryInvoices').map((r) => r['concept']);
        return concepts.includes('loan') && concepts.includes('purchase');
      }),
    ).toBe(true);
    for (const list of ['registryInvoices', 'agencySupplied', 'valuationInvoices'])
      expect(
        MORTGAGE_BANK.some((c) => rowsOf(c, list).length > 0),
        list,
      ).toBe(true);
    const ajd = new Set(
      MORTGAGE_BANK.flatMap((c) => rowsOf(c, 'ajdForms').map((r) => r['concept'])),
    );
    expect(ajd).toEqual(new Set(['loan', 'purchase']));
    const operations = new Set(
      MORTGAGE_BANK.flatMap((c) => rowsOf(c, 'operations').map((r) => String(r['on']).slice(0, 7))),
    );
    for (const month of ['2021', '2023-03', '2024-02'])
      expect(
        [...operations].some((m) => m.startsWith(month)),
        month,
      ).toBe(true);

    expect(MORTGAGE_BANK.filter(isLong)).toHaveLength(2);
    const languages = new Set(MORTGAGE_BANK.flatMap(templatesOf).map((t) => t.slice(-2)));
    expect(languages).toEqual(new Set(['es', 'ca', 'gl']));
    expect(
      MORTGAGE_BANK.filter((c) => c.expected.extraction.outcome === 'nothing_read'),
    ).toHaveLength(2);
    expect(MORTGAGE_BANK.some((c) => c.pages.some((p) => !isMortgageTemplatePage(p)))).toBe(true);

    const reviews = MORTGAGE_BANK.map((c) => c.expected.review);
    expect(reviews.map((r) => r.scope)).toEqual(
      expect.arrayContaining([
        { inScope: false, reason: 'company' },
        { inScope: false, reason: 'developer_subrogation' },
      ]),
    );
    expect(reviews.some((r) => r.totals.statute > 0)).toBe(true);
    expect(reviews.some((r) => r.totals.caseLaw > 0 && r.totals.caseLawInterest !== null)).toBe(
      true,
    );
    expect(reviews.some((r) => r.fees.some((f) => f.status === 'depends'))).toBe(true);
  });

  it('keeps the person keys it scans for in the AI pass', () => {
    const keys = new Set(MORTGAGE_BANK.flatMap((c) => c.pages.flatMap((p) => Object.keys(p.data))));
    for (const key of MORTGAGE_PERSON_KEYS) expect(keys).toContain(key);
  });
});

describe('the mortgage templates', () => {
  it.each(MORTGAGE_TEMPLATE_IDS)(
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
    const used = new Set(MORTGAGE_BANK.flatMap(templatesOf));
    for (const id of MORTGAGE_TEMPLATE_IDS) expect(used).toContain(id);
  });
});
