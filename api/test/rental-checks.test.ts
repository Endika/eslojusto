import { describe, expect, it } from 'vitest';
import { parseReading } from '../src/domain/extraction';
import { rentalFailedChecks, rentalIncomplete } from '../src/domain/rental-checks';
import { rentalMerge } from '../src/domain/rental-merge';
import { f, page } from './support/fields';

const PAGES = [
  page(1, 'lease'),
  page(2, 'rent_update_notice'),
  page(3, 'rent_receipt'),
  page(4, 'agency_invoice'),
  page(5, 'deposit_return'),
];
const checks = (input: Record<string, unknown>) =>
  rentalFailedChecks(parseReading({ pages: PAGES, ...input }, PAGES.length, 'rental'));
const row = (values: Record<string, unknown>) => ({ ...values, confidence: 'high' });

describe('rentalFailedChecks', () => {
  it('passes a coherent pack', () => {
    expect(
      checks({
        lease: { signedOn: f('2024-05-20'), startDate: f('2024-06-01') },
        rent_update_notice: {
          notices: [row({ previousRent: 919.8, percent: 2, newRent: 938.2 })],
        },
        rent_receipt: {
          receipts: [row({ month: '2026-01', total: 969.8, rent: 919.8, community: 50 })],
        },
        agency_invoice: {
          invoices: [row({ conceptKind: 'solvency_check', base: 250, vat: 52.5, total: 302.5 })],
        },
        deposit_return: {
          keysReturnedOn: f('2026-07-31'),
          returns: [row({ on: '2026-07-31', amount: 650 })],
        },
      }),
    ).toEqual([]);
  });

  it.each([
    [
      'return_before_keys',
      {
        deposit_return: {
          keysReturnedOn: f('2026-07-31'),
          returns: [row({ on: '2026-07-30', amount: 650 })],
        },
      },
    ],
    [
      'receipt_parts_do_not_sum',
      {
        rent_receipt: {
          receipts: [row({ month: '2026-01', total: 971, rent: 919.8, community: 50 })],
        },
      },
    ],
    [
      'invoice_total_mismatch',
      {
        agency_invoice: {
          invoices: [row({ conceptKind: 'agency_fee', base: 250, vat: 52.5, total: 302.56 })],
        },
      },
    ],
    [
      'notice_rent_mismatch',
      { rent_update_notice: { notices: [row({ previousRent: 900, percent: 2.2, newRent: 921 })] } },
    ],
    [
      'start_long_before_signing',
      { lease: { signedOn: f('2024-07-03'), startDate: f('2024-06-01') } },
    ],
  ])('flags %s', (check, input) => {
    expect(checks(input)).toEqual([check]);
  });

  it('allows a cent of rounding on an invoice and a euro on a receipt or a notice', () => {
    expect(
      checks({
        rent_receipt: {
          receipts: [row({ month: '2026-01', total: 970.8, rent: 919.8, community: 50 })],
        },
        agency_invoice: {
          invoices: [row({ conceptKind: 'agency_fee', base: 250, vat: 52.5, total: 302.55 })],
        },
        rent_update_notice: { notices: [row({ previousRent: 900, percent: 2.2, newRent: 920.8 })] },
        lease: { signedOn: f('2024-07-02'), startDate: f('2024-06-01') },
      }),
    ).toEqual([]);
  });

  it('checks nothing it lacks a figure for', () => {
    expect(
      checks({
        rent_receipt: { receipts: [row({ month: '2026-01', total: 970 })] },
        agency_invoice: { invoices: [row({ conceptKind: 'agency_fee', total: 300 })] },
        rent_update_notice: { notices: [row({ previousRent: 900, newRent: 950 })] },
        deposit_return: { returns: [row({ on: '2020-01-01', amount: 1 })] },
      }),
    ).toEqual([]);
  });
});

describe('rentalIncomplete', () => {
  const incomplete = (lease: Record<string, unknown>) => {
    const reading = parseReading({ pages: [page(1, 'lease')], lease }, 1, 'rental');
    return rentalIncomplete(reading, rentalMerge(reading));
  };

  it('looks again at a legible lease with neither its rent nor its date', () => {
    expect(incomplete({ deposit: f(900) })).toBe(true);
    expect(incomplete({ initialRent: f(900) })).toBe(false);
    expect(incomplete({ signedOn: f('2024-05-20') })).toBe(false);
  });

  it('does not look again at a lease set aside', () => {
    const reading = parseReading(
      { pages: [page(1, 'lease', 1, 'high', undefined, 'blurry')] },
      1,
      'rental',
    );
    expect(rentalIncomplete(reading, rentalMerge(reading))).toBe(false);
  });
});
