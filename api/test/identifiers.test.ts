import { describe, expect, it } from 'vitest';
import {
  hasIdentifier,
  hasDeviceNumber,
  hasNumberPlate,
  hasPersonTitle,
  hasPaymentCardNumber,
  hasSocialSecurityNumber,
  hasSupplyNumber,
} from '../src/domain/identifiers';

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
    ['a DNI with dots and a dash', 'DNI: 12.345.678-A'],
    ['a DNI with a dash', '12345678-A'],
    ['a DNI with spaces', '12 345 678 A'],
    ['a DNI glued to its label', 'DNI12345678A'],
    ['an NIE with dashes', 'X-1234567-A'],
    ['an NIE with spaces', 'X 1234567 A'],
    ['an IBAN in uneven groups', 'ES00 2100 0418 45 0200051332'],
    ['an IBAN with dots', 'ES00.2100.0418.4502.0005.1332'],
    ['an old account number in groups', '2100 0418 45 0200051332'],
    ['an old account number with dashes', '2100-0418-45-0200051332'],
    ['an old account number in one piece', '21000418450200051332'],
    ['a phone number with 0034', '0034600123456'],
    ['a phone number with dots', '600.12.34.56'],
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
    ['a file number with its year', 'Expte. 600123456/2026'],
    ['an invoice number after its year', 'factura nº 2026-600123456'],
    ['a large amount with dots', '1.234.567,89 €'],
    ['an amount that starts like a phone', '600.123,45 €'],
    ['a millionaire amount', '600.123.456,78 €'],
    ['a month', 'desde 2025-07'],
    ['a date with no separators', '20240520'],
    ['laws', 'Ley 29/1994 y RDL 7/2019'],
    ['a cadastral reference', 'Ref. catastral 9872023VH5797S0001WX'],
    ['a receipt number', 'Recibo 202607-0001'],
    ['a thirteen-digit reference', 'referencia 9123456789012'],
    ['a company tax number', 'NIF B12345678'],
  ])('finds nothing in %s', (_, text) => {
    expect(hasIdentifier(text)).toBe(false);
  });
});

describe('hasSocialSecurityNumber', () => {
  it.each([
    ['in one piece', 'NAF 281234567890'],
    ['in groups', 'n.º afiliación 28 12345678 90'],
    ['with slashes', '28/12345678/90'],
    ['with dashes', '28-12345678-90'],
  ])('finds one %s', (_, text) => {
    expect(hasSocialSecurityNumber(text)).toBe(true);
  });

  it.each([
    ['an employer account code', 'C.C.C. 28/1234567/89'],
    ['an agreement code', 'código 28000000011900'],
    ['an amount', '12.345.678,90 €'],
    ['a date', '2026-10-07'],
    ['a thirteen-digit reference', 'referencia 9123456789012'],
  ])('finds nothing in %s', (_, text) => {
    expect(hasSocialSecurityNumber(text)).toBe(false);
  });
});

describe('hasPaymentCardNumber', () => {
  it.each([
    ['in groups', 'Tarjeta 4000 0000 0000 0002'],
    ['in one piece', 'cargo en la tarjeta 4000000000000002'],
    ['with dashes', '5500-0000-0000-0004'],
    ['of American Express', 'Amex 3400 000000 00009'],
  ])('finds one %s', (_, text) => {
    expect(hasPaymentCardNumber(text)).toBe(true);
  });

  it.each([
    ['a masked number', 'Tarjeta **** **** **** 0002'],
    ['an amount', '1.234.567,89 €'],
    ['an old account number', '2100 0418 45 0200051332'],
    ['a thirteen-digit reference', 'referencia 9123456789012'],
    ['a date', 'desde el 2026-07-31'],
    ['a law', 'Ley 16/2011, de 24 de junio'],
  ])('finds nothing in %s', (_, text) => {
    expect(hasPaymentCardNumber(text)).toBe(false);
  });
});

describe('hasNumberPlate', () => {
  it.each([
    ['of today', 'Turismo matrícula 1234 BCD'],
    ['in one piece', 'vehículo 1234BCD'],
    ['with a dash', '1234-BCD'],
    ['of a province', 'matrícula M-1234-AB'],
  ])('finds one %s', (_, text) => {
    expect(hasNumberPlate(text)).toBe(true);
  });

  it.each([
    ['a law and its acronym', 'Ley 50/1980 LCS'],
    ['a year and a word in lower case', '2026 bcd'],
    ['a year and vowels', '2016 AEI'],
    ['an amount', '12.345,67 €'],
    ['a law', 'Ley 50/1980, de 8 de octubre'],
    ['a company tax number', 'NIF B12345678'],
  ])('finds nothing in %s', (_, text) => {
    expect(hasNumberPlate(text)).toBe(false);
  });
});

describe('hasPersonTitle', () => {
  it.each([
    ['Don', 'con la fianza de Don Mengano Inventado'],
    ['Doña', 'comparece Doña Zutana Ficticia'],
    ['D.', 'responde D. Fulano Inventado'],
    ['D.ª', 'y D.ª María Imaginaria'],
    ['Dña.', 'Dña. Perengana Ficticia, mayor de edad'],
    ['Sra.', 'la Sra. Mengana Inventada'],
  ])('finds a name after %s', (_, text) => {
    expect(hasPersonTitle(text)).toBe(true);
  });

  it.each([
    ['a placeholder', 'responde D. [nombre] como fiador'],
    ['a title in lower case', 'don de gentes'],
    ['a word that ends like one', 'Mondon Fulano'],
    ['a lender', 'Banco Imaginario, S.A.'],
    ['a law', 'Disposición transitoria primera de la Ley 5/2019'],
  ])('finds nothing in %s', (_, text) => {
    expect(hasPersonTitle(text)).toBe(false);
  });
});

describe('hasSupplyNumber', () => {
  it.each([
    ['in one piece', 'Suministro ES0000111122223333BB'],
    ['in groups', 'CUPS: ES 0000 1111 2222 3333 BB'],
    ['with a border point', 'ES0000111122223333BB0F'],
    ['in lower case', 'cups es0000111122223333bb'],
  ])('finds one %s', (_, text) => {
    expect(hasSupplyNumber(text)).toBe(true);
  });

  it.each([
    ['an IBAN', 'ES00 2100 0418 4502 0005 1332'],
    ['an access tariff', 'Peaje 2.0TD'],
    ['an amount', '1.234,56 €'],
    ['a bill number', 'FE26-000000123'],
  ])('finds nothing in %s', (_, text) => {
    expect(hasSupplyNumber(text)).toBe(false);
  });
});

describe('hasDeviceNumber', () => {
  it.each([
    ['in one piece', 'Plazo terminal IMEI 350000111111112'],
    ['in groups', 'IMEI: 35-000011-111111-2'],
    ['with spaces', 'IMEI 35 000011 111111 2'],
  ])('finds one %s', (_, text) => {
    expect(hasDeviceNumber(text)).toBe(true);
  });

  it.each([
    ['a phone number', 'Llamadas a 600 123 456'],
    ['an amount', '1.234,56 €'],
    ['a date and a period', 'Del 01/08/2026 al 31/08/2026'],
    ['sixteen digits', '3500001111111123'],
  ])('finds nothing in %s', (_, text) => {
    expect(hasDeviceNumber(text)).toBe(false);
  });
});
