import { describe, expect, it } from 'vitest';
import { formatoEuros, parseImporte } from '../../src/calculadora/numero';
describe('parseImporte', () => {
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
  ])('%s → %s', (t, n) => expect(parseImporte(t)).toBe(n));
  it('basura → NaN', () => expect(parseImporte('abc')).toBeNaN());
});
describe('formatoEuros', () => {
  it('es-ES', () => expect(formatoEuros(1234.5).replace(/\s/g, ' ')).toBe('1.234,50 €'));
});
