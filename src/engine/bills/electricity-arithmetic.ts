import { daysInYear, toIso } from '../date';
import { round2 } from '../money';
import { billsPhrase, type BillsPhrase } from './calculation';
import {
  billFinding,
  compare,
  directionOf,
  LINE_TOLERANCE,
  single,
  TOTAL_TOLERANCE,
  type BillItem,
  type BillsItemId,
} from './finding';
import type { NormTable } from './norms';
import { periodDays } from './period';
import type { ElectricityBillInput, EnergyLine, PowerLine } from './types';

export const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

// The years a per-year price may be shared out by: 365, and 366 when the period touches a leap
// year, since no norm says which.
function yearBases(input: ElectricityBillInput): readonly number[] {
  const leap = [input.readingFrom.y, input.readingTo.y].some((y) => daysInYear(y) === 366);
  return leap ? [365, 366] : [365];
}

function lineResult(
  id: BillsItemId,
  line: number,
  billed: number,
  expected: readonly number[],
  calculation: readonly BillsPhrase[],
  norms: NormTable,
): BillItem {
  const { matches, difference } = compare(billed, expected, LINE_TOLERANCE);
  const tolerance = billsPhrase('tolerance.line');
  if (matches)
    return single(billFinding(id, 'matches', [...calculation, tolerance], [], norms, { line }));
  return single(
    billFinding(
      id,
      'does_not_add_up',
      [...calculation, tolerance, ...differenceNote(difference)],
      ['billing'],
      norms,
      { line, amount: Math.abs(difference), direction: directionOf(difference) },
    ),
  );
}

// A sum that does not add up is settled in the next bill; one charged short may be charged later.
export const differenceNote = (difference: number): readonly BillsPhrase[] =>
  difference > 0
    ? [billsPhrase('arithmetic.refund_next_bill')]
    : [billsPhrase('arithmetic.under_settled_later')];

function powerLine(
  input: ElectricityBillInput,
  line: PowerLine,
  index: number,
  norms: NormTable,
): BillItem {
  const days = line.days ?? periodDays({ from: input.readingFrom, to: input.readingTo });
  const billed = billsPhrase('arithmetic.billed', { euros: { euros: line.amount } });
  if (line.unit === 'per_kw_day') {
    const expected = line.kw * line.price * days;
    return lineResult(
      'power',
      index,
      line.amount,
      [expected],
      [
        billsPhrase('arithmetic.power_per_day', {
          kw: { kw: line.kw },
          price: { price: line.price, unit: 'per_kw_day' },
          days: { days },
          euros: { euros: round2(expected) },
        }),
        billed,
      ],
      norms,
    );
  }
  const bases = yearBases(input);
  const expected = bases.map((base) => (line.kw * line.price * days) / base);
  return lineResult(
    'power',
    index,
    line.amount,
    expected,
    [
      billsPhrase('arithmetic.power_per_year', {
        kw: { kw: line.kw },
        price: { price: line.price, unit: 'per_kw_year' },
        days: { days },
        euros: { euros: round2(expected[0] ?? 0) },
      }),
      ...(bases.length > 1 ? [billsPhrase('readings.both_bases')] : []),
      billed,
    ],
    norms,
  );
}

const energyLine = (line: EnergyLine, index: number, norms: NormTable): BillItem => {
  const expected = line.kwh * line.price;
  return lineResult(
    'energy',
    index,
    line.amount,
    [expected],
    [
      billsPhrase('arithmetic.energy', {
        kwh: { kwh: line.kwh },
        price: { price: line.price, unit: 'per_kwh' },
        euros: { euros: round2(expected) },
      }),
      billsPhrase('arithmetic.billed', { euros: { euros: line.amount } }),
    ],
    norms,
  );
};

// Every line the total adds up, with what it takes off as negative.
export function linesTotal(input: ElectricityBillInput): number {
  return (
    sum(input.power.map((l) => l.amount)) +
    sum(input.energy.map((l) => l.amount)) -
    sum(input.discounts) +
    (input.socialBonusFunding ?? 0) -
    (input.socialBonus?.amount ?? 0) +
    (input.excessPower?.amount ?? 0) +
    (input.electricityTax?.amount ?? 0) +
    (input.meter?.amount ?? 0) +
    sum(input.services.map((s) => s.amount)) +
    (input.exitPenalty?.amount ?? 0) +
    sum(input.regularizations) +
    (input.vat?.amount ?? 0)
  );
}

// The bill against its own figures: its days, each power and energy line at its own price, and
// the total. Nothing here rests on a table; a difference either way is shown, and one charged
// short never adds to what is paid over.
export function checkArithmetic(
  input: ElectricityBillInput,
  norms: NormTable,
): readonly BillItem[] {
  const items: BillItem[] = [];
  const days = periodDays({ from: input.readingFrom, to: input.readingTo });
  const daysPhrase = billsPhrase('arithmetic.days', {
    from: { date: toIso(input.readingFrom) },
    to: { date: toIso(input.readingTo) },
    days: { days },
  });
  if (input.billedDays !== null && input.billedDays !== days) {
    const difference = input.billedDays - days;
    items.push(
      single(
        billFinding(
          'days',
          'does_not_add_up',
          [
            daysPhrase,
            billsPhrase('arithmetic.days_mismatch', { billed: { days: input.billedDays } }),
          ],
          ['billing'],
          norms,
          { direction: directionOf(difference) },
        ),
      ),
    );
  } else items.push(single(billFinding('days', 'matches', [daysPhrase], [], norms)));

  if (input.priceChange === 'without_segments') {
    const unchecked = (id: 'power' | 'energy', line: number) =>
      single(
        billFinding(
          id,
          'not_checkable',
          [billsPhrase('arithmetic.price_change_without_segments')],
          [],
          norms,
          { line },
        ),
      );
    items.push(
      ...input.power.map((_, i) => unchecked('power', i)),
      ...input.energy.map((_, i) => unchecked('energy', i)),
    );
  } else {
    items.push(
      ...input.power.map((line, i) => powerLine(input, line, i, norms)),
      ...input.energy.map((line, i) => energyLine(line, i, norms)),
    );
  }

  const expected = linesTotal(input);
  const { matches, difference } = compare(input.total, [expected], TOTAL_TOLERANCE);
  const total = [
    billsPhrase('arithmetic.total', { euros: { euros: round2(expected) } }),
    billsPhrase('arithmetic.billed', { euros: { euros: input.total } }),
    billsPhrase('tolerance.total'),
  ];
  items.push(
    single(
      matches
        ? billFinding('total', 'matches', total, [], norms)
        : billFinding(
            'total',
            'does_not_add_up',
            [...total, ...differenceNote(difference)],
            ['billing'],
            norms,
            { amount: Math.abs(difference), direction: directionOf(difference) },
          ),
    ),
  );
  return items;
}
