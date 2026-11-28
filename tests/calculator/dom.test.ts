import { describe, expect, it } from 'vitest';
import { required } from '../../src/calculator/dom';

describe('required', () => {
  it('names what is missing', () => {
    expect(() => required(null, 'the box')).toThrow('Missing the box');
  });
});
