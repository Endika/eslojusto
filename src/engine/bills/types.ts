import type { CivilDate } from '../date';

// Amounts in euros as the bill prints them, always positive: a discount or the social bonus is
// entered as what it takes off. Prices per unit with as many decimals as the bill gives.
export type PowerPeriod = 'p1' | 'p2';
export type EnergyPeriod = 'p1' | 'p2' | 'p3';

export type PowerPriceUnit = 'per_kw_day' | 'per_kw_year';

export interface PowerLine {
  readonly period: PowerPeriod;
  readonly kw: number;
  readonly price: number;
  readonly unit: PowerPriceUnit;
  // Days of a stretch when the bill splits the period by a change of price; null for the whole
  // period.
  readonly days: number | null;
  readonly amount: number;
}

export interface EnergyLine {
  readonly period: EnergyPeriod;
  readonly kwh: number;
  readonly price: number;
  readonly amount: number;
}

// A price that changed within the period, and whether the bill gives each stretch apart.
export type PriceChange = 'none' | 'by_segments' | 'without_segments';

// What the bill says the tolls and charges come to, within the power and energy terms.
export interface TollsAndCharges {
  readonly power: number | null;
  readonly energy: number | null;
}

export type SocialBonusCategory = 'vulnerable' | 'severe';

export interface SocialBonus {
  // Null when neither the bill nor the person says.
  readonly category: SocialBonusCategory | null;
  readonly members: number | null;
  readonly discountedKwh: number | null;
  // kWh with the discount in the earlier bills of the year, which the cap counts against.
  readonly kwhSoFar: number | null;
  readonly amount: number;
}

export interface ExcessPower {
  readonly amount: number;
  // Whether the supply has a maximeter; null when the person does not know.
  readonly maximeter: boolean | null;
}

export interface ElectricityTaxLine {
  readonly base: number | null;
  readonly percent: number | null;
  readonly amount: number;
}

export type Phase = 'single' | 'three';

export interface MeterRental {
  readonly amount: number;
  // Days billed for the meter; null for the whole period.
  readonly days: number | null;
  // The phase the bill charges for, and the supply's own; null when neither says.
  readonly phase: Phase | null;
  readonly supplyPhase: Phase | null;
  readonly owned: boolean | null;
}

// Closed labels for what a free-text concept on the bill is; the literal never reaches the engine.
export type ServiceLabel = 'maintenance' | 'insurance' | 'pack' | 'other';

export interface Service {
  readonly label: ServiceLabel;
  readonly amount: number;
  // «¿Lo pediste?»: yes, no or «No lo sé».
  readonly requested: 'yes' | 'no' | 'unknown';
}

export interface ExitPenalty {
  readonly amount: number;
  readonly priceType: 'fixed' | 'variable' | 'indexed' | null;
  readonly firstRenewalPassed: boolean | null;
}

export interface VatLine {
  readonly base: number | null;
  readonly percent: number | null;
  readonly amount: number;
}

export type AccessTariff = '2.0TD' | '3.0TD' | '6.1TD' | 'other';

export type SelfConsumption = 'none' | 'without_surplus' | 'with_surplus';

// What the engine reads from a household electricity bill. The supply number never reaches it:
// only a fingerprint, to tell two copies of the same bill apart.
export interface ElectricityBillInput {
  readonly issuedOn: CivilDate;
  // The day the bill falls due (charge day or last day to pay), which fixes its taxes.
  readonly dueOn: CivilDate;
  // First reading, which is not billed, and last reading, which is.
  readonly readingFrom: CivilDate;
  readonly readingTo: CivilDate;
  readonly readingKind: 'real' | 'estimated' | null;
  // Days the bill says it covers; null when it does not print them.
  readonly billedDays: number | null;
  readonly postcode: string;
  readonly accessTariff: AccessTariff;
  readonly selfConsumption: SelfConsumption;
  readonly market: 'pvpc' | 'free';
  readonly retailer: 'reference' | 'other' | 'unknown';
  // Whoever holds the contract; null when the person does not say.
  readonly holder: 'person' | 'microenterprise' | 'other' | null;
  readonly contractedPower: Readonly<Record<PowerPeriod, number>>;
  // The highest power used in the last 12 months, as the bill prints it.
  readonly maxPowerUsed: Readonly<Record<PowerPeriod, number | null>>;
  readonly priceChange: PriceChange;
  readonly power: readonly PowerLine[];
  readonly energy: readonly EnergyLine[];
  readonly discounts: readonly number[];
  readonly tollsAndCharges: TollsAndCharges | null;
  readonly socialBonusFunding: number | null;
  readonly socialBonus: SocialBonus | null;
  readonly excessPower: ExcessPower | null;
  readonly electricityTax: ElectricityTaxLine | null;
  readonly meter: MeterRental | null;
  readonly services: readonly Service[];
  readonly exitPenalty: ExitPenalty | null;
  // Settlements of earlier bills: positive when charged, negative when given back.
  readonly regularizations: readonly number[];
  readonly vat: VatLine | null;
  readonly total: number;
  readonly supplyFingerprint: string | null;
}

export type ElectricityOutOfScope =
  | 'canary_ceuta_melilla'
  | 'over_15kw'
  | 'not_2_0td'
  | 'issued_before_2026_06_12'
  | 'self_consumption_surplus';

export type ElectricityScope =
  { readonly inScope: true } | { readonly inScope: false; readonly reason: ElectricityOutOfScope };

export type ChangeKind = 'price_up' | 'service_worse' | 'other';

// The contract's price review clause, as a closed label.
export type PriceIndex = 'ipc' | 'ipc_plus' | 'fixed_amount' | 'none' | 'other';

export interface Commitment {
  readonly startedOn: CivilDate;
  readonly months: number;
  // The penalty the contract sets for leaving at the start; null when the person does not have it.
  readonly agreedPenalty: number | null;
}

export interface Handset {
  readonly value: number;
  readonly kept: boolean;
}

export interface ChangeNotice {
  // Null when no notice came.
  readonly sentOn: CivilDate | null;
  // The day the change takes effect; null when the person does not know it.
  readonly appliesOn: CivilDate | null;
  readonly change: ChangeKind;
  readonly index: PriceIndex;
}

export interface TelecomLine {
  readonly from: CivilDate;
  readonly to: CivilDate;
  readonly amount: number;
}

// What the engine reads from a phone or internet contract and its bills.
export interface TelecomInput {
  readonly commitment: Commitment | null;
  readonly exitRequestedOn: CivilDate;
  readonly penaltyCharged: number | null;
  readonly handset: Handset | null;
  readonly changeNotice: ChangeNotice | null;
  readonly lines: readonly TelecomLine[];
}

export type TelecomOutOfScope = 'exit_before_2022';

export type TelecomScope =
  { readonly inScope: true } | { readonly inScope: false; readonly reason: TelecomOutOfScope };
