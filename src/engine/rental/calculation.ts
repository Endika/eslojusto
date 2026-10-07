import type { Figure } from '../calculation';
import type { IndexId } from './indices';

// A figure inside a rental calculation: the engine's figures plus percentages, months
// ('YYYY-MM'), days ('YYYY-MM-DD') and index names.
export type RentalFigure =
  | Figure
  | { readonly percent: number }
  | { readonly month: string }
  | { readonly date: string }
  | { readonly index: IndexId };

export type RentalPhraseKey =
  | 'rent_update.base_initial'
  | 'rent_update.base_previous_max'
  | 'rent_update.base_from_answer'
  | 'rent_update.no_clause'
  | 'rent_update.before_anniversary'
  | 'rent_update.second_rise'
  | 'rent_update.figure.index'
  | 'rent_update.figure.flash'
  | 'rent_update.figure.fixed'
  | 'rent_update.agreed'
  | 'rent_update.agreed_other'
  | 'rent_update.cap'
  | 'rent_update.max_rent'
  | 'rent_update.negative_rate'
  | 'rent_update.agreed_in_writing'
  | 'rent_update.large_landlord_cap'
  | 'rent_update.charged_before_notice'
  | 'rent_update.notice_not_written'
  | 'rent_update.months'
  | 'rent_update.monthly_over'
  | 'rent_update.within_limit'
  | 'rent_update.other_clause_within_cap'
  | 'rent_update.index_not_loaded'
  | 'rent_update.index_publication_unknown'
  | 'rent_update.index_none_published'
  | 'rent_update.flash_not_loaded'
  | 'rent_update.too_many_readings';

// The UI words a phrase through the dictionary key `client.rental.calculation.<key>`.
export interface RentalPhrase {
  readonly key: RentalPhraseKey;
  readonly vars?: Readonly<Record<string, RentalFigure | RentalPhrase>>;
}

// Sentences, in order; the UI joins them with a space.
export type RentalCalculation = readonly RentalPhrase[];

export const rentalPhrase = (key: RentalPhraseKey, vars?: RentalPhrase['vars']): RentalPhrase =>
  vars === undefined ? { key } : { key, vars };
