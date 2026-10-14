import type { ELECTRICITY_PAGE_KINDS } from '../src/domain/documents';
import type {
  ELECTRICITY_MARKETS,
  ELECTRICITY_READABILITY,
  ENERGY_PERIODS,
  METER_PHASES,
  POWER_PERIODS,
  POWER_PRICE_UNITS,
  PRICE_TYPES,
  READING_KINDS,
  SERVICE_LABELS,
  SOCIAL_BONUS_CATEGORIES,
} from '../src/domain/electricity-schema';
import type { Degrade, ExpectedExtraction, PageData } from './schema';

// One synthetic electricity pack: the bills (and at times the contract) to render, what a read
// should find in them, and what the site's bills engine should say about each bill and about all
// of them together. Every value is invented.

// Each template and the kind of document it should be read as. A template renders to as many
// images as it has sheets.
export const ELECTRICITY_TEMPLATES = {
  'electricity/pvpc-es': 'electricity_bill',
  'electricity/pvpc-bonus-es': 'electricity_bill',
  'electricity/free-classic-es': 'electricity_bill',
  'electricity/free-modern-es': 'electricity_bill',
  'electricity/free-compact-es': 'electricity_bill',
  'electricity/contract-es': 'electricity_contract',
} as const satisfies Readonly<Record<string, (typeof ELECTRICITY_PAGE_KINDS)[number]>>;
export type ElectricityTemplateId = keyof typeof ELECTRICITY_TEMPLATES;
export const ELECTRICITY_TEMPLATE_IDS = Object.keys(
  ELECTRICITY_TEMPLATES,
) as readonly ElectricityTemplateId[];

type Readability = (typeof ELECTRICITY_READABILITY)[number];

interface PageBase {
  readonly data: PageData;
  readonly degrade: Degrade;
  // What a read should say of each image of this page; ok unless the photo is spoiled.
  readonly readability?: Readability;
}

// `other` is a page drawn by the renderer itself that nothing in the review uses.
export type ElectricityPageSpec =
  | (PageBase & { readonly template: ElectricityTemplateId })
  | (PageBase & { readonly kind: 'other' });

// Page data keys that hold a person's data: never to be transcribed by a read. The supply number
// is not among them: a read copies it so that the API can keep its fingerprint alone.
export const ELECTRICITY_PERSON_KEYS = ['holderName', 'holderDni', 'iban'] as const;

type Iso = string;
type PowerPeriod = (typeof POWER_PERIODS)[number];
type EnergyPeriod = (typeof ENERGY_PERIODS)[number];
type Phase = (typeof METER_PHASES)[number];

// The engine's ElectricityBillInput with ISO dates, as a person would enter it from one bill and
// their own answers: who holds the contract, whether they asked for a service, the meter's owner.
export interface ElectricityCaseBill {
  readonly issuedOn: Iso;
  readonly dueOn: Iso;
  readonly readingFrom: Iso;
  readonly readingTo: Iso;
  readonly readingKind: (typeof READING_KINDS)[number] | null;
  readonly billedDays: number | null;
  readonly postcode: string;
  readonly accessTariff: '2.0TD' | '3.0TD' | '6.1TD' | 'other';
  readonly selfConsumption: 'none' | 'without_surplus' | 'with_surplus';
  readonly market: (typeof ELECTRICITY_MARKETS)[number];
  readonly retailer: 'reference' | 'other' | 'unknown';
  readonly holder: 'person' | 'microenterprise' | 'other' | null;
  readonly contractedPower: Readonly<Record<PowerPeriod, number>>;
  readonly maxPowerUsed: Readonly<Record<PowerPeriod, number | null>>;
  readonly priceChange: 'none' | 'by_segments' | 'without_segments';
  readonly power: readonly {
    readonly period: PowerPeriod;
    readonly kw: number;
    readonly price: number;
    readonly unit: (typeof POWER_PRICE_UNITS)[number];
    readonly days: number | null;
    readonly amount: number;
  }[];
  readonly energy: readonly {
    readonly period: EnergyPeriod;
    readonly kwh: number;
    readonly price: number;
    readonly amount: number;
  }[];
  readonly discounts: readonly number[];
  readonly tollsAndCharges: {
    readonly power: number | null;
    readonly energy: number | null;
  } | null;
  readonly socialBonusFunding: number | null;
  readonly socialBonus: {
    readonly category: (typeof SOCIAL_BONUS_CATEGORIES)[number] | null;
    readonly members: number | null;
    readonly discountedKwh: number | null;
    readonly kwhSoFar: number | null;
    readonly amount: number;
  } | null;
  readonly excessPower: { readonly amount: number; readonly maximeter: boolean | null } | null;
  readonly electricityTax: {
    readonly base: number | null;
    readonly percent: number | null;
    readonly amount: number;
  } | null;
  readonly meter: {
    readonly amount: number;
    readonly days: number | null;
    readonly phase: Phase | null;
    readonly supplyPhase: Phase | null;
    readonly owned: boolean | null;
  } | null;
  readonly services: readonly {
    readonly label: (typeof SERVICE_LABELS)[number];
    readonly amount: number;
    readonly requested: 'yes' | 'no' | 'unknown';
  }[];
  readonly exitPenalty: {
    readonly amount: number;
    readonly priceType: (typeof PRICE_TYPES)[number] | null;
    readonly firstRenewalPassed: boolean | null;
  } | null;
  readonly regularizations: readonly number[];
  readonly vat: {
    readonly base: number | null;
    readonly percent: number | null;
    readonly amount: number;
  } | null;
  readonly total: number;
  readonly supplyFingerprint: string | null;
}

// One finding of a bill: its item, line, status and the euros it carries either way.
export interface ExpectedBillFinding {
  readonly id: string;
  readonly line: number | null;
  readonly status: string;
  readonly amount: number | null;
  readonly direction: 'over' | 'under' | null;
  readonly recurring: boolean;
}

// One finding, or one per reading when a norm not yet settled leaves the figure open.
export type ExpectedBillItem =
  | ExpectedBillFinding
  | {
      readonly question: string;
      readonly readings: readonly (ExpectedBillFinding & { readonly when: string })[];
    };

export interface ExpectedBillTotals {
  readonly counted: number;
  readonly upTo: number;
  readonly under: number;
}

export interface ExpectedElectricityBillReview {
  readonly scope: { readonly inScope: true } | { readonly inScope: false; readonly reason: string };
  readonly items: readonly ExpectedBillItem[];
  readonly totals: ExpectedBillTotals;
  readonly recurring: boolean;
}

// Every bill of the pack added up as the person's year: the bills that count, those left out and
// why, and what comes back bill after bill.
export interface ExpectedBasket {
  readonly bills: readonly number[];
  readonly skipped: readonly { readonly bill: number; readonly reason: string }[];
  readonly totals: ExpectedBillTotals;
  readonly days: number;
  readonly recurring: readonly string[];
  readonly yearlyEstimate: number | null;
  readonly offerPass: boolean;
}

export interface ElectricityBankCase {
  // The file name without `.json`.
  readonly id: string;
  // The rule the case exercises, with its article.
  readonly description: string;
  // One of the hard packs (bad photos, doubtful cases, long documents) read in the AI pass.
  readonly eval: boolean;
  // The day the review runs.
  readonly today: Iso;
  readonly pages: readonly ElectricityPageSpec[];
  readonly expected: {
    readonly extraction: ExpectedExtraction;
    // The bills in the order the pack holds them.
    readonly input: { readonly bills: readonly ElectricityCaseBill[] };
    readonly review: {
      readonly bills: readonly ExpectedElectricityBillReview[];
      readonly basket: ExpectedBasket;
    };
  };
}

export const isElectricityTemplatePage = (
  page: ElectricityPageSpec,
): page is PageBase & { readonly template: ElectricityTemplateId } => 'template' in page;

// The kind of document a page should be read as.
export const electricityPageKind = (page: ElectricityPageSpec): string =>
  isElectricityTemplatePage(page) ? ELECTRICITY_TEMPLATES[page.template] : page.kind;
