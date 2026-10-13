import { formatCalculationEuros } from '../../calculator/number';
import { dayText } from '../../calculator/review-result';
import {
  detailLine,
  placeAndDate,
  type LetterDetails,
  type LetterKind,
} from '../../documents/letter';
import type { Block, DocumentModel } from '../../documents/ports';
import { toIso, type CivilDate } from '../../engine/date';
import {
  countedAmount,
  findingsOf,
  type BillFinding,
  type BillItem,
} from '../../engine/bills/finding';
import { commitmentDays } from '../../engine/bills/telecom-commitment';
import type { TelecomReview } from '../../engine/bills/telecom-review';
import type { Translate } from '../../i18n/client';
import { daysText, monthsText } from '../result';
import type { CompletedTelecomReview } from './ports';

const day = (d: CivilDate) => dayText(toIso(d));

const itemOf = (review: TelecomReview, id: BillFinding['id']): BillItem | undefined =>
  review.items.find((item) => findingsOf(item)[0]?.id === id);

// Leaving within the month after a change of conditions, in every reading, with something charged
// over what 67.8 and 67.10 leave in one of them at least. A change the review sends to look at, or
// one it does not reach, gives no letter.
export function exitUnderChange(review: TelecomReview): BillItem | null {
  const item = itemOf(review, 'change_exit');
  if (item === undefined) return null;
  const findings = findingsOf(item);
  return findings.every((f) => f.status === 'paid_over' || f.status === 'within_limit') &&
    findings.some((f) => f.status === 'paid_over')
    ? item
    : null;
}

// A commitment penalty over its proportional cap: a single reading, always.
export function penaltyOver(review: TelecomReview): BillFinding | null {
  const item = itemOf(review, 'commitment_penalty');
  if (item === undefined || item.kind !== 'single' || countedAmount(item) <= 0) return null;
  return item.finding;
}

export interface TelecomLetterKinds {
  // The penalty letter, with figures, which the pass pays for.
  readonly paid: readonly LetterKind[];
  // The exit letter carries no figure: it states the dates and the rule, and downloads free.
  readonly free: readonly LetterKind[];
}

export const telecomLetterKinds = ({ review }: CompletedTelecomReview): TelecomLetterKinds =>
  review.scope.inScope
    ? {
        paid: penaltyOver(review) === null ? [] : ['telecom_penalty_review'],
        free: exitUnderChange(review) === null ? [] : ['telecom_exit_without_penalty'],
      }
    : { paid: [], free: [] };

function header(title: string, details: LetterDetails, tr: Translate): Block[] {
  return [
    { type: 'title', text: title },
    detailLine(tr('client.documents.letter.name'), details.name),
    detailLine(tr('client.documents.letter.id'), details.id),
    detailLine(tr('client.bills.telecom.letter.operator'), details.company),
    detailLine(tr('client.bills.telecom.letter.reference'), details.reference),
  ];
}

function closing(details: LetterDetails, tr: Translate): Block[] {
  return [
    { type: 'text', text: tr('client.bills.letter.regards') },
    placeAndDate(details, tr),
    detailLine(tr('client.documents.letter.name'), details.name),
  ];
}

const sourceBlocks = (findings: readonly BillFinding[]): Block[] =>
  findings
    .flatMap((f) => f.sources)
    .filter((s, i, all) => all.findIndex((o) => o.id === s.id) === i)
    .map((s) => ({ type: 'source', text: s.citation, url: s.url }));

// Tells the operator the exit came within the month after a change of conditions was notified, as
// art. 67.8 LGTel puts it, and that the subsidised handset is kept or not. No amount: what is owed
// for a handset kept admits two readings, and the letter only asks for the penalty to be looked at.
export function exitLetter(
  { input, review }: CompletedTelecomReview,
  details: LetterDetails,
  tr: Translate,
): DocumentModel {
  const title = tr('client.bills.telecom.letter.exit.title');
  const notice = input.changeNotice;
  const item = exitUnderChange(review);
  const kept = input.handset !== null && input.handset.kept && input.handset.value > 0;
  const body: Block[] =
    notice?.sentOn == null || item === null
      ? []
      : [
          {
            type: 'text',
            text:
              notice.appliesOn === null
                ? tr('client.bills.telecom.letter.exit.notice', { aviso: day(notice.sentOn) })
                : tr('client.bills.telecom.letter.exit.notice_applies', {
                    aviso: day(notice.sentOn),
                    aplica: day(notice.appliesOn),
                  }),
          },
          {
            type: 'text',
            text: tr('client.bills.telecom.letter.exit.request', {
              baja: day(input.exitRequestedOn),
            }),
          },
          { type: 'text', text: tr('client.bills.telecom.letter.exit.rule') },
          ...(kept
            ? [{ type: 'text', text: tr('client.bills.telecom.letter.exit.handset_kept') } as const]
            : input.handset !== null
              ? [
                  {
                    type: 'text',
                    text: tr('client.bills.telecom.letter.exit.handset_returned'),
                  } as const,
                ]
              : []),
          ...sourceBlocks(findingsOf(item)),
          {
            type: 'text',
            text: tr(
              kept
                ? 'client.bills.telecom.letter.exit.ask_handset'
                : 'client.bills.telecom.letter.exit.ask',
            ),
          },
        ];
  return {
    title,
    footer: null,
    blocks: [...header(title, details, tr), ...body, ...closing(details, tr)],
  };
}

const eurosOf = (f: BillFinding, key: string, name: string): number | null => {
  const v = f.calculation.find((p) => p.key === key)?.vars?.[name];
  return v !== undefined && typeof v === 'object' && 'euros' in v ? v.euros : null;
};

// Asks the operator to look again at a commitment penalty over the share of the days not served
// that art. 62.5 TRLGDCU allows: the days served and left, the cap and the difference.
export function penaltyLetter(
  { input, review }: CompletedTelecomReview,
  details: LetterDetails,
  tr: Translate,
): DocumentModel {
  const title = tr('client.bills.telecom.letter.penalty.title');
  const finding = penaltyOver(review);
  const { commitment, penaltyCharged } = input;
  const cap = finding === null ? null : eurosOf(finding, 'commitment.proportional', 'euros');
  const body: Block[] =
    finding === null ||
    commitment === null ||
    commitment.agreedPenalty === null ||
    penaltyCharged === null ||
    cap === null
      ? []
      : (() => {
          const days = commitmentDays(commitment, input.exitRequestedOn);
          const left = daysText(days.left, tr);
          return [
            {
              type: 'text',
              text: tr('client.bills.telecom.letter.penalty.body', {
                meses: monthsText(commitment.months, tr),
                inicio: day(commitment.startedOn),
                fin: day(days.endsOn),
                pactada: formatCalculationEuros(commitment.agreedPenalty),
                baja: day(input.exitRequestedOn),
                cumplidos: daysText(days.total - days.left, tr),
                pendientes: left,
                cobrada: formatCalculationEuros(penaltyCharged),
              }),
            },
            { type: 'text', text: tr('client.bills.telecom.letter.penalty.rule') },
            {
              type: 'text',
              text: tr('client.bills.telecom.letter.penalty.over', {
                pendientes: left,
                total: daysText(days.total, tr),
                maximo: formatCalculationEuros(cap),
                diferencia: formatCalculationEuros(finding.amount ?? 0),
              }),
            },
            ...sourceBlocks([finding]),
            { type: 'text', text: tr('client.bills.telecom.letter.penalty.ask') },
          ];
        })();
  return {
    title,
    footer: null,
    blocks: [...header(title, details, tr), ...body, ...closing(details, tr)],
  };
}
