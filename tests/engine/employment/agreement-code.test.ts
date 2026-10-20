import { describe, expect, it } from 'vitest';
import { agreementScope } from '../../../src/engine/employment/agreement-code';

describe('the scope an agreement code gives (RD 713/2010, anexo 3)', () => {
  it('reads a State sector agreement', () => {
    // Publicidad, BOE 01-05-2026.
    expect(agreementScope('99004225011981')).toEqual({ authority: 'state', level: 'sector' });
  });

  it('reads a State company agreement', () => {
    expect(agreementScope('90012342012015')).toEqual({ authority: 'state', level: 'company' });
  });

  it('reads a regional and a provincial one by their first two digits', () => {
    expect(agreementScope('86000125011990').authority).toBe('regional');
    expect(agreementScope('48001234011982').authority).toBe('province');
  });

  it('says a workplace, a company and a group of companies are company agreements', () => {
    for (const digit of ['1', '2', '3'])
      expect(agreementScope(`2800123${digit}012010`).level).toBe('company');
  });

  it('says a sector below a province is a sector agreement, and a «franja» neither', () => {
    expect(agreementScope('28001234012010').level).toBe('sector');
    expect(agreementScope('28001230012010').level).toBe('unknown');
  });

  it('says nothing of a code that is not one of the 14-digit ones, or of an unused authority', () => {
    expect(agreementScope(null)).toEqual({ authority: 'unknown', level: 'unknown' });
    expect(agreementScope('9900422501198')).toEqual({ authority: 'unknown', level: 'unknown' });
    expect(agreementScope('60004225011981').authority).toBe('unknown');
  });
});
