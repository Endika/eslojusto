// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { applies, gate } from '../../src/credit/conditions';
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
  it('reads a loan with its charge taken as paid the day the money arrived', () => {
    expect(read()).toMatchObject({
      input: {
        product: 'personal_loan',
        principal: 10_500,
        netDisbursed: null,
        nominalRate: 12,
        declaredApr: 12,
        declaredTotalPayable: 13_120.8,
        confirmedApr: true,
        instalments: { kind: 'regular', count: 48, amount: 273.35 },
        balloon: null,
        charges: [
          { kind: 'opening', amount: 761.25, paidOn: parseDate('2019-02-15'), how: 'deducted' },
        ],
        insurance: null,
        earlyRepayment: null,
        infoReceived: true,
        infoReceivedOn: null,
        mentions: {},
      },
    });
  });

  it('asks how a charge was paid only once it is entered', () => {
    expect(read({ openingFee: '', openingHow: null })).toMatchObject({ input: { charges: [] } });
    expect(read({ openingHow: '' })).toEqual({
      errors: [{ field: 'openingHow', code: 'missing_choice' }],
    });
  });

  it('without a stated APR compares the one worked out', () => {
    expect(read({ aprStated: 'no', declaredApr: null, confirmedApr: null })).toMatchObject({
      input: { declaredApr: null, confirmedApr: true },
    });
    expect(read({ confirmedApr: 'declared' })).toMatchObject({ input: { confirmedApr: false } });
  });

  it('feeds «No lo sé» on a linked insurance as an open answer', () => {
    expect(
      read({
        hasInsurance: 'yes',
        premium: '600',
        premiumKind: 'single',
        premiumFinanced: 'yes',
        insuranceRequired: 'unknown',
      }),
    ).toMatchObject({
      input: { insurance: { premium: 600, single: true, financed: true, required: null } },
    });
  });

  it('reads an early repayment and a balloon whose day is not known', () => {
    expect(
      read({
        hasBalloon: 'yes',
        balloonAmount: '3.000',
        balloonDueOn: '',
        repaid: 'yes',
        repaidOn: '2021-02-15',
        principalRepaid: '5.000',
        compensation: '0',
        interestSettled: '',
        agreedEndOn: '2023-02-15',
        remainingInterest: '',
        paidByInsurance: 'no',
      }),
    ).toMatchObject({
      input: {
        balloon: { amount: 3_000, dueOn: null },
        earlyRepayment: {
          principalRepaid: 5_000,
          compensationCharged: 0,
          interestSettled: null,
          remainingInterest: null,
          discountLost: null,
        },
      },
    });
  });

  it('names a day still to come, an unreadable rate and a count that is not whole', () => {
    expect(read({ agreedOn: '2026-12-01' })).toMatchObject({
      errors: expect.arrayContaining([{ field: 'agreedOn', code: 'in_future' }]),
    });
    expect(read({ nominalRate: 'doce' })).toEqual({
      errors: [{ field: 'nominalRate', code: 'invalid_rate' }],
    });
    expect(read({ instalmentCount: '48,5' })).toEqual({
      errors: [{ field: 'instalmentCount', code: 'invalid_count' }],
    });
  });

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

  it('stops a loan from before the 2011 law and gives a card of then its indicator', () => {
    expect(scopeOf({ agreedOn: '2011-09-24' })).toEqual({ inScope: false, reason: 'before_lcc' });
    expect(scopeOf({ agreedOn: '2011-09-25' })).toEqual({ inScope: true, indicatorOnly: false });
    expect(
      scopeOf({
        product: 'revolving',
        principal: null,
        cardLimit: '1.500',
        agreedOn: '2009-04-01',
      }),
    ).toEqual({ inScope: true, indicatorOnly: true });
  });

  it('asks a card of before the law only what its indicator needs', () => {
    const f = form({
      ...LOAN,
      product: 'revolving',
      principal: null,
      cardLimit: '1.500',
      agreedOn: '2009-04-01',
    });
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'product';
    radio.value = 'revolving';
    radio.checked = true;
    f.querySelector('[name="product"]')?.replaceWith(radio);
    expect(applies(f, 'tae')).toBe(true);
    expect(applies(f, 'tarjeta')).toBe(true);
    expect(applies(f, 'comparar')).toBe(false);
    expect(applies(f, 'desistimiento')).toBe(false);
    expect(applies(f, 'cuotas')).toBe(false);
  });
});
