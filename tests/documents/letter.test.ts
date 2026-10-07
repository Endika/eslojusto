import { describe, expect, it } from 'vitest';
import { letterPrefilled, looksLikeDniOrNie, NO_DETAILS } from '../../src/documents/letter';

describe('the DNI or NIE check', () => {
  it.each(['12345678Z', '12345678-z', '12.345.678 Z', 'X1234567L', 'Y1234567X', 'Z1234567R'])(
    '%s looks right',
    (id) => expect(looksLikeDniOrNie(id)).toBe(true),
  );
  it.each(['12345678A', '1234567Z', 'X12345678L', 'W1234567L', '1234', 'Alex'])(
    '%s does not',
    (id) => expect(looksLikeDniOrNie(id)).toBe(false),
  );
});

describe('how much of the letter was filled', () => {
  it('counts the four personal fields, never the date', () => {
    expect(letterPrefilled({ ...NO_DETAILS, date: { y: 2026, m: 10, d: 7 } })).toBe('none');
    expect(letterPrefilled({ ...NO_DETAILS, place: 'Logroño' })).toBe('some');
    expect(letterPrefilled({ name: 'A', id: 'B', company: 'C', place: 'D', date: null })).toBe(
      'all',
    );
    expect(letterPrefilled({ ...NO_DETAILS, name: '   ' })).toBe('none');
  });
});
