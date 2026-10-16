import { describe, expect, it } from 'vitest';
import { electricityCase } from '../../src/bills/electricity/case';
import type { CompletedElectricityReview } from '../../src/bills/electricity/ports';
import { telecomCase } from '../../src/bills/telecom/case';
import { basketCase, createBasket } from '../../src/documents/basket';
import type { Block, DocumentModel } from '../../src/documents/ports';
import { BILLS_NORMS } from '../../src/engine/bills/data/norms';
import { BILLS_SOURCES } from '../../src/engine/bills/data/sources';
import { BILLS_TABLES } from '../../src/engine/bills/data/tables';
import { reviewElectricityBill } from '../../src/engine/bills/electricity-review';
import { reviewTelecom } from '../../src/engine/bills/telecom-review';
import type { ElectricityBillInput, TelecomInput } from '../../src/engine/bills/types';
import { parseDate } from '../../src/engine/date';
import { juneBill, meter, TODAY } from '../engine/bills/input';
import { pageTranslator } from '../support/page-strings';
import { today, tr } from './fixtures';

const billsTr = pageTranslator('bills');

describe('a basket kept in memory', () => {
  it('replaces the review being worked on, and keeps it once the next one starts', () => {
    const basket = createBasket<string>();
    basket.put('june');
    basket.put('june, corrected');
    expect(basket.entries()).toEqual(['june, corrected']);
    basket.next();
    basket.put('july');
    expect(basket.entries()).toEqual(['june, corrected', 'july']);
  });

  it('drops only the review being worked on', () => {
    const basket = createBasket<string>();
    basket.put('june');
    basket.next();
    basket.put('out of scope');
    basket.drop();
    expect(basket.entries()).toEqual(['june']);
    // Nothing is being worked on now: dropping again keeps what was kept.
    basket.drop();
    expect(basket.entries()).toEqual(['june']);
    basket.put('july');
    expect(basket.entries()).toEqual(['june', 'july']);
  });

  it('gives a copy of what it keeps', () => {
    const basket = createBasket<string>();
    basket.put('june');
    const seen = basket.entries();
    basket.next();
    basket.put('july');
    expect(seen).toEqual(['june']);
  });
});

describe('a paid review built from a basket', () => {
  const model: DocumentModel = { title: 'Informe', footer: null, blocks: [] };
  const section = {
    offer: (entries: readonly number[]) => entries.reduce((a, b) => a + b, 0) >= 5,
    report: (entries: readonly number[]): DocumentModel => ({
      ...model,
      title: `${entries.length}`,
    }),
    reportFilename: 'client.bills.electricity.report.filename' as const,
  };

  it('offers the pass by the section’s rule over every review kept, never for an empty basket', () => {
    expect(basketCase([2, 3], section).offer).toBe(true);
    expect(basketCase([2], section).offer).toBe(false);
    expect(basketCase([], { ...section, offer: () => true }).offer).toBe(false);
  });

  it('reports the reviews it was built from, even once the basket changes', () => {
    const entries = [2, 3];
    const paid = basketCase(entries, section);
    entries.push(4);
    expect(paid.report(tr, today).title).toBe('2');
    expect(paid.letterKinds).toEqual([]);
    expect(paid.filename?.('report')).toBe('client.bills.electricity.report.filename');
  });
});

const electricity = (input: ElectricityBillInput): CompletedElectricityReview => {
  const r = reviewElectricityBill(input, TODAY, { norms: BILLS_NORMS, tables: BILLS_TABLES });
  if (!r.ok) throw new Error(`invalid: ${JSON.stringify(r.errors)}`);
  return { input, review: r.review };
};

// The June bill with its meter charged at 1,00 instead of 0,80; VAT on 50,42 at 21 % is 10,59.
const meterOver = electricity(
  juneBill({
    meter: meter({ amount: 1 }),
    vat: { base: 50.42, percent: 21, amount: 10.59 },
    total: 61.01,
  }),
);
const onPeriod = (bill: CompletedElectricityReview, from: string, to: string) => ({
  ...bill,
  input: { ...bill.input, readingFrom: parseDate(from), readingTo: parseDate(to) },
});
const texts = (blocks: readonly Block[]) =>
  blocks.map((b) => ('text' in b ? b.text : 'label' in b ? `${b.label}: ${b.value}` : b.type));

describe('a year of electricity bills as the pass sees it', () => {
  const year = [
    onPeriod(meterOver, '2026-04-30', '2026-05-31'),
    meterOver,
    onPeriod(meterOver, '2026-06-30', '2026-07-31'),
  ];

  it('is not offered for one small difference, and is once it comes back bill after bill', () => {
    expect(electricityCase([meterOver], BILLS_NORMS).offer).toBe(false);
    expect(electricityCase(year, BILLS_NORMS).offer).toBe(true);
  });

  it('adds up every bill once, with the yearly estimate apart from the total', () => {
    const lines = texts(
      electricityCase([...year, meterOver], BILLS_NORMS).report(billsTr, today).blocks,
    );
    expect(lines).toContain('Por encima de la norma: 0,60 €');
    expect(lines).not.toContain('Por encima de la norma: 0,80 €');
    expect(lines).toContain(
      'Estimación, no una cifra de tus facturas, y no se suma a ningún total: si lo que se repite (Alquiler del contador) siguiera igual, en un año serían unos 2\u00a0€.',
    );
    expect(lines).toContain('Factura del 31\u201105\u20112026 al 30\u201106\u20112026');
    expect(lines).toContain(
      'Es la misma que otra factura de tu año (mismo suministro y periodo) y no cuenta dos veces.',
    );
  });

  it('lists a single bill without a year to add up', () => {
    const lines = texts(electricityCase([meterOver], BILLS_NORMS).report(billsTr, today).blocks);
    expect(lines).not.toContain('Lo que suman tus facturas');
    expect(lines.some((l) => l.startsWith('Alquiler del contador: Por encima'))).toBe(true);
  });
});

describe('an exit from a phone contract as the pass sees it', () => {
  const exit = (penaltyCharged: number) => {
    const input: TelecomInput = {
      commitment: { startedOn: parseDate('2025-03-01'), months: 18, agreedPenalty: 180 },
      exitRequestedOn: parseDate('2026-03-01'),
      penaltyCharged,
      handset: null,
      changeNotice: null,
      lines: [],
    };
    const r = reviewTelecom(input, TODAY, {
      norms: BILLS_NORMS,
      sources: BILLS_SOURCES,
      tables: { holidays: BILLS_TABLES.holidays },
    });
    if (!r.ok) throw new Error('invalid');
    return { input, review: r.review };
  };

  it('is offered once what it counts reaches the price of the pass', () => {
    // 184 of 549 days left of 180,00 allow 60,33.
    expect(telecomCase(exit(120), BILLS_NORMS).offer).toBe(true);
    expect(telecomCase(exit(64), BILLS_NORMS).offer).toBe(false);
    expect(telecomCase(exit(120), BILLS_NORMS).report(billsTr, today).title).toBe(
      'Revisión de tu baja de teléfono o internet',
    );
  });
});
