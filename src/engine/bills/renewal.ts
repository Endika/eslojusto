import { addMonthsClamped, compareDates, ordinal, parseDate } from '../date';
import { round2 } from '../money';
import type { BillsNormId } from './norms';
import type {
  Exit,
  Notice,
  Recalc,
  RenewalCore,
  RenewalDeps,
  RenewalInput,
  RenewalPrices,
  Split,
  TermSplit,
} from './renewal-types';
import { valueOn, type PowerEnergyPrices } from './tables';

const DAYS_PER_YEAR = 365;
const MISMATCH_TOLERANCE = 1;
const NOTICE_SINCE = '2026-06-12';

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

const powerPerYear = (input: RenewalInput, price: number, kw: number): number =>
  kw * price * (input.powerUnit === 'per_kw_day' ? DAYS_PER_YEAR : 1);

function yearlyCost(input: RenewalInput, prices: RenewalPrices, kwh: number): number | null {
  if (!('all' in prices.energy)) return null;
  return (
    powerPerYear(input, prices.power.p1, input.powerKw.p1) +
    powerPerYear(input, prices.power.p2, input.powerKw.p2) +
    kwh * prices.energy.all
  );
}

function recalculate(input: RenewalInput): Recalc {
  if (input.annualKwh === null) return { kind: 'no_consumption' };
  const current = yearlyCost(input, input.current, input.annualKwh);
  const next = yearlyCost(input, input.next, input.annualKwh);
  if (current === null || next === null) return { kind: 'needs_period_use' };
  const [now, then] = [round2(current), round2(next)];
  const declared = input.declared.withoutTax;
  return {
    kind: 'ok',
    current: now,
    next: then,
    risePercent: round2(((then - now) / now) * 100),
    mismatch:
      declared !== null && Math.abs(declared - then) > MISMATCH_TOLERANCE
        ? { declared, computed: then }
        : null,
  };
}

type Access =
  | { kind: 'ok'; prices: PowerEnergyPrices }
  | { kind: 'missing_table'; day: string }
  | { kind: 'conditional'; norms: readonly BillsNormId[] };

// Tolls plus charges on `day`.
function regulatedOn(day: string, { tables, norms }: RenewalDeps): Access {
  const tolls = valueOn(tables.tolls, day, norms);
  const charges = valueOn(tables.charges, day, norms);
  for (const found of [tolls, charges]) {
    if (found.kind === 'missing') return { kind: 'missing_table', day };
  }
  if (tolls.kind === 'conditional' || charges.kind === 'conditional') {
    const deciding = [tolls, charges].flatMap((f) => (f.kind === 'conditional' ? f.norms : []));
    return { kind: 'conditional', norms: [...new Set(deciding)] };
  }
  if (tolls.kind !== 'ok' || charges.kind !== 'ok') return { kind: 'missing_table', day };
  const [t, c] = [tolls.row.value, charges.row.value];
  return {
    kind: 'ok',
    prices: {
      power: { p1: t.power.p1 + c.power.p1, p2: t.power.p2 + c.power.p2 },
      energy: {
        p1: t.energy.p1 + c.energy.p1,
        p2: t.energy.p2 + c.energy.p2,
        p3: t.energy.p3 + c.energy.p3,
      },
    },
  };
}

const sameRegulated = (a: PowerEnergyPrices, b: PowerEnergyPrices): boolean =>
  round6(a.power.p1) === round6(b.power.p1) &&
  round6(a.power.p2) === round6(b.power.p2) &&
  round6(a.energy.p1) === round6(b.energy.p1) &&
  round6(a.energy.p2) === round6(b.energy.p2) &&
  round6(a.energy.p3) === round6(b.energy.p3);

function powerSplit(input: RenewalInput, regulated: number, period: 'p1' | 'p2'): TermSplit {
  const perYear = (prices: RenewalPrices) => powerPerYear(input, prices.power[period], 1);
  return {
    regulated: round2(regulated),
    retailerCurrent: round2(perYear(input.current) - regulated),
    retailerNext: round2(perYear(input.next) - regulated),
  };
}

function energySplit(
  input: RenewalInput,
  regulated: number,
  period: 'p1' | 'p2' | 'p3',
): TermSplit {
  const price = (prices: RenewalPrices) =>
    'all' in prices.energy ? prices.energy.all : prices.energy[period];
  return {
    regulated: round6(regulated),
    retailerCurrent: round6(price(input.current) - regulated),
    retailerNext: round6(price(input.next) - regulated),
  };
}

function split(input: RenewalInput, deps: RenewalDeps): Split {
  const renewal = regulatedOn(input.renewalDate, deps);
  if (renewal.kind !== 'ok') return renewal;
  const letter = regulatedOn(input.letterDate, deps);
  const { power, energy } = renewal.prices;
  return {
    kind: 'ok',
    power: {
      p1: powerSplit(input, power.p1, 'p1'),
      p2: powerSplit(input, power.p2, 'p2'),
    },
    energy: {
      p1: energySplit(input, energy.p1, 'p1'),
      p2: energySplit(input, energy.p2, 'p2'),
      p3: energySplit(input, energy.p3, 'p3'),
    },
    regulatedChange: letter.kind === 'ok' ? !sameRegulated(letter.prices, renewal.prices) : null,
  };
}

function notice(input: RenewalInput): Notice {
  if (input.letterDate < NOTICE_SINCE) return { kind: 'not_checked_before', since: NOTICE_SINCE };
  if (input.separateFromBill === false) return { kind: 'not_separate' };
  const [letter, renewal] = [parseDate(input.letterDate), parseDate(input.renewalDate)];
  const days = ordinal(renewal) - ordinal(letter);
  const earliest = addMonthsClamped(letter, 1);
  if (compareDates(renewal, earliest) >= 0 && input.separateFromBill === null) {
    return { kind: 'separate_unknown', days };
  }
  return compareDates(renewal, earliest) >= 0 ? { kind: 'meets', days } : { kind: 'short', days };
}

function exit(input: RenewalInput): Exit {
  if (input.fixedPrice === null) return { kind: 'unknown' };
  if (!input.fixedPrice) return { kind: 'free' };
  if (input.firstRenewal === null) return { kind: 'unknown' };
  return input.firstRenewal ? { kind: 'penalty_possible', capPercent: 5 } : { kind: 'free' };
}

export function reviewRenewalCore(input: RenewalInput, deps: RenewalDeps): RenewalCore {
  return {
    recalc: recalculate(input),
    split: split(input, deps),
    notice: notice(input),
    exit: exit(input),
  };
}
