// A figure inside a calculation, tagged with how the UI writes it; a bare number is written as is.
export type Figure =
  number | { readonly days: number } | { readonly euros: number } | { readonly integer: number };

export type PhraseKey =
  | 'pending_salary'
  | 'holiday_pay.accrual'
  | 'holiday_pay.accrual_from_start'
  | 'holiday_pay.days_unknown'
  | 'holiday_pay.over_taken'
  | 'holiday_pay.pending'
  | 'holiday_pay.pending_working'
  | 'holiday_pay.counted'
  | 'holiday_pay.unit.working'
  | 'holiday_pay.unit.calendar'
  | 'methods.two_counts'
  | 'methods.three_counts'
  | 'extra_pay.share'
  | 'extra_pay.share_from_start'
  | 'extra_pay.annual'
  | 'extra_pay.semiannual'
  | 'extra_pay.unknown'
  | 'extra_pay.same_count_for_both'
  | 'extra_pay.summer_in_last_payslip'
  | 'extra_pay.christmas_in_last_payslip'
  | 'extra_pay.single'
  | 'extra_pay.over_two'
  | 'employer_notice'
  | 'notice_deduction'
  | 'notice_deduction.agreement_unknown'
  | 'severance.unfair'
  | 'severance.objective'
  | 'severance.first_stretch'
  | 'severance.second_stretch'
  | 'severance.over_cap'
  | 'severance.cap'
  | 'severance.total'
  | 'severance.cgpj_range'
  | 'severance.fixed_term'
  | 'severance.fixed_term_before_2001'
  | 'severance.replacement'
  | 'severance.training'
  | 'severance.resignation'
  | 'severance.disciplinary';

// The UI words a phrase through the dictionary key `client.calculation.<key>`.
export interface Phrase {
  readonly key: PhraseKey;
  readonly vars?: Readonly<Record<string, Figure | Phrase>>;
}

// Sentences, in order; the UI joins them with a space.
export type Calculation = readonly Phrase[];

export const phrase = (key: PhraseKey, vars?: Phrase['vars']): Phrase =>
  vars === undefined ? { key } : { key, vars };
