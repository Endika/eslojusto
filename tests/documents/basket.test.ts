import { describe, expect, it } from 'vitest';
import { basketCase, createBasket } from '../../src/documents/basket';
import type { DocumentModel } from '../../src/documents/ports';
import { today, tr } from './fixtures';

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
