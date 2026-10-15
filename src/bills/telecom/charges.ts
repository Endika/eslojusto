import { formatCalculationEuros } from '../../calculator/number';
import { dayText, find, listOf, template } from '../../calculator/review-result';
import type { ExtractedRow, ExtractedValue, TelecomExtraction } from '../../documents/contract';
import {
  TELECOM_LINE_KINDS,
  isExtra,
  telecomCharges,
  type TelecomCharges,
  type TelecomLineKind,
} from '../../engine/bills/telecom-charges';
import { parseDate, toIso, type CivilDate } from '../../engine/date';
import type { Translate } from '../../i18n/client';

export interface ReadLine {
  // As printed; null when the reading left it out, as it does with one that names a number.
  readonly concept: string | null;
  readonly kind: TelecomLineKind;
  readonly from: CivilDate | null;
  readonly to: CivilDate | null;
  readonly amount: number;
}

export interface ReadBill {
  readonly operator: string | null;
  readonly issuedOn: CivilDate | null;
  readonly periodFrom: CivilDate | null;
  readonly periodTo: CivilDate | null;
  readonly total: number | null;
  readonly lines: readonly ReadLine[];
}

const textOf = (v: ExtractedValue | undefined): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
const amountOf = (v: ExtractedValue | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
const kindOf = (v: ExtractedValue | undefined): TelecomLineKind =>
  TELECOM_LINE_KINDS.find((k) => k === v) ?? 'other';

function dateOf(v: ExtractedValue | undefined): CivilDate | null {
  if (typeof v !== 'string') return null;
  try {
    return parseDate(v);
  } catch {
    return null;
  }
}

const documentOf = (row: ExtractedRow): number | null => {
  const n = row.values['document'];
  return typeof n === 'number' && Number.isInteger(n) ? n : null;
};

const isoOf = (d: CivilDate | null): string => (d === null ? '' : toIso(d));
const newestFirst = (a: ReadBill, b: ReadBill): number =>
  isoOf(b.periodTo ?? b.issuedOn).localeCompare(isoOf(a.periodTo ?? a.issuedOn));

// The bills of a read with their lines, newest first. A line whose bill was not read still keeps
// one of its own.
export function readBills(e: TelecomExtraction): ReadBill[] {
  const documents = [
    ...new Set([...e.bills, ...e.lines].map(documentOf).filter((n) => n !== null)),
  ];
  return documents
    .map((document) => {
      const bill = e.bills.find((row) => documentOf(row) === document)?.values ?? {};
      const lines = e.lines
        .filter((row) => documentOf(row) === document)
        .flatMap((row): ReadLine[] => {
          const amount = amountOf(row.values['amount']);
          if (amount === null) return [];
          return [
            {
              concept: textOf(row.values['concept']),
              kind: kindOf(row.values['kind']),
              from: dateOf(row.values['from']),
              to: dateOf(row.values['to']),
              amount,
            },
          ];
        });
      return {
        operator: textOf(bill['operatorName']),
        issuedOn: dateOf(bill['issuedOn']),
        periodFrom: dateOf(bill['periodFrom']),
        periodTo: dateOf(bill['periodTo']),
        total: amountOf(bill['total']),
        lines,
      };
    })
    .filter((b) => b.lines.length > 0)
    .sort(newestFirst);
}

// The bills of every read since the form last started over. A bill read again, known by its
// operator, dates and total, keeps its latest reading.
export function chargesMemory() {
  let bills: ReadBill[] = [];
  const keyOf = (b: ReadBill): string | null =>
    b.issuedOn === null && b.periodTo === null
      ? null
      : [b.operator, isoOf(b.issuedOn), isoOf(b.periodFrom), isoOf(b.periodTo), b.total].join('|');
  return {
    add(read: readonly ReadBill[]) {
      const keys = new Set(read.map(keyOf).filter((k) => k !== null));
      bills = [...read, ...bills.filter((b) => !keys.has(keyOf(b) ?? ''))].sort(newestFirst);
    },
    clear() {
      bills = [];
    },
    bills: (): readonly ReadBill[] => bills,
  };
}

function billTitle(b: ReadBill, tr: Translate): string {
  const name =
    b.issuedOn !== null
      ? tr('client.bills.telecom.charges.bill_issued', { fecha: dayText(toIso(b.issuedOn)) })
      : b.periodFrom !== null && b.periodTo !== null
        ? tr('client.bills.telecom.charges.bill_period', {
            desde: dayText(toIso(b.periodFrom)),
            hasta: dayText(toIso(b.periodTo)),
          })
        : tr('client.bills.telecom.charges.bill');
  return b.operator === null
    ? name
    : tr('client.bills.telecom.charges.bill_operator', { factura: name, operador: b.operator });
}

function periodText(l: ReadLine, tr: Translate): string | null {
  const from = l.from === null ? null : dayText(toIso(l.from));
  const to = l.to === null ? null : dayText(toIso(l.to));
  if (from !== null && to !== null)
    return tr('client.bills.telecom.charges.period', { desde: from, hasta: to });
  if (from !== null) return tr('client.bills.telecom.charges.period_from', { desde: from });
  if (to !== null) return tr('client.bills.telecom.charges.period_to', { hasta: to });
  return null;
}

export const amountText = (l: Pick<ReadLine, 'kind' | 'amount'>): string =>
  l.kind === 'discount' && l.amount > 0
    ? `−${formatCalculationEuros(l.amount)}`
    : formatCalculationEuros(l.amount);

const conceptText = (l: ReadLine, tr: Translate): string =>
  l.concept ?? tr('client.bills.telecom.charges.no_concept');

function renderLine(root: ParentNode, l: ReadLine, tr: Translate): DocumentFragment {
  const frag = template(root, 'charges-line');
  find(frag, '[data-line-concept]').textContent = conceptText(l, tr);
  const extra = find(frag, '[data-line-extra]');
  extra.hidden = !isExtra(l.kind);
  extra.textContent = isExtra(l.kind) ? tr('client.bills.telecom.charges.extra') : '';
  const period = periodText(l, tr);
  const slot = find(frag, '[data-line-period]');
  slot.hidden = period === null;
  slot.textContent = period ?? '';
  find(frag, '[data-line-amount]').textContent = amountText(l);
  return frag;
}

function promotionLines(bills: readonly ReadBill[], c: TelecomCharges, tr: Translate): string[] {
  return c.promotions.map((p) => {
    const line = bills[p.bill]?.lines[p.line];
    return tr(
      p.ended
        ? 'client.bills.telecom.charges.promotion_ended'
        : 'client.bills.telecom.charges.promotion_ends',
      {
        concepto: line ? conceptText(line, tr) : tr('client.bills.telecom.charges.kind.discount'),
        fecha: dayText(toIso(p.endsOn)),
        importe: formatCalculationEuros(p.amount),
      },
    );
  });
}

// Every line of the bills read, bill by bill and grouped by kind, the extras marked; the discounts
// that end, with what the bill goes up by then; and the norms the lines call for. Hidden while no
// bill has a line.
export function renderCharges(
  root: HTMLElement,
  bills: readonly ReadBill[],
  today: CivilDate,
  tr: Translate,
): void {
  const c = telecomCharges(bills, today);
  root.hidden = bills.length === 0;
  find(root, '[data-charges-extras]').hidden = c.extras === 0;
  find(root, '[data-charges-fees]').hidden = !c.fixedFees;
  find(root, '[data-charges-bills]').replaceChildren(
    ...bills.map((bill, b) => {
      const frag = template(root, 'charges-bill');
      find(frag, '[data-bill-title]').textContent = billTitle(bill, tr);
      find(frag, '[data-bill-groups]').replaceChildren(
        ...(c.bills[b]?.groups ?? []).map((group) => {
          const g = template(root, 'charges-group');
          find(g, '[data-group-title]').textContent = tr(
            `client.bills.telecom.charges.kind.${group.kind}`,
          );
          find(g, '[data-group-lines]').replaceChildren(
            ...group.lines.flatMap((i) => {
              const line = bill.lines[i];
              return line ? [renderLine(root, line, tr)] : [];
            }),
          );
          return g;
        }),
      );
      return frag;
    }),
  );
  const promotions = promotionLines(bills, c, tr);
  find(root, '[data-charges-promotions]').hidden = promotions.length === 0;
  find(root, '[data-charges-promotion-list]').replaceChildren(...listOf(promotions));
  find(root, '[data-charges-right="disconnect"]').hidden = !c.premiumRate;
  find(root, '[data-charges-right="unrequested"]').hidden = c.extras === 0;
  find(root, '[data-charges-rights]').hidden = c.extras === 0;
}
