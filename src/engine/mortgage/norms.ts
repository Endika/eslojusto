import type { Norm as LawNorm, NormTable as LawNormTable } from '../law/norms';
import type { SourceTable as LawSourceTable } from '../law/sources';

export { normStanding, type NormStanding, type NormStatus } from '../law/norms';

export type MortgageNormId =
  | 'lcci'
  | 'trlitpajd29'
  | 'law41_2007'
  | 'rdl19_2022'
  | 'rdl8_2023'
  | 'lh114'
  | 'law1_2013'
  | 'cc'
  | 'lo1_2025'
  | 'law44_2002'
  | 'lcci_25bis';

export type Norm = LawNorm<MortgageNormId>;

export type NormTable = LawNormTable<MortgageNormId>;

// Day each norm was last read in the BOE during the monthly review; null until its first reading.
export type NormReview = Readonly<Record<MortgageNormId, string | null>>;

// Court rulings the review cites besides its norms: the Supreme Court's, unverified until opened
// in CENDOJ, and the Court of Justice's, read in EUR-Lex.
export type MortgageSourceId =
  | 'sts147_148_2018'
  | 'sts725_2018'
  | 'sts35_2021'
  | 'sts816_2023'
  | 'sts241_2013'
  | 'sts364_2016'
  | 'sts463_2019'
  | 'sts857_2024'
  | 'tjue_c154_15'
  | 'tjue_c96_16'
  | 'tjue_c70_17'
  | 'tjue_c125_18'
  | 'tjue_c224_19'
  | 'tjue_c452_18'
  | 'tjue_c565_21'
  | 'tjue_c265_22'
  | 'tjue_c561_21';

export type SourceTable = LawSourceTable<MortgageSourceId>;

// Passages of the norms read word for word in the BOE, which the page may quote.
export type MortgageTextId = 'lcci_14' | 'lcci_15' | 'lcci_21' | 'trlitpajd_29';

export type TextTable = LawSourceTable<MortgageTextId>;
