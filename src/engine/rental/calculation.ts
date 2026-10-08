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
  | 'rent_update.accepted_by_paying'
  | 'rent_update.agreed_verbally'
  | 'rent_update.months'
  | 'rent_update.monthly_over'
  | 'rent_update.within_limit'
  | 'rent_update.other_clause_within_cap'
  | 'rent_update.index_not_loaded'
  | 'rent_update.index_publication_unknown'
  | 'rent_update.index_none_published'
  | 'rent_update.flash_not_loaded'
  | 'rent_update.too_many_readings'
  | 'item.not_entered'
  | 'fees.company_landlord'
  | 'fees.person_landlord'
  | 'fees.landlord_pays'
  | 'fees.any_name'
  | 'fees.other_name'
  | 'fees.requested_in_writing'
  | 'fees.paid_over'
  | 'guarantees.deposit_excess'
  | 'guarantees.money'
  | 'guarantees.over_cap'
  | 'guarantees.within_cap'
  | 'guarantees.long_contract'
  | 'guarantees.not_money'
  | 'guarantees.only_money_compared'
  | 'guarantees.insurance_banned'
  | 'guarantees.insurance_before_ban'
  | 'advance.over_cap'
  | 'advance.within_cap'
  | 'charges.not_in_contract'
  | 'charges.year_unclear'
  | 'charges.no_annual_amount'
  | 'charges.agreed'
  | 'charges.year_cap'
  | 'charges.over_cap'
  | 'charges.within_cap'
  | 'charges.rise_upper_bound'
  | 'charges.rise_not_checkable'
  | 'charges.too_many_readings'
  | 'charges.past_first_years'
  | 'charges.tax_outside_cap'
  | 'charges.tax_banned'
  | 'charges.waste_may_be_tax'
  | 'charges.other_kind'
  | 'deposit.pending'
  | 'deposit.deduction.damage'
  | 'deposit.deduction.cleaning'
  | 'deposit.deduction.unpaid_rent'
  | 'deposit.deduction.unpaid_bills'
  | 'deposit.deduction.wear'
  | 'deposit.deduction.other'
  | 'deposit.deductions_not_judged'
  | 'deposit.owed'
  | 'deposit.not_yet_due'
  | 'deposit.returned_in_full'
  | 'deposit.returned_on_time'
  | 'deposit.returned_after_month'
  | 'deposit.late_part_above_month'
  | 'deposit.interest_not_yet'
  | 'deposit.interest_deposit_only'
  | 'deposit.interest_stretch'
  | 'deposit.interest_day_count'
  | 'deposit.interest_total'
  | 'deposit.interest_rate_not_loaded';

// The UI words a phrase through the dictionary key `client.rental.calculation.<key>`.
export interface RentalPhrase {
  readonly key: RentalPhraseKey;
  readonly vars?: Readonly<Record<string, RentalFigure | RentalPhrase>>;
}

// Sentences, in order; the UI joins them with a space.
export type RentalCalculation = readonly RentalPhrase[];

export const rentalPhrase = (key: RentalPhraseKey, vars?: RentalPhrase['vars']): RentalPhrase =>
  vars === undefined ? { key } : { key, vars };
