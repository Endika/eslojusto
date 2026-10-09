import { addMonthsClamped, compareDates, ordinal } from '../date';
import { assessAcross } from '../law/readings';
import { round2 } from '../money';
import { creditPhrase, type CreditPhrase } from './calculation';
import { creditFinding, dayOf, single, type CreditFinding, type CreditItem } from './finding';
import type { NormTable } from './norms';
import type { StatuteRuleId } from './rules';
import type { CreditInput, EarlyRepayment } from './types';

// Art. 30.2 LCC: 1 % of the amount repaid when more than a year is left to the agreed end, 0,5 %
// otherwise; the year runs date to date (Código Civil, art. 5.1).
const OVER_A_YEAR = 0.01;
const UP_TO_A_YEAR = 0.005;
const A_YEAR = 12;
const PERCENT = 100;

export type RepaymentBase = 'principal_and_interest' | 'principal_only';

// Whether more than a year is left from the repayment to the agreed end. Exactly a year, date to
// date, is not more than a year.
export const overAYearLeft = (repayment: Pick<EarlyRepayment, 'on' | 'agreedEndOn'>): boolean =>
  compareDates(repayment.agreedEndOn, addMonthsClamped(repayment.on, A_YEAR)) > 0;

// One reading of the cap on the compensation, on one base. Which amount art. 30.2 calls «el
// importe del crédito reembolsado anticipadamente» is not settled: the capital alone, or with the
// interest settled that day. Both are worked out; the total counts the lower result.
function capReading(
  input: CreditInput,
  repayment: EarlyRepayment,
  base: RepaymentBase,
  norms: NormTable,
): CreditFinding {
  const charged = repayment.compensationCharged;
  const finding = (
    status: CreditFinding['status'],
    calculation: readonly CreditPhrase[],
    rules: readonly StatuteRuleId[],
    amount: number | null = null,
  ) => creditFinding('early_repayment', status, calculation, rules, norms, { amount });

  // 30.3: nothing may be charged for a repayment an insurance pays or made in a period without a
  // fixed rate.
  const noBasis = repayment.paidByInsurance
    ? 'early_repayment.paid_by_insurance'
    : input.rateType === 'variable'
      ? 'early_repayment.variable_rate'
      : null;
  if (noBasis !== null) {
    if (charged === 0)
      return finding(
        'nothing_charged',
        [creditPhrase(noBasis), creditPhrase('early_repayment.nothing_charged')],
        ['early_repayment_none'],
      );
    return finding(
      'charged_without_basis',
      [
        creditPhrase(noBasis),
        creditPhrase('early_repayment.charged_without_basis', { charged: { euros: charged } }),
      ],
      ['early_repayment_none'],
      round2(charged),
    );
  }

  const longTerm = overAYearLeft(repayment);
  const rate = longTerm ? OVER_A_YEAR : UP_TO_A_YEAR;
  const amount =
    base === 'principal_and_interest'
      ? repayment.principalRepaid + (repayment.interestSettled ?? 0)
      : repayment.principalRepaid;
  const general = round2(amount * rate);
  const remaining = repayment.remainingInterest;
  // 30.5: never more than the interest the schedule had left to pay.
  const interestBinds = remaining !== null && remaining < general;
  const cap = interestBinds ? round2(remaining) : general;
  const rules: StatuteRuleId[] = ['early_repayment_cap', 'period_count'];
  if (interestBinds) rules.push('early_repayment_interest_cap');
  const workings: CreditPhrase[] = [
    creditPhrase(longTerm ? 'early_repayment.over_a_year' : 'early_repayment.up_to_a_year', {
      end: dayOf(repayment.agreedEndOn),
      on: dayOf(repayment.on),
    }),
    creditPhrase(
      base === 'principal_and_interest'
        ? 'early_repayment.base_with_interest'
        : 'early_repayment.base_principal',
      {
        base: { euros: round2(amount) },
        rate: { percent: rate * PERCENT },
        cap: { euros: general },
      },
    ),
    ...(interestBinds
      ? [creditPhrase('early_repayment.interest_cap', { cap: { euros: cap } })]
      : []),
  ];
  if (charged > cap)
    return finding(
      'above_general_cap',
      [
        ...workings,
        creditPhrase('early_repayment.above_general_cap', {
          charged: { euros: charged },
          over: { euros: round2(charged - cap) },
        }),
        creditPhrase('early_repayment.losses'),
      ],
      [...rules, 'early_repayment_losses'],
      round2(charged - cap),
    );
  return finding(
    'within_cap',
    [...workings, creditPhrase('early_repayment.within_cap', { charged: { euros: charged } })],
    rules,
  );
}

// Item 3: the compensation charged for an early repayment against the caps of art. 30.
export function checkEarlyRepayment(input: CreditInput, norms: NormTable): CreditItem {
  const repayment = input.earlyRepayment;
  if (repayment === null)
    return single(
      creditFinding(
        'early_repayment',
        'not_entered',
        [creditPhrase('item.not_entered')],
        ['early_repayment_cap'],
        norms,
      ),
    );
  const bases: readonly RepaymentBase[] =
    repayment.interestSettled !== null && repayment.interestSettled > 0
      ? ['principal_and_interest', 'principal_only']
      : ['principal_only'];
  return assessAcross('repayment_base', bases, (base) => capReading(input, repayment, base, norms));
}

// A discount given for financing a car and taken back on repaying early is the dealer's, not the
// lender's compensation: left to review, with no figure.
export function checkDealerDiscount(input: CreditInput, norms: NormTable): CreditItem | null {
  if (input.earlyRepayment?.discountLost !== true) return null;
  return single(
    creditFinding(
      'dealer_discount',
      'review_it',
      [creditPhrase('dealer_discount.review_it')],
      ['contract_mentions', 'early_repayment_cap'],
      norms,
    ),
  );
}

// Art. 30.6: the part of a linked insurance premium not yet used, as a straight-line share of the
// term left. Only a guide, labelled as such: the policy sets the method. Never in a total.
export function unusedPremiumGuide(input: CreditInput): number | null {
  const repayment = input.earlyRepayment;
  const insurance = input.insurance;
  if (repayment === null || insurance === null || !insurance.single) return null;
  const term = ordinal(repayment.agreedEndOn) - ordinal(input.drawnOn);
  const left = ordinal(repayment.agreedEndOn) - ordinal(repayment.on);
  if (term <= 0) return null;
  return round2((insurance.premium * left) / term);
}
