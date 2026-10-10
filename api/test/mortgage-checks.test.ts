import { describe, expect, it } from 'vitest';
import { parseReading } from '../src/domain/extraction';
import { mortgageFailedChecks, mortgageIncomplete } from '../src/domain/mortgage-checks';
import { mortgageMerge } from '../src/domain/mortgage-merge';
import { f, page } from './support/fields';

// Made-up invoices and deeds, with figures that add up unless a test says otherwise.

const row = (values: Record<string, unknown>) => ({ ...values, confidence: 'high' });
const EXPENSES = row({ label: 'expenses_clause', text: 'Gastos a cargo de la parte prestataria.' });

const checks = (input: Record<string, unknown>) =>
  mortgageFailedChecks(
    parseReading(input, (input['pages'] as readonly unknown[]).length, 'mortgage'),
  );

const notary = (values: Record<string, unknown>) => ({
  pages: [page(1, 'notary_invoice')],
  notary_invoice: { notaryInvoices: [row(values)] },
});

describe('mortgage coherence checks', () => {
  it('finds nothing wrong with invoices that add up', () => {
    expect(
      checks(notary({ concept: 'loan', base: 500, vat: 105, supplied: 10.5, total: 615.5 })),
    ).toEqual([]);
  });

  it('flags an invoice whose base, VAT and outlays are more than 5 cents from its total', () => {
    expect(checks(notary({ concept: 'loan', base: 500, vat: 105, total: 615.5 }))).toEqual([
      'invoice_parts_do_not_sum',
    ]);
    expect(checks(notary({ concept: 'loan', base: 500, vat: 105, total: 605.04 }))).toEqual([]);
  });

  it('adds an agency’s outlays to its only invoice, and leaves two invoices unchecked', () => {
    const agency = (invoices: readonly Record<string, unknown>[]) => ({
      pages: [page(1, 'agency_invoice_mortgage')],
      agency_invoice_mortgage: {
        agencyInvoices: invoices.map(row),
        agencySupplied: [row({ concept: 'registry', amount: 300 })],
      },
    });
    expect(checks(agency([{ fee: 200, vat: 42, total: 542 }]))).toEqual([]);
    expect(checks(agency([{ fee: 200, vat: 42, total: 242 }]))).toEqual([
      'invoice_parts_do_not_sum',
    ]);
    expect(checks(agency([{ fee: 200, vat: 42, total: 242 }, { total: 90 }]))).toEqual([]);
  });

  it('flags a notary or registry invoice that bills the purchase and the loan as one', () => {
    expect(checks(notary({ concept: 'loan', mixed: true, total: 1200 }))).toEqual([
      'invoice_mixes_purchase_and_loan',
    ]);
  });

  it('flags an agency outlay that repeats a tax return or a registry invoice in the pack', () => {
    const pack = (supplied: number) => ({
      pages: [page(1, 'agency_invoice_mortgage'), page(2, 'ajd_form'), page(3, 'registry_invoice')],
      agency_invoice_mortgage: {
        agencySupplied: [row({ concept: 'ajd', amount: supplied })],
      },
      ajd_form: { ajdForms: [row({ concept: 'loan', amountPaid: 1500 })] },
      registry_invoice: { registryInvoices: [row({ concept: 'mortgage', total: 410.2 })] },
    });
    expect(checks(pack(1500.04))).toEqual(['duplicate_supplied_amount']);
    expect(checks(pack(1499))).toEqual([]);
  });

  it('flags a return that taxes the purchase rather than the loan', () => {
    expect(
      checks({
        pages: [page(1, 'ajd_form')],
        ajd_form: { ajdForms: [row({ concept: 'purchase', amountPaid: 9800 })] },
      }),
    ).toEqual(['ajd_purchase_not_loan']);
  });

  it('flags a legible deed without its expenses clause as a missing page', () => {
    const deed = (
      clauses: readonly unknown[],
      readability: 'ok' | 'blurry' = 'ok',
      fields: Record<string, unknown> = { deedOn: f('2014-05-06') },
    ) => ({
      pages: [page(1, 'mortgage_deed', 1, 'high', undefined, readability)],
      mortgage_deed: { ...fields, clauses },
    });
    expect(checks(deed([]))).toEqual(['missing_key_page']);
    expect(checks(deed([EXPENSES]))).toEqual([]);
    expect(checks(deed([], 'blurry'))).toEqual([]);
    expect(checks(deed([], 'ok', { deedOn: f('2019-06-15') }))).toEqual(['missing_key_page']);
    expect(checks(deed([], 'ok', { principal: f(120000) }))).toEqual(['missing_key_page']);
  });

  it('asks for no expenses clause from a deed of 16-06-2019 or later, whose costs the law shares out', () => {
    const deed = (deedOn: string) => ({
      pages: [page(1, 'mortgage_deed')],
      mortgage_deed: { deedOn: f(deedOn), clauses: [] },
    });
    expect(checks(deed('2019-06-16'))).toEqual([]);
    expect(checks(deed('2021-03-04'))).toEqual([]);
  });
});

describe('an incomplete mortgage read', () => {
  const incomplete = (deed: Record<string, unknown>) => {
    const input = { pages: [page(1, 'mortgage_deed')], mortgage_deed: deed };
    const reading = parseReading(input, 1, 'mortgage');
    return mortgageIncomplete(reading, mortgageMerge(reading, input));
  };

  it('is a legible deed with neither its date nor its capital', () => {
    expect(incomplete({ lenderName: f('Banco Imaginario, S.A.') })).toBe(true);
    expect(incomplete({ deedOn: f('2014-05-06') })).toBe(false);
    expect(incomplete({ principal: f(120000) })).toBe(false);
  });
});
