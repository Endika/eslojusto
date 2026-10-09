import type { CreditFigure, CreditPhraseKey } from '../engine/credit/calculation';
import { findingsOf, type CreditFinding } from '../engine/credit/finding';
import type { NormTable } from '../engine/credit/norms';
import type { CreditReview } from '../engine/credit/review';
import { ruleSource } from '../engine/credit/rules';
import { formatEuros } from '../calculator/number';
import { detailLine, placeAndDate, type LetterDetails, type LetterKind } from '../documents/letter';
import type { Block, DocumentModel } from '../documents/ports';
import type { ClientKey, Translate } from '../i18n/client';
import type { CompletedCreditReview } from './ports';
import { civilDayText as day } from './render';

// What a letter may say: only figures that hold in every reading of the review, the lowest of
// them, and never a verdict on the indicator against the average rate.

// The early repayment the letter asks to look at again: the reading with the least over a cap,
// which every reading reaches, and whether there were others with more.
export interface RepaymentLine {
  readonly finding: CreditFinding;
  readonly lowest: boolean;
}

export function repaymentLine(review: CreditReview): RepaymentLine | null {
  const item = review.items.find((i) => findingsOf(i)[0]?.id === 'early_repayment');
  if (item === undefined) return null;
  const findings = findingsOf(item);
  const amounts = findings.map((f) => f.amount ?? 0);
  const least = Math.min(...amounts);
  const finding = findings[amounts.indexOf(least)];
  if (finding === undefined || least <= 0) return null;
  return { finding, lowest: findings.length > 1 };
}

export interface CreditLetterKinds {
  // The early repayment letter, with figures, which the pass pays for.
  readonly paid: readonly LetterKind[];
  // The request for the credit's information, which only asks for it.
  readonly free: readonly LetterKind[];
}

// A credit the review covers can always ask for its information; the early repayment letter
// needs compensation over a cap in every reading.
export const creditLetterKinds = ({ review }: CompletedCreditReview): CreditLetterKinds =>
  review.scope.inScope
    ? {
        paid: repaymentLine(review) === null ? [] : ['early_repayment_review'],
        free: ['credit_information'],
      }
    : { paid: [], free: [] };

function header(title: string, details: LetterDetails, tr: Translate): Block[] {
  return [
    { type: 'title', text: title },
    detailLine(tr('client.documents.letter.name'), details.name),
    detailLine(tr('client.documents.letter.id'), details.id),
    detailLine(tr('client.credit.letter.lender'), details.company),
    detailLine(tr('client.credit.letter.reference'), details.reference),
  ];
}

function closing(details: LetterDetails, tr: Translate): Block[] {
  return [
    { type: 'text', text: tr('client.credit.letter.regards') },
    placeAndDate(details, tr),
    detailLine(tr('client.documents.letter.name'), details.name),
  ];
}

const opening = ({ input }: CompletedCreditReview, tr: Translate): Block => ({
  type: 'text',
  text: tr(`client.credit.letter.about.${input.product}`, { fecha: day(input.agreedOn) }),
});

// Asks the lender for the amortisation schedule art. 16.2.i LCC gives a right to at any time, free,
// in a credit of fixed duration; for a revolving card, for the breakdown of what was paid and what
// is owed, told as what the transparency order provides, never as what this lender owes.
export function informationLetter(
  r: CompletedCreditReview,
  norms: NormTable,
  details: LetterDetails,
  tr: Translate,
): DocumentModel {
  const title = tr('client.credit.letter.information.title');
  const revolving = r.input.product === 'revolving';
  const source = ruleSource(revolving ? 'revolving_info' : 'contract_mentions', norms);
  return {
    title,
    footer: null,
    blocks: [
      ...header(title, details, tr),
      opening(r, tr),
      {
        type: 'text',
        text: tr(
          revolving
            ? 'client.credit.letter.information.breakdown'
            : 'client.credit.letter.information.schedule',
        ),
      },
      { type: 'source', text: source.citation, url: source.url },
      { type: 'text', text: tr('client.credit.letter.information.reply') },
      ...closing(details, tr),
    ],
  };
}

const varOf = (f: CreditFinding, key: CreditPhraseKey, name: string): CreditFigure | undefined =>
  f.calculation.find((p) => p.key === key)?.vars?.[name];

const euros = (f: CreditFigure | undefined): string =>
  f !== undefined && typeof f === 'object' && 'euros' in f ? formatEuros(f.euros) : '';

const has = (f: CreditFinding, key: CreditPhraseKey) => f.calculation.some((p) => p.key === key);

// The cap of art. 30.2 and, when it binds, of 30.5, with the figures the review worked out.
function capBlocks(f: CreditFinding, tr: Translate): Block[] {
  const withInterest = has(f, 'early_repayment.base_with_interest');
  const baseKey = withInterest
    ? 'early_repayment.base_with_interest'
    : 'early_repayment.base_principal';
  return [
    {
      type: 'text',
      text: tr(
        has(f, 'early_repayment.over_a_year')
          ? 'client.credit.letter.repayment.over_a_year'
          : 'client.credit.letter.repayment.up_to_a_year',
      ),
    },
    {
      type: 'text',
      text: tr(
        withInterest
          ? 'client.credit.letter.repayment.base_with_interest'
          : 'client.credit.letter.repayment.base_principal',
        { base: euros(varOf(f, baseKey, 'base')), tope: euros(varOf(f, baseKey, 'cap')) },
      ),
    },
    ...(has(f, 'early_repayment.interest_cap')
      ? [
          {
            type: 'text',
            text: tr('client.credit.letter.repayment.interest_cap', {
              tope: euros(varOf(f, 'early_repayment.interest_cap', 'cap')),
            }),
          } as const,
        ]
      : []),
    {
      type: 'text',
      text: tr('client.credit.letter.repayment.over', { diferencia: formatEuros(f.amount ?? 0) }),
    },
    { type: 'text', text: tr('client.credit.letter.repayment.ask') },
  ];
}

// 30.3: no compensation for a repayment an insurance paid, or in a period without a fixed rate.
function noBasisBlocks(f: CreditFinding, tr: Translate): Block[] {
  const reason: ClientKey = has(f, 'early_repayment.paid_by_insurance')
    ? 'client.credit.letter.repayment.paid_by_insurance'
    : 'client.credit.letter.repayment.variable_rate';
  return [
    { type: 'text', text: tr(reason) },
    { type: 'text', text: tr('client.credit.letter.repayment.ask_no_basis') },
  ];
}

// Asks the lender to look again at the compensation charged for an early repayment above the caps
// of art. 30 LCC, with the amount repaid, the time left, the cap and the difference.
export function repaymentLetter(
  r: CompletedCreditReview,
  details: LetterDetails,
  tr: Translate,
): DocumentModel {
  const title = tr('client.credit.letter.repayment.title');
  const line = repaymentLine(r.review);
  const repayment = r.input.earlyRepayment;
  const body: Block[] =
    line === null || repayment === null
      ? []
      : [
          {
            type: 'text',
            text: tr('client.credit.letter.repayment.body', {
              fecha: day(repayment.on),
              capital: formatEuros(repayment.principalRepaid),
              cobrado: formatEuros(repayment.compensationCharged),
              fin: day(repayment.agreedEndOn),
            }),
          },
          ...(line.finding.status === 'charged_without_basis'
            ? noBasisBlocks(line.finding, tr)
            : capBlocks(line.finding, tr)),
          ...(line.lowest
            ? [{ type: 'note', text: tr('client.credit.letter.repayment.lowest') } as const]
            : []),
          ...line.finding.sources.map((s): Block => ({
            type: 'source',
            text: s.citation,
            url: s.url,
          })),
        ];
  return {
    title,
    footer: null,
    blocks: [...header(title, details, tr), opening(r, tr), ...body, ...closing(details, tr)],
  };
}
