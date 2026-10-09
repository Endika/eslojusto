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

// A last payment larger than the instalments. It is entered here and never also as a row of the
// schedule, or it would be counted twice.
export interface Balloon {
  readonly amount: number;
  // The day the contract sets for it. Null when the person does not know: contracts put it either
  // with the last instalment or a month after it, and the review works out both.
  readonly dueOn: CivilDate | null;
}

export interface LinkedInsurance {
  readonly premium: number;
  // One premium for the whole term, or a periodic one paid with each instalment, on top of it.
  readonly single: boolean;
  // A single premium added to the capital and repaid within the instalments.
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
  // Whether the car dealer charged back a discount it had given for financing the purchase.
  readonly discountLost: boolean | null;
}

// The letters of art. 16.2 LCC the review asks about, each a mention the contract must carry.
export const MENTION_LETTERS = [
  'a',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'l',
  'o',
  'p',
  'q',
  'r',
  't',
] as const;

export type MentionLetter = (typeof MENTION_LETTERS)[number];

// What the engine reads; free text, such as the literal name of a charge, never reaches it.
export interface CreditInput {
  readonly product: CreditProduct;
  readonly purpose: 'personal' | 'business';
  readonly secured: 'none' | 'mortgage';
  readonly leaseWithoutPurchase: boolean;
  readonly agreedOn: CivilDate;
  readonly drawnOn: CivilDate;
  // For a revolving card, its limit. The capital lent, without any charge or premium financed on
  // top of it: those are entered apart and added by the engine.
  readonly principal: number;
  // What reached the account, when charges were taken off it.
  readonly netDisbursed: number | null;
  readonly nominalRate: number;
  readonly rateType: 'fixed' | 'variable';
  readonly declaredApr: number | null;
  readonly declaredTotalPayable: number | null;
  // Whether the person takes the APR worked out from the contract's figures, rather than the
  // declared one, to compare with the average rate.
  readonly confirmedApr: boolean;
  // Null for a revolving card. A regular plan's instalments are monthly.
  readonly instalments: Instalments | null;
  readonly balloon: Balloon | null;
  // A charge `financed` is added on top of `principal` and repaid within the instalments.
  readonly charges: readonly Charge[];
  readonly insurance: LinkedInsurance | null;
  readonly card: Card | null;
  readonly earlyRepayment: EarlyRepayment | null;
  // When the contract and its information arrived, if after the contract day.
  readonly infoReceivedOn: CivilDate | null;
  readonly infoReceived: boolean | null;
  // Whether each mention of art. 16.2 is in the contract; a letter left out was not answered.
  readonly mentions: Readonly<Partial<Record<MentionLetter, boolean>>>;
}

export type OutOfScopeReason =
  'mortgage' | 'lease_without_purchase' | 'business' | 'under_200' | 'before_lcc';

// A revolving card concluded before the consumer credit law gets only the indicator against the
// average rate, which the case law applies to contracts of any date.
export type Scope =
  | { readonly inScope: true; readonly indicatorOnly: boolean }
  | { readonly inScope: false; readonly reason: OutOfScopeReason };
