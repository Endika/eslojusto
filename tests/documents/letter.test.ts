import { describe, expect, it } from 'vitest';
import {
  detailLine,
  letterPrefilled,
  looksLikeDniOrNie,
  NO_DETAILS,
  placeAndDate,
  type LetterDetails,
} from '../../src/documents/letter';
import { today, tr } from './fixtures';

describe('the DNI or NIE check', () => {
  it.each(['12345678Z', '12345678-z', '12.345.678 Z', 'X1234567L', 'Y1234567X', 'Z1234567R'])(
    '%s looks right',
    (id) => expect(looksLikeDniOrNie(id)).toBe(true),
  );
  it.each([
    '12345678A',
    '1234567Z',
    'X12345678L',
    'X12345678Z',
    'W1234567L',
    '1234',
    'Alex',
    'AB12345678Z',
    '12345678Z9',
  ])('%s does not', (id) => expect(looksLikeDniOrNie(id)).toBe(false));
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
  it('reads a field that is missing as empty', () => {
    expect(letterPrefilled({} as LetterDetails)).toBe('none');
  });
});

describe('the lines of the letter that take what the person typed', () => {
  it('keeps what was typed trimmed, and leaves an empty value to write by hand', () => {
    expect(detailLine('Nombre', ' Alex ')).toEqual({
      type: 'blank',
      label: 'Nombre',
      value: 'Alex',
      wrap: true,
    });
    expect(detailLine('Nombre', '  ')).toEqual({ type: 'blank', label: 'Nombre' });
    expect(detailLine('Nombre')).toEqual({ type: 'blank', label: 'Nombre' });
  });
  it('writes the place and date, with blanks for what was left empty', () => {
    const at = (place: string, date: LetterDetails['date']) =>
      placeAndDate({ ...NO_DETAILS, place, date }, tr);
    expect(at(' Teruel ', today)).toEqual({
      type: 'text',
      text: 'En Teruel, a 7 de octubre de 2026',
    });
    expect(at('  ', null)).toEqual({
      type: 'text',
      text: 'En ____________________, a ____ de ____________________ de ________',
    });
  });
});
