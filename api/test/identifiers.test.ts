import { describe, expect, it } from 'vitest';
import { hasIdentifier } from '../src/domain/identifiers';

// Made-up identifiers: control letters and check digits are not valid.
describe('hasIdentifier', () => {
  it.each([
    ['a DNI', 'Arrendatario con DNI 12345678A'],
    ['a DNI in lower case', 'dni 12345678a'],
    ['an NIE', 'NIE X1234567A'],
    ['an IBAN in one piece', 'IBAN ES0021000418450200051332'],
    ['an IBAN in groups', 'cuenta ES00 2100 0418 4502 0005 1332'],
    ['an IBAN with dashes', 'ES00-2100-0418-4502-0005-1332'],
    ['an email address', 'escribe a casero.inventado@ejemplo.test'],
    ['a mobile number', 'tel 600123456'],
    ['a phone number in groups', 'llamar al 912 34 56 78'],
    ['a phone number with +34', 'móvil +34 600 123 456'],
  ])('finds %s', (_, text) => {
    expect(hasIdentifier(text)).toBe(true);
  });

  it.each([
    ['an amount', 'La renta será de 1.234,56 euros mensuales'],
    ['a large amount', 'un aval de 912.345,67 €'],
    ['a date', 'desde el 2026-07-31 o el 31/07/2026'],
    ['a postcode', 'Calle Inexistente 1, 28999 Madrid'],
    ['a percentage', 'se actualizará un 3,5 % o un 2.25 %'],
    ['a contract clause', 'aplicando la variación del IRAV publicada por el INE'],
    ['a long number that is no phone', 'expediente 9123456789'],
  ])('finds nothing in %s', (_, text) => {
    expect(hasIdentifier(text)).toBe(false);
  });
});
