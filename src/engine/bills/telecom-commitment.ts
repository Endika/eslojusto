import { addMonthsClamped, ordinal, toIso, type CivilDate } from '../date';
import { round2 } from '../money';
import { billsPhrase, type BillsCalculation } from './calculation';
import { billFinding, single, withinCap, type BillItem, type BillsStatus } from './finding';
import type { NormTable } from './norms';
import type { Commitment, TelecomInput } from './types';

// Art. 67.7 LGTel: the longest commitment a consumer may be held to.
export const MAX_COMMITMENT_MONTHS = 24;

export interface CommitmentDays {
  readonly endsOn: CivilDate;
  readonly total: number;
  // Days from the exit request to the end, none once the commitment is over.
  readonly left: number;
}

// The request day is the one counted from, not the day the exit takes effect: it leaves the most
// days, so the highest penalty the law allows.
export function commitmentDays(commitment: Commitment, exitOn: CivilDate): CommitmentDays {
  const endsOn = addMonthsClamped(commitment.startedOn, commitment.months);
  return {
    endsOn,
    total: ordinal(endsOn) - ordinal(commitment.startedOn),
    left: Math.max(0, ordinal(endsOn) - ordinal(exitOn)),
  };
}

function lengthItem(commitment: Commitment, norms: NormTable): readonly BillItem[] {
  if (commitment.months <= MAX_COMMITMENT_MONTHS) return [];
  return [
    single(
      billFinding(
        'commitment_length',
        'above_legal_maximum',
        [
          billsPhrase('commitment.over_maximum', {
            months: { integer: commitment.months },
            maximum: { integer: MAX_COMMITMENT_MONTHS },
          }),
        ],
        ['commitment_maximum'],
        norms,
      ),
    ),
  ];
}

// Art. 62.5 TRLGDCU: leaving a commitment early costs at most the agreed penalty in proportion to
// the days left. Without the agreed penalty nothing is worked out.
export function checkCommitmentPenalty(input: TelecomInput, norms: NormTable): BillItem | null {
  const { commitment, penaltyCharged: charged } = input;
  if (commitment === null || charged === null || charged <= 0) return null;
  const finding = (status: BillsStatus, calculation: BillsCalculation, amount?: number) =>
    billFinding('commitment_penalty', status, calculation, ['commitment_proportional'], norms, {
      amount: amount ?? null,
      direction: amount === undefined ? null : 'over',
    });
  const { agreedPenalty: agreed } = commitment;
  if (agreed === null)
    return single(finding('not_checkable', [billsPhrase('commitment.agreed_unknown')]));
  const days = commitmentDays(commitment, input.exitRequestedOn);
  const highest = days.left === 0 ? 0 : round2((agreed * days.left) / days.total);
  const calculation =
    days.left === 0
      ? [billsPhrase('commitment.ended', { end: { date: toIso(days.endsOn) } })]
      : [
          billsPhrase('commitment.proportional', {
            agreed: { euros: agreed },
            left: { days: days.left },
            total: { days: days.total },
            euros: { euros: highest },
          }),
        ];
  // Over the legal maximum, the cap worked out on the agreed length is the highest that may hold:
  // what is over it is certain, but under it the penalty is not taken as within the limit.
  if (withinCap(charged, highest))
    return single(
      commitment.months > MAX_COMMITMENT_MONTHS
        ? finding('review_it', [
            ...calculation,
            billsPhrase('commitment.over_maximum_penalty', {
              maximum: { integer: MAX_COMMITMENT_MONTHS },
            }),
          ])
        : finding('within_limit', calculation),
    );
  return single(finding('paid_over', calculation, round2(charged - highest)));
}

// How long the commitment runs and what leaving it early may cost.
export function checkCommitment(input: TelecomInput, norms: NormTable): readonly BillItem[] {
  if (input.commitment === null) return [];
  const penalty = checkCommitmentPenalty(input, norms);
  return [...lengthItem(input.commitment, norms), ...(penalty === null ? [] : [penalty])];
}
