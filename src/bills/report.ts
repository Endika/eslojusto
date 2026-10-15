import { formatCalculationEuros, formatWholeEuros } from '../calculator/number';
import { longDate } from '../documents/letter';
import type { Block, DocumentModel } from '../documents/ports';
import type { CivilDate } from '../engine/date';
import {
  findingsOf,
  type BillFinding,
  type BillItem,
  type BillTotals,
} from '../engine/bills/finding';
import type { NormStatus, NormTable } from '../engine/bills/norms';
import type { NormSource } from '../engine/law/sources';
import type { ClientKey, Translate } from '../i18n/client';
import {
  calculationLines,
  readingText,
  rowText,
  sourceText,
  statusText,
  type ItemLabels,
} from './result';

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
  // The norms the reviews read, for the table rows their figures rest on.
  readonly norms: NormTable;
  // What a section adds after the reviews, such as the electricity bills' official figures.
  readonly extra?: readonly Block[];
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

const bullets = (f: BillFinding, tr: Translate): Block[] =>
  calculationLines(f.calculation, tr).map((text): Block => ({ type: 'bullet', text }));

const sourceBlock = (s: NormSource<NormStatus>, tr: Translate): Block => ({
  type: 'source',
  text: `${s.citation} · ${sourceText(s, tr)}`,
  url: s.url,
});

// A line's verdict and calculation, every reading when the norms leave it open, then each rule it
// rests on with how its norm stands and each table row its official figure comes from.
function itemBlocks(
  item: BillItem,
  labels: ReportedReview['labels'],
  norms: NormTable,
  tr: Translate,
): Block[] {
  const findings = findingsOf(item);
  const [first] = findings;
  if (first === undefined) return [];
  const sources = findings
    .flatMap((f) => f.sources)
    .filter((s, i, all) => all.findIndex((o) => o.id === s.id) === i);
  const rows = findings
    .flatMap((f) => f.rows)
    .filter((r, i, all) => all.findIndex((o) => o.norm === r.norm && o.from === r.from) === i);
  return [
    ...(item.kind === 'single'
      ? [row(labels.title(first), statusText(first, tr)), ...bullets(first, tr)]
      : [
          row(labels.title(first), tr('client.bills.status.depends')),
          { type: 'note', text: tr(`client.bills.depends.${item.question}`) } as const,
          ...item.readings.flatMap((r): Block[] => [
            { type: 'text', text: `${readingText(r.when, tr)}: ${statusText(r.finding, tr)}` },
            ...bullets(r.finding, tr),
          ]),
        ]),
    ...sources.map((s) => sourceBlock(s, tr)),
    ...rows.map((r): Block => ({
      type: 'source',
      text: tr('client.bills.report.row', {
        norma: norms[r.norm].citation,
        estado: rowText(r, norms, tr),
      }),
      url: r.url,
    })),
  ];
}

function reviewBlocks(r: ReportedReview, norms: NormTable, tr: Translate): Block[] {
  if (r.skipped !== undefined)
    return [
      { type: 'subheading', text: r.heading },
      { type: 'note', text: r.skipped },
    ];
  return [
    { type: 'subheading', text: r.heading },
    ...r.items.flatMap((item) => itemBlocks(item, r.labels, norms, tr)),
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

// Every review kept, line by line with its verdict, its calculation, its readings, the rules and
// table rows it rests on and how each norm stands; what each adds up to and, for a year of bills,
// what they add up to together, with what is charged short and the yearly estimate apart and never
// in a total.
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
      ...report.reviews.flatMap((r) => reviewBlocks(r, report.norms, tr)),
      ...(report.extra ?? []),
    ],
  };
}
