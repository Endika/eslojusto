import type { Norm as LawNorm, NormStatus, NormTable as LawNormTable } from '../law/norms';
import type { SourceTable as LawSourceTable } from '../law/sources';

export { normStanding, type NormStanding, type NormStatus } from '../law/norms';

// The tax reductions of 2026 hang on figures published a month apart, so each month is its own
// conditional norm, settled on its own, beside the decree that holds it.
export type BillsNormId =
  | 'cnmc_tolls_2026'
  | 'order_ted1524_2025'
  | 'order_ted634_2026'
  | 'order_etu1948_2016'
  | 'law38_1992'
  | 'law37_1992'
  | 'rdl7_2026'
  | 'rdl7_2026_june'
  | 'rdl10_2026'
  | 'rdl18_2026'
  | 'rdl18_2026_august'
  | 'rdl18_2026_september'
  | 'rdl25_2026'
  | 'rdl25_2026_november'
  | 'rdl25_2026_december'
  | 'order_iet1491_2013'
  | 'rd897_2017'
  | 'rd88_2026'
  | 'rd216_2014'
  | 'trlgdcu'
  | 'lgtel'
  | 'rd899_2009';

export type Norm = LawNorm<BillsNormId, NormStatus>;

export type NormTable = LawNormTable<BillsNormId, NormStatus>;

// Day each norm was last read in the BOE during the monthly review; null until its first reading.
export type NormReview = Readonly<Record<BillsNormId, string | null>>;

// Official figures the tables rest on besides their norms.
export type BillsSourceId = 'ine_cpi_electricity' | 'tjue_c326_14';

export type SourceTable = LawSourceTable<BillsSourceId>;
