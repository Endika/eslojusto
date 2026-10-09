import type { Figure } from '../calculation';

// A figure inside a bills calculation: the engine's figures plus prices with their unit, kW, kWh,
// percentages and days ('YYYY-MM-DD').
export type BillsFigure =
  | Figure
  | { readonly price: number; readonly unit: 'per_kw_day' | 'per_kw_year' | 'per_kwh' }
  | { readonly kw: number }
  | { readonly kwh: number }
  | { readonly percent: number }
  | { readonly date: string };

export type BillsPhraseKey =
  | 'scope.canary_ceuta_melilla'
  | 'scope.over_15kw'
  | 'scope.not_2_0td'
  | 'scope.issued_before_2026_06_12'
  | 'scope.self_consumption_surplus'
  | 'scope.exit_before_2022'
  | 'tolerance.line'
  | 'tolerance.total'
  | 'readings.both_bases'
  | 'arithmetic.days'
  | 'arithmetic.days_mismatch'
  | 'arithmetic.power_per_day'
  | 'arithmetic.power_per_year'
  | 'arithmetic.energy'
  | 'arithmetic.total'
  | 'arithmetic.price_change_without_segments'
  | 'arithmetic.billed'
  | 'arithmetic.refund_next_bill'
  | 'arithmetic.under_settled_later'
  | 'official.missing'
  | 'official.pending'
  | 'tolls.power'
  | 'tolls.energy'
  | 'tolls.not_on_bill'
  | 'tolls.energy_price_change'
  | 'tolls.free_market_price'
  | 'pvpc.power_over_10kw'
  | 'pvpc.holder_not_allowed'
  | 'pvpc.holder_unknown'
  | 'pvpc.eligible'
  | 'pvpc.not_reference_retailer'
  | 'pvpc.power_p1'
  | 'pvpc.power_p2'
  | 'pvpc.margin_not_updated'
  | 'pvpc.margin_differs'
  | 'funding.days'
  | 'funding.not_on_bill'
  | 'funding.free_market_above'
  | 'meter.cap'
  | 'meter.owned'
  | 'meter.three_phase_on_single'
  | 'meter.phase_unknown';

// The UI words a phrase through the dictionary key `client.bills.calculation.<key>`.
export interface BillsPhrase {
  readonly key: BillsPhraseKey;
  readonly vars?: Readonly<Record<string, BillsFigure>>;
}

// Sentences, in order; the UI joins them with a space.
export type BillsCalculation = readonly BillsPhrase[];

export const billsPhrase = (key: BillsPhraseKey, vars?: BillsPhrase['vars']): BillsPhrase =>
  vars === undefined ? { key } : { key, vars };
