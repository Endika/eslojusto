import {
  addDays,
  addMonthsClamped,
  compareDates,
  daysInYear,
  ordinal,
  toIso,
  type CivilDate,
} from '../date';
import { round2 } from '../money';
import { rentalPhrase as p, type RentalPhrase } from './calculation';
import {
  itemReading,
  itemResult,
  notEntered,
  readAcross,
  single,
  type ItemReading,
  type ItemResult,
} from './item';
import type { Doubt, World } from './outcome';
import type { RuleId } from './rules';
import type { MoveOut, RentalInput, ReviewDeps } from './types';

// Below a cent the difference is rounding.
const TOLERANCE = 0.01;
const DAY_COUNT: Doubt = { id: 'interest_day_count', reason: 'interest_day_count' };
const INTEREST_RULES: readonly RuleId[] = ['deposit_interest', 'legal_interest_rate'];

const sum = (xs: readonly { readonly amount: number }[]): number =>
  round2(xs.reduce((s, x) => s + x.amount, 0));

// What is still to come back of the deposit; null without a deposit to start from.
const pendingOf = (deposit: number | null, out: MoveOut): number | null =>
  deposit === null ? null : round2(deposit - sum(out.returns) - sum(out.deductions));

// The deposit less what came back and what was kept. What was kept is listed as the landlord
// gave it: whether damage justifies it is not something this review can weigh.
function returnReading(deposit: number | null, out: MoveOut, today: CivilDate): ItemReading {
  const rules: RuleId[] = ['deposit_interest'];
  const pending = pendingOf(deposit, out);
  if (deposit === null || pending === null) return notEntered(rules);
  const phrases: RentalPhrase[] = [
    p('deposit.pending', {
      deposit: { euros: deposit },
      returned: { euros: sum(out.returns) },
      deducted: { euros: sum(out.deductions) },
      pending: { euros: Math.max(0, pending) },
    }),
    ...out.deductions.map((d) => p(`deposit.deduction.${d.kind}`, { amount: { euros: d.amount } })),
  ];
  if (out.deductions.length > 0) phrases.push(p('deposit.deductions_not_judged'));
  // Up to the day the month after the keys runs out (date to date) the balance is not due yet: no
  // figure, no total.
  const due = addMonthsClamped(out.keysReturnedOn, 1);
  if (pending > TOLERANCE && compareDates(today, due) <= 0)
    return itemReading(
      'not_yet_due',
      null,
      [...phrases, p('deposit.not_yet_due', { due: { date: toIso(due) } })],
      rules,
    );
  if (pending > TOLERANCE)
    return itemReading(
      'owed',
      pending,
      [...phrases, p('deposit.owed', { amount: { euros: pending } })],
      rules,
    );
  return itemReading('within_limit', null, [...phrases, p('deposit.returned_in_full')], rules);
}

interface Stretch {
  readonly amount: number;
  // First day that accrues and the day the money came back (or today), which does not.
  readonly from: CivilDate;
  readonly until: CivilDate;
}

// LAU art. 36.4: the balance accrues the legal interest once a month has passed since the keys
// were handed back. Each calendar year takes its own rate; the year counts 365 days (366 in a
// leap year) or 360, as no norm settles which.
function interestIn(
  stretches: readonly Stretch[],
  rates: ReviewDeps['legalInterest'],
  world: World,
): ItemReading {
  const commercial = world[DAY_COUNT.id] === true;
  const phrases: RentalPhrase[] = [];
  let total = 0;
  for (const s of stretches) {
    let from = s.from;
    while (compareDates(from, s.until) < 0) {
      const yearEnd: CivilDate = { y: from.y + 1, m: 1, d: 1 };
      const to = compareDates(yearEnd, s.until) < 0 ? yearEnd : s.until;
      const rate = rates.find((r) => r.year === from.y)?.rate;
      if (rate === undefined)
        return itemReading(
          'not_checkable',
          null,
          [p('deposit.interest_rate_not_loaded', { year: { integer: from.y } })],
          INTEREST_RULES,
        );
      const days = ordinal(to) - ordinal(from);
      const yearDays = commercial ? 360 : daysInYear(from.y);
      const interest = (s.amount * rate * days) / (100 * yearDays);
      total += interest;
      phrases.push(
        p('deposit.interest_stretch', {
          amount: { euros: s.amount },
          from: { date: toIso(from) },
          to: { date: toIso(addDays(to, -1)) },
          days: { days },
          rate: { percent: rate },
          yearDays: { integer: yearDays },
          interest: { euros: round2(interest) },
        }),
      );
      from = to;
    }
  }
  total = round2(total);
  phrases.push(
    p('deposit.interest_day_count'),
    p('deposit.interest_total', { total: { euros: total } }),
  );
  return total >= TOLERANCE
    ? itemReading('owed', total, phrases, INTEREST_RULES)
    : itemReading('within_limit', null, phrases, INTEREST_RULES);
}

// LAU art. 36.1 and 36.4: the deposit is one month's rent and only it accrues; what was paid above
// it is an extra guarantee. Which money came back first is not known, so the part above the month
// is taken as kept or returned first: the lower reading.
function interestItem(
  deposit: number | null,
  rent: number,
  out: MoveOut,
  today: CivilDate,
  rates: ReviewDeps['legalInterest'],
): ItemResult['outcome'] {
  // Months run date to date (Código Civil, art. 5.1): the month ends on `due`, and interest runs
  // from the day after it.
  const from = addDays(addMonthsClamped(out.keysReturnedOn, 1), 1);
  const late = (until: CivilDate) => compareDates(until, from) > 0;
  const aboveMonth = deposit === null ? 0 : Math.max(0, round2(deposit - rent));
  let notAccruing = Math.max(0, round2(aboveMonth - sum(out.deductions)));
  const stretches: Stretch[] = [];
  for (const r of [...out.returns].sort((a, b) => compareDates(a.on, b.on))) {
    const kept = Math.min(r.amount, notAccruing);
    notAccruing = round2(notAccruing - kept);
    const accruing = round2(r.amount - kept);
    if (late(r.on) && accruing > 0) stretches.push({ amount: accruing, from, until: r.on });
  }
  const pending = pendingOf(deposit, out);
  const stillOwed = pending !== null && pending > TOLERANCE;
  const pendingAccruing = pending === null ? 0 : round2(pending - notAccruing);
  if (stillOwed && late(today) && pendingAccruing > TOLERANCE)
    stretches.push({ amount: pendingAccruing, from, until: today });
  const capPhrase =
    aboveMonth > TOLERANCE ? [p('deposit.interest_deposit_only', { rent: { euros: rent } })] : [];
  if (stretches.length > 0)
    return readAcross([DAY_COUNT], (world) => {
      const r = interestIn(stretches, rates, world);
      return { ...r, calculation: [...capPhrase, ...r.calculation] };
    });
  const why = stillOwed
    ? p('deposit.interest_not_yet', { from: { date: toIso(from) } })
    : p('deposit.returned_on_time', { from: { date: toIso(from) } });
  return single(itemReading('within_limit', null, [...capPhrase, why], INTEREST_RULES));
}

// The deposit's return once the keys are back: what is still owed, and the interest on what came
// back late or has not come back.
export function checkDepositReturn(
  input: RentalInput,
  today: CivilDate,
  deps: Pick<ReviewDeps, 'norms' | 'legalInterest'>,
): readonly ItemResult[] {
  const out = input.moveOut;
  if (out === null) return [];
  return [
    itemResult('deposit_return', {}, single(returnReading(input.deposit, out, today)), deps.norms),
    itemResult(
      'deposit_interest',
      {},
      interestItem(input.deposit, input.initialRent, out, today, deps.legalInterest),
      deps.norms,
    ),
  ];
}
