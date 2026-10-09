import { addDays, toIso, type CivilDate } from '../date';
import { interestByYear } from '../law/interest';
import type { LawSource, NormSource } from '../law/sources';
import { round2 } from '../money';
import {
  mortgagePhrase as p,
  type MortgageCalculation,
  type MortgagePhrase,
  type MortgagePhraseKey,
} from './calculation';
import type { NormStatus } from './norms';
import {
  caseLawSources,
  criterionCounts,
  criterionReaches,
  ruleSource,
  ruleStanding,
  type Basis,
  type CaseLawRuleId,
  type StatuteRuleId,
} from './rules';
import { basisTotals, type BasisTotals } from './totals';
import type { Invoice, InvoiceKind, MortgageDeps, MortgageInput } from './types';

// `lender_bears` is the only status counted in a total. `not_chargeable` carries what the person
// paid for something the law says is charged to nobody, on a line of its own: it is not a cost of
// the lender. `split_explained` gives the Supreme Court's share without a figure while the rulings
// behind it are unread at their source.
export type ExpenseStatus =
  | 'lender_bears'
  | 'not_chargeable'
  | 'split_explained'
  | 'borrower_bears'
  | 'not_applicable'
  | 'not_applicable_to_date'
  | 'paid_by_bank'
  | 'not_entered'
  | 'review_it';

export type MortgageSource = NormSource<NormStatus> | LawSource;

export interface ExpenseInterest {
  // Legal interest on the lender's part, from the day it was paid up to `until`, the last day
  // counted.
  readonly amount: number;
  readonly until: string;
  // Counted from the deed's day because the day of payment is unknown.
  readonly estimated: boolean;
  // A year whose rate is not published yet: nothing is counted from it on.
  readonly missingYear: number | null;
}

export interface ExpenseItem {
  // Position in the input's invoices.
  readonly index: number;
  readonly kind: InvoiceKind;
  // Null for a cost this review leaves out, such as the purchase's.
  readonly basis: Basis | null;
  readonly status: ExpenseStatus;
  // % of the invoice the law or the split puts on the lender; null when there is none to give.
  readonly share: number | null;
  // Euros of a `lender_bears` or `not_chargeable` item; null otherwise.
  readonly amount: number | null;
  // Only on a case-law item: the interest rests on a court's criterion, never on the law.
  readonly interest: ExpenseInterest | null;
  readonly calculation: MortgageCalculation;
  readonly sources: readonly MortgageSource[];
}

export interface ExpensesReview {
  readonly items: readonly ExpenseItem[];
  readonly totals: BasisTotals;
  // Notes on the costs as a whole.
  readonly calculation: MortgageCalculation;
}

interface Rules {
  readonly statute: readonly StatuteRuleId[];
  readonly caseLaw: readonly CaseLawRuleId[];
}

// Who bears an invoice before its amount and payer are looked at.
type Allocation =
  | {
      readonly kind: 'share';
      readonly basis: Basis;
      readonly share: number;
      // Whether a case-law share may give euros; a statute share always may.
      readonly counts: boolean;
      // A deed under the LCCI, whose art. 3 an agreement cannot set aside.
      readonly binding: boolean;
      readonly rules: Rules;
    }
  | {
      readonly kind: 'none';
      readonly status: Exclude<
        ExpenseStatus,
        'lender_bears' | 'not_chargeable' | 'split_explained'
      >;
      readonly basis: Basis | null;
      readonly phrase: MortgagePhraseKey;
      readonly rules: Rules;
    };

const statute = (...ids: StatuteRuleId[]): Rules => ({ statute: ids, caseLaw: [] });
const caseLaw = (...ids: CaseLawRuleId[]): Rules => ({ statute: [], caseLaw: ids });
const NO_RULES: Rules = { statute: [], caseLaw: [] };

const none = (
  status: Extract<Allocation, { kind: 'none' }>['status'],
  basis: Basis | null,
  phrase: MortgagePhraseKey,
  rules: Rules = NO_RULES,
): Allocation => ({ kind: 'none', status, basis, phrase, rules });

// Art. 14.1.e LCCI: the lender pays the notary of the loan, its copy, the registry and the agency;
// the valuation is the borrower's and each copy is paid by whoever asks for it. Art. 15.8 says the
// notary's record of the advice carries no fee at all: charged to nobody, not put on the lender.
const LCCI_SHARES: Partial<Record<InvoiceKind, number>> = {
  notary_loan: 100,
  notary_copy_bank: 100,
  notary_copy_borrower: 0,
  registry_mortgage: 100,
  agency: 100,
  valuation: 0,
  transparency_deed: 100,
};

// The Supreme Court's split for consumers before the LCCI: the notary by halves, the lender's copy,
// the registry, the agency and the valuation to the lender.
const SPLIT_SHARES: Partial<Record<InvoiceKind, number>> = {
  notary_loan: 50,
  notary_copy_bank: 100,
  notary_copy_borrower: 0,
  registry_mortgage: 100,
  agency: 100,
  valuation: 100,
};

const PURCHASE: ReadonlySet<InvoiceKind> = new Set([
  'notary_purchase',
  'registry_purchase',
  'ajd_purchase',
]);

const BORROWER_PHRASE: Partial<Record<InvoiceKind, MortgagePhraseKey>> = {
  valuation: 'expenses.valuation_borrower',
  notary_copy_borrower: 'expenses.copy_borrower',
};

const standing = (id: StatuteRuleId, deed: CivilDate, deps: MortgageDeps) =>
  ruleStanding(id, deed, deps.norms);

function allocate(
  kind: InvoiceKind,
  input: MortgageInput,
  consumer: boolean,
  deps: MortgageDeps,
): Allocation {
  const deed = input.deedOn;
  if (PURCHASE.has(kind)) return none('not_applicable', null, 'expenses.purchase');
  if (kind === 'notary_cancellation') return none('not_applicable', null, 'expenses.cancellation');
  // Who bears the registry's entry of the cancellation has not been settled.
  if (kind === 'registry_cancellation')
    return none('review_it', null, 'expenses.registry_cancellation');

  if (kind === 'ajd_loan') {
    const ajd = standing('ajd_lender', deed, deps);
    if (ajd === 'applies')
      return {
        kind: 'share',
        basis: 'statute',
        share: 100,
        counts: true,
        binding: standing('expenses_lcci', deed, deps) === 'applies',
        rules: statute('ajd_lender'),
      };
    if (ajd === 'doubt')
      return none('review_it', 'statute', 'expenses.doubtful_norm', statute('ajd_lender'));
    return none(
      'not_applicable_to_date',
      null,
      'expenses.ajd_before_2018',
      caseLaw('ajd_borrower_before_2018'),
    );
  }

  const lcci = standing('expenses_lcci', deed, deps);
  if (lcci === 'doubt')
    return none('review_it', 'statute', 'expenses.doubtful_norm', statute('expenses_lcci'));
  if (lcci === 'applies') {
    const id = kind === 'transparency_deed' ? 'transparency_act_free' : 'expenses_lcci';
    return {
      kind: 'share',
      basis: 'statute',
      share: LCCI_SHARES[kind] ?? 0,
      counts: true,
      binding: true,
      rules: statute(id),
    };
  }

  const split = caseLaw('expenses_ts_split');
  // The notary's record of the advice exists from the LCCI on.
  if (kind === 'transparency_deed')
    return none('review_it', 'case_law', 'expenses.transparency_before_lcci');
  if (!criterionReaches('expenses_ts_split', deed))
    return none('review_it', 'case_law', 'expenses.doubtful_norm', split);
  // The split comes from setting aside a clause in a contract with a consumer.
  if (!consumer) return none('not_applicable', 'case_law', 'expenses.not_consumer', split);
  if (input.expensesClause === 'absent')
    return none('review_it', 'case_law', 'expenses.no_clause', split);
  if (input.expensesClause === 'unknown')
    return none('review_it', 'case_law', 'expenses.clause_unknown', split);
  return {
    kind: 'share',
    basis: 'case_law',
    share: SPLIT_SHARES[kind] ?? 0,
    counts: criterionCounts(deps.criteria.expenses_ts_split, deps.sources),
    binding: false,
    rules: split,
  };
}

const sameAllocation = (a: Allocation, b: Allocation): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

// «No lo sé» on being a consumer: both answers are worked out, and only one that does not change
// anything stands.
function allocation(kind: InvoiceKind, input: MortgageInput, deps: MortgageDeps): Allocation {
  if (input.consumer !== null) return allocate(kind, input, input.consumer, deps);
  const yes = allocate(kind, input, true, deps);
  const no = allocate(kind, input, false, deps);
  if (sameAllocation(yes, no)) return yes;
  return none('review_it', 'case_law', 'expenses.consumer_unknown', caseLaw('expenses_ts_split'));
}

// Two amounts within this many euros are the same payment written twice.
const SAME_PAYMENT = 0.05;

const DUPLICABLE: ReadonlySet<InvoiceKind> = new Set(['ajd_loan', 'registry_mortgage']);

// An agency's own fee: its total less the outlays it passed on. An outlay that matches the tax or
// the registry entered on their own goes on that invoice's line, whatever that line counts; any
// other is left out, never guessed.
function agencyFee(
  invoice: Invoice,
  total: number,
  invoices: readonly Invoice[],
): { readonly fee: number; readonly phrases: readonly MortgagePhrase[] } {
  if (invoice.supplied.length === 0) return { fee: total, phrases: [] };
  const entered = invoices.flatMap((i) =>
    DUPLICABLE.has(i.kind) && i.total !== null ? [i.total] : [],
  );
  const matches = (x: number) => entered.some((t) => Math.abs(t - x) <= SAME_PAYMENT);
  const sum = (xs: readonly number[]) => round2(xs.reduce((s, x) => s + x, 0));
  const apart = sum(invoice.supplied.filter(matches));
  const left = sum(invoice.supplied.filter((x) => !matches(x)));
  return {
    fee: round2(total - apart - left),
    phrases: [
      ...(apart > 0 ? [p('expenses.supplied_own_line', { euros: { euros: apart } })] : []),
      ...(left > 0 ? [p('expenses.supplied_left_out', { euros: { euros: left } })] : []),
    ],
  };
}

// Legal interest on the lender's part of a case-law item, from the day it was paid. It rests on the
// Supreme Court's criterion, restitution after a clause is set aside, so it never rides on a
// statute item; until that ruling is read at its source it is only explained.
function interestOn(
  amount: number,
  invoice: Invoice,
  input: MortgageInput,
  today: CivilDate,
  deps: MortgageDeps,
): { readonly interest: ExpenseInterest | null; readonly phrases: readonly MortgagePhrase[] } {
  // A deed the criterion does not reach gets no word on interest at all.
  if (!criterionReaches('expenses_interest', input.deedOn)) return { interest: null, phrases: [] };
  if (!criterionCounts(deps.criteria.expenses_interest, deps.sources))
    return { interest: null, phrases: [p('interest.explained')] };
  // What came back and when is not known, so no interest is worked out on top of it.
  if (input.alreadyReturned !== null && input.alreadyReturned > 0)
    return { interest: null, phrases: [p('interest.returned')] };
  const from = invoice.paidOn ?? input.deedOn;
  const estimated = invoice.paidOn === null;
  const result = interestByYear(amount, from, today, deps.legalInterest, 365);
  if (result.kind === 'before_table')
    return { interest: null, phrases: [p('interest.before_table')] };
  const until = result.kind === 'partial' ? result.until : toIso(addDays(today, -1));
  const missingYear = result.kind === 'partial' ? result.missingYear : null;
  return {
    interest: { amount: result.interest, until, estimated, missingYear },
    phrases: [
      p('interest.counted', {
        euros: { euros: result.interest },
        from: { date: toIso(from) },
        until: { date: until },
      }),
      ...(estimated ? [p('interest.estimated')] : []),
      ...(missingYear === null
        ? []
        : [p('interest.not_published', { year: { integer: missingYear } })]),
    ],
  };
}

const INTEREST_RULES: Rules = { statute: ['restitution'], caseLaw: ['expenses_interest'] };

function sourcesOf(rules: readonly Rules[], deps: MortgageDeps): readonly MortgageSource[] {
  const statuteIds = [...new Set(rules.flatMap((r) => r.statute))];
  const caseLawIds = [...new Set(rules.flatMap((r) => r.caseLaw))];
  const rulings = [...new Set(caseLawIds.flatMap((id) => caseLawSources(id, deps.sources)))];
  return [...statuteIds.map((id) => ruleSource(id, deps.norms)), ...rulings];
}

function expenseItem(
  invoice: Invoice,
  index: number,
  input: MortgageInput,
  today: CivilDate,
  deps: MortgageDeps,
): ExpenseItem {
  const a = allocation(invoice.kind, input, deps);
  const item = (
    status: ExpenseStatus,
    calculation: MortgageCalculation,
    rules: readonly Rules[],
    figures: {
      readonly share?: number | null;
      readonly amount?: number | null;
      readonly interest?: ExpenseInterest | null;
    } = {},
  ): ExpenseItem => ({
    index,
    kind: invoice.kind,
    basis: a.basis,
    status,
    share: figures.share ?? null,
    amount: figures.amount ?? null,
    interest: figures.interest ?? null,
    calculation,
    sources: sourcesOf(rules, deps),
  });

  if (a.kind === 'none') return item(a.status, [p(a.phrase)], [a.rules]);
  const { share, rules } = a;
  if (share === 0)
    return item(
      'borrower_bears',
      [p(BORROWER_PHRASE[invoice.kind] ?? 'expenses.copy_borrower')],
      [rules],
      { share },
    );
  // What was paid, and by whom, comes before any share: half of an invoice that also holds the
  // purchase, or a share of what the lender paid itself, would read as a figure.
  if (invoice.total === null)
    return item('not_entered', [p('item.not_entered')], [rules], { share });
  if (invoice.mixed) return item('review_it', [p('expenses.mixed')], [rules]);
  if (invoice.paidBy === 'bank') return item('paid_by_bank', [p('expenses.paid_by_bank')], [rules]);
  if (invoice.paidBy === 'unknown')
    return item('review_it', [p('expenses.payer_unknown')], [rules]);
  // An agreement on the costs, or not knowing whether there was one, may have settled what the
  // law does not bind. Deliberately cautious: not knowing counts as a possible agreement, and the
  // tax of a deed between 10-11-2018 and the LCCI, though statute, has no art. 3 LCCI behind it.
  if (input.agreementOnExpenses !== false && !a.binding)
    return item(
      'review_it',
      [
        p(
          input.agreementOnExpenses === null
            ? 'expenses.agreement_unknown'
            : a.basis === 'case_law'
              ? 'expenses.agreement_case_law'
              : 'expenses.agreement_ajd',
        ),
      ],
      [rules],
    );
  if (!a.counts)
    return item(
      'split_explained',
      [
        p('expenses.case_law_explained', { share: { percent: share } }),
        p('expenses.case_law_condition'),
      ],
      [rules],
      { share },
    );

  const { fee, phrases } =
    invoice.kind === 'agency'
      ? agencyFee(invoice, invoice.total, input.invoices)
      : { fee: invoice.total, phrases: [] };
  const amount = round2((fee * share) / 100);
  const agreement =
    input.agreementOnExpenses === true
      ? { rules: [statute('binding_terms')], phrases: [p('expenses.agreement_statute')] }
      : { rules: [], phrases: [] };
  if (invoice.kind === 'transparency_deed')
    return item(
      'not_chargeable',
      [p('expenses.transparency_free', { euros: { euros: amount } }), ...agreement.phrases],
      [rules, ...agreement.rules],
      { amount },
    );
  if (a.basis === 'statute')
    return item(
      'lender_bears',
      [p('expenses.statute', { euros: { euros: amount } }), ...phrases, ...agreement.phrases],
      [rules, ...agreement.rules],
      { share, amount },
    );
  const interest = interestOn(amount, invoice, input, today, deps);
  return item(
    'lender_bears',
    [
      p('expenses.case_law', { euros: { euros: amount }, share: { percent: share } }),
      p('expenses.case_law_condition'),
      ...phrases,
      ...interest.phrases,
    ],
    [rules, ...(interest.phrases.length > 0 ? [INTEREST_RULES] : [])],
    { share, amount, interest: interest.interest },
  );
}

// The set-up costs of the loan, invoice by invoice, and what the law and the Supreme Court's split
// put on the lender, in two totals that are never added together.
export function reviewExpenses(
  input: MortgageInput,
  today: CivilDate,
  deps: MortgageDeps,
): ExpensesReview {
  const items = input.invoices.map((invoice, i) => expenseItem(invoice, i, input, today, deps));
  const returned = input.alreadyReturned ?? 0;
  return {
    items,
    totals: basisTotals(items, returned),
    calculation: returned > 0 ? [p('expenses.returned', { euros: { euros: returned } })] : [],
  };
}
