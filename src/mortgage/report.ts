import { formatCalculationEuros, formatEuros, formatInteger } from '../calculator/number';
import { dayText } from '../calculator/review-result';
import { addDays, parseDate, toIso, type CivilDate } from '../engine/date';
import { interestByYear, type LegalInterestTable } from '../engine/law/interest';
import type { ExpenseItem, MortgageSource } from '../engine/mortgage/expenses';
import { feeFindings, type FeeFinding, type FeeItem } from '../engine/mortgage/fees';
import type { ClauseFlag } from '../engine/mortgage/flags';
import type { InformationBlock } from '../engine/mortgage/information';
import type { MortgageInput } from '../engine/mortgage/types';
import { round2 } from '../engine/money';
import { longDate } from '../documents/letter';
import type { Block, DocumentModel } from '../documents/ports';
import type { ClientKey, Translate } from '../i18n/client';
import type { CompletedMortgageReview } from './ports';
import {
  calculationLines,
  expenseStatusText,
  feeStatusText,
  partTitle,
  percentText,
  readingTitle,
  sourceText,
} from './render';

const day = (d: CivilDate): string => dayText(toIso(d));

const row = (label: string, value: string): Block => ({ type: 'row', label, value });

const bullets = (lines: readonly string[]): Block[] =>
  lines.map((text): Block => ({ type: 'bullet', text }));

const answer = (v: boolean | null, tr: Translate) =>
  tr(
    v === null
      ? 'client.mortgage.answer.unknown'
      : v
        ? 'client.mortgage.answer.yes'
        : 'client.mortgage.answer.no',
  );

const PAID_BY: Record<MortgageInput['invoices'][number]['paidBy'], ClientKey> = {
  me: 'client.mortgage.report.paid_by.me',
  bank: 'client.mortgage.report.paid_by.bank',
  unknown: 'client.mortgage.report.paid_by.unknown',
};

// What the person confirmed, as the review read it.
function dataRows(input: MortgageInput, flags: readonly ClauseFlag[], tr: Translate): Block[] {
  const paidOn = input.invoices.find((i) => i.paidOn !== null)?.paidOn ?? null;
  return [
    row(tr('client.mortgage.report.deed_on'), day(input.deedOn)),
    ...(input.loanAmount === null
      ? []
      : [row(tr('client.mortgage.report.loan_amount'), formatEuros(input.loanAmount))]),
    row(tr('client.mortgage.report.consumer'), answer(input.consumer, tr)),
    row(
      tr('client.mortgage.report.rate_type'),
      tr(`client.mortgage.report.rate.${input.rateType}`),
    ),
    ...(input.rateRevisionMonths === null
      ? []
      : [
          row(
            tr('client.mortgage.report.revision'),
            tr('client.mortgage.report.revision_months', {
              meses: formatInteger(input.rateRevisionMonths),
            }),
          ),
        ]),
    row(
      tr('client.mortgage.report.expenses_clause'),
      tr(`client.mortgage.report.expenses_clause.${input.expensesClause}`),
    ),
    ...input.invoices.map((i) =>
      row(
        tr(`client.mortgage.invoice.${i.kind}`),
        i.total === null
          ? tr('client.mortgage.report.no_figure')
          : tr(
              i.mixed ? 'client.mortgage.report.invoice_mixed' : 'client.mortgage.report.invoice',
              {
                importe: formatEuros(i.total),
                pagador: tr(PAID_BY[i.paidBy]),
              },
            ),
      ),
    ),
    ...(paidOn === null ? [] : [row(tr('client.mortgage.report.paid_on'), day(paidOn))]),
    ...(input.invoices.length === 0
      ? []
      : [row(tr('client.mortgage.report.agreement'), answer(input.agreementOnExpenses, tr))]),
    ...(input.alreadyReturned === null || input.alreadyReturned === 0
      ? []
      : [row(tr('client.mortgage.report.returned'), formatEuros(input.alreadyReturned))]),
    ...input.operations.map((o) =>
      row(
        tr(`client.mortgage.operation.${o.kind}`),
        tr('client.mortgage.report.operation', {
          fecha: day(o.on),
          capital: formatEuros(o.principal),
          comision: formatEuros(o.feeCharged),
        }),
      ),
    ),
    ...(input.prepaymentOption === null
      ? []
      : [
          row(
            tr('client.mortgage.report.prepayment_option'),
            tr(`client.mortgage.report.prepayment_option.${input.prepaymentOption}`),
          ),
        ]),
    ...flags.map((f) =>
      row(tr(`client.mortgage.clause.${f.label}`), tr(`client.mortgage.flag.${f.state}`)),
    ),
  ];
}

// The three figures, each on its own line: what the law puts on the lender, what the Supreme
// Court's split gives and the fees over their caps. Nothing adds them up.
function summaryBlocks({ review }: CompletedMortgageReview, tr: Translate): Block[] {
  const { totals } = review;
  const items = review.expenses.items;
  const notChargeable = round2(
    items.filter((i) => i.status === 'not_chargeable').reduce((s, i) => s + (i.amount ?? 0), 0),
  );
  const explained = items.some((i) => i.status === 'split_explained');
  const nothing = tr('client.mortgage.total.nothing');
  const interest = totals.caseLaw.interest;
  return [
    row(
      tr('client.mortgage.report.total_statute'),
      totals.statute.principal > 0 ? formatEuros(totals.statute.principal) : nothing,
    ),
    ...(notChargeable > 0
      ? [row(tr('client.mortgage.report.total_not_chargeable'), formatEuros(notChargeable))]
      : []),
    row(
      tr('client.mortgage.report.total_case_law'),
      totals.caseLaw.principal > 0
        ? formatEuros(totals.caseLaw.principal)
        : explained
          ? tr('client.mortgage.total.no_figure_yet')
          : nothing,
    ),
    ...(interest === null || totals.caseLaw.principal === 0
      ? []
      : [
          row(
            tr(
              interest.estimated
                ? 'client.mortgage.report.total_interest_estimated'
                : 'client.mortgage.report.total_interest',
              { fecha: dayText(interest.until) },
            ),
            formatEuros(interest.amount),
          ),
        ]),
    { type: 'note', text: tr('client.mortgage.report.case_law_condition') },
    ...(review.fees.length === 0
      ? []
      : [
          row(
            tr('client.mortgage.report.total_fees'),
            totals.fees.counted > 0 ? formatEuros(totals.fees.counted) : nothing,
          ),
          ...(totals.fees.upTo > totals.fees.counted
            ? [
                {
                  type: 'note',
                  text: tr('client.mortgage.report.fees_up_to', {
                    maximo: formatEuros(totals.fees.upTo),
                  }),
                } as const,
              ]
            : []),
        ]),
    { type: 'text', text: tr('client.mortgage.report.totals_apart') },
    ...bullets(calculationLines(review.expenses.calculation, tr)),
  ];
}

// The legal interest of a case-law item, stretch by stretch: one for each calendar year, two in a
// year whose rate changed partway.
function interestRows(
  item: ExpenseItem,
  input: MortgageInput,
  table: LegalInterestTable,
  tr: Translate,
): Block[] {
  const { interest, amount } = item;
  const invoice = input.invoices[item.index];
  if (interest === null || amount === null || invoice === undefined) return [];
  const from = invoice.paidOn ?? input.deedOn;
  const to = addDays(parseDate(interest.until), 1);
  const segments = interestByYear(amount, from, to, table, 365).segments;
  if (segments.length === 0) return [];
  return [
    { type: 'text', text: tr('client.mortgage.report.interest_by_year') },
    ...segments.map((s) =>
      row(
        tr('client.mortgage.report.interest_year', {
          anio: String(s.from.y),
          dias: formatInteger(s.days),
          tipo: percentText(s.rate),
        }),
        formatCalculationEuros(round2(s.interest)),
      ),
    ),
  ];
}

const sourceBlock = (s: MortgageSource, tr: Translate): Block => ({
  type: 'source',
  text: `${s.citation} · ${sourceText(s, tr)}`,
  url: s.url,
});

const uniqueSources = (sources: readonly MortgageSource[]): MortgageSource[] =>
  sources.filter((s, i) => sources.findIndex((o) => o.id === s.id) === i);

const expenseBlocks = (
  item: ExpenseItem,
  input: MortgageInput,
  table: LegalInterestTable,
  tr: Translate,
): Block[] => [
  { type: 'subheading', text: tr(`client.mortgage.invoice.${item.kind}`) },
  { type: 'text', text: expenseStatusText(item, tr) },
  ...bullets(calculationLines(item.calculation, tr)),
  ...interestRows(item, input, table, tr),
  ...uniqueSources(item.sources).map((s) => sourceBlock(s, tr)),
];

const findingBlocks = (f: FeeFinding, title: string | null, tr: Translate): Block[] => [
  ...(title === null ? [] : [{ type: 'text', text: title } as const]),
  { type: 'text', text: feeStatusText(f, tr) },
  ...bullets(calculationLines(f.calculation, tr)),
];

function feeBlocks(item: FeeItem, tr: Translate): Block[] {
  const findings = feeFindings(item);
  const [first] = findings;
  if (first === undefined) return [];
  return [
    { type: 'subheading', text: tr(`client.mortgage.operation.${first.kind}`) },
    ...(item.kind === 'single'
      ? findingBlocks(item.finding, null, tr)
      : [
          { type: 'text', text: tr(`client.mortgage.depends.${item.question}`) } as const,
          ...item.readings.flatMap((r) =>
            findingBlocks(r.finding, readingTitle(r.when, item.question, tr), tr),
          ),
        ]),
    ...uniqueSources(findings.flatMap((f) => f.sources)).map((s) => sourceBlock(s, tr)),
  ];
}

// A clause with what the law or the courts say of it, a court's criterion with the day its state
// is given as of; never a verdict on the clause.
const flagBlocks = (flag: ClauseFlag, tr: Translate): Block[] => [
  { type: 'subheading', text: tr(`client.mortgage.clause.${flag.label}`) },
  { type: 'text', text: tr(`client.mortgage.flag.${flag.state}`) },
  ...bullets(calculationLines(flag.calculation, tr)),
  ...flag.parts.flatMap((part): Block[] => [
    { type: 'text', text: partTitle(part, tr) },
    ...bullets(calculationLines(part.calculation, tr)),
    ...uniqueSources(part.sources).map((s) => sourceBlock(s, tr)),
  ]),
];

const informationBlocks = (b: InformationBlock, tr: Translate): Block[] => {
  const text = calculationLines(b.calculation, tr).join(' ');
  return [
    { type: 'subheading', text: tr(`client.mortgage.info.${b.id}`) },
    {
      type: 'text',
      text:
        b.statusAsOf === null
          ? text
          : `${text} ${tr('client.mortgage.info.as_of', { fecha: dayText(b.statusAsOf) })}`,
    },
    ...b.sources.map((s): Block => ({ type: 'source', text: s.citation, url: s.url })),
  ];
};

// Every norm and ruling the review rests on, once, with how it stands and the day it was last read.
function allSources({ review }: CompletedMortgageReview): MortgageSource[] {
  return uniqueSources([
    ...review.expenses.items.flatMap((i) => i.sources),
    ...review.fees.flatMap((item) => feeFindings(item).flatMap((f) => f.sources)),
    ...review.flags.flatMap((f) => f.parts.flatMap((p) => p.sources)),
    ...review.information.flatMap((b) => b.sources),
  ]);
}

const section = (heading: string, blocks: readonly Block[]): Block[] =>
  blocks.length === 0 ? [] : [{ type: 'heading', text: heading }, ...blocks];

// The whole review, cost by cost with the legal interest year by year, each fee with every
// reading, each clause with the state of the case law, and the norms and rulings it rests on, as
// the person confirmed it, dated the day it is made. The legal interest table is the one the
// review read.
export function mortgageReport(
  r: CompletedMortgageReview,
  legalInterest: LegalInterestTable,
  tr: Translate,
  today: CivilDate,
): DocumentModel {
  const { review, input } = r;
  return {
    title: tr('client.mortgage.report.title'),
    footer: tr('client.mortgage.report.footer', { fecha: longDate(today) }),
    blocks: [
      { type: 'title', text: tr('client.mortgage.report.title') },
      { type: 'meta', text: tr('client.documents.report.generated', { fecha: longDate(today) }) },
      { type: 'rule' },
      { type: 'text', text: tr('client.mortgage.report.intro') },
      { type: 'heading', text: tr('client.mortgage.report.your_data') },
      ...dataRows(input, review.flags, tr),
      { type: 'heading', text: tr('client.mortgage.report.summary') },
      ...summaryBlocks(r, tr),
      ...section(
        tr('client.mortgage.report.expenses'),
        review.expenses.items.flatMap((item) => expenseBlocks(item, input, legalInterest, tr)),
      ),
      ...section(
        tr('client.mortgage.report.fees'),
        review.fees.flatMap((item) => feeBlocks(item, tr)),
      ),
      ...section(tr('client.mortgage.report.flags'), [
        ...(review.flags.length === 0
          ? []
          : [{ type: 'note', text: tr('client.mortgage.report.flags_note') } as const]),
        ...review.flags.flatMap((flag) => flagBlocks(flag, tr)),
      ]),
      { type: 'heading', text: tr('client.mortgage.report.sources') },
      ...allSources(r).map((s) => sourceBlock(s, tr)),
      ...section(
        tr('client.mortgage.report.information'),
        review.information.flatMap((b) => informationBlocks(b, tr)),
      ),
      { type: 'heading', text: tr('client.mortgage.report.unchecked') },
      ...bullets(review.unchecked.map((c) => tr(`client.mortgage.unchecked.${c}`))),
      { type: 'heading', text: tr('client.mortgage.report.channels') },
      { type: 'text', text: tr('client.mortgage.report.channels_text') },
    ],
  };
}
