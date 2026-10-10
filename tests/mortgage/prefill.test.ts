// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type {
  Confidence,
  ExtractedRow,
  ExtractedValue,
  MortgageExtraction,
  SourceKind,
} from '../../src/documents/contract';
import { parseDate } from '../../src/engine/date';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { readMortgageForm } from '../../src/mortgage/form';
import { mortgagePrefill } from '../../src/mortgage/prefill';

const tr: Translate = (key, vars) => t('es', key, vars);
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
  const p = prefill({ fields: DEED, clauses: CLAUSES });

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
      agencyInvoices: [row({ total: 1_850 }, 'agency_invoice_mortgage')],
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
