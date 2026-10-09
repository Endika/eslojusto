import { parseDate } from '../../../src/engine/date';
import type { CreditInput, EarlyRepayment } from '../../../src/engine/credit/types';

// A synthetic personal loan of 10.500 € in 48 monthly instalments with an opening charge taken off
// the amount handed over; tests override what they check.
export const loan = (change: Partial<CreditInput> = {}): CreditInput => ({
  product: 'personal_loan',
  purpose: 'personal',
  secured: 'none',
  leaseWithoutPurchase: false,
  agreedOn: parseDate('2019-02-15'),
  drawnOn: parseDate('2019-02-15'),
  principal: 10_500,
  netDisbursed: 9_738.75,
  nominalRate: 12,
  rateType: 'fixed',
  declaredApr: 12,
  declaredTotalPayable: 13_120.8,
  confirmedApr: false,
  instalments: {
    kind: 'regular',
    count: 48,
    amount: 273.35,
    frequency: 'monthly',
    firstDueOn: parseDate('2019-03-15'),
  },
  balloon: null,
  charges: [{ kind: 'opening', amount: 761.25, paidOn: parseDate('2019-02-15'), how: 'deducted' }],
  insurance: null,
  card: null,
  earlyRepayment: null,
  infoReceivedOn: null,
  infoReceived: true,
  mentions: {},
  ...change,
});

export const repayment = (change: Partial<EarlyRepayment> = {}): EarlyRepayment => ({
  on: parseDate('2021-02-15'),
  principalRepaid: 5_000,
  interestSettled: 40,
  compensationCharged: 50,
  paidByInsurance: false,
  agreedEndOn: parseDate('2023-02-15'),
  remainingInterest: 600,
  discountLost: false,
  ...change,
});

export const TODAY = parseDate('2026-10-09');
