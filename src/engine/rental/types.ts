import type { CivilDate } from '../date';
import type { IndexTables } from './indices';
import type { LegalInterestYear } from './legal-interest';
import type { NormTable } from './norms';

export type ContractType =
  'main_home' | 'seasonal' | 'room' | 'other_use' | 'protected' | 'old_rent';
export type LandlordType = 'person' | 'company';
export type UpdateClause =
  'none' | 'ipc' | 'irav' | 'igc' | 'fixed_percent' | 'unspecified_index' | 'other';

// ISO 3166-2:ES codes of the 17 autonomous communities and the cities of Ceuta and Melilla.
export const REGION_CODES = [
  'AN',
  'AR',
  'AS',
  'IB',
  'CN',
  'CB',
  'CL',
  'CM',
  'CT',
  'VC',
  'EX',
  'GA',
  'MD',
  'MC',
  'NC',
  'PV',
  'RI',
  'CE',
  'ML',
] as const;
export type RegionCode = (typeof REGION_CODES)[number];

export type FeeKind =
  'agency_fee' | 'formalisation' | 'solvency_check' | 'reservation' | 'management' | 'other';

export interface Fee {
  readonly kind: FeeKind;
  readonly amount: number;
  // Paid as an advance on rent or deposit and taken off later.
  readonly deductedLater: boolean;
  // null = «No lo sé».
  readonly requestedInWriting: boolean | null;
}

export type GuaranteeKind = 'cash' | 'bank_guarantee' | 'insurance' | 'other';

export interface Guarantee {
  readonly kind: GuaranteeKind;
  readonly amount: number | null;
}

// How the landlord gave notice of an update. The first four are in writing (LAU art. 18.2).
export type NoticeForm =
  'letter' | 'burofax' | 'receipt_note' | 'annex' | 'email' | 'messaging' | 'verbal' | 'none';

export interface RentUpdateInput {
  // The contract anniversary the rise is for.
  readonly anniversary: CivilDate;
  // The day the rise took effect, as the landlord applied it: on the anniversary, later, or
  // early, when the months before the anniversary are paid over in full.
  readonly effectiveOn: CivilDate;
  readonly previousRent: number;
  readonly newRent: number;
  // Any day of the first month charged at the new rent.
  readonly chargedFrom: CivilDate;
  readonly notice: NoticeForm;
  readonly noticeOn: CivilDate | null;
  // null = «No lo sé».
  readonly agreedInWriting: boolean | null;
}

export type ChargeKind = 'community' | 'property_tax' | 'waste' | 'other';

export interface Charge {
  readonly kind: ChargeKind;
  readonly inContract: boolean;
  readonly annualAgreed: number | null;
  readonly charged: readonly { readonly year: number; readonly amount: number }[];
}

export type DeductionKind =
  'damage' | 'cleaning' | 'unpaid_rent' | 'unpaid_bills' | 'wear' | 'other';

export interface MoveOut {
  readonly keysReturnedOn: CivilDate;
  readonly returns: readonly { readonly on: CivilDate; readonly amount: number }[];
  readonly deductions: readonly { readonly amount: number; readonly kind: DeductionKind }[];
}

// Dates and figures only: free text from a document never reaches the engine.
export interface RentalInput {
  readonly contractType: ContractType;
  readonly signedOn: CivilDate;
  readonly startDate: CivilDate;
  readonly landlordType: LandlordType;
  // A large landlord (gran tenedor); null = «No lo sé».
  readonly largeLandlord: boolean | null;
  readonly agreedMonths: number;
  readonly initialRent: number;
  readonly updateClause: UpdateClause;
  // % a year, for a `fixed_percent` clause.
  readonly fixedPercent?: number;
  readonly region: RegionCode;
  readonly stressedZone: boolean | null;
  readonly fees: readonly Fee[];
  readonly deposit: number | null;
  readonly guarantees: readonly Guarantee[];
  readonly advanceMonths: number | null;
  readonly updates: readonly RentUpdateInput[];
  readonly charges: readonly Charge[];
  readonly moveOut: MoveOut | null;
}

// The tables a review reads, passed in so a change of status or a new index figure needs no code.
export interface RentalDeps {
  readonly norms: NormTable;
  readonly indices: IndexTables;
}

// Everything a whole review reads.
export interface ReviewDeps extends RentalDeps {
  readonly legalInterest: readonly LegalInterestYear[];
}

// The results an item can have. `not_yet_due` is a balance the landlord still has time to return
// (LAU art. 36.4 gives a month from the keys).
export type ItemStatus =
  | 'paid_over'
  | 'owed'
  | 'within_limit'
  | 'over_cap'
  | 'not_checkable'
  | 'not_applicable_to_date'
  | 'not_entered'
  | 'review_it'
  | 'not_yet_due';
