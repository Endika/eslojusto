import { formatEuros } from '../calculator/number';
import { dayText } from '../calculator/review-result';
import { toIso, type CivilDate } from '../engine/date';
import type { ExpenseItem, MortgageSource } from '../engine/mortgage/expenses';
import { feeFindings, type FeeFinding } from '../engine/mortgage/fees';
import type { MortgageReview } from '../engine/mortgage/review';
import type { MortgageInput } from '../engine/mortgage/types';
import { detailLine, placeAndDate, type LetterDetails, type LetterKind } from '../documents/letter';
import type { Block, DocumentModel } from '../documents/ports';
import type { Translate } from '../i18n/client';
import type { CompletedMortgageReview } from './ports';

// What the amounts letter may say: only what a law settles, never the Supreme Court's split nor
// any figure that depends on a judge.

const day = (d: CivilDate): string => dayText(toIso(d));

// A cost the law puts on the lender, or says is charged to nobody, that the person paid.
export interface ExpenseLine {
  readonly item: ExpenseItem;
  readonly amount: number;
}

// A fee over its cap: the reading with the least over it, which every reading reaches, and whether
// another reading gives more.
export interface FeeLine {
  readonly finding: FeeFinding;
  readonly amount: number;
  readonly lowest: boolean;
}

export interface AmountLines {
  readonly expenses: readonly ExpenseLine[];
  readonly fees: readonly FeeLine[];
  // What the lender already gave back of the set-up costs, which of them unknown, and what is left
  // of those the law puts on it once that is taken off.
  readonly returned: number;
  readonly lenderLeft: number;
}

// What the person paid for the notary's record stands on its own; the costs the law puts on the
// lender go only while what came back, taken off them in full as the review does, leaves some.
function expenseLines(review: MortgageReview): readonly ExpenseLine[] {
  const lenderLeft = review.totals.statute.principal > 0;
  return review.expenses.items.flatMap((item) =>
    item.basis === 'statute' &&
    (item.amount ?? 0) > 0 &&
    (item.status === 'not_chargeable' || (item.status === 'lender_bears' && lenderLeft))
      ? [{ item, amount: item.amount ?? 0 }]
      : [],
  );
}

function feeLines(review: MortgageReview): readonly FeeLine[] {
  return review.fees.flatMap((item) => {
    const findings = feeFindings(item);
    const amounts = findings.map((f) => (f.status === 'above_cap' ? (f.amount ?? 0) : 0));
    const least = Math.min(...amounts);
    const finding = findings[amounts.indexOf(least)];
    if (finding === undefined || least <= 0) return [];
    return [{ finding, amount: least, lowest: Math.max(...amounts) > least }];
  });
}

// The items of the review that rest on a law and carry euros. A case-law item never reaches it.
export function amountLines(r: CompletedMortgageReview): AmountLines {
  return {
    expenses: expenseLines(r.review),
    fees: feeLines(r.review),
    returned: r.input.alreadyReturned ?? 0,
    lenderLeft: r.review.totals.statute.principal,
  };
}

const hasAmounts = (lines: AmountLines): boolean =>
  lines.expenses.length > 0 || lines.fees.length > 0;

export interface MortgageLetterKinds {
  // The amounts letter, with figures, which the pass pays for.
  readonly paid: readonly LetterKind[];
  // The request for the mortgage's documents, which only asks for them.
  readonly free: readonly LetterKind[];
}

// A mortgage the review covers can always ask for its documents, even with no invoice at hand; the
// amounts letter needs some item a law settles with euros.
export const mortgageLetterKinds = (r: CompletedMortgageReview): MortgageLetterKinds =>
  r.review.scope.inScope
    ? {
        paid: hasAmounts(amountLines(r)) ? ['mortgage_amounts'] : [],
        free: ['mortgage_documents'],
      }
    : { paid: [], free: [] };

function header(title: string, details: LetterDetails, tr: Translate): Block[] {
  return [
    { type: 'title', text: title },
    detailLine(tr('client.documents.letter.name'), details.name),
    detailLine(tr('client.documents.letter.id'), details.id),
    detailLine(tr('client.mortgage.letter.bank'), details.company),
    detailLine(tr('client.mortgage.letter.reference'), details.reference),
  ];
}

function closing(details: LetterDetails, tr: Translate): Block[] {
  return [
    { type: 'text', text: tr('client.mortgage.letter.regards') },
    placeAndDate(details, tr),
    detailLine(tr('client.documents.letter.name'), details.name),
  ];
}

const opening = (input: MortgageInput, tr: Translate): Block => ({
  type: 'text',
  text: tr('client.mortgage.letter.about', { fecha: day(input.deedOn) }),
});

const DOCUMENTS = [
  'client.mortgage.letter.documents.deed',
  'client.mortgage.letter.documents.invoices',
  'client.mortgage.letter.documents.tax',
  'client.mortgage.letter.documents.fein',
  'client.mortgage.letter.documents.prepayment',
] as const;

// Asks the bank for a copy of the deed and of what was paid and handed over around it. It cites no
// norm: it only asks.
export function documentsLetter(
  { input }: CompletedMortgageReview,
  details: LetterDetails,
  tr: Translate,
): DocumentModel {
  const title = tr('client.mortgage.letter.documents.title');
  return {
    title,
    footer: null,
    blocks: [
      ...header(title, details, tr),
      opening(input, tr),
      { type: 'text', text: tr('client.mortgage.letter.documents.ask') },
      ...DOCUMENTS.map((key): Block => ({ type: 'bullet', text: tr(key) })),
      { type: 'text', text: tr('client.mortgage.letter.documents.missing') },
      { type: 'text', text: tr('client.mortgage.letter.documents.reply') },
      ...closing(details, tr),
    ],
  };
}

const sourceBlocks = (sources: readonly MortgageSource[]): Block[] =>
  sources
    .filter((s, i) => sources.findIndex((o) => o.id === s.id) === i)
    .map((s) => ({ type: 'source', text: s.citation, url: s.url }));

function expenseBlocks({ item, amount }: ExpenseLine, tr: Translate): Block[] {
  const vars = { gasto: tr(`client.mortgage.invoice.${item.kind}`), importe: formatEuros(amount) };
  return [
    {
      type: 'text',
      text: tr(
        item.status === 'not_chargeable'
          ? 'client.mortgage.letter.amounts.not_chargeable'
          : 'client.mortgage.letter.amounts.expense',
        vars,
      ),
    },
    ...sourceBlocks(item.sources),
  ];
}

function feeBlocks({ finding, amount, lowest }: FeeLine, input: MortgageInput, tr: Translate) {
  const operation = input.operations[finding.index];
  if (operation === undefined) return [];
  return [
    {
      type: 'text',
      text: tr('client.mortgage.letter.amounts.fee', {
        operacion: tr(`client.mortgage.operation.${finding.kind}`),
        fecha: day(operation.on),
        cobrado: formatEuros(operation.feeCharged),
        capital: formatEuros(operation.principal),
        tope: formatEuros(finding.cap ?? 0),
        diferencia: formatEuros(amount),
      }),
    } as const,
    ...(lowest
      ? [{ type: 'note', text: tr('client.mortgage.letter.amounts.lowest') } as const]
      : []),
    ...sourceBlocks(finding.sources),
  ] satisfies Block[];
}

// Asks the bank to look again at the set-up costs a law puts on it and the fees over their caps,
// each with the norm and the euros. Nothing that rests on a court's criterion is in it.
export function amountsLetter(
  r: CompletedMortgageReview,
  details: LetterDetails,
  tr: Translate,
): DocumentModel {
  const title = tr('client.mortgage.letter.amounts.title');
  const lines = amountLines(r);
  const returned: Block[] =
    lines.lenderLeft > 0 && lines.returned > 0
      ? [
          {
            type: 'text',
            text: tr('client.mortgage.letter.amounts.returned', {
              importe: formatEuros(lines.returned),
              resto: formatEuros(lines.lenderLeft),
            }),
          },
        ]
      : [];
  return {
    title,
    footer: null,
    blocks: [
      ...header(title, details, tr),
      opening(r.input, tr),
      ...(hasAmounts(lines)
        ? [
            { type: 'text', text: tr('client.mortgage.letter.amounts.intro') } as const,
            ...lines.expenses.flatMap((l) => expenseBlocks(l, tr)),
            ...returned,
            ...lines.fees.flatMap((l) => feeBlocks(l, r.input, tr)),
            { type: 'text', text: tr('client.mortgage.letter.amounts.ask') } as const,
          ]
        : []),
      ...closing(details, tr),
    ],
  };
}
