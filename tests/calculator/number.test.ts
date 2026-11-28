import { describe, expect, it } from 'vitest';
import { parseAmount } from '../../src/calculator/number';
describe('parseAmount', () => {
  it.each([
    ['1234.56', 1234.56],
    ['1 234,56 €', 1234.56],
  ])('%s → %s', (t, n) => expect(parseAmount(t)).toBe(n));
  // «1,500» reads as 1500 in English and as 1,5 in Spanish: neither is guessed.
  it.each(['1,500 €'])('%s, ambiguous → NaN', (t) => expect(parseAmount(t)).toBeNaN());
});

describe('a field whose values are never thousands', () => {
  it.each([['3.464', 3.464]])('%s reads as a decimal one', (t, n) =>
    expect(parseAmount(t, true)).toBe(n),
  );
});
