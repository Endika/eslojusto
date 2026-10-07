import type { Figure } from '../calculation';

// Phrases of the employment review; the UI words each through `client.employment.calculation.<key>`.
// Each checked item adds its own keys.
export type EmploymentPhraseKey =
  'minimum_wage.not_published' | 'minimum_wage.not_loaded' | 'modality.before_reform';

export interface EmploymentPhrase {
  readonly key: EmploymentPhraseKey;
  readonly vars?: Readonly<Record<string, Figure | EmploymentPhrase>>;
}

export type EmploymentCalculation = readonly EmploymentPhrase[];

export const phrase = (
  key: EmploymentPhraseKey,
  vars?: EmploymentPhrase['vars'],
): EmploymentPhrase => (vars === undefined ? { key } : { key, vars });
