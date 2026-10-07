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
import type { NormTable } from './norms';
import { ruleFrame } from './rule-worlds';
import type { RuleId } from './rules';
import type { Guarantee, RentalInput } from './types';

// Below a cent the difference is rounding.
const TOLERANCE = 0.01;
// LAU art. 36.5: the cap binds contracts of up to five years, or seven with a company landlord.
const CAPPED_MONTHS = { person: 60, company: 84 } as const;
const CAP_MONTHS = 2;

interface Frame {
  readonly rent: number;
  readonly capped: boolean;
  readonly longContract: RentalPhrase;
}

function frameOf(input: RentalInput, norms: NormTable): Frame {
  const limit = CAPPED_MONTHS[input.landlordType];
  const inForce = ruleFrame(input.signedOn, ['guarantee_cap'], norms).active.has('guarantee_cap');
  return {
    rent: input.initialRent,
    capped: inForce && input.agreedMonths <= limit,
    longContract: p('guarantees.long_contract', {
      months: { integer: input.agreedMonths },
      limit: { integer: limit },
    }),
  };
}

// LAU art. 36.1 and 36.5: the deposit is one month's rent, and what goes past it counts as an
// extra guarantee; money handed over as extra guarantees is compared with two months' rent. A bank
// guarantee or an insurance is not money paid, so it carries no figure.
function moneyItem(input: RentalInput, frame: Frame): ItemReading {
  const rules: RuleId[] = ['deposit_one_month', 'guarantee_cap'];
  const cash = input.guarantees.filter(
    (g): g is Guarantee & { amount: number } => g.kind === 'cash' && g.amount !== null,
  );
  if (input.deposit === null && cash.length === 0) return notEntered(rules);
  const { rent } = frame;
  const phrases: RentalPhrase[] = [];
  const depositExcess = input.deposit === null ? 0 : Math.max(0, round2(input.deposit - rent));
  if (depositExcess > TOLERANCE)
    phrases.push(
      p('guarantees.deposit_excess', {
        deposit: { euros: input.deposit ?? 0 },
        rent: { euros: rent },
        excess: { euros: depositExcess },
      }),
    );
  const money = round2(depositExcess + cash.reduce((sum, g) => sum + g.amount, 0));
  if (!frame.capped)
    return itemReading('not_applicable_to_date', null, [...phrases, frame.longContract], rules);
  const cap = round2(CAP_MONTHS * rent);
  phrases.push(p('guarantees.money', { money: { euros: money }, cap: { euros: cap } }));
  const over = round2(money - cap);
  if (over > TOLERANCE)
    return itemReading(
      'over_cap',
      over,
      [...phrases, p('guarantees.over_cap', { amount: { euros: over } })],
      rules,
    );
  return itemReading('within_limit', null, [...phrases, p('guarantees.within_cap')], rules);
}

function guaranteeItem(
  input: RentalInput,
  g: Guarantee,
  frame: Frame,
  norms: NormTable,
): ItemResult['outcome'] {
  const longOrReview = (rule: RuleId, why: RentalPhrase): ItemReading =>
    frame.capped
      ? itemReading('review_it', null, [why], [rule])
      : itemReading('not_applicable_to_date', null, [frame.longContract], [rule]);
  if (g.kind === 'cash') return single(notEntered(['guarantee_cap']));
  if (g.kind !== 'insurance')
    return single(longOrReview('guarantee_cap', p('guarantees.not_money')));
  // LAU art. 36.5 as reworded by RDL 29/2026: no rent-default insurance may be required. Before
  // it, whether an insurance counts within the two months is not settled.
  const ban = ruleFrame(input.signedOn, ['insurance_ban'], norms);
  return readAcross(ban.doubts, (world) =>
    ban.holds('insurance_ban', world)
      ? itemReading('over_cap', null, [p('guarantees.insurance_banned')], ['insurance_ban'])
      : longOrReview('guarantee_cap', p('guarantees.insurance_before_ban')),
  );
}

export function checkGuarantees(input: RentalInput, norms: NormTable): readonly ItemResult[] {
  const frame = frameOf(input, norms);
  const money = itemResult('guarantees', {}, single(moneyItem(input, frame)), norms);
  const others = input.guarantees.flatMap((g, index) =>
    g.kind === 'cash' && g.amount !== null
      ? []
      : [itemResult('guarantee', { index }, guaranteeItem(input, g, frame, norms), norms)],
  );
  return [money, ...others];
}

// LAU art. 17.2: no more than one month's rent may be required in advance.
export function checkAdvance(input: RentalInput, norms: NormTable): ItemResult {
  const rules: RuleId[] = ['advance_cap'];
  const months = input.advanceMonths;
  const rent = input.initialRent;
  const value =
    months === null
      ? notEntered(rules)
      : months > 1
        ? itemReading(
            'over_cap',
            round2((months - 1) * rent),
            [
              p('advance.over_cap', {
                months: { integer: months },
                rent: { euros: rent },
                amount: { euros: round2((months - 1) * rent) },
              }),
            ],
            rules,
          )
        : itemReading('within_limit', null, [p('advance.within_cap')], rules);
  return itemResult('advance', {}, single(value), norms);
}
