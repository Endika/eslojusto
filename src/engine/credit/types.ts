import type { CivilDate } from '../date';

// `null` in any yes/no answer means «No lo sé». Amounts in euros, rates in % a year.
export type CreditProduct = 'personal_loan' | 'car_loan' | 'revolving';

export type ChargeKind = 'opening' | 'study' | 'management' | 'other';

// Taken off the amount handed over, added to the capital, or paid apart.
export type ChargePayment = 'deducted' | 'financed' | 'paid';

export interface Charge {
  readonly kind: ChargeKind;
  readonly amount: number;
  readonly paidOn: CivilDate;
  readonly how: ChargePayment;
}

export interface ScheduleRow {
  readonly dueOn: CivilDate;
  readonly amount: number;
}

// Equal monthly instalments, or the whole schedule as the contract gives it.
export type Instalments =
  | {
      readonly kind: 'regular';
      readonly count: number;
      readonly amount: number;
      readonly frequency: 'monthly';
      readonly firstDueOn: CivilDate;
    }
  | { readonly kind: 'schedule'; readonly rows: readonly ScheduleRow[] };

export interface LinkedInsurance {
  readonly premium: number;
  // One premium for the whole term, or periodic.
  readonly single: boolean;
  readonly financed: boolean;
  // Whether the lender required it to grant the credit.
  readonly required: boolean | null;
}

export interface Card {
  readonly limit: number;
  readonly nominalRate: number;
  readonly annualFee: number;
  readonly minimumPayment: number;
  readonly balance: number;
}

export interface EarlyRepayment {
  readonly on: CivilDate;
  readonly principalRepaid: number;
  // Interest settled on the day of the repayment, when the statement gives it.
  readonly interestSettled: number | null;
  readonly compensationCharged: number;
  readonly paidByInsurance: boolean;
  readonly agreedEndOn: CivilDate;
  // Interest the schedule had left to pay from that day.
  readonly remainingInterest: number | null;
}

// What the engine reads; free text, such as the literal name of a charge, never reaches it.
export interface CreditInput {
  readonly product: CreditProduct;
  readonly purpose: 'personal' | 'business';
  readonly secured: 'none' | 'mortgage';
  readonly leaseWithoutPurchase: boolean;
  readonly agreedOn: CivilDate;
  readonly drawnOn: CivilDate;
  // For a revolving card, its limit.
  readonly principal: number;
  // What reached the account, when charges were taken off it.
  readonly netDisbursed: number | null;
  readonly nominalRate: number;
  readonly rateType: 'fixed' | 'variable';
  readonly declaredApr: number | null;
  readonly declaredTotalPayable: number | null;
  // Null for a revolving card.
  readonly instalments: Instalments | null;
  readonly balloon: number | null;
  readonly charges: readonly Charge[];
  readonly insurance: LinkedInsurance | null;
  readonly card: Card | null;
  readonly earlyRepayment: EarlyRepayment | null;
  // When the contract and its information arrived, if after the contract day.
  readonly infoReceivedOn: CivilDate | null;
  readonly infoReceived: boolean | null;
}

export type OutOfScopeReason =
  'mortgage' | 'lease_without_purchase' | 'business' | 'under_200' | 'before_lcc';

// A revolving card concluded before the consumer credit law gets only the indicator against the
// average rate, which the case law applies to contracts of any date.
export type Scope =
  | { readonly inScope: true; readonly indicatorOnly: boolean }
  | { readonly inScope: false; readonly reason: OutOfScopeReason };
