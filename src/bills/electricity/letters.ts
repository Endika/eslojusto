import { formatCalculationEuros } from '../../calculator/number';
import {
  detailLine,
  placeAndDate,
  type LetterDetails,
  type LetterKind,
} from '../../documents/letter';
import type { Block, DocumentModel } from '../../documents/ports';
import type { ElectricityReview } from '../../engine/bills/electricity-review';
import {
  countedAmount,
  findingsOf,
  single,
  type BillFinding,
  type BillsItemId,
} from '../../engine/bills/finding';
import type { NormTable } from '../../engine/bills/norms';
import { ruleSource } from '../../engine/bills/rules';
import type { ElectricityBillInput } from '../../engine/bills/types';
import type { Translate } from '../../i18n/client';
import { billHeading, electricityBasket } from './year';
import type { CompletedElectricityReview } from './ports';
import { electricityLabels } from './render';

// What the correction letter may say: only the lines counted over the norm in every reading, with
// the lowest of their figures. Nothing to look at, nothing charged short and nothing that rests on
// a norm not yet settled ever reaches it.

interface CorrectionLine {
  readonly finding: BillFinding;
  // What the bill charges for the line, or the discount it gives; null when the answers do not
  // say it apart.
  readonly billed: number | null;
  // Other readings give more over the norm than this one.
  readonly lowest: boolean;
}

// Lines that are a discount the bill gives rather than a charge.
const DISCOUNTS: ReadonlySet<BillsItemId> = new Set(['social_bonus']);

function billedOf(input: ElectricityBillInput, f: BillFinding): number | null {
  const at = <T>(list: readonly T[]) => (f.line === null ? undefined : list[f.line]);
  const power = (period: 'p1' | 'p2') => {
    const lines = input.power.filter((l) => l.period === period);
    return lines.length === 0 ? null : lines.reduce((sum, l) => sum + l.amount, 0);
  };
  switch (f.id) {
    case 'meter':
      return input.meter?.amount ?? null;
    case 'pvpc_power_p1':
      return power('p1');
    case 'pvpc_power_p2':
      return power('p2');
    case 'social_bonus_funding':
      return input.socialBonusFunding;
    case 'social_bonus':
      return input.socialBonus?.amount ?? null;
    case 'electricity_tax':
      return input.electricityTax?.amount ?? null;
    case 'vat':
      return input.vat?.amount ?? null;
    case 'service':
      return at(input.services)?.amount ?? null;
    case 'exit_penalty':
      return input.exitPenalty?.amount ?? null;
    case 'excess_power':
      return input.excessPower?.amount ?? null;
    default:
      return null;
  }
}

function correctionLines({ input, review }: CompletedElectricityReview): CorrectionLine[] {
  return review.items.flatMap((item) => {
    const least = countedAmount(item);
    if (least <= 0) return [];
    const findings = findingsOf(item);
    const finding = findings.find((f) => countedAmount(single(f)) === least);
    if (finding === undefined) return [];
    return [{ finding, billed: billedOf(input, finding), lowest: findings.length > 1 }];
  });
}

const reviewOf = (e: CompletedElectricityReview): ElectricityReview => e.review;

// The bills of the year the letter speaks of: those that count, a copy only once, each with the
// lines it has over the norm.
export function correctedBills(
  entries: readonly CompletedElectricityReview[],
): { readonly entry: CompletedElectricityReview; readonly lines: readonly CorrectionLine[] }[] {
  const basket = electricityBasket(entries);
  return basket.bills.flatMap((i) => {
    const entry = entries[i];
    if (entry === undefined || !reviewOf(entry).scope.inScope) return [];
    const lines = correctionLines(entry);
    return lines.length === 0 ? [] : [{ entry, lines }];
  });
}

// The correction letter carries figures, so the pass pays for it; it is offered when some bill of
// the year has a line over the norm in every reading.
export const electricityLetterKinds = (
  entries: readonly CompletedElectricityReview[],
): readonly LetterKind[] => (correctedBills(entries).length > 0 ? ['bill_correction'] : []);

function lineText(line: CorrectionLine, title: string, tr: Translate): string {
  const diferencia = formatCalculationEuros(line.finding.amount ?? 0);
  if (line.billed === null)
    return tr('client.bills.letter.correction.line_difference', { linea: title, diferencia });
  const discount = DISCOUNTS.has(line.finding.id);
  const difference = line.finding.amount ?? 0;
  const norm = discount ? line.billed + difference : line.billed - difference;
  return tr(
    discount
      ? 'client.bills.letter.correction.line_discount'
      : 'client.bills.letter.correction.line',
    {
      linea: title,
      facturado: formatCalculationEuros(line.billed),
      norma: formatCalculationEuros(norm),
      diferencia,
    },
  );
}

// Asks the retailer for a corrective invoice of each bill with a line over the norm: each line with
// what was billed, what the norm sets and the lowest difference, what art. 45.2 of the regulation
// says of amounts billed over, and every rule the lines rest on.
export function correctionLetter(
  entries: readonly CompletedElectricityReview[],
  norms: NormTable,
  details: LetterDetails,
  tr: Translate,
): DocumentModel {
  const bills = correctedBills(entries);
  const title = tr(
    bills.length > 1
      ? 'client.bills.letter.correction.title_many'
      : 'client.bills.letter.correction.title_one',
  );
  const lines = bills.flatMap((b) => b.lines);
  const total = lines.reduce((sum, l) => sum + (l.finding.amount ?? 0), 0);
  const sources = lines
    .flatMap((l) => l.finding.sources)
    .filter((s, i, all) => all.findIndex((o) => o.id === s.id) === i);
  const billing = ruleSource('billing', norms);
  return {
    title,
    footer: null,
    blocks: [
      { type: 'title', text: title },
      detailLine(tr('client.documents.letter.name'), details.name),
      detailLine(tr('client.documents.letter.id'), details.id),
      detailLine(tr('client.bills.letter.retailer'), details.company),
      detailLine(tr('client.bills.letter.reference'), details.reference),
      {
        type: 'text',
        text:
          bills.length > 1
            ? tr('client.bills.letter.correction.intro_many', { n: bills.length })
            : tr('client.bills.letter.correction.intro_one'),
      },
      ...bills.flatMap(({ entry, lines: billLines }): Block[] => {
        const labels = electricityLabels(entry.input, tr);
        return [
          { type: 'subheading', text: billHeading(entry, tr) },
          ...billLines.map((l): Block => ({
            type: 'bullet',
            text: lineText(l, labels.title(l.finding), tr),
          })),
        ];
      }),
      ...(lines.length > 1
        ? [
            {
              type: 'text',
              text: tr('client.bills.letter.correction.total', {
                importe: formatCalculationEuros(total),
              }),
            } as const,
          ]
        : []),
      ...(lines.some((l) => l.lowest)
        ? [{ type: 'note', text: tr('client.bills.letter.correction.lowest') } as const]
        : []),
      ...sources.map((s): Block => ({ type: 'source', text: s.citation, url: s.url })),
      { type: 'text', text: tr('client.bills.letter.correction.refund') },
      { type: 'source', text: billing.citation, url: billing.url },
      { type: 'text', text: tr('client.bills.letter.correction.ask') },
      { type: 'text', text: tr('client.bills.letter.regards') },
      placeAndDate(details, tr),
      detailLine(tr('client.documents.letter.name'), details.name),
    ],
  };
}
