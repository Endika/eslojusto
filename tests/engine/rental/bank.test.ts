import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BankCase, CaseInput, ExpectedItem } from '../../../api/eval/schema';
import { parseDate as f } from '../../../src/engine/date';
import { RENTAL_TABLES } from '../../../src/engine/rental/data/tables';
import { itemAmount } from '../../../src/engine/rental/item';
import { countedAmount, highestAmount, type Outcome } from '../../../src/engine/rental/outcome';
import { rentUpdateAmount } from '../../../src/engine/rental/rent-update';
import { reviewRental, type RentalItemResult } from '../../../src/engine/rental/review';
import type { RegionCode, RentalInput } from '../../../src/engine/rental/types';

// The synthetic bank of lease packs doubles as golden cases for the engine: each case's expected
// review was worked out by hand from the law, never copied from the engine.
const DIR = new URL('../../../api/eval/cases/', import.meta.url);
const CASES: readonly BankCase[] = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8')) as BankCase);

const toInput = (c: CaseInput): RentalInput => ({
  ...c,
  region: c.region as RegionCode,
  signedOn: f(c.signedOn),
  startDate: f(c.startDate),
  updates: c.updates.map((u) => ({
    ...u,
    anniversary: f(u.anniversary),
    effectiveOn: f(u.effectiveOn),
    chargedFrom: f(u.chargedFrom),
    noticeOn: u.noticeOn === null ? null : f(u.noticeOn),
  })),
  moveOut:
    c.moveOut === null
      ? null
      : {
          keysReturnedOn: f(c.moveOut.keysReturnedOn),
          returns: c.moveOut.returns.map((r) => ({ on: f(r.on), amount: r.amount })),
          deductions: c.moveOut.deductions,
        },
});

const idOf = (item: RentalItemResult): string => {
  if (item.kind === 'rent_update') return `rent_update:${item.index}`;
  return [item.kind, item.index, item.year].filter((p) => p !== null).join(':');
};

function shape<T extends { readonly status: string }>(
  id: string,
  outcome: Outcome<T>,
  amount: (value: T) => number,
  figured: (value: T) => boolean,
): ExpectedItem {
  if (outcome.kind === 'single') {
    const { value } = outcome;
    return figured(value)
      ? { id, status: value.status, amount: amount(value) }
      : { id, status: value.status };
  }
  return {
    id,
    status: 'depends',
    amount: countedAmount(outcome, amount),
    upTo: highestAmount(outcome, amount),
    reasons: outcome.reasons,
  };
}

const asExpected = (item: RentalItemResult): ExpectedItem =>
  item.kind === 'rent_update'
    ? shape(idOf(item), item.outcome, rentUpdateAmount, (v) => v.status === 'paid_over')
    : shape(idOf(item), item.outcome, itemAmount, (v) => v.amount !== null);

describe('the synthetic bank of lease packs', () => {
  it('holds 30 to 40 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(30);
    expect(CASES.length).toBeLessThanOrEqual(40);
  });

  it.each(CASES.map((c) => [c.id, c] as const))('%s', (_, c) => {
    const result = reviewRental(toInput(c.expected.input), f(c.today), RENTAL_TABLES);
    if (!result.ok) throw new Error(`invalid input: ${JSON.stringify(result.errors)}`);
    expect(result.review.scope).toEqual(c.expected.review.scope);
    expect(result.review.items.map(asExpected)).toEqual(c.expected.review.items);
  });
});
