import { describe, expect, it } from 'vitest';
import { electricityFailedChecks, electricityIncomplete } from '../src/domain/electricity-checks';
import { ELECTRICITY_MERGE_RULES, electricityMerge } from '../src/domain/electricity-merge';
import { ELECTRICITY_SECTIONS, MAX_BILLS } from '../src/domain/electricity-schema';
import { parseReading } from '../src/domain/extraction';
import { fingerprint } from '../src/domain/fingerprint';
import { f, page } from './support/fields';

// Made-up figures, companies and supply codes (their check letters are not valid).
const SUPPLY = 'ES0000111122223333BB';
const PAGES = [
  page(1, 'electricity_contract'),
  page(2, 'price_change_notice'),
  page(3, 'electricity_bill'),
  page(4, 'electricity_bill', 4),
];
const toolInput = (input: Record<string, unknown>, pages = PAGES) => ({ pages, ...input });
const read = (input: Record<string, unknown>, pages = PAGES) =>
  parseReading(toolInput(input, pages), pages.length, 'electricity');
const pack = (input: Record<string, unknown>, pages = PAGES) =>
  electricityMerge(read(input, pages), toolInput(input, pages));
const checks = (input: Record<string, unknown>) => electricityFailedChecks(read(input));
const row = (values: Record<string, unknown>) => ({ ...values, confidence: 'high' });

// A bill whose lines add up to its VAT base, and whose base and VAT make its total.
const COHERENT = {
  bills: [
    row({
      document: 3,
      readingFrom: '2026-06-30',
      readingTo: '2026-07-31',
      billedDays: 31,
      supplyFingerprint: SUPPLY,
      socialBonusFunding: 0.77,
      electricityTaxAmount: 2.84,
      meterAmount: 0.83,
      vatBase: 64.25,
      vatAmount: 13.49,
      total: 77.74,
    }),
  ],
  powerLines: [
    row({ document: 3, period: 'p1', amount: 9.63 }),
    row({ document: 3, period: 'p2', amount: 1.07 }),
  ],
  energyLines: [
    row({ document: 3, period: 'p1', amount: 12.99 }),
    row({ document: 3, period: 'p2', amount: 11.69 }),
    row({ document: 3, period: 'p3', amount: 19.48 }),
  ],
  otherLines: [
    row({ document: 3, kind: 'service', serviceLabel: 'maintenance', amount: 6.95 }),
    row({ document: 3, kind: 'discount', amount: 2 }),
  ],
};
const bill = (values: Record<string, unknown>) => ({
  ...COHERENT,
  bills: [{ ...COHERENT.bills[0], ...values }],
});

describe('electricityMerge', () => {
  it('merges every contract and notice field, and nothing else', () => {
    const fields = Object.values(ELECTRICITY_SECTIONS).flatMap((s) => Object.keys(s.fields));
    const renamed = { noticeSentOn: 'sentOn', noticeAppliesFrom: 'appliesFrom' };
    const merged = Object.keys(ELECTRICITY_MERGE_RULES).map(
      (name) => renamed[name as keyof typeof renamed] ?? name,
    );
    expect(merged.sort()).toEqual([...new Set(fields)].sort());
  });

  it('keeps each bill in its own row with its source, so two bills never conflict', () => {
    const m = pack({
      electricity_bill: {
        bills: [
          row({ document: 3, readingTo: '2026-07-31', total: 77.74, supplyFingerprint: SUPPLY }),
          row({ document: 4, readingTo: '2026-08-31', total: 71.2, supplyFingerprint: SUPPLY }),
        ],
      },
    });
    expect(m.lists.bills?.map((b) => [b.values['document'], b.values['total'], b.source])).toEqual([
      [3, 77.74, 'electricity_bill'],
      [4, 71.2, 'electricity_bill'],
    ]);
    expect(m.lists.bills?.map((b) => b.values['supplyFingerprint'])).toEqual([
      fingerprint(SUPPLY),
      fingerprint(SUPPLY),
    ]);
    expect(m.conflicts).toEqual([]);
    expect(m.truncated).toBe(false);
  });

  it('names the notice’s dates apart from the contract’s', () => {
    const m = pack({
      electricity_contract: { signedOn: f('2026-05-20'), priceType: f('fixed') },
      price_change_notice: { sentOn: f('2026-08-01'), appliesFrom: f('2026-09-01') },
    });
    expect(m.fields).toEqual({
      signedOn: { ...f('2026-05-20'), source: 'electricity_contract' },
      priceType: { ...f('fixed'), source: 'electricity_contract' },
      noticeSentOn: { ...f('2026-08-01'), source: 'price_change_notice' },
      noticeAppliesFrom: { ...f('2026-09-01'), source: 'price_change_notice' },
    });
  });

  it('drops a copied text that holds a supply code, an IBAN, a phone or health, and keeps the figures', () => {
    const m = pack({
      electricity_contract: {
        exitPenaltyText: f('Penalización para el suministro ES0000111122223333BB del titular.'),
      },
      electricity_bill: {
        bills: [
          row({
            document: 3,
            retailerName: 'Energía Imaginaria, tel. 600 123 456',
            invoiceNumber: 'ES00 2100 0418 4502 0005 1332',
            total: 77.74,
          }),
        ],
        otherLines: [
          row({ document: 3, concept: 'Seguro de salud', kind: 'service', amount: 4.99 }),
          row({ document: 3, concept: 'Mantenimiento Plus', kind: 'service', amount: 6.95 }),
        ],
      },
    });
    expect(m.fields.exitPenaltyText).toBeUndefined();
    expect(m.lists.bills?.[0]?.values).toEqual({ document: 3, total: 77.74 });
    expect(m.lists.otherLines?.map((r) => r.values['concept'])).toEqual([
      undefined,
      'Mantenimiento Plus',
    ]);
    expect(m.lists.otherLines?.map((r) => r.values['amount'])).toEqual([4.99, 6.95]);
    expect(m.discarded).toBe(4);
    expect(JSON.stringify(m)).not.toMatch(/ES0000|ES00 2100|600 123|salud/);
  });

  it('says a list came back at its maximum', () => {
    const bills = Array.from({ length: MAX_BILLS }, (_, i) => row({ document: 3, total: i + 1 }));
    expect(pack({ electricity_bill: { bills } }).truncated).toBe(true);
  });
});

describe('electricityFailedChecks', () => {
  it('passes a bill that hangs together', () => {
    expect(checks({ electricity_bill: COHERENT })).toEqual([]);
  });

  it('flags lines that do not add up to the VAT base, beyond a euro', () => {
    expect(checks({ electricity_bill: bill({ vatBase: 65.5, total: 79 }) })).toEqual([
      'lines_do_not_sum',
    ]);
    expect(checks({ electricity_bill: bill({ vatBase: 65.25, total: 78.74 }) })).toEqual([]);
  });

  it('leaves a bill with a penalty for leaving out of the sum', () => {
    expect(checks({ electricity_bill: bill({ vatBase: 80, exitPenaltyAmount: 15 }) })).toEqual([
      'vat_base_mismatch',
    ]);
  });

  it('flags a total below the base and its VAT, never one above it', () => {
    expect(checks({ electricity_bill: bill({ total: 70 }) })).toEqual(['vat_base_mismatch']);
    expect(checks({ electricity_bill: bill({ total: 90 }) })).toEqual([]);
  });

  it('flags billed days that are not the days between the readings', () => {
    expect(checks({ electricity_bill: bill({ billedDays: 32 }) })).toEqual(['days_mismatch']);
  });

  it('flags a last reading on or before the first', () => {
    expect(checks({ electricity_bill: bill({ readingTo: '2026-06-30', billedDays: 0 }) })).toEqual([
      'period_end_before_start',
    ]);
  });

  it('flags the same supply and period twice', () => {
    const [first] = COHERENT.bills;
    expect(checks({ electricity_bill: { bills: [first, { ...first, document: 4 }] } })).toEqual([
      'duplicate_bill',
    ]);
    expect(
      checks({
        electricity_bill: {
          bills: [
            first,
            { ...first, document: 4, readingFrom: '2026-07-31', readingTo: '2026-08-31' },
          ],
        },
      }),
    ).toEqual([]);
  });
});

describe('electricityIncomplete', () => {
  it('doubts a legible bill that yields no total, and a contract with no price', () => {
    const bills = [page(1, 'electricity_bill'), page(2, 'electricity_bill', 2)];
    const incomplete = (input: Record<string, unknown>, pages = PAGES) => {
      const r = read(input, pages);
      return electricityIncomplete(r, electricityMerge(r, toolInput(input, pages)));
    };
    const one = (values: Record<string, unknown>) => ({ bills: [row({ document: 1, ...values })] });
    expect(incomplete({ electricity_bill: one({ total: 77.74 }) }, bills)).toBe(false);
    expect(incomplete({ electricity_bill: one({ readingTo: '2026-07-31' }) }, bills)).toBe(true);
    expect(incomplete({ electricity_bill: COHERENT })).toBe(true);
    expect(
      incomplete({ electricity_bill: COHERENT, electricity_contract: { priceType: f('fixed') } }),
    ).toBe(false);
  });
});
