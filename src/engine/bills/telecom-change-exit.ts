import { addMonthsClamped, compareDates, toIso } from '../date';
import { assessAcross } from '../law/readings';
import { round2 } from '../money';
import { billsPhrase, type BillsCalculation, type BillsPhraseKey } from './calculation';
import {
  billFinding,
  withinCap,
  single,
  type BillItem,
  type BillsStatus,
  type HandsetQuestion,
  type HandsetReading,
} from './finding';
import type { NormTable, SourceTable } from './norms';
import { RULES, type BillsRuleId } from './rules';
import { commitmentDays } from './telecom-commitment';
import type { TelecomInput } from './types';

export interface ChangeExitDeps {
  readonly norms: NormTable;
  readonly sources: SourceTable;
}

// Art. 67.8 and 67.10 LGTel: leaving within the month after a change of conditions is notified
// costs nothing but the subsidised handset the subscriber keeps. Whether that is its whole value or
// the share of the commitment left is not settled, so both readings are given and the lowest
// difference counts. A rise under an index clause, and a change notified less than a month ahead
// or not at all, are shown without a figure.
export function checkChangeExit(input: TelecomInput, deps: ChangeExitDeps): BillItem | null {
  const { changeNotice: notice, penaltyCharged: charged, exitRequestedOn: exit } = input;
  if (notice === null || charged === null || charged <= 0) return null;
  const { norms } = deps;
  const finding = (
    status: BillsStatus,
    calculation: BillsCalculation,
    rules: readonly BillsRuleId[] = ['change_exit'],
    amount?: number,
  ) =>
    billFinding('change_exit', status, calculation, rules, norms, {
      amount: amount ?? null,
      direction: amount === undefined ? null : 'over',
    });
  const plain = (status: BillsStatus, key: BillsPhraseKey) =>
    single(finding(status, [billsPhrase(key)]));

  if (toIso(exit) < RULES.change_exit.from) return plain('not_checkable', 'change.before_rules');
  if (notice.sentOn === null) return plain('review_it', 'change.no_notice');
  // 67.8 leaves out changes only to the subscriber's benefit, purely administrative ones and those
  // a norm imposes; an unnamed change may be any of them.
  if (notice.change === 'other') return plain('review_it', 'change.other_unsettled');
  if (notice.change === 'price_up' && notice.index === 'ipc')
    return single(
      finding(
        'information',
        [
          billsPhrase('change.index_cpi', {
            judgment: { date: deps.sources.tjue_c326_14.inForceSince },
          }),
        ],
        ['indexed_price_rise'],
      ),
    );
  if (notice.change === 'price_up' && notice.index !== 'none')
    return plain('review_it', 'change.index_unsettled');
  if (compareDates(exit, notice.sentOn) < 0)
    return plain('not_applicable', 'change.exit_before_notice');
  // A notice given less than a month ahead: the right to leave holds, but from when it runs is not
  // settled, so it is explained with no figure.
  const lastDay = addMonthsClamped(notice.sentOn, 1);
  if (notice.appliesOn !== null && compareDates(notice.appliesOn, lastDay) < 0)
    return single(
      finding('review_it', [
        billsPhrase('change.short_notice', {
          sent: { date: toIso(notice.sentOn) },
          applies: { date: toIso(notice.appliesOn) },
        }),
      ]),
    );
  if (compareDates(exit, lastDay) > 0)
    return single(
      finding('not_applicable', [
        billsPhrase('change.exit_after_month', { last: { date: toIso(lastDay) } }),
      ]),
    );

  const noPenalty = billsPhrase('change.no_penalty', { last: { date: toIso(lastDay) } });
  const assess = (allowed: number, calculation: BillsCalculation, rules: readonly BillsRuleId[]) =>
    withinCap(charged, allowed)
      ? finding('within_limit', calculation, rules)
      : finding('paid_over', calculation, rules, round2(charged - allowed));

  const { handset, commitment } = input;
  if (handset === null || !handset.kept || handset.value <= 0)
    return single(assess(0, [noPenalty], ['change_exit']));
  const rules: readonly BillsRuleId[] = ['change_exit', 'handset_after_change'];
  const whole = round2(handset.value);
  const wholeFinding = assess(
    whole,
    [noPenalty, billsPhrase('change.handset_whole', { euros: { euros: whole } })],
    rules,
  );
  if (commitment === null) return single(wholeFinding);
  const days = commitmentDays(commitment, exit);
  const prorated = round2((handset.value * days.left) / days.total);
  return assessAcross<HandsetQuestion, HandsetReading, typeof wholeFinding>(
    'handset_share',
    ['whole_value', 'prorated_value'],
    (reading) =>
      reading === 'whole_value'
        ? wholeFinding
        : assess(
            prorated,
            [
              noPenalty,
              billsPhrase('change.handset_prorated', {
                value: { euros: whole },
                left: { days: days.left },
                total: { days: days.total },
                euros: { euros: prorated },
              }),
            ],
            rules,
          ),
  );
}
