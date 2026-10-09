import type { CivilDate } from '../engine/date';
import type { AprDetail } from '../engine/credit/tae-check';
import { findingsOf, type CreditFinding, type CreditItem } from '../engine/credit/finding';
import type { Indicator } from '../engine/credit/indicator';
import type { NormStatus } from '../engine/credit/norms';
import { scopePhrases } from '../engine/credit/scope';
import type { CreditInput } from '../engine/credit/types';
import type { LawSource, NormSource } from '../engine/law/sources';
import { formatEuros, formatInteger } from '../calculator/number';
import { longDate } from '../documents/letter';
import type { Block, DocumentModel } from '../documents/ports';
import type { Translate } from '../i18n/client';
import type { CompletedCreditReview } from './ports';
import {
  calculationLines,
  civilDayText as day,
  dayText,
  indicatorStatusText,
  lawSourceText,
  normStatusText,
  percentText,
  phraseText,
  readingTitle,
  statusText,
} from './render';

const row = (label: string, value: string): Block => ({ type: 'row', label, value });

const answer = (v: boolean | null, tr: Translate) =>
  tr(
    v === null
      ? 'client.credit.answer.unknown'
      : v
        ? 'client.credit.answer.yes'
        : 'client.credit.answer.no',
  );

const optional = (n: number | null, show: (n: number) => string, tr: Translate) =>
  n === null ? tr('client.credit.report.no_figure') : show(n);

// What the person confirmed, as the review read it.
function dataRows(input: CreditInput, tr: Translate): Block[] {
  const revolving = input.product === 'revolving';
  const plan = input.instalments;
  const repayment = input.earlyRepayment;
  return [
    row(tr('client.credit.report.product'), tr(`client.credit.report.product.${input.product}`)),
    row(tr('client.credit.report.agreed'), day(input.agreedOn)),
    row(tr('client.credit.report.drawn'), day(input.drawnOn)),
    row(
      tr(revolving ? 'client.credit.report.limit' : 'client.credit.report.principal'),
      formatEuros(input.principal),
    ),
    ...(revolving
      ? []
      : [row(tr('client.credit.report.net'), optional(input.netDisbursed, formatEuros, tr))]),
    row(tr('client.credit.report.nominal_rate'), percentText(input.nominalRate)),
    row(tr('client.credit.report.rate_type'), tr(`client.credit.report.rate.${input.rateType}`)),
    row(tr('client.credit.report.declared_apr'), optional(input.declaredApr, percentText, tr)),
    row(
      tr('client.credit.report.declared_total'),
      optional(input.declaredTotalPayable, formatEuros, tr),
    ),
    ...(plan === null
      ? []
      : [
          row(
            tr('client.credit.report.instalments'),
            plan.kind === 'regular'
              ? tr('client.credit.report.instalments_regular', {
                  n: formatInteger(plan.count),
                  importe: formatEuros(plan.amount),
                  fecha: day(plan.firstDueOn),
                })
              : tr('client.credit.report.instalments_schedule', {
                  n: formatInteger(plan.rows.length),
                }),
          ),
        ]),
    ...(input.balloon === null
      ? []
      : [
          row(
            tr('client.credit.report.balloon'),
            input.balloon.dueOn === null
              ? formatEuros(input.balloon.amount)
              : tr('client.credit.report.balloon_on', {
                  importe: formatEuros(input.balloon.amount),
                  fecha: day(input.balloon.dueOn),
                }),
          ),
        ]),
    ...input.charges.map((c) =>
      row(
        tr(`client.credit.report.charge.${c.kind}`),
        tr(`client.credit.report.charge_how.${c.how}`, { importe: formatEuros(c.amount) }),
      ),
    ),
    ...(input.insurance === null
      ? []
      : [
          row(
            tr('client.credit.report.insurance'),
            tr(
              input.insurance.single
                ? 'client.credit.report.insurance_single'
                : 'client.credit.report.insurance_periodic',
              { importe: formatEuros(input.insurance.premium) },
            ),
          ),
          row(tr('client.credit.report.insurance_required'), answer(input.insurance.required, tr)),
        ]),
    ...(input.card === null
      ? []
      : [
          row(tr('client.credit.report.balance'), formatEuros(input.card.balance)),
          row(tr('client.credit.report.payment'), formatEuros(input.card.minimumPayment)),
          row(tr('client.credit.report.annual_fee'), formatEuros(input.card.annualFee)),
        ]),
    ...(repayment === null
      ? []
      : [
          row(tr('client.credit.report.repaid_on'), day(repayment.on)),
          row(tr('client.credit.report.repaid'), formatEuros(repayment.principalRepaid)),
          row(tr('client.credit.report.compensation'), formatEuros(repayment.compensationCharged)),
          row(tr('client.credit.report.agreed_end'), day(repayment.agreedEndOn)),
        ]),
  ];
}

// The flows the APR equation is solved on, each with its time in years: what is received counts
// positive and what is paid negative.
function flowBlocks(detail: AprDetail, tr: Translate): Block[] {
  const years = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
  return [
    { type: 'text', text: tr(`client.credit.report.flows.${detail.basis}`) },
    ...detail.flows.map((f) =>
      row(
        tr('client.credit.report.flow', { fecha: dayText(f.on), t: years.format(f.years) }),
        formatEuros(f.amount),
      ),
    ),
    {
      type: 'note',
      text: tr('client.credit.report.flows_solved', { tae: percentText(detail.apr) }),
    },
  ];
}

function findingBlocks(f: CreditFinding, title: string | null, tr: Translate): Block[] {
  return [
    ...(title === null ? [] : [{ type: 'text', text: title } as const]),
    { type: 'text', text: statusText(f, tr) },
    ...calculationLines(f.calculation, tr).map((text): Block => ({ type: 'bullet', text })),
    ...(f.detail === null ? [] : flowBlocks(f.detail, tr)),
  ];
}

const normBlock = (s: NormSource<NormStatus>, tr: Translate): Block => ({
  type: 'source',
  text: `${s.citation} · ${normStatusText(s, tr)}`,
  url: s.url,
});

const lawBlock = (s: LawSource, tr: Translate): Block => ({
  type: 'source',
  text: `${s.citation} · ${lawSourceText(s, tr)}`,
  url: s.url,
});

function itemBlocks(item: CreditItem, tr: Translate): Block[] {
  const findings = findingsOf(item);
  const [first] = findings;
  if (first === undefined) return [];
  const sources = findings
    .flatMap((f) => f.sources)
    .filter((s, i, all) => all.findIndex((o) => o.id === s.id) === i);
  return [
    { type: 'subheading', text: tr(`client.credit.item.${first.id}`) },
    { type: 'note', text: tr('client.credit.report.how') },
    ...(item.kind === 'single'
      ? findingBlocks(item.finding, null, tr)
      : [
          { type: 'text', text: tr(`client.credit.depends.${item.question}`) } as const,
          ...item.readings.flatMap((r) => findingBlocks(r.finding, readingTitle(r.when, tr), tr)),
        ]),
    ...sources.map((s) => normBlock(s, tr)),
  ];
}

const indicatorBlocks = (indicator: Indicator, tr: Translate): Block[] => [
  { type: 'subheading', text: tr('client.credit.item.indicator') },
  { type: 'text', text: indicatorStatusText(indicator, tr) },
  ...calculationLines(indicator.calculation, tr).map((text): Block => ({ type: 'bullet', text })),
  ...indicator.sources.map((s) => lawBlock(s, tr)),
];

// The euros counted over a cap, when there are any: the lowest reading, and how far the others go.
// Over the general cap, the lender may still show a greater loss (art. 30.4).
function summaryBlocks({ review }: CompletedCreditReview, tr: Translate): Block[] {
  const { counted, upTo } = review.totals.overCharged;
  if (upTo === 0) return [{ type: 'text', text: tr('client.credit.report.summary_none') }];
  const losses: Block[] = review.items
    .flatMap(findingsOf)
    .some((f) => f.status === 'above_general_cap')
    ? [{ type: 'note', text: tr('client.credit.calculation.early_repayment.losses') }]
    : [];
  if (counted === 0)
    return [
      {
        type: 'text',
        text: tr('client.credit.report.summary_doubtful', { maximo: formatEuros(upTo) }),
      },
      ...losses,
    ];
  return [
    {
      type: 'text',
      text:
        upTo > counted
          ? tr('client.credit.report.summary_up_to', {
              importe: formatEuros(counted),
              maximo: formatEuros(upTo),
            })
          : tr('client.credit.report.summary', { importe: formatEuros(counted) }),
    },
    ...losses,
  ];
}

// Every norm the items and the information rest on, once, with how it stands today.
function norms(r: CompletedCreditReview): NormSource<NormStatus>[] {
  const all = [
    ...r.review.items.flatMap((i) => findingsOf(i).flatMap((f) => f.sources)),
    ...r.review.information.flatMap((b) => b.sources),
  ];
  return all.filter((s, i) => all.findIndex((o) => o.citation === s.citation) === i);
}

// The whole review, item by item with every reading, the flows its APR is solved on, the
// indicator against the average rate, and the norms and rulings it rests on, as the person
// confirmed it, dated the day it is made.
export function creditReport(
  r: CompletedCreditReview,
  tr: Translate,
  today: CivilDate,
): DocumentModel {
  const { review, input } = r;
  const scopeNote = scopePhrases(review.scope).map((p) => phraseText(p, tr));
  return {
    title: tr('client.credit.report.title'),
    footer: tr('client.credit.report.footer', { fecha: longDate(today) }),
    blocks: [
      { type: 'title', text: tr('client.credit.report.title') },
      { type: 'meta', text: tr('client.documents.report.generated', { fecha: longDate(today) }) },
      { type: 'rule' },
      { type: 'text', text: tr('client.credit.report.intro') },
      ...scopeNote.map((text): Block => ({ type: 'note', text })),
      { type: 'heading', text: tr('client.credit.report.your_data') },
      ...dataRows(input, tr),
      { type: 'heading', text: tr('client.credit.report.summary_title') },
      ...summaryBlocks(r, tr),
      { type: 'heading', text: tr('client.credit.report.items') },
      ...review.items.flatMap((item) => itemBlocks(item, tr)),
      ...(review.indicator === null ? [] : indicatorBlocks(review.indicator, tr)),
      { type: 'heading', text: tr('client.credit.report.norms') },
      ...norms(r).map((s) => normBlock(s, tr)),
      ...(review.information.length > 0
        ? [{ type: 'heading', text: tr('client.credit.report.information') } as const]
        : []),
      ...review.information.flatMap((b): Block[] => [
        { type: 'subheading', text: tr(`client.credit.info.${b.id}`) },
        { type: 'text', text: calculationLines(b.calculation, tr).join(' ') },
        ...b.sources.map((s): Block => ({ type: 'source', text: s.citation, url: s.url })),
      ]),
      { type: 'heading', text: tr('client.credit.report.unchecked') },
      ...review.unchecked.map((c): Block => ({
        type: 'bullet',
        text: tr(`client.credit.unchecked.${c}`),
      })),
      { type: 'heading', text: tr('client.credit.report.channels') },
      { type: 'text', text: tr('client.credit.report.channels_text') },
    ],
  };
}
