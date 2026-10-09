import type { EnactedStatus, Norm as LawNorm, NormTable as LawNormTable } from '../law/norms';

export { normStanding, type NormStanding, type EnactedStatus as NormStatus } from '../law/norms';

export type InsuranceNormId = 'lcs' | 'law22_2007';

export type Norm = LawNorm<InsuranceNormId, EnactedStatus>;

export type NormTable = LawNormTable<InsuranceNormId, EnactedStatus>;

// Day each norm was last read in the BOE during the monthly review; null until its first reading.
export type NormReview = Readonly<Record<InsuranceNormId, string | null>>;
