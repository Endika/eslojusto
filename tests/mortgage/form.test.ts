// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { applies, gate } from '../../src/mortgage/conditions';
import { readMortgageForm, sheetErrors } from '../../src/mortgage/form';

const TODAY = parseDate('2026-10-10');

type Values = Readonly<Record<string, string | null>>;

// A synthetic consumer's variable-rate deed of 2021 with its invoices; tests change what they
// check. A null value leaves the question out, as a hidden question is.
const DEED: Values = {
  loanKind: 'standard',
  borrower: 'individual',
  purpose: 'housing',
  deedOn: '2021-05-10',
  loanAmount: '',
  consumer: 'yes',
  rateType: 'variable',
  revisionMonths: '12',
  expensesClause: 'present',
  floor: 'no',
  irph: 'no',
  defaultInterest: 'no',
  earlyTermination: 'unknown',
  openingFee: 'no',
  roundingUp: 'no',
  insuranceRequired: 'no',
  hasInvoices: 'yes',
  notaryLoan: '700,00',
  notaryMixed: 'no',
  registryMortgage: '450,00',
  registryMixed: 'no',
  agency: '350,00',
  agencyTax: '',
  agencyRegistry: '',
  valuation: '',
  transparencyDeed: '',
  ajdLoan: '1.200,00',
  paidOn: '2021-05-10',
  agreement: 'no',
  returned: '',
  operation: 'none',
};

function form(values: Values): HTMLFormElement {
  const el = document.createElement('form');
  el.innerHTML = Object.entries(values)
    .filter(([, value]) => value !== null)
    .map(([name, value]) => `<input name="${name}" value="${value}" />`)
    .join('');
  return el;
}

const read = (change: Values = {}) => readMortgageForm(form({ ...DEED, ...change }), TODAY);

const invoiceOf = (kind: string, total: number | null, paidOn: string | null = '2021-05-10') => ({
  kind,
  total,
  paidBy: 'me',
  paidOn: paidOn === null ? null : parseDate(paidOn),
  mixed: false,
  supplied: [],
});

describe('the mortgage form', () => {
  it('reads a deed with its invoices, each blank one listed as not entered', () => {
    expect(read()).toMatchObject({
      input: {
        deedOn: parseDate('2021-05-10'),
        borrower: 'individual',
        purpose: 'housing',
        consumer: true,
        loanKind: 'standard',
        rateType: 'variable',
        fixedUntil: null,
        rateRevisionMonths: 12,
        loanAmount: null,
        expensesClause: 'present',
        invoices: [
          invoiceOf('notary_loan', 700),
          invoiceOf('registry_mortgage', 450),
          invoiceOf('agency', 350),
          invoiceOf('valuation', null, null),
          invoiceOf('ajd_loan', 1_200),
        ],
        alreadyReturned: null,
        agreementOnExpenses: false,
        prepaymentOption: null,
        operations: [],
        clauses: [
          { label: 'floor_clause', present: false },
          { label: 'irph', present: false },
          { label: 'default_interest', present: false },
          { label: 'early_termination', present: null },
          { label: 'opening_fee', present: false },
          { label: 'rounding_up', present: false },
          { label: 'insurance_required', present: false },
        ],
      },
      invoiceFields: ['notaryLoan', 'registryMortgage', 'agency', 'valuation', 'ajdLoan'],
    });
  });

  it('counts the notary’s record only when it was charged', () => {
    const r = read({ transparencyDeed: '60' });
    expect('input' in r && r.input.invoices.map((i) => i.kind)).toContain('transparency_deed');
  });

  it('asks whether an entered invoice also holds the purchase', () => {
    expect(read({ notaryMixed: '' })).toEqual({
      errors: [{ field: 'notaryMixed', code: 'missing_choice' }],
    });
    expect(read({ notaryLoan: '', notaryMixed: '' })).toMatchObject({
      input: { invoices: expect.arrayContaining([invoiceOf('notary_loan', null, null)]) },
    });
    const r = read({ registryMixed: 'yes' });
    expect('input' in r && r.input.invoices[1]?.mixed).toBe(true);
  });

  it('passes on what the agency paid on your behalf as its outlays', () => {
    const r = read({ agency: '1.900', agencyTax: '1.200', agencyRegistry: '' });
    expect('input' in r && r.input.invoices[2]?.supplied).toEqual([1_200]);
  });

  it('keeps a clause’s figures only when given', () => {
    const r = read({
      floor: 'yes',
      floorPercent: '3',
      defaultInterest: 'yes',
      defaultRate: '18',
      ordinaryRate: '',
      openingFee: 'yes',
      openingFeeAmount: '1.500',
      duplicateFee: 'unknown',
    });
    expect('input' in r && r.input.clauses).toEqual(
      expect.arrayContaining([
        { label: 'floor_clause', present: true, floorPercent: 3 },
        { label: 'default_interest', present: true, defaultRate: 18 },
        { label: 'opening_fee', present: true, feeAmount: 1_500 },
      ]),
    );
  });

  it('reads an early repayment, leaving the deed’s option open when not known', () => {
    expect(
      read({
        operation: 'partial_prepayment',
        operationOn: '2023-03-01',
        operationPrincipal: '20.000',
        operationFee: '100',
        prepaymentOption: 'unknown',
      }),
    ).toMatchObject({
      input: {
        prepaymentOption: 'unknown',
        operations: [
          {
            on: parseDate('2023-03-01'),
            kind: 'partial_prepayment',
            principal: 20_000,
            feeCharged: 100,
            hadInsurance: null,
          },
        ],
      },
    });
  });

  it('names a day still to come, an unreadable rate and a count that is not whole', () => {
    expect(read({ deedOn: '2026-12-01' })).toMatchObject({
      errors: expect.arrayContaining([{ field: 'deedOn', code: 'in_future' }]),
    });
    expect(read({ floor: 'yes', floorPercent: 'tres' })).toEqual({
      errors: [{ field: 'floorPercent', code: 'invalid_rate' }],
    });
    expect(read({ revisionMonths: '6,5' })).toEqual({
      errors: [{ field: 'revisionMonths', code: 'invalid_count' }],
    });
  });

  it('puts the engine checks on the question that asks them', () => {
    const f = form({ ...DEED, paidOn: '2020-01-01' });
    expect(sheetErrors(f, 'pago', TODAY)).toEqual([{ field: 'paidOn', code: 'before_deed' }]);
    expect(
      sheetErrors(form({ ...DEED, agencyTax: '300', agencyRegistry: '100' }), 'gestoria', TODAY),
    ).toEqual([{ field: 'agencyTax', code: 'above_total' }]);
    expect(readMortgageForm(form({ ...DEED, deedOn: '1994-12-31' }), TODAY)).toEqual({
      errors: [{ field: 'deedOn', code: 'before_table' }],
    });
  });
});

describe('the door', () => {
  const scopeOf = (change: Values) => gate(form({ ...DEED, ...change }));

  it('stops a company, a business property and the loans the review does not cover', () => {
    expect(scopeOf({ borrower: 'company' })).toEqual({ inScope: false, reason: 'company' });
    expect(scopeOf({ purpose: 'business' })).toEqual({
      inScope: false,
      reason: 'business_purpose',
    });
    for (const reason of ['developer_subrogation', 'multicurrency', 'reverse', 'not_mortgage'])
      expect(scopeOf({ loanKind: reason })).toEqual({ inScope: false, reason });
    expect(scopeOf({})).toEqual({ inScope: true });
  });
});

describe('the sheets asked', () => {
  // `applies` reads radio groups, as the page has them.
  function radios(values: Values): HTMLFormElement {
    const el = document.createElement('form');
    el.innerHTML = Object.entries(values)
      .filter(([, value]) => value !== null)
      .map(([name, value]) => `<input type="radio" name="${name}" value="${value}" checked />`)
      .join('');
    return el;
  }
  const asked = (change: Values) => {
    const f = radios({ ...DEED, ...change });
    return (
      ['suelo', 'indice', 'notaria', 'acuerdo', 'operacion', 'condiciones', 'seguro'] as const
    ).filter((s) => applies(f, s));
  };

  it('asks of a variable rate its floor and index, and of invoices their sheets', () => {
    expect(asked({})).toEqual(['suelo', 'indice', 'notaria', 'acuerdo']);
    expect(asked({ rateType: 'fixed', hasInvoices: 'no' })).toEqual([]);
  });

  it('asks the deed’s option of a variable repayment and the insurance of a full one', () => {
    expect(asked({ hasInvoices: 'no', operation: 'partial_prepayment' })).toEqual([
      'suelo',
      'indice',
      'operacion',
      'condiciones',
    ]);
    expect(asked({ hasInvoices: 'no', rateType: 'fixed', operation: 'full_prepayment' })).toEqual([
      'operacion',
      'seguro',
    ]);
    expect(
      asked({ hasInvoices: 'no', rateType: 'fixed', operation: 'fixed_rate_novation' }),
    ).toEqual(['operacion']);
  });

  it('a mortgage out of the review asks nothing after its door', () => {
    const f = radios({ ...DEED, borrower: 'company' });
    expect(applies(f, 'escritura')).toBe(false);
    expect(applies(f, 'hipoteca')).toBe(true);
  });
});
