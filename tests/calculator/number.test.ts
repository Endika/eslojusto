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
});
describe('formatEuros', () => {
  it('es-ES', () => expect(formatEuros(1234.5).replace(/\s/g, ' ')).toBe('1.234,50 €'));
});
