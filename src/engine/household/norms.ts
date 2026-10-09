import type {
  EnactedStatus,
  Norm as LawNorm,
  NormReview as LawNormReview,
  NormTable as LawNormTable,
} from '../law/norms';

export { normStanding, type NormStanding, type EnactedStatus as NormStatus } from '../law/norms';

export type HouseholdNormId =
  | 'rd1620_2011'
  | 'rdl16_2022'
  | 'et'
  | 'lgss'
  | 'cc'
  | 'rd99_2023'
  | 'rd145_2024'
  | 'rd87_2025'
  | 'rd126_2026';

export type Norm = LawNorm<HouseholdNormId, EnactedStatus>;

export type NormTable = LawNormTable<HouseholdNormId, EnactedStatus>;

export type NormReview = LawNormReview<HouseholdNormId>;
