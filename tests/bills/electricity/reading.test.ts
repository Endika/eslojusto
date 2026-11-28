// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { electricityReading } from '../../../src/bills/electricity/reading';
import type { Confidence, ElectricityExtraction } from '../../../src/documents/contract';
import type { Translate } from '../../../src/i18n/client';

const tr: Translate = (key) => key;

const bill = (document: number, readingTo: string, confidence: Confidence = 'high') => ({
  values: { document, readingTo },
  confidence,
});

const extraction = (...bills: ReturnType<typeof bill>[]): ElectricityExtraction => ({
  pages: [],
  documents: [],
  fields: {},
  conflicts: [],
  bills,
  powerLines: [],
  energyLines: [],
  otherLines: [],
  agreedPrices: [],
  services: [],
  priceChanges: [],
});

const pack = extraction(bill(1, '2026-06-30', 'low'), bill(2, '2026-07-30'));

describe('the electricity reading', () => {
  it('words every check', () => {
    expect(electricityReading(document.createElement('form'), tr).wordsEveryCheck).toBe(true);
  });

  it('fills nothing, and keeps the form, when no bill was read', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    form.append(input);
    input.value = 'typed';
    const reading = electricityReading(form, tr);
    expect(reading.prefill(extraction(), {}, [])).toEqual({
      entries: [],
      marks: [],
      count: 0,
      lowConfidence: false,
      notes: [],
    });
    expect(input.value).toBe('typed');
  });

  it('clears the form of the bill it replaces, and adds the read’s notes to the bill’s', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    form.append(input);
    input.value = 'typed';
    const reading = electricityReading(form, tr);
    const read = reading.prefill(pack, {}, ['duplicate_bill']);
    expect(input.value).toBe('');
    expect(read.notes).toEqual([
      'client.bills.documents.several',
      'client.bills.documents.check.duplicate_bill',
      'client.documents.done_low',
    ]);
  });

  it('keeps a bill taken from the queue and not reviewed in turn for the next read', () => {
    const reading = electricityReading(document.createElement('form'), tr);
    reading.prefill(pack, {}, []);
    reading.next();
    expect(reading.pending()).toBe(0);
    reading.prefill(pack, {}, []);
    expect(reading.pending()).toBe(2);
  });

  it('lets a bill typed by hand go when another read comes', () => {
    const reading = electricityReading(document.createElement('form'), tr);
    reading.prefill(pack, {}, []);
    reading.typed();
    reading.prefill(pack, {}, []);
    expect(reading.pending()).toBe(2);
  });
});
