import { toIso, type CivilDate } from '../engine/date';
import type { ItemReading } from '../engine/rental/item';
import type { IndexFigure, RentUpdateReading } from '../engine/rental/rent-update';
import type { RentalItemResult, RentUpdateItem } from '../engine/rental/review';
import type { RentalSource } from '../engine/rental/rules';
import type { ItemStatus, RentalInput } from '../engine/rental/types';
import { formatEuros, formatInteger } from '../calculator/number';
import { longDate } from '../documents/letter';
import type { Block, DocumentModel } from '../documents/ports';
import type { Translate } from '../i18n/client';
import type { CompletedRentalReview } from './ports';
import {
  calculationLines,
  dayText,
  inForceText,
  informationText,
  itemTitle,
  normStatusText,
  percentText,
  rateText,
  riseFigures,
  reasonsText,
  type Figures,
} from './render';
import { headline, summarise, totalLines, totalShare, type Verdict } from './summary';

const FIGURED: ReadonlySet<ItemStatus> = new Set(['paid_over', 'owed', 'over_cap']);

const row = (label: string, value: string): Block => ({ type: 'row', label, value });

const answer = (v: boolean | null, tr: Translate) =>
  tr(
    v === null
      ? 'client.rental.answer.unknown'
      : v
        ? 'client.rental.answer.yes'
        : 'client.rental.answer.no',
  );

const euros = (n: number | null, tr: Translate) =>
  n === null ? tr('client.rental.report.no_figure') : formatEuros(n);

function clauseText(input: RentalInput, tr: Translate): string {
  return input.updateClause === 'fixed_percent' && input.fixedPercent !== undefined
    ? tr('client.rental.report.clause.fixed_percent', { tasa: percentText(input.fixedPercent) })
    : tr(`client.rental.report.clause.${input.updateClause}`);
}

// What the person confirmed, as the review read it.
function dataRows(input: RentalInput, tr: Translate): Block[] {
  const day = (d: CivilDate) => dayText(toIso(d));
  return [
    row(tr('client.rental.report.signed'), day(input.signedOn)),
    row(tr('client.rental.report.start'), day(input.startDate)),
    row(tr('client.rental.report.landlord'), tr(`client.rental.landlord.${input.landlordType}`)),
    row(tr('client.rental.report.large_landlord'), answer(input.largeLandlord, tr)),
    row(tr('client.rental.report.region'), tr(`client.rental.region.${input.region}`)),
    row(tr('client.rental.report.stressed_zone'), answer(input.stressedZone, tr)),
    row(
      tr('client.rental.report.agreed_months'),
      tr('client.rental.report.months', { meses: formatInteger(input.agreedMonths) }),
    ),
    row(tr('client.rental.report.initial_rent'), formatEuros(input.initialRent)),
    row(tr('client.rental.report.clause'), clauseText(input, tr)),
    row(tr('client.rental.report.deposit'), euros(input.deposit, tr)),
    row(
      tr('client.rental.report.advance'),
      input.advanceMonths === null
        ? tr('client.rental.report.no_figure')
        : formatInteger(input.advanceMonths),
    ),
    ...(input.moveOut
      ? [row(tr('client.rental.report.keys'), day(input.moveOut.keysReturnedOn))]
      : []),
  ];
}

// A reading's result with its exact euros: the report says what the summary rounds.
function verdictText(v: Verdict, tr: Translate): string {
  if (!FIGURED.has(v.status)) return tr(`client.rental.status.${v.status}`);
  if (v.amount === null) return tr('client.rental.status.over_cap_no_amount');
  const status = v.status as 'paid_over' | 'owed' | 'over_cap';
  return tr(`client.rental.status.${status}`, { importe: formatEuros(v.amount) });
}

function readingText(v: Verdict, tr: Translate): string {
  if (v.amount === null || !FIGURED.has(v.status)) return tr(`client.rental.reading.${v.status}`);
  const status = v.status as 'paid_over' | 'owed' | 'over_cap';
  return tr(`client.rental.reading_amount.${status}`, { importe: formatEuros(v.amount) });
}

function statusBlocks(item: RentalItemResult, tr: Translate): Block[] {
  const s = summarise(item);
  if (s.kind === 'single') return [{ type: 'text', text: verdictText(s.verdict, tr) }];
  const blocks: Block[] = [
    {
      type: 'text',
      text: tr('client.rental.depends_status', {
        motivo: reasonsText(s.reasons, tr),
        una: readingText(s.low, tr),
        otra: readingText(s.high, tr),
      }),
    },
  ];
  const share = totalShare(s);
  if (share === 'out') blocks.push({ type: 'note', text: tr('client.rental.share.out') });
  if (share === 'lowest')
    blocks.push({
      type: 'note',
      text: tr('client.rental.share.lowest', { importe: formatEuros(s.counted) }),
    });
  return blocks;
}

function figureRows(figures: Figures, tr: Translate): Block[] {
  return figures.map(([key, value]) =>
    row(tr(key), typeof value === 'number' ? formatEuros(value) : value),
  );
}

// Each reading the item was worked out under: one, or the two the result moves between.
function readingBlocks(item: RentalItemResult, input: RentalInput, tr: Translate): Block[] {
  const titled = item.outcome.kind === 'depends';
  const titles = [tr('client.rental.detail.reading_low'), tr('client.rental.detail.reading_high')];
  const blocks = (
    title: string | undefined,
    figures: Figures,
    calculation: readonly string[],
  ): Block[] => [
    ...(titled && title ? [{ type: 'text', text: title } as const] : []),
    ...figureRows(figures, tr),
    ...calculation.map((text): Block => ({ type: 'bullet', text })),
  ];
  if (item.kind === 'rent_update') {
    const values: readonly RentUpdateReading[] =
      item.outcome.kind === 'single' ? [item.outcome.value] : [item.outcome.low, item.outcome.high];
    return values.flatMap((r, i) =>
      blocks(titles[i], riseFigures(r, item, input, tr), calculationLines(r.calculation, tr)),
    );
  }
  const values: readonly ItemReading[] =
    item.outcome.kind === 'single' ? [item.outcome.value] : [item.outcome.low, item.outcome.high];
  return values.flatMap((r, i) => blocks(titles[i], [], calculationLines(r.calculation, tr)));
}

const sourceBlock = (s: RentalSource, tr: Translate): Block => ({
  type: 'source',
  text: `${s.citation} · ${inForceText(s, tr)}`,
  url: s.url,
});

function itemBlocks(item: RentalItemResult, input: RentalInput, tr: Translate): Block[] {
  return [
    { type: 'subheading', text: itemTitle(item, input, tr) },
    ...statusBlocks(item, tr),
    ...(item.kind === 'rent_update' && item.companyLandlordHint
      ? [{ type: 'note', text: tr('client.rental.hint.company_landlord') } as const]
      : []),
    { type: 'note', text: tr('client.rental.report.how') },
    ...readingBlocks(item, input, tr),
    ...item.sources.map((s) => sourceBlock(s, tr)),
  ];
}

// Every index figure a rise was compared with, once, with its month and publication day.
function indexFigures(items: readonly RentalItemResult[]): IndexFigure[] {
  const figures = new Map<string, IndexFigure>();
  for (const item of items.filter((i): i is RentUpdateItem => i.kind === 'rent_update')) {
    const values =
      item.outcome.kind === 'single'
        ? [item.outcome.value]
        : item.outcome.readings.map((r) => r.value);
    for (const r of values)
      for (const rate of [r.agreed, r.cap?.rate])
        if (rate?.kind === 'index')
          figures.set(
            `${rate.figure.index}:${rate.figure.month}:${rate.figure.flash}`,
            rate.figure,
          );
  }
  return [...figures.values()].sort(
    (a, b) => a.month.localeCompare(b.month) || a.index.localeCompare(b.index),
  );
}

// Every norm the review rests on, once, with how it stands today.
function norms(r: CompletedRentalReview): RentalSource[] {
  const all = [
    ...r.review.items.flatMap((i) => i.sources),
    ...r.review.information.flatMap((b) => b.sources),
  ];
  return all.filter((s, i) => all.findIndex((o) => o.citation === s.citation) === i);
}

function totalBlocks(r: CompletedRentalReview, tr: Translate): Block[] {
  return [
    { type: 'text', text: tr(`client.rental.headline.${headline(r.review)}`) },
    ...totalLines(r.review).map(({ kind, total }): Block => {
      const text =
        total.counted === 0
          ? tr(`client.rental.total.${kind}_doubtful`, { maximo: formatEuros(total.upTo) })
          : total.upTo > total.counted
            ? tr(`client.rental.total.${kind}_up_to`, {
                importe: formatEuros(total.counted),
                maximo: formatEuros(total.upTo),
              })
            : tr(`client.rental.total.${kind}`, { importe: formatEuros(total.counted) });
      return { type: 'bullet', text };
    }),
  ];
}

// The whole review, item by item with every reading, its calculation and the norms it rests on,
// as the person confirmed it, dated the day it is made.
export function rentalReport(
  r: CompletedRentalReview,
  tr: Translate,
  today: CivilDate,
): DocumentModel {
  const { review, input } = r;
  const indices = indexFigures(review.items);
  return {
    title: tr('client.rental.report.title'),
    footer: tr('client.rental.report.footer', { fecha: longDate(today) }),
    blocks: [
      { type: 'title', text: tr('client.rental.report.title') },
      { type: 'meta', text: tr('client.documents.report.generated', { fecha: longDate(today) }) },
      { type: 'rule' },
      { type: 'text', text: tr('client.rental.report.intro') },
      { type: 'heading', text: tr('client.rental.report.your_data') },
      ...dataRows(input, tr),
      { type: 'heading', text: tr('client.rental.report.summary') },
      ...totalBlocks(r, tr),
      { type: 'heading', text: tr('client.rental.report.items') },
      ...review.items.flatMap((item) => itemBlocks(item, input, tr)),
      ...(indices.length > 0
        ? [
            { type: 'heading', text: tr('client.rental.report.indices') } as const,
            ...indices.map((figure): Block => ({
              type: 'bullet',
              text: rateText({ kind: 'index', figure }, tr),
            })),
          ]
        : []),
      { type: 'heading', text: tr('client.rental.report.norms') },
      ...norms(r).map((s): Block => ({
        type: 'source',
        text: `${s.citation} · ${normStatusText(s, tr)}`,
        url: s.url,
      })),
      ...(review.information.length > 0
        ? [{ type: 'heading', text: tr('client.rental.report.information') } as const]
        : []),
      ...review.information.flatMap((b): Block[] => {
        const info = informationText(b, tr);
        return [
          { type: 'subheading', text: info.title },
          { type: 'text', text: info.text },
          ...info.links.map((l): Block => ({ type: 'source', text: l.text, url: l.url })),
        ];
      }),
      { type: 'heading', text: tr('client.rental.report.unchecked') },
      ...review.unchecked.map((c): Block => ({
        type: 'bullet',
        text: tr(`client.rental.unchecked.${c}`),
      })),
    ],
  };
}
