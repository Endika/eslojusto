import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/domain/documents';
import { ELECTRICITY_MERGE_RULES } from '../src/domain/electricity-merge';
import { ELECTRICITY_SECTIONS } from '../src/domain/electricity-schema';
import {
  ELECTRICITY_PERSON_KEYS,
  ELECTRICITY_TEMPLATE_IDS,
  isElectricityTemplatePage,
  type ElectricityBankCase,
} from '../eval/electricity-schema';
import { FOOTER, SHEET } from '../eval/schema';
import { bankSheetsOf, bankTemplate, ELECTRICITY_BANK, expectFilled } from './support/bank';
import { expectOfType, specsOf } from './support/bank-values';

const templatesOf = (c: ElectricityBankCase) =>
  c.pages.filter(isElectricityTemplatePage).map((p) => p.template);

const imagesOf = (c: ElectricityBankCase) =>
  c.pages.reduce((n, p) => n + (isElectricityTemplatePage(p) ? bankSheetsOf(p.template) : 1), 0);

const billPages = (c: ElectricityBankCase) =>
  c.pages.filter(isElectricityTemplatePage).filter((p) => p.template !== 'electricity/contract-es');

const bills = (c: ElectricityBankCase) => c.expected.input.bills;
const inputs = ELECTRICITY_BANK.flatMap(bills);

describe('the bank of electricity packs', () => {
  it('names each case after its file and gives it a rule to exercise', () => {
    const ids = ELECTRICITY_BANK.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of ELECTRICITY_BANK) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.description, c.id).toMatch(/\bart\.|Real Decreto|\bRD\b|\bRDL\b|Orden|Circular|Ley/);
    }
  });

  it('holds 37 packs and marks eleven hard ones for the AI pass, the unreadable and the long among them', () => {
    expect(ELECTRICITY_BANK).toHaveLength(37);
    const hard = ELECTRICITY_BANK.filter((c) => c.eval);
    expect(hard).toHaveLength(11);
    for (const c of ELECTRICITY_BANK.filter(
      (x) => x.expected.extraction.outcome === 'nothing_read' || bills(x).length >= 12,
    ))
      expect(c.eval, c.id).toBe(true);
    // The two years of bills: one of 24 photos and one of 12.
    expect(hard.map(imagesOf).filter((n) => n >= 12)).toEqual(expect.arrayContaining([24, 12]));
  });

  it('fits every pack in what the API accepts', () => {
    for (const c of ELECTRICITY_BANK)
      expect(imagesOf(c), c.id).toBeLessThanOrEqual(LIMITS.maxImages);
  });

  it('gives every template placeholder a value, row by row in repeated blocks', () => {
    for (const c of ELECTRICITY_BANK)
      for (const page of c.pages.filter(isElectricityTemplatePage))
        expectFilled(c.id, bankTemplate(page.template), page.data);
  });

  it('expects only fields the electricity response carries, each of its type', () => {
    const fields = new Set(Object.keys(ELECTRICITY_MERGE_RULES));
    const specs = specsOf(ELECTRICITY_SECTIONS, ELECTRICITY_MERGE_RULES);
    for (const c of ELECTRICITY_BANK) {
      for (const name of Object.keys(c.expected.extraction.fields))
        expect(fields, `${c.id}: ${name}`).toContain(name);
      for (const [name, value] of Object.entries(c.expected.extraction.fields))
        expectOfType(`${c.id}: ${name}`, specs.fields[name], value);
      for (const [name, rows] of Object.entries(c.expected.extraction.lists))
        for (const row of rows)
          for (const [key, value] of Object.entries(row))
            expectOfType(`${c.id}: ${name}.${key}`, specs.lists[name]?.[key], value);
    }
  });

  it('expects one row of bills per bill photographed, with the figures the engine is given', () => {
    for (const c of ELECTRICITY_BANK.filter((x) => x.expected.extraction.outcome === 'ok')) {
      const rows = c.expected.extraction.lists['bills'] ?? [];
      expect(rows, c.id).toHaveLength(billPages(c).length);
      rows.forEach((row, i) => {
        const bill = bills(c)[i];
        expect(bill, c.id).toBeDefined();
        if (bill === undefined) return;
        expect(row, `${c.id} #${i + 1}`).toMatchObject({
          issuedOn: bill.issuedOn,
          dueOn: bill.dueOn,
          readingFrom: bill.readingFrom,
          readingTo: bill.readingTo,
          postcode: bill.postcode,
          market: bill.market,
          contractedPowerP1: bill.contractedPower.p1,
          contractedPowerP2: bill.contractedPower.p2,
          total: bill.total,
        });
      });
      const lines = (list: string) => c.expected.extraction.lists[list] ?? [];
      expect(lines('powerLines').map((r) => r['amount'])).toEqual(
        bills(c).flatMap((b) => b.power.map((l) => l.amount)),
      );
      expect(lines('energyLines').map((r) => r['amount'])).toEqual(
        bills(c).flatMap((b) => b.energy.map((l) => l.amount)),
      );
    }
  });

  it('covers the spread the review needs', () => {
    const blocks = new Set(
      ELECTRICITY_BANK.flatMap((c) =>
        billPages(c).map((p) => `${p.template}|${p.data['retailerBlock']}`),
      ),
    );
    const retailers = (market: 'pvpc' | 'free') =>
      new Set(
        [...blocks]
          .filter((b) => b.includes(market === 'pvpc' ? '/pvpc' : '/free'))
          .map((b) => b.split('|')[1]),
      );
    expect(retailers('pvpc').size).toBe(2);
    expect(retailers('free').size).toBe(2);

    const months = new Set(
      inputs.filter((b) => b.issuedOn >= '2026-06-12').map((b) => b.dueOn.slice(0, 7)),
    );
    for (const m of ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'])
      expect(months, m).toContain(m);
    expect(inputs.some((b) => b.readingFrom < '2026-06-25' && b.readingTo >= '2026-06-26')).toBe(
      true,
    );
    for (const category of ['vulnerable', 'severe'])
      expect(
        inputs.some((b) => b.socialBonus?.category === category),
        category,
      ).toBe(true);
    expect(inputs.some((b) => b.meter?.phase === 'single' && b.meter.owned === false)).toBe(true);
    expect(inputs.some((b) => b.meter?.phase === 'three' && b.meter.supplyPhase === 'three')).toBe(
      true,
    );
    expect(inputs.some((b) => b.meter?.owned === true)).toBe(true);
    for (const requested of ['yes', 'no'] as const)
      expect(inputs.some((b) => b.services.some((s) => s.requested === requested))).toBe(true);
    expect(inputs.some((b) => b.excessPower?.maximeter === false)).toBe(true);
    expect(inputs.some((b) => b.exitPenalty?.priceType === 'variable')).toBe(true);
    const sizes = ELECTRICITY_BANK.map((c) => bills(c).length);
    expect(sizes).toContain(3);
    expect(sizes).toContain(12);
    expect(inputs.some((b) => /^35/.test(b.postcode))).toBe(true);
    expect(
      ELECTRICITY_BANK.filter((c) => c.expected.extraction.outcome === 'nothing_read'),
    ).toHaveLength(2);
    expect(ELECTRICITY_BANK.some((c) => c.pages.some((p) => !isElectricityTemplatePage(p)))).toBe(
      true,
    );

    const reviews = ELECTRICITY_BANK.flatMap((c) => c.expected.review.bills);
    expect(reviews.map((r) => r.scope)).toEqual(
      expect.arrayContaining([
        { inScope: false, reason: 'canary_ceuta_melilla' },
        { inScope: false, reason: 'issued_before_2026_06_12' },
      ]),
    );
    expect(reviews.some((r) => r.totals.under > 0)).toBe(true);
    expect(reviews.some((r) => r.totals.counted > 0)).toBe(true);
    expect(reviews.some((r) => r.items.some((i) => 'readings' in i))).toBe(true);
    const baskets = ELECTRICITY_BANK.map((c) => c.expected.review.basket);
    expect(baskets.some((b) => b.skipped.some((s) => s.reason === 'duplicate'))).toBe(true);
    expect(baskets.some((b) => b.yearlyEstimate !== null)).toBe(true);
  });

  it('keeps the person keys it scans for in the AI pass', () => {
    const keys = new Set(
      ELECTRICITY_BANK.flatMap((c) => c.pages.flatMap((p) => Object.keys(p.data))),
    );
    for (const key of ELECTRICITY_PERSON_KEYS) expect(keys).toContain(key);
  });
});

describe('the electricity templates', () => {
  it.each(ELECTRICITY_TEMPLATE_IDS)(
    '%s says where it comes from and carries the footer on every sheet',
    (id) => {
      const html = bankTemplate(id);
      expect(html).toMatch(/^<!--[\s\S]*Source:[\s\S]*Licence:[\s\S]*-->/);
      const sheets = html.match(SHEET)?.length ?? 0;
      expect(sheets).toBeGreaterThanOrEqual(1);
      expect(html.split(FOOTER).length - 1).toBe(sheets);
    },
  );

  it('re-lays out the PVPC model bills of the 2021 resolution and names it', () => {
    for (const id of ['electricity/pvpc-es', 'electricity/pvpc-bonus-es'] as const)
      expect(bankTemplate(id)).toContain('BOE-A-2021-7120');
  });

  it('every template is used by some case', () => {
    const used = new Set(ELECTRICITY_BANK.flatMap(templatesOf));
    for (const id of ELECTRICITY_TEMPLATE_IDS) expect(used).toContain(id);
  });
});
