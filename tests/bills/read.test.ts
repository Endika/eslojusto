import { describe, expect, it } from 'vitest';
import { Answers, amountOf, dateOf, isoOf, lowest, numberOf, textOf } from '../../src/bills/read';

describe('the figures of a read', () => {
  it.each([
    [['high', 'medium', 'high'], 'medium'],
    [['medium', 'low', 'high'], 'low'],
    [['low', 'medium'], 'low'],
    [['high', 'high'], 'high'],
    [['medium'], 'medium'],
  ] as const)('takes the least sure of %j', (list, expected) => {
    expect(lowest(...list)).toBe(expected);
  });

  it.each([
    [0, 0],
    [4.6, 4.6],
    [-0.1, null],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    ['4', null],
    [true, null],
    [undefined, null],
  ])('reads %j as the figure %j', (value, expected) => {
    expect(numberOf(value)).toBe(expected);
  });

  it('reads an amount to the cent', () => {
    expect(amountOf(1.239)).toBe(1.24);
    expect(amountOf(1.231)).toBe(1.23);
    expect(amountOf(-1)).toBeNull();
    expect(amountOf('1')).toBeNull();
  });
});

describe('the words and the days of a read', () => {
  it.each([
    ['  hola  ', 'hola'],
    ['hola', 'hola'],
    ['   ', null],
    ['', null],
    [7, null],
  ])('reads %j as the text %j', (value, expected) => {
    expect(textOf(value)).toBe(expected);
  });

  it('reads a day only from a real date', () => {
    expect(dateOf('2026-06-30')).toEqual({ y: 2026, m: 6, d: 30 });
    expect(isoOf('2026-06-30')).toBe('2026-06-30');
    for (const v of ['2026-02-31', 'no', '', 20260630, undefined]) {
      expect(dateOf(v)).toBeNull();
      expect(isoOf(v)).toBeNull();
    }
  });
});

describe('the answers of a read', () => {
  it('keeps each in order, with the mark of the ones read and not the ones that only open', () => {
    const a = new Answers<'x' | 'y' | 'z'>();
    a.read('x', '1', 'high');
    a.open('y', 'yes');
    a.read('z', '2', 'low', true);
    expect(a.entries).toEqual([
      ['x', '1'],
      ['y', 'yes'],
      ['z', '2'],
    ]);
    expect(a.marks).toEqual([
      { id: 'x', container: '[data-field="x"]', confidence: 'high' },
      { id: 'z', container: '[data-field="z"]', confidence: 'low', derived: true },
    ]);
  });

  it('is low in confidence when any answer read is', () => {
    const a = new Answers<'x'>();
    expect(a.lowConfidence()).toBe(false);
    a.read('x', '1', 'medium');
    expect(a.lowConfidence()).toBe(false);
    a.read('x', '2', 'low');
    expect(a.lowConfidence()).toBe(true);
  });
});
