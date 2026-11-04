import type { BillsNormId, NormTable } from './norms';
import type { BillsTables } from './tables';

export type PriceUnit = 'per_kw_day' | 'per_kw_year';

export interface RenewalPrices {
  // In the input's `powerUnit`.
  readonly power: { readonly p1: number; readonly p2: number };
  // €/kWh.
  readonly energy:
    { readonly all: number } | { readonly p1: number; readonly p2: number; readonly p3: number };
}

export interface RenewalInput {
  readonly letterDate: string;
  readonly renewalDate: string;
  readonly powerKw: { readonly p1: number; readonly p2: number };
  readonly powerUnit: PriceUnit;
  readonly current: RenewalPrices;
  readonly next: RenewalPrices;
  readonly annualKwh: number | null;
  readonly declared: { readonly withoutTax: number | null; readonly withTax: number | null };
  readonly separateFromBill: boolean | null;
}

export interface RenewalDeps {
  readonly tables: Pick<BillsTables, 'tolls' | 'charges' | 'pvpcMargin' | 'electricityTax' | 'vat'>;
  readonly norms: NormTable;
}

// Yearly cost without taxes, in € rounded to the cent.
export type Recalc =
  | {
      readonly kind: 'ok';
      readonly current: number;
      readonly next: number;
      readonly risePercent: number;
      readonly mismatch: { readonly declared: number; readonly computed: number } | null;
    }
  | { readonly kind: 'needs_period_use' }
  | { readonly kind: 'no_consumption' };

// €/kW·year for power, €/kWh for energy.
export interface TermSplit {
  readonly regulated: number;
  readonly retailerCurrent: number;
  readonly retailerNext: number;
}

export type Split =
  | {
      readonly kind: 'ok';
      readonly power: { readonly p1: TermSplit; readonly p2: TermSplit };
      readonly energy: {
        readonly p1: TermSplit;
        readonly p2: TermSplit;
        readonly p3: TermSplit;
      };
      // Null when the letter's own day has no tables to compare with.
      readonly regulatedChange: boolean | null;
    }
  | { readonly kind: 'missing_table'; readonly day: string }
  | { readonly kind: 'conditional'; readonly norms: readonly BillsNormId[] };

export type Notice =
  | { readonly kind: 'meets'; readonly days: number }
  // Short of a month; `separate` says whether it also came apart from the bill (null: not known).
  | { readonly kind: 'short'; readonly days: number; readonly separate: boolean | null }
  | { readonly kind: 'not_checked_before'; readonly since: '2026-06-12' }
  | { readonly kind: 'not_separate' }
  // A month or more ahead, but it is not known whether the letter came apart from the bill.
  | { readonly kind: 'separate_unknown'; readonly days: number };

// Leaving is free when a letter dated from 12-06-2026 changes a price (RD 88/2026, arts. 6.1.m
// and 30.1.j); a letter that changes none is not assessed.
export type Exit =
  | { readonly kind: 'free' }
  | { readonly kind: 'no_change' }
  | { readonly kind: 'not_checked_before'; readonly since: '2026-06-12' };

export interface RenewalCore {
  readonly recalc: Recalc;
  readonly split: Split;
  readonly notice: Notice;
  readonly exit: Exit;
}
