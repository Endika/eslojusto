import { describe, expect, it } from 'vitest';
import { ERTE_ERRORS, parseErte, type ErteAnswers } from '../../src/erte/form';

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
  it('maps «Prefiero no decirlo» to no answer', () => {
    expect(parseErte(answers({ children: 'not_said' }))).toMatchObject({
      input: { children: null },
    });
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
  it.each(['0', '5', '9', '71', '100', '-5', 'x', ''])('rejects the percentage «%s»', (percent) => {
    expect(parseErte(answers({ measure: 'reduction', percent }))).toEqual({
      kind: 'errors',
      fields: ['percent'],
    });
  });
  it.each(['10', '70'])('accepts the percentage «%s» at the edges', (percent) => {
    expect(parseErte(answers({ measure: 'reduction', percent }))).toMatchObject({ kind: 'input' });
  });
  it('names the range when the percentage is out of it', () => {
    expect(ERTE_ERRORS.percent).toBe('Escribe un porcentaje entre 10 y 70');
  });
  it.each(['0', '-1', 'abc'])('rejects the base «%s»', (base) => {
    expect(parseErte(answers({ base }))).toEqual({ kind: 'errors', fields: ['base'] });
  });
});
