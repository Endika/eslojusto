import { describe, expect, it } from 'vitest';
import { parseReading } from '../src/domain/extraction';
import { RENTAL_MERGE_RULES, rentalMerge } from '../src/domain/rental-merge';
import { RENTAL_SECTIONS } from '../src/domain/rental-schema';
import { f, page } from './support/fields';

const pack = (input: Record<string, unknown>, pages: number) =>
  rentalMerge(parseReading(input, pages, 'rental'));

const leaseAndReturn = [page(1, 'lease'), page(2, 'deposit_return')];

describe('rentalMerge', () => {
  it('merges every lease and deposit-return field, and nothing else', () => {
    const fields = [
      ...Object.keys(RENTAL_SECTIONS.lease.fields),
      ...Object.keys(RENTAL_SECTIONS.deposit_return.fields),
    ];
    expect(Object.keys(RENTAL_MERGE_RULES).sort()).toEqual([...new Set(fields)].sort());
  });

  it('keeps each value with the kind of document it came from', () => {
    const m = pack(
      {
        pages: leaseAndReturn,
        lease: { signedOn: f('2024-05-20'), initialRent: f(1100, 'medium') },
        deposit_return: { keysReturnedOn: f('2026-07-31') },
      },
      2,
    );
    expect(m.fields).toEqual({
      signedOn: { ...f('2024-05-20'), source: 'lease' },
      initialRent: { ...f(1100, 'medium'), source: 'lease' },
      keysReturnedOn: { ...f('2026-07-31'), source: 'deposit_return' },
    });
    expect(m.documents).toEqual([
      { kind: 'lease', pages: [1] },
      { kind: 'deposit_return', pages: [2] },
    ]);
  });

  it('takes the deposit from the lease first, and flags a return that states another', () => {
    const m = pack(
      { pages: leaseAndReturn, lease: { deposit: f(1100) }, deposit_return: { deposit: f(1000) } },
      2,
    );
    expect(m.fields.deposit).toEqual({ ...f(1100), source: 'lease' });
    expect(m.conflicts).toEqual([{ field: 'deposit', sources: ['lease', 'deposit_return'] }]);
    expect(m.discarded).toBe(0);
  });

  it('falls back to the deposit a return states when the lease names none', () => {
    const m = pack({ pages: leaseAndReturn, lease: {}, deposit_return: { deposit: f(1000) } }, 2);
    expect(m.fields.deposit).toEqual({ ...f(1000), source: 'deposit_return' });
  });

  it('drops a disagreeing deposit the return was unsure of, as a discard, not a conflict', () => {
    const m = pack(
      {
        pages: leaseAndReturn,
        lease: { deposit: f(1100) },
        deposit_return: { deposit: f(1000, 'medium') },
      },
      2,
    );
    expect(m.conflicts).toEqual([]);
    expect(m.discarded).toBe(1);
  });

  it('carries each list with its source and leaves out lists with no rows', () => {
    const m = pack(
      {
        pages: [page(1, 'rent_receipt', 1, 'high', '2026-01'), page(2, 'agency_invoice')],
        rent_receipt: { receipts: [{ month: '2026-01', total: 950, confidence: 'high' }] },
        agency_invoice: { invoices: [] },
      },
      2,
    );
    expect(m.lists).toEqual({
      receipts: [
        { values: { month: '2026-01', total: 950 }, confidence: 'high', source: 'rent_receipt' },
      ],
    });
  });

  it('drops a landlord’s name unless the lease shows a company', () => {
    const name = (landlordType?: string) =>
      pack(
        {
          pages: [page(1, 'lease')],
          lease: {
            ...(landlordType && { landlordType: f(landlordType) }),
            landlordCompanyName: f('Persona Inventada Ejemplo'),
          },
        },
        1,
      );
    for (const m of [name('person'), name()]) {
      expect(m.fields.landlordCompanyName).toBeUndefined();
      expect(m.discarded).toBe(1);
    }
    const company = name('company');
    expect(company.fields.landlordCompanyName).toEqual({
      ...f('Persona Inventada Ejemplo'),
      source: 'lease',
    });
    expect(company.discarded).toBe(0);
  });

  it('drops a copied text that still holds an identifier, and keeps the figures beside it', () => {
    const m = pack(
      {
        pages: [page(1, 'lease'), page(2, 'deposit_return')],
        lease: {
          landlordType: f('company'),
          landlordCompanyName: f('Pisos de Mentira S.L., ES00 2100 0418 4502 0005 1332'),
          feesText: f('Honorarios a cargo de la parte arrendadora.'),
          chargesClauseText: f('Comunidad a cargo del inquilino; dudas al 600 123 456.'),
          updateClauseText: f('Se actualizará según el IRAV.'),
        },
        deposit_return: {
          deductions: [
            { amount: 150, kind: 'cleaning', concept: 'Limpieza final', confidence: 'high' },
            { amount: 90, kind: 'other', concept: 'Pago a NIE X1234567A', confidence: 'high' },
          ],
        },
      },
      2,
    );
    expect(Object.keys(m.fields).sort()).toEqual(['feesText', 'landlordType', 'updateClauseText']);
    expect(m.lists.deductions?.map((d) => d.values)).toEqual([
      { amount: 150, kind: 'cleaning', concept: 'Limpieza final' },
      { amount: 90, kind: 'other' },
    ]);
    expect(m.discarded).toBe(3);
  });
});
