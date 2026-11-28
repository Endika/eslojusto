import { describe, expect, it } from 'vitest';
import { parseErte, type ErteAnswers } from '../../src/erte/form';

const answers = (over: Partial<ErteAnswers> = {}): ErteAnswers => ({
  regime: 'etop',
  measure: 'suspension',
  percent: '',
  base: '1.500,00',
  children: '0',
  ...over,
});

describe('parseErte', () => {
  it('reads a complete suspension', () => {
    expect(parseErte(answers())).toEqual({
      kind: 'input',
      input: { regime: 'etop', measure: { kind: 'suspension' }, base: 1500, children: 0 },
    });
  });
  it('reads a reduction with its percentage', () => {
    const p = parseErte(answers({ measure: 'reduction', percent: '40' }));
    expect(p).toMatchObject({ input: { measure: { kind: 'reduction', percent: 40 } } });
  });
  it('does not ask RED for children', () => {
    expect(parseErte(answers({ regime: 'red', children: '' }))).toMatchObject({
      kind: 'input',
      input: { regime: 'red', children: null },
    });
  });
  it('«No lo sé» needs nothing else', () => {
    expect(parseErte(answers({ regime: 'unknown', measure: '', base: '', children: '' }))).toEqual({
      kind: 'unknown_regime',
    });
  });
  it('lists every missing answer', () => {
    expect(parseErte(answers({ regime: '', measure: '', base: '', children: '' }))).toEqual({
      kind: 'errors',
      fields: ['regime', 'measure', 'base', 'children'],
    });
  });
  it.each(['71'])('rejects the percentage «%s»', (percent) => {
    expect(parseErte(answers({ measure: 'reduction', percent }))).toEqual({
      kind: 'errors',
      fields: ['percent'],
    });
  });
  it.each(['0', '1.000.000,01'])('rejects the base «%s»', (base) => {
    expect(parseErte(answers({ base }))).toEqual({ kind: 'errors', fields: ['base'] });
  });
  it('accepts a base of exactly one million', () => {
    expect(parseErte(answers({ base: '1.000.000' }))).toMatchObject({ input: { base: 1_000_000 } });
  });
  it.each([['2', 2]])('reads %s children', (children, expected) => {
    expect(parseErte(answers({ children }))).toMatchObject({ input: { children: expected } });
  });
});
