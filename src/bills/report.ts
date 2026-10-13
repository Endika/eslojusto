import { formatCalculationEuros, formatWholeEuros } from '../calculator/number';
import { longDate } from '../documents/letter';
import type { Block, DocumentModel } from '../documents/ports';
import type { CivilDate } from '../engine/date';
import { findingsOf, type BillItem, type BillTotals } from '../engine/bills/finding';
import type { ClientKey, Translate } from '../i18n/client';
import { statusText, type ItemLabels } from './result';

// One review the report lists: a bill of the year, or the exit from a contract.
export interface ReportedReview {
  // «Factura del 31-05-2026 al 30-06-2026».
  readonly heading: string;
  readonly items: readonly BillItem[];
  readonly totals: BillTotals;
  readonly labels: Pick<ItemLabels, 'title'>;
  // Why it is listed without counting, as a copy of a bill already listed.
  readonly skipped?: string;
}

// What a year of bills adds up to, and the estimate that stands apart from it.
export interface ReportedYear {
  readonly totals: BillTotals;
  // The items that come back bill after bill, by name.
  readonly recurring: readonly string[];
  readonly yearlyEstimate: number | null;
}

export interface BillsReport {
  readonly title: ClientKey;
  readonly intro: ClientKey;
  readonly reviews: readonly ReportedReview[];
  readonly year: ReportedYear | null;
}

const row = (label: string, value: string): Block => ({ type: 'row', label, value });

function totalsBlocks(totals: BillTotals, tr: Translate): Block[] {
  return [
    row(tr('client.bills.report.counted'), formatCalculationEuros(totals.counted)),
    ...(totals.upTo > totals.counted
      ? [
          {
            type: 'note',
            text: tr('client.bills.total.up_to', { importe: formatCalculationEuros(totals.upTo) }),
          } as const,
        ]
      : []),
    ...(totals.under > 0
      ? [
          {
            type: 'note',
            text: tr('client.bills.total.under', { importe: formatCalculationEuros(totals.under) }),
          } as const,
        ]
      : []),
  ];
}

function reviewBlocks(r: ReportedReview, tr: Translate): Block[] {
  if (r.skipped !== undefined)
    return [
      { type: 'subheading', text: r.heading },
      { type: 'note', text: r.skipped },
    ];
  return [
    { type: 'subheading', text: r.heading },
    ...r.items.flatMap((item) =>
      findingsOf(item).map((f) => row(r.labels.title(f), statusText(f, tr))),
    ),
    ...totalsBlocks(r.totals, tr),
  ];
}

function yearBlocks(year: ReportedYear, tr: Translate): Block[] {
  return [
    { type: 'heading', text: tr('client.bills.report.year') },
    ...totalsBlocks(year.totals, tr),
    ...(year.yearlyEstimate === null
      ? []
      : [
          {
            type: 'note',
            text: tr('client.bills.basket.estimate', {
              partidas: year.recurring.join(', '),
              importe: formatWholeEuros(year.yearlyEstimate),
            }),
          } as const,
        ]),
  ];
}

// Every review kept, line by line with its verdict, what each adds up to and, for a year of bills,
// what they add up to together, with the yearly estimate apart and never in a total.
export function billsReport(report: BillsReport, tr: Translate, today: CivilDate): DocumentModel {
  return {
    title: tr(report.title),
    footer: tr('client.bills.report.footer', { fecha: longDate(today) }),
    blocks: [
      { type: 'title', text: tr(report.title) },
      { type: 'meta', text: tr('client.bills.report.generated', { fecha: longDate(today) }) },
      { type: 'rule' },
      { type: 'text', text: tr(report.intro) },
      ...(report.year === null ? [] : yearBlocks(report.year, tr)),
      { type: 'heading', text: tr('client.bills.report.reviews') },
      ...report.reviews.flatMap((r) => reviewBlocks(r, tr)),
    ],
  };
}
