import { compareDates, toIso, type CivilDate } from '../date';

// What a line of a phone or internet bill is, as the reading labels it.
export const TELECOM_LINE_KINDS = [
  'fixed_fee',
  'premium_rate',
  'third_party',
  'penalty',
  'handset',
  'discount',
  'other',
] as const;
export type TelecomLineKind = (typeof TELECOM_LINE_KINDS)[number];

// The order the kinds are shown in: the fees first, what may not have been asked for right after
// them, the discounts last.
const CHARGE_GROUP_ORDER: readonly TelecomLineKind[] = [
  'fixed_fee',
  'premium_rate',
  'third_party',
  'handset',
  'penalty',
  'other',
  'discount',
];

// Charged by the bill on top of the plan, and often never asked for. A monthly fee is never
// marked: nothing on the bill tells which one is the plan.
const EXTRA_KINDS: ReadonlySet<TelecomLineKind> = new Set(['premium_rate', 'third_party']);

export const isExtra = (kind: TelecomLineKind): boolean => EXTRA_KINDS.has(kind);

// Amounts as the bill prints them, always positive; a discount is what it takes off.
export interface ChargeLine {
  readonly kind: TelecomLineKind;
  readonly from: CivilDate | null;
  readonly to: CivilDate | null;
  readonly amount: number;
}

interface ChargedBill {
  readonly lines: readonly ChargeLine[];
}

interface ChargeGroup {
  readonly kind: TelecomLineKind;
  // Positions in the bill's lines, in their order.
  readonly lines: readonly number[];
}

export interface BillCharges {
  readonly groups: readonly ChargeGroup[];
  readonly extras: readonly number[];
}

// A discount that ends on a day the bill prints: from the day after, the bill goes up by it.
export interface PromotionEnd {
  readonly bill: number;
  readonly line: number;
  readonly endsOn: CivilDate;
  // Its last day is before today.
  readonly ended: boolean;
  readonly amount: number;
}

export interface TelecomCharges {
  readonly bills: readonly BillCharges[];
  readonly extras: number;
  readonly premiumRate: boolean;
  // A bill with more than one monthly fee: which is the plan's own, the bill does not say.
  readonly severalFees: boolean;
  readonly promotions: readonly PromotionEnd[];
}

function billCharges(bill: ChargedBill): BillCharges {
  const groups = CHARGE_GROUP_ORDER.flatMap((kind) => {
    const lines = bill.lines.flatMap((l, i) => (l.kind === kind ? [i] : []));
    return lines.length === 0 ? [] : [{ kind, lines }];
  });
  return { groups, extras: bill.lines.flatMap((l, i) => (isExtra(l.kind) ? [i] : [])) };
}

// Every line of the bills grouped by kind, the extras among them and the discounts that end. The
// bills come newest first: a discount repeated on several bills, with the same end and amount, is
// told once, from the newest.
export function telecomCharges(bills: readonly ChargedBill[], today: CivilDate): TelecomCharges {
  const seen = new Set<string>();
  const promotions = bills.flatMap((bill, b) =>
    bill.lines.flatMap((line, i): PromotionEnd[] => {
      if (line.kind !== 'discount' || line.to === null || line.amount <= 0) return [];
      const key = `${toIso(line.to)}|${line.amount}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        {
          bill: b,
          line: i,
          endsOn: line.to,
          ended: compareDates(line.to, today) < 0,
          amount: line.amount,
        },
      ];
    }),
  );
  const lines = bills.flatMap((b) => b.lines);
  return {
    bills: bills.map(billCharges),
    extras: lines.filter((l) => isExtra(l.kind)).length,
    premiumRate: lines.some((l) => l.kind === 'premium_rate'),
    severalFees: bills.some((b) => b.lines.filter((l) => l.kind === 'fixed_fee').length > 1),
    promotions,
  };
}
