import { LIMITS } from '../../src/domain/documents';
import {
  MAX_CLAUSES,
  MAX_INVOICES,
  MAX_MORTGAGE_CLAUSE_TEXT,
  MAX_OPERATIONS,
  MAX_SUPPLIED,
  MORTGAGE_SECTIONS,
} from '../../src/domain/mortgage-schema';

// What a mortgage read of 25 pages can record, to measure its output: a deed with twelve clauses
// and every invoice, return and statement list at its maximum. `largest` copies every text to its
// limit; `typical` copies clauses of the length deeds print. Made-up values only.

const f = (value: unknown) => ({ value, confidence: 'high' });
const page = (n: number, kind: string, document: number) => ({
  page: n,
  kind,
  document,
  readability: f('ok'),
  confidence: 'high',
});
const PROSE =
  'Serán de cuenta exclusiva de la parte prestataria todos los gastos de tasación del inmueble, aranceles notariales y registrales relativos a la constitución de la hipoteca, los impuestos que graven este contrato y los gastos de gestoría para su tramitación. ';
const prose = (length: number) => PROSE.repeat(Math.ceil(length / PROSE.length)).slice(0, length);
// A deed's clauses run from a few lines to most of a page.
const TYPICAL_CLAUSE = 800;

const maxOf = <K extends keyof typeof MORTGAGE_SECTIONS>(kind: K, list: string): number => {
  const lists: Readonly<Record<string, { readonly maxItems: number }>> =
    MORTGAGE_SECTIONS[kind].lists;
  return lists[list]?.maxItems ?? 0;
};

const KINDS = [
  'notary_invoice',
  'registry_invoice',
  'agency_invoice_mortgage',
  'valuation_invoice',
  'ajd_form',
  'fein',
  'fiae',
  'transparency_deed',
  'prepayment_statement',
];

export function mortgageRecord(texts: 'largest' | 'typical'): Record<string, unknown> {
  const largest = texts === 'largest';
  const named = (name: string, limit: number) => (largest ? name.padEnd(limit, 'X') : name);
  const kinds = [...Array<string>(LIMITS.maxImages - KINDS.length).fill('mortgage_deed'), ...KINDS];
  const rows = <T>(n: number, row: (i: number) => T) => Array.from({ length: n }, (_, i) => row(i));
  const invoice = (concept: string) => ({
    invoiceOn: '2019-07-02',
    concept,
    mixed: false,
    base: 612.4,
    vat: 128.6,
    supplied: 12.5,
    total: 753.5,
    confidence: 'high',
  });
  return {
    pages: kinds.map((kind, i) => page(i + 1, kind, kinds.indexOf(kind) + 1)),
    mortgage_deed: {
      deedOn: f('2019-07-02'),
      lenderName: f(named('Banco Imaginario, S.A.', 80)),
      borrowerType: f('individual'),
      purpose: f('housing'),
      loanKind: f('standard'),
      principal: f(180000),
      termMonths: f(360),
      rateType: f('mixed'),
      fixedUntil: f('2024-07-01'),
      initialRate: f(1.875),
      index: f('euribor'),
      spread: f(0.875),
      rateRevisionMonths: f(12),
      floorPercent: f(0),
      defaultRate: f(4.875),
      defaultMarginPoints: f(3),
      earlyTerminationInstalments: f(12),
      prepaymentOption: f('a_015_5y'),
      variablePrepaymentFeePercent: f(0.15),
      fixedPrepaymentFeePercent: f(2),
      openingFee: f(900),
      openingFeePercent: f(0.5),
      otherSetUpFee: f(false),
      transparencyActStated: f(true),
      handwrittenStatement: f(true),
      clauses: rows(MAX_CLAUSES, (i) => ({
        label: 'expenses_clause',
        text: prose(largest ? MAX_MORTGAGE_CLAUSE_TEXT : TYPICAL_CLAUSE),
        page: i + 1,
        confidence: 'high',
      })),
    },
    notary_invoice: { notaryInvoices: rows(MAX_INVOICES, () => invoice('loan')) },
    registry_invoice: { registryInvoices: rows(MAX_INVOICES, () => invoice('mortgage')) },
    agency_invoice_mortgage: {
      agencyInvoices: rows(maxOf('agency_invoice_mortgage', 'agencyInvoices'), () => ({
        invoiceOn: '2019-07-20',
        fee: 250,
        vat: 52.5,
        total: 2302.5,
        confidence: 'high',
      })),
      agencySupplied: rows(MAX_SUPPLIED, () => ({
        concept: 'registry',
        amount: 410.2,
        confidence: 'high',
      })),
    },
    valuation_invoice: {
      valuationInvoices: rows(maxOf('valuation_invoice', 'valuationInvoices'), () => ({
        invoiceOn: '2019-06-10',
        base: 300,
        vat: 63,
        total: 363,
        confidence: 'high',
      })),
    },
    ajd_form: {
      ajdForms: rows(maxOf('ajd_form', 'ajdForms'), () => ({
        concept: 'loan',
        accruedOn: '2019-07-02',
        taxBase: 270000,
        amountPaid: 4050,
        paidOn: '2019-07-25',
        paidByLender: true,
        confidence: 'high',
      })),
    },
    fein: { deliveredOn: f('2019-06-17'), principal: f(180000), initialRate: f(1.875) },
    fiae: { deliveredOn: f('2019-06-17') },
    transparency_deed: { actOn: f('2019-07-01'), amountCharged: f(0) },
    prepayment_statement: {
      operations: rows(MAX_OPERATIONS, () => ({
        on: '2023-03-15',
        kind: 'partial_prepayment',
        principal: 20000,
        feeCharged: 30,
        feeConcept: named('Compensación por desistimiento', 80),
        premiumRefunded: 120.4,
        confidence: 'high',
      })),
    },
  };
}
