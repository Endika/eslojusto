import type { Figure } from '../calculation';

// A figure inside a credit calculation: the engine's figures plus percentages and days
// ('YYYY-MM-DD').
export type CreditFigure = Figure | { readonly percent: number } | { readonly date: string };

export type CreditPhraseKey =
  | 'scope.mortgage'
  | 'scope.lease_without_purchase'
  | 'scope.business'
  | 'scope.under_200'
  | 'scope.before_lcc'
  | 'scope.indicator_only';

// The UI words a phrase through the dictionary key `client.credit.calculation.<key>`.
export interface CreditPhrase {
  readonly key: CreditPhraseKey;
  readonly vars?: Readonly<Record<string, CreditFigure>>;
}

// Sentences, in order; the UI joins them with a space.
export type CreditCalculation = readonly CreditPhrase[];

export const creditPhrase = (key: CreditPhraseKey, vars?: CreditPhrase['vars']): CreditPhrase =>
  vars === undefined ? { key } : { key, vars };
