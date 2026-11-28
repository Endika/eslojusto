import { describe, expect, it } from 'vitest';
import { required } from '../../src/calculator/dom';

describe('required', () => {
  it('hands back the element it is given', () => {
    const el = { tagName: 'DIV' } as Element;
    expect(required(el, 'box')).toBe(el);
  });

  it('names what is missing', () => {
    expect(() => required(null, 'the box')).toThrow('Missing the box');
  });
});
