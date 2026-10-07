import type { Norm as LawNorm, NormTable as LawNormTable } from '../law/norms';

export { normStanding, type NormStanding, type NormStatus } from '../law/norms';

export type EmploymentNormId =
  | 'et'
  | 'rdl8_2019'
  | 'law10_2021'
  | 'rdl32_2021'
  | 'law4_2023'
  | 'law1_2025'
  | 'rd99_2023'
  | 'rd145_2024'
  | 'rd87_2025'
  | 'rd126_2026'
  | 'rd723_2026'
  | 'rd1561_1995';

export type Norm = LawNorm<EmploymentNormId>;

export type NormTable = LawNormTable<EmploymentNormId>;

// Day each norm was last read in the BOE during the monthly review; kept apart from `Norm` so the
// shared model stays the same for every section.
export type NormReview = Readonly<Record<EmploymentNormId, string>>;
