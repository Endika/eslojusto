import { describe, expect, it } from 'vitest';
import { errorName } from '../src/domain/error-name';

describe('the error name a log carries', () => {
  it('is the class of a known error, never its message', () => {
    const throttled = Object.assign(new Error('Too many tokens for 12345678Z'), {
      name: 'ThrottlingException',
    });
    expect(errorName(throttled)).toBe('ThrottlingException');
    expect(errorName(new TypeError('x'))).toBe('TypeError');
  });

  it('is «other» for any name off the list, or for something that is not an error', () => {
    expect(errorName(Object.assign(new Error('x'), { name: 'Juan Pérez' }))).toBe('other');
    expect(errorName('ThrottlingException')).toBe('other');
    expect(errorName(undefined)).toBe('other');
  });
});
