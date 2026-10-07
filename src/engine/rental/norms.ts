import type { Norm as LawNorm, NormTable as LawNormTable } from '../law/norms';

export { normStanding, type NormStanding, type NormStatus } from '../law/norms';

export type NormId =
  | 'lau'
  | 'rdl7_2019'
  | 'rdl6_2022'
  | 'rdl11_2022'
  | 'rdl20_2022'
  | 'law12_2023'
  | 'ineIravResolution'
  | 'pge2023'
  | 'rdl8_2026'
  | 'rdl26_2026'
  | 'rdl29_2026'
  | 'rdl28_2026';

export type Norm = LawNorm<NormId>;

export type NormTable = LawNormTable<NormId>;
