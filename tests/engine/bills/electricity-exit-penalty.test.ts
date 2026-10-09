import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { checkExitPenalty } from '../../../src/engine/bills/electricity-exit-penalty';
import { countedAmount, type BillItem } from '../../../src/engine/bills/finding';
import type { ElectricityBillInput, ExitPenalty } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { freeBill, juneBill, only } from './input';

const present = (item: BillItem | null): BillItem => {
  if (item === null) throw new Error('no item');
  return item;
};

const summary = (item: BillItem) => {
  const f = only(item);
  return { status: f.status, amount: f.amount, counted: countedAmount(item) };
};

describe('a penalty for leaving the contract', () => {
  const penalty = (change: Partial<ExitPenalty>): ExitPenalty => ({
    amount: 30,
    priceType: 'variable',
    firstRenewalPassed: false,
    ...change,
  });
  const check = (change: Partial<ExitPenalty>, bill: Partial<ElectricityBillInput> = {}) =>
    present(checkExitPenalty(freeBill({ ...bill, exitPenalty: penalty(change) }), BILLS_NORMS));
  const person = { holder: 'person' } as const;

  it.each([
    [{ priceType: 'variable' }, 'exit.not_fixed'],
    [{ priceType: 'indexed' }, 'exit.not_fixed'],
    [{ priceType: 'fixed', firstRenewalPassed: true }, 'exit.renewed'],
  ] as const)('%j is not allowed, and counted', (change, key) => {
    const item = check(change, person);
    expect(summary(item)).toEqual({ status: 'not_allowed', amount: 30, counted: 30 });
    expect(only(item).calculation).toEqual([{ key }]);
    expect(only(item).sources.map((s) => s.id)).toEqual(['exit_penalty']);
  });

  it.each([
    [{ priceType: 'fixed' }, person, 'exit.fixed_first_term'],
    [{ priceType: null }, person, 'exit.terms_unknown'],
    [{ firstRenewalPassed: null }, person, 'exit.terms_unknown'],
    [{}, { holder: 'microenterprise' }, 'exit.not_person'],
    [{}, { holder: null }, 'exit.not_person'],
    [{}, { ...person, issuedOn: parseDate('2026-06-11') }, 'exit.before_rules'],
  ] as const)('%j for %j cannot be checked', (change, bill, key) => {
    const item = check(change, bill);
    expect(summary(item)).toEqual({ status: 'not_checkable', amount: null, counted: 0 });
    expect(only(item).calculation).toEqual([{ key }]);
  });

  it('gives nothing when the bill has no penalty', () => {
    expect(checkExitPenalty(juneBill(), BILLS_NORMS)).toBeNull();
  });
});
