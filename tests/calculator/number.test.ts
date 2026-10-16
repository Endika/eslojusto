import { describe, expect, it } from 'vitest';
import { formatEuros, parseAmount } from '../../src/calculator/number';
describe('parseAmount', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1234,56', 1234.56],
    ['1234.56', 1234.56],
    ['1 234,56 €', 1234.56],
    ['1.234', 1234],
    ['12,5', 12.5],
    ['0', 0],
    ['', null],
    ['  ', null],
  ])('%s → %s', (t, n) => expect(parseAmount(t)).toBe(n));
  it('garbage → NaN', () => expect(parseAmount('abc')).toBeNaN());
  // «1,500» reads as 1500 in English and as 1,5 in Spanish: neither is guessed.
  it.each(['1,500', '12,000', '999,999', '1,500 €'])('%s, ambiguous → NaN', (t) =>
    expect(parseAmount(t)).toBeNaN(),
  );
  it.each([
    ['0,125', 0.125],
    ['1,25', 1.25],
    ['1.500,000', 1500],
    ['1234,500', 1234.5],
  ])('%s is not ambiguous → %s', (t, n) => expect(parseAmount(t)).toBe(n));
});
describe('formatEuros', () => {
  it('es-ES', () => expect(formatEuros(1234.5).replace(/\s/g, ' ')).toBe('1.234,50 €'));
});
