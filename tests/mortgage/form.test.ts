// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { gate } from '../../src/mortgage/conditions';
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

describe('the mortgage form', () => {
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

  it('leaves out the deed’s option before 16-06-2019, where art. 23.5 sets none', () => {
    const repaid = {
      operation: 'partial_prepayment',
      operationOn: '2023-03-01',
      operationPrincipal: '20.000',
      operationFee: '100',
      prepaymentOption: '',
    };
    expect(read({ ...repaid, deedOn: '2019-06-15' })).toMatchObject({
      input: { prepaymentOption: null, operations: [{ kind: 'partial_prepayment' }] },
    });
    expect(read({ ...repaid, deedOn: '2019-06-16' })).toEqual({
      errors: [{ field: 'prepaymentOption', code: 'missing_choice' }],
    });
  });

  it('puts the engine checks on the question that asks them', () => {
    const f = form({ ...DEED, paidOn: '2020-01-01' });
    expect(sheetErrors(f, 'pago', TODAY)).toEqual([{ field: 'paidOn', code: 'before_deed' }]);
    expect(
      sheetErrors(form({ ...DEED, agency: '300', agencyTax: '0' }), 'gestoria', TODAY),
    ).toEqual([{ field: 'agencyTax', code: 'amount_range' }]);
    expect(readMortgageForm(form({ ...DEED, deedOn: '1994-12-31' }), TODAY)).toEqual({
      errors: [{ field: 'deedOn', code: 'before_table' }],
    });
  });
});

describe('the compensation the deed sets', () => {
  it('puts a percentage the engine refuses on its own field', () => {
    expect(read({ deedPercentVariable: '45' })).toMatchObject({
      errors: [{ field: 'deedPercentVariable', code: 'percent_range' }],
    });
    expect(read({ deedPercentVariable: 'medio' })).toMatchObject({
      errors: [{ field: 'deedPercentVariable', code: 'invalid_rate' }],
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
