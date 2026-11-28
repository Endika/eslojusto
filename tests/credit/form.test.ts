// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { gate } from '../../src/credit/conditions';
import { readCreditForm, sheetErrors } from '../../src/credit/form';

const TODAY = parseDate('2026-10-09');

type Values = Readonly<Record<string, string | null>>;

// The synthetic loan of STS 366/2026, with an opening charge taken off what was handed over; tests
// change what they check. A null value leaves the question out, as a hidden question is.
const LOAN: Values = {
  product: 'personal_loan',
  purpose: 'personal',
  principal: '10.500,00',
  agreedOn: '2019-02-15',
  drawnOn: '2019-02-15',
  nominalRate: '12',
  rateType: 'fixed',
  aprStated: 'yes',
  declaredApr: '12,00',
  declaredTotalPayable: '13.120,80',
  instalmentCount: '48',
  instalmentAmount: '273,35',
  firstDueOn: '2019-03-15',
  hasBalloon: 'no',
  openingFee: '761,25',
  openingHow: 'deducted',
  otherFee: '',
  hasInsurance: 'no',
  confirmedApr: 'recalculated',
  repaid: 'no',
  infoReceived: 'yes',
  infoReceivedOn: '',
};

function form(values: Values): HTMLFormElement {
  const el = document.createElement('form');
  el.innerHTML = Object.entries(values)
    .filter(([, value]) => value !== null)
    .map(([name, value]) => `<input name="${name}" value="${value}" />`)
    .join('');
  return el;
}

const read = (change: Values = {}, base: Values = LOAN) =>
  readCreditForm(form({ ...base, ...change }), TODAY);

describe('the credit form', () => {
  it('puts the engine checks on the question that asks them', () => {
    const f = form({ ...LOAN, drawnOn: '2018-01-01' });
    expect(sheetErrors(f, 'contrato', TODAY)).toEqual([
      { field: 'drawnOn', code: 'before_agreed' },
    ]);
  });

  it('reads a revolving card with its limit as the capital', () => {
    const card: Values = {
      product: 'revolving',
      purpose: 'personal',
      cardLimit: '1.500',
      agreedOn: '2026-08-20',
      nominalRate: '21,94',
      aprStated: 'yes',
      declaredApr: '24,29',
      annualFee: '',
      monthlyPayment: '60',
      balance: '',
      confirmedApr: 'declared',
      infoReceived: 'unknown',
    };
    expect(read({}, card)).toMatchObject({
      input: {
        product: 'revolving',
        principal: 1_500,
        drawnOn: parseDate('2026-08-20'),
        rateType: 'fixed',
        instalments: null,
        card: { limit: 1_500, nominalRate: 21.94, annualFee: 0, minimumPayment: 60, balance: 0 },
        infoReceived: null,
      },
    });
  });
});

describe('the door', () => {
  const scopeOf = (change: Values) => gate(form({ ...LOAN, ...change }));

  it('stops a mortgage, a lease, a business credit and one under 200 €', () => {
    expect(scopeOf({ product: 'mortgage' })).toEqual({ inScope: false, reason: 'mortgage' });
    expect(scopeOf({ product: 'lease' })).toEqual({
      inScope: false,
      reason: 'lease_without_purchase',
    });
    expect(scopeOf({ purpose: 'business' })).toEqual({ inScope: false, reason: 'business' });
    expect(scopeOf({ principal: '199,99', agreedOn: '' })).toEqual({
      inScope: false,
      reason: 'under_200',
    });
  });
});
