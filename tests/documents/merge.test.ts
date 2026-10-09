import { describe, expect, it } from 'vitest';
import type { FormEntries } from '../../src/calculator/fill';
import { mergeRead, type Applied, type ListSpecs } from '../../src/documents/merge';
import type { ReadMark } from '../../src/documents/ports';

const LISTS: ListSpecs = {
  receipts: { identity: ['month'], max: 4 },
  jobs: { identity: ['startDate'], max: Infinity, rowContainer: (i) => `[data-job="${i}"]` },
};

const mark = (id: string, derived = false): ReadMark => ({
  id,
  container: `[data-field="${id}"]`,
  confidence: 'high',
  ...(derived && { derived: true as const }),
});
const read = (entries: FormEntries, derived: readonly string[] = []) => ({
  entries,
  marks: entries.map(([name]) => mark(name, derived.includes(name))),
});
const earlier = (entries: FormEntries, derived: readonly string[] = []) =>
  new Map<string, Applied>(
    entries.map(([name, value]) => [name, { value, derived: derived.includes(name) }]),
  );

describe('mergeRead', () => {
  it('on an empty form, sets and marks everything read', () => {
    const r = read([
      ['startDate', '2024-01-01'],
      ['receipts.0.month', '2025-01'],
    ]);
    const m = mergeRead(r, [], new Map(), LISTS);
    expect(m.entries).toEqual(r.entries);
    expect(m.marks).toEqual(r.marks);
    expect(m.applied.map(([name]) => name)).toEqual(['startDate', 'receipts.0.month']);
    expect([m.differ, m.recalculated, m.full]).toEqual([false, false, false]);
  });

  it('keeps an earlier read value the new read states otherwise, and marks it', () => {
    const before: FormEntries = [
      ['startDate', '2024-01-01'],
      ['salary', '1.000,00'],
    ];
    const m = mergeRead(
      read([
        ['startDate', '2024-02-01'],
        ['endDate', '2025-01-31'],
      ]),
      before,
      earlier(before),
      LISTS,
    );
    expect(m.entries).toEqual([['endDate', '2025-01-31']]);
    expect(m.marks).toEqual([
      { id: 'startDate', container: '[data-field="startDate"]', confidence: 'low', conflict: true },
      mark('endDate'),
    ]);
    expect(m.differ).toBe(true);
  });

  it('works out again a value an earlier read worked out, and says so', () => {
    const m = mergeRead(
      read([['salary', '1.400,00']], ['salary']),
      [['salary', '1.300,00']],
      earlier([['salary', '1.300,00']], ['salary']),
      LISTS,
    );
    expect(m.entries).toEqual([['salary', '1.400,00']]);
    expect(m.applied).toEqual([['salary', { value: '1.400,00', derived: true }]]);
    expect([m.differ, m.recalculated]).toEqual([false, true]);
  });

  it('keeps what the person typed, unmarked', () => {
    const m = mergeRead(
      read([['salary', '1.400,00']]),
      [['salary', '1.250,00']],
      earlier([['salary', '1.300,00']]),
      LISTS,
    );
    expect(m.entries).toEqual([]);
    expect(m.marks).toEqual([]);
    expect(m.differ).toBe(true);
  });

  it('always sets an answer that only opens a list', () => {
    const m = mergeRead(
      { entries: [['hasReceipts', 'yes']], marks: [] },
      [['hasReceipts', 'no']],
      new Map(),
      LISTS,
    );
    expect(m.entries).toEqual([['hasReceipts', 'yes']]);
    expect(m.differ).toBe(false);
  });

  it('adds new rows after the ones there, the same document once, and keeps typed rows', () => {
    const before: FormEntries = [
      ['receipts.0.month', '2025-01'],
      ['receipts.0.rent', '500,00'],
      ['receipts.1.month', '2025-02'],
      ['receipts.1.rent', '500,00'],
    ];
    // Row 2, typed by hand, was never read.
    const typed: FormEntries = [['receipts.2.rent', '510,00']];
    const m = mergeRead(
      read([
        ['receipts.0.month', '2025-02'],
        ['receipts.0.rent', '500,00'],
        ['receipts.0.water', '20,00'],
        ['receipts.1.month', '2025-03'],
        ['receipts.1.rent', '500,00'],
      ]),
      [...before, ...typed],
      earlier(before),
      LISTS,
    );
    expect(m.entries).toEqual([
      ['receipts.0.month', '2025-01'],
      ['receipts.0.rent', '500,00'],
      ['receipts.1.month', '2025-02'],
      ['receipts.1.rent', '500,00'],
      ['receipts.2.rent', '510,00'],
      ['receipts.1.water', '20,00'],
      ['receipts.3.month', '2025-03'],
      ['receipts.3.rent', '500,00'],
    ]);
    expect(m.marks.map((k) => [k.id, k.container])).toEqual([
      ['receipts.1.month', '[data-field="receipts.1.month"]'],
      ['receipts.1.rent', '[data-field="receipts.1.rent"]'],
      ['receipts.1.water', '[data-field="receipts.1.water"]'],
      ['receipts.3.month', '[data-field="receipts.3.month"]'],
      ['receipts.3.rent', '[data-field="receipts.3.rent"]'],
    ]);
    expect([m.differ, m.full]).toEqual([false, false]);
  });

  it('keeps a row value an earlier read gave that the same document now states otherwise', () => {
    const before: FormEntries = [
      ['receipts.0.month', '2025-01'],
      ['receipts.0.rent', '500,00'],
    ];
    const m = mergeRead(
      read([
        ['receipts.0.month', '2025-01'],
        ['receipts.0.rent', '550,00'],
      ]),
      before,
      earlier(before),
      LISTS,
    );
    expect(m.entries).toEqual(before);
    expect(m.marks).toContainEqual({
      id: 'receipts.0.rent',
      container: '[data-field="receipts.0.rent"]',
      confidence: 'low',
      conflict: true,
    });
    expect(m.differ).toBe(true);
  });

  it('on a full list, keeps every row there, adds what fits and says the rest did not', () => {
    const before: FormEntries = ['01', '02', '03'].map((mm, i) => [
      `receipts.${i}.month`,
      `2025-${mm}`,
    ]);
    const m = mergeRead(
      read([
        ['receipts.0.month', '2025-04'],
        ['receipts.1.month', '2025-05'],
      ]),
      before,
      earlier(before),
      LISTS,
    );
    expect(m.entries).toEqual([...before, ['receipts.3.month', '2025-04']]);
    expect(m.marks.map((k) => k.id)).toEqual(['receipts.3.month']);
    expect(m.full).toBe(true);
  });

  it('moves a whole row’s mark to the row it lands on', () => {
    const before: FormEntries = [['jobs.0.startDate', '2020-01-01']];
    const m = mergeRead(
      {
        entries: [
          ['jobs.0.startDate', '2021-01-01'],
          ['jobs.0.endDate', '2021-06-30'],
        ],
        marks: [{ id: 'jobs.0', container: '[data-job="0"]', confidence: 'medium' }],
      },
      before,
      new Map(),
      LISTS,
    );
    expect(m.entries).toEqual([
      ['jobs.0.startDate', '2020-01-01'],
      ['jobs.1.startDate', '2021-01-01'],
      ['jobs.1.endDate', '2021-06-30'],
    ]);
    expect(m.marks).toEqual([{ id: 'jobs.1', container: '[data-job="1"]', confidence: 'medium' }]);
  });

  it('passes on a mark about no value the read sets', () => {
    const lone: ReadMark = { id: 'note', container: '[data-note]', confidence: 'high' };
    expect(mergeRead({ entries: [], marks: [lone] }, [], new Map(), LISTS).marks).toEqual([lone]);
  });
});
