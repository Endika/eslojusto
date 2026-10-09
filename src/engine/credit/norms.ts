import type { Norm as LawNorm, NormTable as LawNormTable } from '../law/norms';
import type { SourceTable as LawSourceTable } from '../law/sources';

export { normStanding, type NormStanding, type NormStatus } from '../law/norms';

// `dcc_2023` is a directive not yet transposed and `consumer_credit_bill` the bill that would
// transpose it: drafts the engine never applies.
export type CreditNormId =
  'lcc' | 'lcc_annex_2013' | 'lru' | 'oeha' | 'cc' | 'dcc_2023' | 'consumer_credit_bill';

export type Norm = LawNorm<CreditNormId>;

export type NormTable = LawNormTable<CreditNormId>;

// Day each norm was last read in the BOE during the monthly review; null until its first reading.
export type NormReview = Readonly<Record<CreditNormId, string | null>>;

// Court criteria and official figures the review rests on besides its norms.
export type CreditSourceId = 'sts258_2023' | 'sts366_2026' | 'bde_be1904';

export type SourceTable = LawSourceTable<CreditSourceId>;
