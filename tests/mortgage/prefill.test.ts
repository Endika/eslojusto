// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  Confidence,
  ExtractedRow,
  ExtractedValue,
  MortgageExtraction,
  SourceKind,
} from '../../src/documents/contract';
import { parseDate } from '../../src/engine/date';
import type { Translate } from '../../src/i18n/client';
import { readMortgageForm } from '../../src/mortgage/form';
import { mortgagePrefill } from '../../src/mortgage/prefill';
import { pageTranslator } from '../support/page-strings';

const tr: Translate = pageTranslator('mortgage');
const TODAY = parseDate('2026-10-10');

const f = (
  value: ExtractedValue,
  confidence: Confidence = 'high',
  source: SourceKind = 'mortgage_deed',
) => ({ value, confidence, source });
const row = (
  values: Record<string, ExtractedValue>,
  source: SourceKind,
  confidence: Confidence = 'high',
): ExtractedRow => ({ values, confidence, source });
const clause = (label: string, text: string, confidence: Confidence = 'high') =>
  row({ label, text, page: 1 }, 'mortgage_deed', confidence);

const extraction = (e: Partial<MortgageExtraction>): MortgageExtraction => ({
  pages: [],
  documents: [{ kind: 'mortgage_deed', pages: 6 }],
  fields: {},
  conflicts: [],
  clauses: [],
  notaryInvoices: [],
  registryInvoices: [],
  agencyInvoices: [],
  agencySupplied: [],
  valuationInvoices: [],
  ajdForms: [],
  operations: [],
  ...e,
});

const prefill = (
  e: Partial<MortgageExtraction>,
  checks: Parameters<typeof mortgagePrefill>[2] = [],
) => mortgagePrefill(extraction(e), tr, checks);
type P = ReturnType<typeof prefill>;
const entry = (p: P, name: string) => p.entries.find(([n]) => n === name)?.[1];
const mark = (p: P, id: string) => p.marks.find((m) => m.id === id);

// A synthetic consumer's variable-rate deed of 2014 at Euríbor plus a spread, with a floor, a
// default rate, an early termination clause, an opening fee and the clause that put every cost on
// the borrower.
const DEED: MortgageExtraction['fields'] = {
  deedOn: f('2014-03-20'),
  lenderName: f('Banco Ficticio, S.A.'),
  borrowerType: f('individual'),
  purpose: f('housing'),
  loanKind: f('standard'),
  principal: f(150_000),
  rateType: f('variable'),
  initialRate: f(3.25),
  index: f('euribor'),
  spread: f(1.5),
  rateRevisionMonths: f(12),
  floorPercent: f(3),
  defaultRate: f(18, 'medium'),
  earlyTerminationInstalments: f(3),
  openingFee: f(1_500),
  otherSetUpFee: f(false),
};
const EXPENSES =
  'Serán de cuenta exclusiva de la parte prestataria todos los gastos de notaría, registro, gestoría, tasación e impuestos que se deriven de la presente escritura.';
const FLOOR =
  'El tipo de interés aplicable nunca podrá ser inferior al 3,00 % nominal anual, cualquiera que sea la variación del índice de referencia.';
const INDEX =
  'El tipo de interés se revisará anualmente tomando como índice de referencia el Euríbor a un año más un diferencial de 1,50 puntos.';
const CLAUSES = [
  clause('floor_clause', FLOOR),
  clause('euribor', INDEX),
  clause('default_interest', 'El interés de demora será del 18 % nominal anual.', 'medium'),
  clause(
    'early_termination',
    'La entidad podrá dar por vencido el préstamo si se impagan 3 cuotas.',
  ),
  clause('opening_fee', 'Comisión de apertura de 1.500 euros, a pagar de una sola vez.'),
  clause('expenses_clause', EXPENSES),
];

// The answers the form holds after the read, with what the documents never say, as a person would
// add them; read as the review reads its form.
function readAnswers(p: P, added: Record<string, string>) {
  const el = document.createElement('form');
  const values = { ...Object.fromEntries(p.entries), ...added };
  el.innerHTML = Object.entries(values)
    .map(([name, value]) => `<input name="${name}" value="${value}" />`)
    .join('');
  return readMortgageForm(el, TODAY);
}

describe('a mortgage deed', () => {
  let p: P;
  beforeEach(() => {
    p = prefill({ fields: DEED, clauses: CLAUSES });
  });

  it('fills the loan, its date, its capital and its rate', () => {
    expect(entry(p, 'loanKind')).toBe('standard');
    expect(entry(p, 'borrower')).toBe('individual');
    expect(entry(p, 'purpose')).toBe('housing');
    expect(entry(p, 'deedOn')).toBe('2014-03-20');
    expect(entry(p, 'loanAmount')).toBe('150.000,00');
    expect(entry(p, 'rateType')).toBe('variable');
    expect(entry(p, 'revisionMonths')).toBe('12');
    expect(mark(p, 'deedOn')).toMatchObject({ confidence: 'high' });
  });

  it('answers each clause found, as surely as the clause was read', () => {
    expect(entry(p, 'expensesClause')).toBe('present');
    expect(entry(p, 'floor')).toBe('yes');
    expect(entry(p, 'floorPercent')).toBe('3');
    expect(entry(p, 'defaultInterest')).toBe('yes');
    expect(mark(p, 'defaultInterest')).toMatchObject({ confidence: 'medium' });
    expect(entry(p, 'defaultRate')).toBe('18');
    expect(entry(p, 'earlyTermination')).toBe('yes');
    expect(entry(p, 'missedInstalments')).toBe('3');
    expect(entry(p, 'openingFee')).toBe('yes');
    expect(entry(p, 'openingFeeAmount')).toBe('1.500,00');
    expect(entry(p, 'duplicateFee')).toBe('no');
  });

  it('quotes every clause word for word beside the question it answers', () => {
    expect(p.quotes.expensesClause).toBe(EXPENSES);
    expect(p.quotes.floor).toBe(FLOOR);
    // An index clause goes beside the IRPH question, and answers nothing: only IRPH would.
    expect(p.quotes.irph).toBe(INDEX);
    expect(entry(p, 'irph')).toBeUndefined();
  });

  it('names the clauses found and says where each is to be confirmed', () => {
    expect(p.notes).toContain(
      'Cláusulas encontradas en tu escritura: tipo mínimo (cláusula suelo), índice Euríbor, interés de demora, vencimiento anticipado, comisión de apertura, gastos. Cada una aparece copiada tal cual junto a su pregunta: léela y confirma allí tu respuesta.',
    );
  });

  it('never answers what only the person can, such as whether the loan was a consumer’s', () => {
    for (const name of ['consumer', 'roundingUp', 'insuranceRequired', 'hasInvoices'])
      expect(entry(p, name), name).toBeUndefined();
  });

  it('gives answers the form reads into the engine’s input once the person adds the rest', () => {
    const read = readAnswers(p, {
      consumer: 'yes',
      roundingUp: 'no',
      insuranceRequired: 'no',
      hasInvoices: 'no',
      operation: 'none',
    });
    expect(read).toMatchObject({
      input: {
        deedOn: { y: 2014, m: 3, d: 20 },
        loanAmount: 150_000,
        expensesClause: 'present',
        clauses: expect.arrayContaining([
          { label: 'floor_clause', present: true, floorPercent: 3 },
          { label: 'opening_fee', present: true, feeAmount: 1_500 },
        ]),
      },
    });
  });
});

describe('the clauses', () => {
  it('keeps every clause of one kind, one after the other', () => {
    const p = prefill({
      clauses: [clause('opening_fee', 'Apertura: 1 %.'), clause('opening_fee', 'Estudio: 300 €.')],
    });
    expect(p.quotes.openingFee).toBe('Apertura: 1 %.\n\nEstudio: 300 €.');
  });

  it('quotes a fee for repaying early beside the question on repaying early', () => {
    const p = prefill({ clauses: [clause('prepayment_fee', 'Compensación del 0,25 %.')] });
    expect(p.quotes.operation).toBe('Compensación del 0,25 %.');
    expect(entry(p, 'operation')).toBeUndefined();
  });

  it('answers yes to an IRPH clause', () => {
    const p = prefill({ clauses: [clause('irph', 'Índice IRPH Entidades.', 'low')] });
    expect(entry(p, 'irph')).toBe('yes');
    expect(mark(p, 'irph')).toMatchObject({ confidence: 'low' });
    expect(p.lowConfidence).toBe(true);
  });

  it('leaves the expenses clause open when the deed was read without it', () => {
    const p = prefill({ fields: DEED, clauses: [clause('floor_clause', FLOOR)] });
    expect(entry(p, 'expensesClause')).toBeUndefined();
    expect(p.quotes.expensesClause).toBeUndefined();
  });
});

describe('figures stated without their clause', () => {
  it('open the clause they belong to', () => {
    const p = prefill({ fields: { floorPercent: f(2.5), earlyTerminationInstalments: f(12) } });
    expect(entry(p, 'floor')).toBe('yes');
    expect(entry(p, 'floorPercent')).toBe('2,5');
    expect(entry(p, 'earlyTermination')).toBe('yes');
    expect(entry(p, 'missedInstalments')).toBe('12');
  });

  it('work out default interest from points over the initial rate, to be checked', () => {
    const p = prefill({ fields: { initialRate: f(2.875), defaultMarginPoints: f(2) } });
    expect(entry(p, 'defaultInterest')).toBe('yes');
    expect(entry(p, 'ordinaryRate')).toBe('2,875');
    expect(entry(p, 'defaultRate')).toBe('4,875');
    expect(mark(p, 'defaultRate')).toMatchObject({ derived: true });
    expect(p.notes).toContain(tr('client.mortgage.documents.default_points'));
  });

  it('give a fixed rate’s initial rate as its ordinary one', () => {
    const p = prefill({ fields: { rateType: f('fixed'), initialRate: f(2.1), defaultRate: f(5) } });
    expect(entry(p, 'ordinaryRate')).toBe('2,1');
    expect(entry(p, 'defaultRate')).toBe('5');
  });

  it('work out an opening fee stated as a share of the capital, to be checked', () => {
    const p = prefill({ fields: { principal: f(120_000), openingFeePercent: f(0.5) } });
    expect(entry(p, 'openingFee')).toBe('yes');
    expect(entry(p, 'openingFeeAmount')).toBe('600,00');
    expect(mark(p, 'openingFeeAmount')).toMatchObject({ derived: true });
    expect(p.notes).toContain(tr('client.mortgage.documents.opening_percent'));
  });
});

describe('the invoices', () => {
  const notary = (values: Record<string, ExtractedValue>) => row(values, 'notary_invoice');
  const registry = (values: Record<string, ExtractedValue>) => row(values, 'registry_invoice');

  it('go to the question of their concept, opening the invoices', () => {
    const p = prefill({
      notaryInvoices: [notary({ concept: 'loan', mixed: false, total: 720.5 })],
      registryInvoices: [registry({ concept: 'mortgage', mixed: false, total: 410 })],
      agencyInvoices: [row({ concept: 'loan', total: 1_850 }, 'agency_invoice_mortgage')],
      agencySupplied: [
        row({ concept: 'ajd', amount: 1_125 }, 'agency_invoice_mortgage'),
        row({ concept: 'registry', amount: 410 }, 'agency_invoice_mortgage'),
        row({ concept: 'other', amount: 20 }, 'agency_invoice_mortgage'),
      ],
      valuationInvoices: [row({ total: 302.5 }, 'valuation_invoice', 'medium')],
      ajdForms: [row({ concept: 'loan', amountPaid: 1_125, paidByLender: false }, 'ajd_form')],
      fields: { transparencyActCharged: f(60, 'high', 'transparency_deed') },
    });
    expect(entry(p, 'hasInvoices')).toBe('yes');
    expect(entry(p, 'notaryLoan')).toBe('720,50');
    expect(entry(p, 'notaryMixed')).toBe('no');
    expect(entry(p, 'registryMortgage')).toBe('410,00');
    expect(entry(p, 'registryMixed')).toBe('no');
    expect(entry(p, 'agency')).toBe('1.850,00');
    expect(entry(p, 'agencyTax')).toBe('1.125,00');
    expect(entry(p, 'agencyRegistry')).toBe('410,00');
    expect(entry(p, 'valuation')).toBe('302,50');
    expect(mark(p, 'valuation')).toMatchObject({ confidence: 'medium' });
    expect(entry(p, 'ajdLoan')).toBe('1.125,00');
    expect(entry(p, 'transparencyDeed')).toBe('60,00');
    expect(p.notes).toContain(tr('client.mortgage.documents.invoices'));
  });

  it('mark an invoice that bills the purchase and the loan together as mixed', () => {
    const p = prefill(
      { notaryInvoices: [notary({ concept: 'purchase', mixed: true, total: 1_480 })] },
      ['invoice_mixes_purchase_and_loan'],
    );
    expect(entry(p, 'notaryLoan')).toBe('1.480,00');
    expect(entry(p, 'notaryMixed')).toBe('yes');
    expect(p.notes).toContain(
      tr('client.mortgage.documents.check.invoice_mixes_purchase_and_loan'),
    );
  });

  it('leave out what this review does not count, and say so', () => {
    const p = prefill({
      notaryInvoices: [
        notary({ concept: 'purchase', mixed: false, total: 900 }),
        notary({ concept: 'copy_borrower', total: 30 }),
      ],
      registryInvoices: [registry({ concept: 'purchase', total: 380 })],
    });
    expect(entry(p, 'hasInvoices')).toBeUndefined();
    expect(entry(p, 'notaryLoan')).toBeUndefined();
    expect(entry(p, 'registryMortgage')).toBeUndefined();
    expect(p.notes).toContain(tr('client.mortgage.documents.invoices_left_out'));
  });

  it('add up several of one concept, as worked out', () => {
    const p = prefill({
      valuationInvoices: [
        row({ total: 250 }, 'valuation_invoice'),
        row({ total: 60.5 }, 'valuation_invoice', 'low'),
      ],
    });
    expect(entry(p, 'valuation')).toBe('310,50');
    expect(mark(p, 'valuation')).toMatchObject({ confidence: 'low', derived: true });
    expect(p.notes).toContain(tr('client.mortgage.documents.invoices_added'));
  });

  it('never take a tax the lender paid, nor the purchase’s, as the person’s', () => {
    const p = prefill({
      ajdForms: [
        row({ concept: 'loan', amountPaid: 1_125, paidByLender: true }, 'ajd_form'),
        row({ concept: 'purchase', amountPaid: 9_000 }, 'ajd_form'),
      ],
    });
    expect(entry(p, 'ajdLoan')).toBeUndefined();
    expect(p.notes).toContain(tr('client.mortgage.documents.ajd_lender_paid'));
  });
});

// An agency that handled the purchase and the loan as two files: an invoice for each, and a
// statement of funds listing what it paid for each deed apart from both invoices. Made-up figures.
describe('an agency that handled the purchase and the loan', () => {
  const agency = (values: Record<string, ExtractedValue>) => row(values, 'agency_invoice_mortgage');
  const LOAN = agency({ concept: 'loan', base: 310, vat: 65.1, total: 375.1 });
  const PURCHASE = agency({ concept: 'purchase', base: 180, vat: 37.8, total: 217.8 });
  const INVOICES = [LOAN, PURCHASE];
  const STATEMENT = [
    agency({ concept: 'ajd', deed: 'loan', amount: 1_640 }),
    agency({ concept: 'ajd', deed: 'purchase', amount: 410 }),
    agency({ concept: 'notary', deed: 'purchase', amount: 702.4 }),
    agency({ concept: 'notary', deed: 'loan', amount: 815.3 }),
    agency({ concept: 'registry', deed: 'purchase', amount: 150.2 }),
    agency({ concept: 'registry', deed: 'loan', amount: 176.9 }),
  ];
  const BILLS: Partial<MortgageExtraction> = {
    notaryInvoices: [
      row({ concept: 'purchase', mixed: false, total: 702.4 }, 'notary_invoice'),
      row({ concept: 'loan', mixed: false, total: 815.3 }, 'notary_invoice'),
    ],
    registryInvoices: [
      row({ concept: 'purchase', mixed: false, total: 150.2 }, 'registry_invoice'),
      row({ concept: 'mortgage', mixed: false, total: 176.9 }, 'registry_invoice'),
    ],
    ajdForms: [
      row({ concept: 'purchase', amountPaid: 410, paidByLender: false }, 'ajd_form'),
      row({ concept: 'loan', amountPaid: 1_640, paidByLender: false }, 'ajd_form'),
    ],
  };

  it('passes the loan’s invoice alone, and no outlay listed apart from it', () => {
    const p = prefill({
      fields: DEED,
      ...BILLS,
      agencyInvoices: INVOICES,
      agencySupplied: STATEMENT,
    });
    expect(entry(p, 'agency')).toBe('375,10');
    expect(entry(p, 'agencyTax')).toBeUndefined();
    expect(entry(p, 'agencyRegistry')).toBeUndefined();
    expect(entry(p, 'notaryLoan')).toBe('815,30');
    expect(entry(p, 'registryMortgage')).toBe('176,90');
    expect(entry(p, 'ajdLoan')).toBe('1.640,00');
    expect(p.notes).toContain(tr('client.mortgage.documents.invoices_left_out'));
    expect(p.notes).not.toContain(tr('client.mortgage.documents.agency_supplied_apart'));
  });

  it('gives the review answers it takes without a complaint', () => {
    const p = prefill({
      fields: DEED,
      clauses: CLAUSES,
      ...BILLS,
      agencyInvoices: INVOICES,
      agencySupplied: STATEMENT,
    });
    const read = readAnswers(p, {
      consumer: 'yes',
      roundingUp: 'no',
      insuranceRequired: 'no',
      valuation: '',
      paidOn: '2014-03-20',
      agreement: 'no',
      returned: '',
      operation: 'none',
    });
    expect(read).not.toHaveProperty('errors');
    expect(read).toMatchObject({
      input: {
        invoices: expect.arrayContaining([
          expect.objectContaining({ kind: 'agency', total: 375.1, supplied: [] }),
        ]),
      },
    });
  });

  it('says where an outlay paid apart goes when its own document was not read', () => {
    const p = prefill({ agencyInvoices: INVOICES, agencySupplied: STATEMENT });
    expect(entry(p, 'agency')).toBe('375,10');
    expect(entry(p, 'agencyTax')).toBeUndefined();
    expect(p.notes).toContain(tr('client.mortgage.documents.agency_supplied_apart'));
  });

  it('passes the outlays inside the loan’s invoice, those of the purchase left out', () => {
    const p = prefill({
      agencyInvoices: [agency({ concept: 'loan', base: 310, vat: 65.1, total: 2_192 }), PURCHASE],
      agencySupplied: STATEMENT,
    });
    expect(entry(p, 'agency')).toBe('2.192,00');
    expect(entry(p, 'agencyTax')).toBe('1.640,00');
    expect(entry(p, 'agencyRegistry')).toBe('176,90');
  });

  it('leaves out an invoice that names no deed, rather than adding it to the loan’s', () => {
    const p = prefill({
      agencyInvoices: [LOAN, agency({ base: 180, vat: 37.8, total: 217.8 })],
    });
    expect(entry(p, 'agency')).toBe('375,10');
    expect(p.notes).toContain(tr('client.mortgage.documents.invoices_left_out'));
  });
});

describe('an early repayment', () => {
  it('fills the latest operation a statement shows, and says when there were more', () => {
    const op = (on: string, principal: number, fee: number) =>
      row({ on, kind: 'partial_prepayment', principal, feeCharged: fee }, 'prepayment_statement');
    const p = prefill({ operations: [op('2022-02-01', 10_000, 50), op('2024-06-15', 20_000, 0)] });
    expect(entry(p, 'operation')).toBe('partial_prepayment');
    expect(entry(p, 'operationOn')).toBe('2024-06-15');
    expect(entry(p, 'operationPrincipal')).toBe('20.000,00');
    expect(entry(p, 'operationFee')).toBe('0,00');
    expect(p.notes).toContain(tr('client.mortgage.documents.operations_many'));
  });
});

describe('the summary', () => {
  it('names the capital the deed and the FEIN state differently, and the one used', () => {
    const p = prefill({
      fields: { principal: f(150_000) },
      conflicts: [{ field: 'principal', sources: ['mortgage_deed', 'fein'] }],
    });
    expect(p.notes).toContain(
      'Importe del préstamo: los documentos no dicen lo mismo. Se ha usado lo que pone la escritura; compáralo con los demás.',
    );
  });

  it('words each check of the API but the missing page, which the upload says', () => {
    const p = prefill({}, ['invoice_parts_do_not_sum', 'missing_key_page']);
    expect(p.notes).toEqual([tr('client.mortgage.documents.check.invoice_parts_do_not_sum')]);
  });

  it('says when the documents held more rows than one read takes', () => {
    expect(prefill({ truncated: true }).notes).toContain(tr('client.mortgage.documents.rows_cut'));
  });
});

// What a reading is worth, value by value, with the words of the notes as their keys.
describe('what the prefill takes from each value', () => {
  type Fields = MortgageExtraction['fields'];
  const echo: Translate = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);
  const read = (e: Partial<MortgageExtraction>) => mortgagePrefill(extraction(e), echo, []);
  const answers = (e: Partial<MortgageExtraction>) => Object.fromEntries(read(e).entries);
  const KEEPS_NOTHING = {};

  const fields: [string, Fields, Record<string, string>][] = [
    ['a capital as text', { principal: f('150000') }, KEEPS_NOTHING],
    ['a capital that is not a number', { principal: f(Number.NaN) }, KEEPS_NOTHING],
    ['a capital with no end', { principal: f(Infinity) }, KEEPS_NOTHING],
    ['a capital of nothing', { principal: f(0) }, KEEPS_NOTHING],
    ['a negative capital', { principal: f(-5) }, KEEPS_NOTHING],
    ['a capital to the cent', { principal: f(150_000.456) }, { loanAmount: '150.000,46' }],
    ['months that are half', { rateRevisionMonths: f(12.5) }, KEEPS_NOTHING],
    ['no months', { rateRevisionMonths: f(0) }, KEEPS_NOTHING],
    ['months as text', { rateRevisionMonths: f('12') }, KEEPS_NOTHING],
    ['a loan kind that is none', { loanKind: f('weird') }, KEEPS_NOTHING],
    ['a loan kind as a number', { loanKind: f(3) }, KEEPS_NOTHING],
    ['a date that is none', { deedOn: f('31/12/2014') }, KEEPS_NOTHING],
    ['a date that never was', { deedOn: f('2014-02-30') }, KEEPS_NOTHING],
    ['a date as a number', { deedOn: f(20_140_320) }, KEEPS_NOTHING],
    ['a floor of nothing', { floorPercent: f(0) }, { floor: 'yes', floorPercent: '0' }],
    ['a negative floor', { floorPercent: f(-1) }, KEEPS_NOTHING],
    ['a floor as text', { floorPercent: f('3') }, KEEPS_NOTHING],
    [
      'a floor to three decimals',
      { floorPercent: f(2.8754) },
      { floor: 'yes', floorPercent: '2,875' },
    ],
    [
      'a floor of thousands',
      { floorPercent: f(12_345.5) },
      { floor: 'yes', floorPercent: '12345,5' },
    ],
    ['half an instalment', { earlyTerminationInstalments: f(2.5) }, KEEPS_NOTHING],
    ['no instalments', { earlyTerminationInstalments: f(0) }, KEEPS_NOTHING],
    ['another fee', { otherSetUpFee: f(true) }, { duplicateFee: 'yes' }],
    ['no other fee', { otherSetUpFee: f(false) }, { duplicateFee: 'no' }],
    ['another fee as text', { otherSetUpFee: f('yes') }, KEEPS_NOTHING],
    ['an opening fee of nothing', { openingFee: f(0) }, { openingFee: 'no' }],
    ['a negative opening fee', { openingFee: f(-5) }, KEEPS_NOTHING],
    [
      'an opening fee over its percent',
      { openingFee: f(1_500), openingFeePercent: f(1), principal: f(100_000) },
      { loanAmount: '100.000,00', openingFee: 'yes', openingFeeAmount: '1.500,00' },
    ],
    [
      'an opening percent of nothing',
      { openingFeePercent: f(0), principal: f(1_000) },
      { loanAmount: '1.000,00' },
    ],
    [
      'a negative opening percent',
      { openingFeePercent: f(-1), principal: f(1_000) },
      { loanAmount: '1.000,00' },
    ],
    ['an opening percent with no capital', { openingFeePercent: f(1) }, { openingFee: 'yes' }],
    [
      'an opening percent of a capital of nothing',
      { openingFeePercent: f(1), principal: f(0) },
      { openingFee: 'yes' },
    ],
    [
      'an option of the deed',
      { prepaymentOption: f('a_015_5y') },
      { prepaymentOption: 'a_015_5y' },
    ],
    ['an option that is none', { prepaymentOption: f('x') }, KEEPS_NOTHING],
    ['a default rate', { defaultRate: f(18) }, { defaultInterest: 'yes', defaultRate: '18' }],
    [
      'a default rate on a variable rate with an initial one',
      { rateType: f('variable'), initialRate: f(3), defaultRate: f(18) },
      { rateType: 'variable', defaultInterest: 'yes', defaultRate: '18' },
    ],
    [
      'a default rate on a fixed rate with an initial one that is none',
      { rateType: f('fixed'), initialRate: f(-1), defaultRate: f(5) },
      { rateType: 'fixed', defaultInterest: 'yes', defaultRate: '5' },
    ],
    [
      'a default rate on a fixed rate with no initial one',
      { rateType: f('fixed'), defaultRate: f(5) },
      { rateType: 'fixed', defaultInterest: 'yes', defaultRate: '5' },
    ],
    [
      'points when the default rate is none',
      { defaultRate: f(-1), defaultMarginPoints: f(2), initialRate: f(3) },
      { defaultInterest: 'yes', ordinaryRate: '3', defaultRate: '5' },
    ],
    ['points with no initial rate', { defaultMarginPoints: f(2) }, { defaultInterest: 'yes' }],
    [
      'points with an initial rate that is none',
      { defaultMarginPoints: f(2), initialRate: f(-1) },
      { defaultInterest: 'yes' },
    ],
    ['points that are none', { defaultMarginPoints: f(-2), initialRate: f(3) }, KEEPS_NOTHING],
    ['an initial rate alone', { initialRate: f(3) }, KEEPS_NOTHING],
  ];

  it.each(fields)('reads %s', (_name, given, expected) => {
    expect(answers({ fields: given })).toStrictEqual(expected);
  });

  it('keeps the first answer of a question, with the surety it was read with', () => {
    const p = read({
      fields: { floorPercent: f(3, 'high') },
      clauses: [clause('floor_clause', FLOOR, 'low')],
    });
    expect(p.entries).toEqual([
      ['floor', 'yes'],
      ['floorPercent', '3'],
    ]);
    expect(p.marks).toEqual([
      { id: 'floor', container: '[data-field="floor"]', confidence: 'low' },
      { id: 'floorPercent', container: '[data-field="floorPercent"]', confidence: 'high' },
    ]);
    expect(p.count).toBe(2);
  });

  it('marks as worked out only what is, with the least sure of what it came from', () => {
    const p = read({
      fields: {
        initialRate: f(2, 'medium'),
        defaultMarginPoints: f(1, 'low'),
        principal: f(1_000),
        openingFeePercent: f(1, 'high'),
      },
    });
    expect(p.marks.map((m) => [m.id, m.confidence, m.derived])).toEqual([
      ['loanAmount', 'high', undefined],
      ['defaultInterest', 'low', undefined],
      ['ordinaryRate', 'medium', undefined],
      ['defaultRate', 'low', true],
      ['openingFee', 'high', undefined],
      ['openingFeeAmount', 'high', true],
    ]);
    expect(p.notes).toEqual([
      'client.documents.done_low',
      'client.mortgage.documents.default_points',
      'client.mortgage.documents.opening_percent',
    ]);
  });

  it('says nothing of surety when every answer was read for sure', () => {
    const p = read({ fields: { principal: f(1_000) } });
    expect(p.lowConfidence).toBe(false);
    expect(p.notes).toEqual([]);
  });

  describe('the clauses', () => {
    it('lists each kind found once, in the order of the form, and quotes them trimmed', () => {
      const p = read({
        clauses: [
          clause('irph', ' Índice IRPH. '),
          clause('floor_clause', FLOOR),
          clause('irph', 'Otra vez.'),
        ],
      });
      expect(p.notes).toEqual([
        'client.mortgage.documents.clauses {"clausulas":"client.mortgage.documents.clause.floor_clause, client.mortgage.documents.clause.irph"}',
      ]);
      expect(p.quotes).toEqual({ irph: 'Índice IRPH.\n\nOtra vez.', floor: FLOOR });
    });

    it.each([
      ['a text of spaces', row({ label: 'irph', text: '   ' }, 'mortgage_deed')],
      ['no text', row({ label: 'irph' }, 'mortgage_deed')],
      ['a text that is a number', row({ label: 'irph', text: 5 }, 'mortgage_deed')],
      ['a label that is none', row({ label: 'nope', text: 'Algo.' }, 'mortgage_deed')],
      ['no label', row({ text: 'Algo.' }, 'mortgage_deed')],
    ])('leaves out a clause with %s', (_name, bad) => {
      const p = read({ clauses: [bad] });
      expect(p).toMatchObject({ entries: [], notes: [] });
      expect(p.quotes).toStrictEqual({});
    });
  });

  describe('the invoices', () => {
    const notary = (values: Record<string, ExtractedValue>, c: Confidence = 'high') =>
      row({ concept: 'loan', mixed: false, ...values }, 'notary_invoice', c);
    const agency = (values: Record<string, ExtractedValue>) =>
      row(values, 'agency_invoice_mortgage');
    const BILL = agency({ concept: 'loan', total: 1_000, base: 800, vat: 168 });
    const INVOICES = 'client.mortgage.documents.invoices';
    const LEFT_OUT = 'client.mortgage.documents.invoices_left_out';
    const ADDED = 'client.mortgage.documents.invoices_added';
    const LENDER = 'client.mortgage.documents.ajd_lender_paid';
    const APART = 'client.mortgage.documents.agency_supplied_apart';
    const outlay = (concept: string, amount: number, deed?: string) =>
      agency({ concept, amount, ...(deed === undefined ? {} : { deed }) });
    const PAID_TAX = row({ concept: 'loan', amountPaid: 100, paidByLender: false }, 'ajd_form');
    const PAID_REGISTRY = row({ concept: 'mortgage', total: 100 }, 'registry_invoice');

    it('says only what it did: one invoice read, nothing added, left out or apart', () => {
      const p = read({ valuationInvoices: [row({ total: 300 }, 'valuation_invoice')] });
      expect(p.entries).toEqual([
        ['hasInvoices', 'yes'],
        ['valuation', '300,00'],
      ]);
      expect(p.marks).toEqual([
        { id: 'valuation', container: '[data-field="valuation"]', confidence: 'high' },
      ]);
      expect(p.notes).toEqual([INVOICES]);
    });

    it('answers for what is read nothing the invoices do not give', () => {
      const none = Object.assign(row({ concept: 'loan' }, 'ajd_form'), {});
      expect(
        read({
          valuationInvoices: [row({}, 'valuation_invoice'), row({ total: 0 }, 'valuation_invoice')],
          ajdForms: [none],
          fields: { transparencyActCharged: f('x', 'high', 'transparency_deed') },
        }),
      ).toMatchObject({ entries: [], notes: [] });
    });

    it('takes the least sure of several invoices of one concept, and of those mixed or not', () => {
      const p = read({
        notaryInvoices: [
          notary({ total: 100 }, 'medium'),
          notary({ total: 200 }, 'high'),
          notary({ total: 90, mixed: true, concept: 'purchase' }, 'low'),
          notary({ concept: 'purchase' }, 'low'),
        ],
      });
      expect(Object.fromEntries(p.entries)).toMatchObject({
        notaryLoan: '390,00',
        notaryMixed: 'yes',
      });
      expect(p.marks.map((m) => [m.id, m.confidence, m.derived])).toEqual([
        ['notaryLoan', 'low', true],
        ['notaryMixed', 'low', undefined],
      ]);
      expect(p.notes).toEqual(['client.documents.done_low', INVOICES, ADDED]);
    });

    it('takes the least sure of the invoices that are not mixed', () => {
      const p = read({
        notaryInvoices: [notary({ total: 100 }, 'medium'), notary({ total: 200 }, 'high')],
      });
      expect(p.marks.find((m) => m.id === 'notaryMixed')).toMatchObject({ confidence: 'medium' });
    });

    it('does not count an invoice without a figure as left out', () => {
      const p = read({
        notaryInvoices: [notary({ total: 100 }), notary({ concept: 'purchase', total: 0 })],
      });
      expect(p.notes).toEqual([INVOICES]);
    });

    it.each([
      ['left out', { notaryInvoices: [notary({ concept: 'purchase', total: 9 })] }, [LEFT_OUT]],
      [
        'paid by the lender',
        { ajdForms: [row({ concept: 'loan', paidByLender: true }, 'ajd_form')] },
        [LENDER],
      ],
      ['paid apart', { agencySupplied: [outlay('ajd', 40, 'loan')] }, [APART]],
    ] as const)('says alone what was %s when nothing else was read', (_name, given, notes) => {
      expect(read({ ...given } as Partial<MortgageExtraction>)).toMatchObject({
        entries: [],
        notes,
      });
    });

    it('says all three, after the invoices, when they hold', () => {
      const p = read({
        notaryInvoices: [notary({ total: 9 }), notary({ concept: 'purchase', total: 9 })],
        ajdForms: [row({ concept: 'loan', paidByLender: true }, 'ajd_form')],
        agencyInvoices: [BILL],
        agencySupplied: [outlay('ajd', 40, 'loan')],
      });
      expect(p.notes).toEqual([INVOICES, LEFT_OUT, LENDER, APART]);
    });

    describe('the outlays of an agency', () => {
      const entries = (e: Partial<MortgageExtraction>) => answers(e);
      const apart = (e: Partial<MortgageExtraction>) => read(e).notes.includes(APART);

      it.each([
        ['less than', 30, { agencyTax: '30,00' }],
        ['as much as', 32, { agencyTax: '32,00' }],
      ])('passes an outlay of %s what the invoice bills beyond base and VAT', (_n, amount, tax) => {
        const e = { agencyInvoices: [BILL], agencySupplied: [outlay('ajd', amount, 'loan')] };
        expect(entries(e)).toMatchObject(tax);
        expect(apart(e)).toBe(false);
      });

      it('holds back one that does not fit, saying where it goes unless its line was read', () => {
        const e = { agencyInvoices: [BILL], agencySupplied: [outlay('ajd', 40, 'loan')] };
        expect(entries(e)).not.toHaveProperty('agencyTax');
        expect(apart(e)).toBe(true);
        expect(apart({ ...e, ajdForms: [PAID_TAX] })).toBe(false);
        const registry = {
          agencyInvoices: [BILL],
          agencySupplied: [outlay('registry', 40, 'loan')],
        };
        expect(apart(registry)).toBe(true);
        expect(apart({ ...registry, registryInvoices: [PAID_REGISTRY] })).toBe(false);
      });

      it('says so when only one of the outlays has its line unread', () => {
        const both = [outlay('ajd', 20, 'loan'), outlay('registry', 20, 'loan')];
        const e = { agencyInvoices: [BILL], agencySupplied: both };
        expect(apart({ ...e, ajdForms: [PAID_TAX] })).toBe(true);
        expect(apart({ ...e, registryInvoices: [PAID_REGISTRY] })).toBe(true);
        expect(apart({ ...e, ajdForms: [PAID_TAX], registryInvoices: [PAID_REGISTRY] })).toBe(
          false,
        );
      });

      it('counts an outlay with no figure as unread, though it adds nothing to what is passed', () => {
        const e = {
          registryInvoices: [PAID_REGISTRY],
          agencySupplied: [
            agency({ concept: 'ajd', deed: 'loan' }),
            outlay('registry', 40, 'loan'),
          ],
        };
        expect(apart(e)).toBe(false);
      });

      it('reads the room of an invoice without its base and VAT as all of it', () => {
        const e = {
          agencyInvoices: [agency({ concept: 'loan', total: 1_000 })],
          agencySupplied: [outlay('ajd', 500, 'loan')],
        };
        expect(entries(e)).toMatchObject({ agencyTax: '500,00' });
      });

      it('takes an outlay that names no deed only when every invoice priced is the loan’s', () => {
        const nameless = [outlay('ajd', 30)];
        const only = { agencyInvoices: [BILL], agencySupplied: nameless };
        expect(entries(only)).toMatchObject({ agencyTax: '30,00' });
        const unpriced = agency({ concept: 'purchase' });
        expect(entries({ ...only, agencyInvoices: [BILL, unpriced] })).toMatchObject({
          agencyTax: '30,00',
        });
        const purchase = agency({ concept: 'purchase', total: 100 });
        expect(entries({ ...only, agencyInvoices: [BILL, purchase] })).not.toHaveProperty(
          'agencyTax',
        );
        const none = { agencySupplied: nameless };
        expect(apart(none)).toBe(false);
        expect(entries(none)).toEqual({});
      });

      it.each([
        ['an outlay of the purchase', outlay('ajd', 30, 'purchase')],
        ['an outlay of something else', outlay('notary', 30, 'loan')],
        ['an outlay with no figure', agency({ concept: 'ajd', deed: 'loan' })],
        ['an outlay of nothing', outlay('ajd', 0, 'loan')],
      ])('leaves out %s', (_name, supplied) => {
        const e = { agencyInvoices: [BILL], agencySupplied: [supplied] };
        expect(entries(e)).toEqual({ hasInvoices: 'yes', agency: '1.000,00' });
        expect(apart(e)).toBe(false);
      });
    });
  });

  describe('an early repayment', () => {
    const op = (values: Record<string, ExtractedValue>) =>
      row({ on: '2024-06-15', kind: 'partial_prepayment', ...values }, 'prepayment_statement');

    it.each([
      ['a date that is none', op({ on: 'ayer' })],
      ['no date', op({ on: 0 })],
      ['a kind that is none', op({ kind: 'weird' })],
      ['the kind of no repayment', op({ kind: 'none' })],
    ])('leaves out one with %s', (_name, bad) => {
      expect(read({ operations: [bad] })).toMatchObject({ entries: [], notes: [] });
    });

    it('takes the figures it has and says nothing of others when there is one', () => {
      expect(read({ operations: [op({ principal: -1 })] })).toMatchObject({
        entries: [
          ['operation', 'partial_prepayment'],
          ['operationOn', '2024-06-15'],
        ],
        notes: [],
      });
      expect(answers({ operations: [op({ principal: 5_000, feeCharged: 0 })] })).toMatchObject({
        operationPrincipal: '5.000,00',
        operationFee: '0,00',
      });
    });
  });
});
