import type { ItemResult } from '../engine/compare';
import { toIso, type CivilDate } from '../engine/date';
import type { Range } from '../engine/money';
import type { BenefitEstimate } from '../engine/unemployment';
import type { Item } from '../engine/types';
import { calculationText } from '../calculator/calculation';
import { formatDays, formatEuros, formatInteger, formatWholeEuros } from '../calculator/number';
import type { CompletedReview } from '../calculator/ports';
import {
  durationKey,
  qualifyingText,
  sourceDate,
  statusText,
  withHolidayNote,
} from '../calculator/render';
import type { Translate } from '../i18n/client';

// What a PDF says, block by block, before any layout: the report and the letter are built from
// the review the person confirmed and the page's dictionary, never from anything else.
export type Block =
  | { readonly type: 'title'; readonly text: string }
  | { readonly type: 'meta'; readonly text: string }
  | { readonly type: 'heading'; readonly text: string }
  | { readonly type: 'subheading'; readonly text: string }
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'note'; readonly text: string }
  | { readonly type: 'row'; readonly label: string; readonly value: string }
  | { readonly type: 'bullet'; readonly text: string }
  | { readonly type: 'source'; readonly text: string; readonly url: string }
  | { readonly type: 'blank'; readonly label: string }
  | { readonly type: 'rule' };

export interface DocumentModel {
  readonly title: string;
  readonly footer: string | null;
  readonly blocks: readonly Block[];
}

// «2026-10-07» → «07-10-2026», as the site writes dates.
const shortDate = (d: CivilDate) => sourceDate(toIso(d));

export const longDate = (d: CivilDate) =>
  new Date(d.y, d.m - 1, d.d).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

function rangeText(item: Item, tr: Translate): string {
  const { range } = item;
  if (range === null)
    return tr(item.missingAnswer === 'days_taken' ? 'client.range.days' : 'client.range.agreement');
  if (item.direction === 'deduction') return formatEuros(range.max);
  if (range.min === range.max) return formatEuros(range.min);
  return tr('client.range.between', {
    minimo: formatEuros(range.min),
    maximo: formatEuros(range.max),
  });
}

function approximate(r: Range, tr: Translate): string {
  const min = Math.round(r.min);
  const max = Math.round(r.max);
  return min === max
    ? tr('client.unemployment.about', { importe: formatWholeEuros(min) })
    : tr('client.range.between', { minimo: formatWholeEuros(min), maximo: formatWholeEuros(max) });
}

function sources(list: Item['sources'], tr: Translate): Block[] {
  return list.map((s) => ({
    type: 'source',
    text: `${s.citation} · ${tr('client.source.in_force', { fecha: sourceDate(s.inForceSince) })}`,
    url: s.url,
  }));
}

function itemBlocks(r: ItemResult, reference: number | null, tr: Translate): Block[] {
  const { item } = r;
  const deduction = item.direction === 'deduction';
  return [
    { type: 'subheading', text: tr(`client.item.${item.id}`) },
    {
      type: 'row',
      label: tr('client.documents.report.employer'),
      value: r.employerFigure === null ? tr('client.no_figure') : formatEuros(r.employerFigure),
    },
    {
      type: 'row',
      label: tr(deduction ? 'client.range.maximum_deduction' : 'client.range.minimum'),
      value: rangeText(item, tr),
    },
    { type: 'text', text: statusText(r, tr, reference) },
    ...(item.dependsOnAgreement && item.range !== null
      ? [{ type: 'note', text: tr('client.agreement_may_improve') } as const]
      : []),
    ...(item.id === 'severance' && reference !== null && r.employerFigure !== null
      ? [
          {
            type: 'note',
            text: tr('client.unfair_reference', { importe: formatEuros(reference) }),
          } as const,
        ]
      : []),
    {
      type: 'note',
      text: `${tr('client.documents.report.how')}: ${calculationText(item.calculation, tr)}`,
    },
    ...sources(item.sources, tr),
  ];
}

function benefitBlocks(
  p: BenefitEstimate,
  cause: CompletedReview['input']['cause'],
  tr: Translate,
) {
  const blocks: Block[] = [
    { type: 'heading', text: tr('client.documents.report.benefit') },
    {
      type: 'text',
      text: tr(
        p.entitled === 'yes' ? 'client.unemployment.status.yes' : 'client.unemployment.status.no',
      ),
    },
    { type: 'note', text: tr(`client.unemployment.reason.${cause}`) },
  ];
  if (p.entitled === 'yes') {
    if (p.figures === null)
      blocks.push({
        type: 'text',
        text: tr(
          p.noFigures === 'base_below_minimum'
            ? 'client.unemployment.no_figures_base'
            : 'client.unemployment.no_figures',
        ),
      });
    else {
      const twoStretches = p.secondStretch || p.duration.days === 0;
      blocks.push(
        {
          type: 'text',
          text: tr(
            twoStretches ? 'client.unemployment.amount.two' : 'client.unemployment.amount.one',
            {
              tramo1: approximate(p.figures.firstStretch, tr),
              tramo2: approximate(p.figures.secondStretch, tr),
            },
          ),
        },
        {
          type: 'note',
          text: tr('client.unemployment.deduction', {
            ss: formatWholeEuros(Math.round(p.figures.contribution.min)),
          }),
        },
      );
    }
    const { duration } = p;
    blocks.push({
      type: 'text',
      text: tr(durationKey(duration), {
        dias: formatInteger(duration.days),
        meses: formatInteger(duration.days / 30),
      }),
    });
    if (withHolidayNote(duration))
      blocks.push({ type: 'note', text: tr('client.unemployment.duration.holiday_note') });
    blocks.push({ type: 'note', text: qualifyingText(p, tr) });
  }
  return [...blocks, ...sources(p.sources, tr)];
}

function dataRows({ input: e }: CompletedReview, tr: Translate): Block[] {
  const cause =
    tr(`client.documents.report.cause.${e.cause}`) +
    (e.cause === 'fixed_term_end' && e.fixedTermType
      ? ` (${tr(`client.documents.report.fixed_term.${e.fixedTermType}`)})`
      : '');
  const extraPay = e.extraPayProrated
    ? tr('client.documents.report.extra_pay_prorated')
    : tr('client.documents.report.extra_pay_apart', {
        n: formatInteger(e.extraPayCount),
        importe: formatEuros(e.extraPayAmount),
      });
  const holidays =
    e.holidayDaysTaken === null
      ? tr('client.documents.report.holidays_unknown', { anuales: formatDays(e.annualHolidayDays) })
      : tr('client.documents.report.holidays_text', {
          anuales: formatDays(e.annualHolidayDays),
          disfrutados: formatDays(e.holidayDaysTaken),
        });
  const row = (label: string, value: string): Block => ({ type: 'row', label, value });
  return [
    row(tr('client.documents.report.cause'), cause),
    row(tr('client.documents.report.start'), shortDate(e.startDate)),
    row(tr('client.documents.report.end'), shortDate(e.endDate)),
    row(tr('client.documents.report.salary'), formatEuros(e.monthlySalary)),
    row(tr('client.documents.report.extra_pay'), extraPay),
    row(tr('client.documents.report.holidays'), holidays),
  ];
}

export function reportModel(r: CompletedReview, tr: Translate, today: CivilDate): DocumentModel {
  const { review } = r;
  return {
    title: tr('client.documents.report.title'),
    footer: tr('client.documents.report.footer', { fecha: longDate(today) }),
    blocks: [
      { type: 'title', text: tr('client.documents.report.title') },
      { type: 'meta', text: tr('client.documents.report.generated', { fecha: longDate(today) }) },
      { type: 'rule' },
      { type: 'text', text: tr('client.documents.report.intro') },
      { type: 'heading', text: tr('client.documents.report.your_data') },
      ...dataRows(r, tr),
      { type: 'heading', text: tr('client.documents.report.items') },
      ...review.items.flatMap((i) => itemBlocks(i, review.unfairReference, tr)),
      { type: 'heading', text: tr('client.documents.report.unchecked') },
      ...review.uncheckedCodes.map((c): Block => ({
        type: 'bullet',
        text: tr(`client.unchecked.${c}`),
      })),
      ...benefitBlocks(r.benefit, r.input.cause, tr),
    ],
  };
}

// The letter lists only what falls short, with the figures of the review; the person fills in
// the rest by hand and decides whether to use it at all.
export function letterModel(r: CompletedReview, tr: Translate): DocumentModel {
  const lines = r.review.items.flatMap((i): Block[] => {
    const partida = tr(`client.item.${i.item.id}`);
    const empresa = formatEuros(i.employerFigure ?? 0);
    const diferencia = formatEuros(i.difference ?? 0);
    if (i.status === 'below_minimum' && i.item.range)
      return [
        {
          type: 'bullet',
          text: tr('client.documents.letter.credit', {
            partida,
            empresa,
            minimo: formatEuros(i.item.range.min),
            diferencia,
          }),
        },
      ];
    if (i.status === 'deduction_too_high' && i.item.range)
      return [
        {
          type: 'bullet',
          text: tr('client.documents.letter.deduction', {
            partida,
            empresa,
            maximo: formatEuros(i.item.range.max),
            diferencia,
          }),
        },
      ];
    return [];
  });
  return {
    title: tr('client.documents.letter.title'),
    footer: null,
    blocks: [
      { type: 'title', text: tr('client.documents.letter.title') },
      { type: 'blank', label: tr('client.documents.letter.name') },
      { type: 'blank', label: tr('client.documents.letter.id') },
      { type: 'blank', label: tr('client.documents.letter.company') },
      {
        type: 'text',
        text: tr('client.documents.letter.body', { fecha: shortDate(r.input.endDate) }),
      },
      ...lines,
      { type: 'text', text: tr('client.documents.letter.closing') },
      { type: 'text', text: tr('client.documents.letter.place_date') },
      { type: 'text', text: tr('client.documents.letter.received') },
      { type: 'blank', label: tr('client.documents.letter.name') },
    ],
  };
}
