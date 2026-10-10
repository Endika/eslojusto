import { toIso } from '../engine/date';
import type { ExpenseItem, ExpenseStatus } from '../engine/mortgage/expenses';
import { feeFindings, type FeeItem, type FeeStatus } from '../engine/mortgage/fees';
import type { MortgageReview } from '../engine/mortgage/review';
import type { Basis } from '../engine/mortgage/rules';
import type { MortgageInput } from '../engine/mortgage/types';
import type { Detail } from '../calculator/ports';
import type { MortgageEvents, Step } from '../mortgage/ports';
import {
  MORTGAGE_EXPENSE_STATUSES,
  MORTGAGE_FEE_STATUSES,
  attemptBucket,
  differenceBucket,
  reviewSecondsBucket,
  type Props,
  type Track,
} from './events';
import { sectionAnalytics } from './section';

type Completed = Props<'mortgage_review_completed'>;

// The days that change what the review reads in a deed: the caps of Ley 41/2007, the late
// interest of Ley 1/2013, the tax on the lender and the LCCI.
function deedPeriod({ deedOn }: MortgageInput): Completed['deed_period'] {
  const day = toIso(deedOn);
  if (day < '2007-12-09') return 'before_2007';
  if (day < '2013-05-15') return '2007_2013';
  if (day < '2018-11-10') return '2013_2018';
  return day < '2019-06-16' ? '2018_2019' : '2019_plus';
}

// Of the costs on one basis, the status that weighs most; the list runs from the most to the least.
function expensesStatus(items: readonly ExpenseItem[], basis: Basis): ExpenseStatus | 'none' {
  const statuses = items.filter((i) => i.basis === basis).map((i) => i.status);
  return MORTGAGE_EXPENSE_STATUSES.find((s) => statuses.includes(s)) ?? 'none';
}

// An operation whose readings disagree counts as `readings`; of several, the one that weighs most.
function feesStatus(items: readonly FeeItem[]): FeeStatus | 'readings' | 'none' {
  const statuses = items.map((item) => {
    const own = new Set(feeFindings(item).map((f) => f.status));
    const [only] = own;
    return own.size === 1 && only !== undefined ? only : 'readings';
  });
  return MORTGAGE_FEE_STATUSES.find((s) => statuses.includes(s)) ?? 'none';
}

const invoicesBucket = (n: number): Completed['invoices'] => (n <= 0 ? '0' : n <= 2 ? '1-2' : '3+');

export function mortgageReviewProps(data: {
  review: MortgageReview;
  input: MortgageInput;
  attempt: number;
  seconds: number;
  detail: Detail;
}): Completed {
  const { review, input } = data;
  const { statute, caseLaw, fees } = review.totals;
  return {
    deed_period: deedPeriod(input),
    consumer: input.consumer === null ? 'unknown' : input.consumer ? 'yes' : 'no',
    expenses_statute: expensesStatus(review.expenses.items, 'statute'),
    expenses_case_law: expensesStatus(review.expenses.items, 'case_law'),
    invoices: invoicesBucket(input.invoices.length),
    fees: feesStatus(review.fees),
    // The clauses found in the deed, each once.
    flags: review.flags.filter((f) => f.state === 'in_deed').map((f) => f.label),
    // The largest of the three lines, never their sum: they are never added up.
    difference: differenceBucket(Math.max(statute.principal, caseLaw.principal, fees.counted)),
    offered: review.offerPass,
    detail: data.detail,
    attempt: attemptBucket(data.attempt),
    seconds: reviewSecondsBucket(data.seconds),
  };
}

// The mortgage review's events as catalogue events: steps, field names, codes and buckets only;
// never an amount, a rate, a date or a bank. `detail` tells whether a pass shows the report.
// The pass, not the measurement, hears when a review is cleared.
export function mortgageAnalytics(
  track: Track,
  now: () => number,
  detail: () => Detail,
): Omit<MortgageEvents, 'reviewCleared'> {
  const { events, reviewed } = sectionAnalytics<Step>(track, now);
  return {
    ...events,
    outOfScope(reason) {
      track('mortgage_out_of_scope', { reason });
    },
    reviewCompleted({ review, input }) {
      track(
        'mortgage_review_completed',
        mortgageReviewProps({ review, input, ...reviewed(), detail: detail() }),
      );
    },
  };
}
