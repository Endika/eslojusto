import { describe, expect, it } from 'vitest';
import { parseDate, toIso } from '../../../src/engine/date';
import {
  prepaymentToday,
  TODAY_EXAMPLE,
  type TodayCap,
  type TodayItem,
} from '../../../src/engine/mortgage/fees';
import type { MortgageInput } from '../../../src/engine/mortgage/types';
import { DEPS, mortgage } from './input';

const d = parseDate;
const TODAY = d('2026-10-19');

const run = (change: Partial<MortgageInput>): TodayItem =>
  prepaymentToday(mortgage(change), TODAY, DEPS);

const only = (change: Partial<MortgageInput>): TodayCap => {
  const item = run(change);
  if (item.kind !== 'single') throw new Error(`expected a single finding, got ${item.kind}`);
  return item.finding;
};

const brief = (c: TodayCap) => [
  c.status,
  c.capPercent,
  c.deedPercent,
  c.cap,
  c.next === null ? null : [toIso(c.next.on), c.next.percent],
];
const keys = (c: TodayCap) => c.calculation.map((x) => x.key);
const sourceIds = (c: TodayCap) => c.sources.map((s) => s.id);

describe('repaying capital today', () => {
  it('is worked out on 10.000 €', () => {
    expect(TODAY_EXAMPLE).toBe(10_000);
  });

  it('variable rate of 2020, option a: its five years are over, so nothing, and it stays so', () => {
    const c = only({ deedOn: d('2020-03-01'), rateType: 'variable', prepaymentOption: 'a_015_5y' });
    expect(brief(c)).toEqual(['cap', 0, null, 0, null]);
    expect(keys(c)).toEqual(['fees.lcci_variable', 'fees.after_period']);
    expect(sourceIds(c)).toEqual(['prepayment_lcci_variable']);
  });

  it('variable rate of 2024, option a: 0,15 % is 15 €, and nothing from its fifth anniversary', () => {
    const c = only({ deedOn: d('2024-06-01'), rateType: 'variable', prepaymentOption: 'a_015_5y' });
    expect(brief(c)).toEqual(['cap', 0.15, null, 15, ['2029-06-01', 0]]);
    expect(keys(c)).toEqual(['fees.lcci_variable', 'fees.financial_loss']);
    expect(sourceIds(c)).toEqual(['prepayment_lcci_variable', 'financial_loss_cap']);
  });

  it('variable rate of 2024 with the option unknown: both options, each with its own end', () => {
    const item = run({
      deedOn: d('2024-06-01'),
      rateType: 'variable',
      prepaymentOption: 'unknown',
    });
    expect(item.kind === 'readings' && item.question).toBe('prepayment_option');
    expect(
      item.kind === 'readings' && item.readings.map((r) => [r.when, ...brief(r.finding)]),
    ).toEqual([
      ['variable.option_a', 'cap', 0.15, null, 15, ['2029-06-01', 0]],
      ['variable.option_b', 'cap', 0.25, null, 25, ['2027-06-01', 0]],
    ]);
  });

  it('fixed rate of 2023: 2 % is 200 €, and 1,5 % from its tenth anniversary', () => {
    const c = only({ deedOn: d('2023-02-01'), rateType: 'fixed' });
    expect(brief(c)).toEqual(['cap', 2, null, 200, ['2033-02-01', 1.5]]);
    expect(keys(c)).toEqual(['fees.lcci_fixed_first', 'fees.financial_loss']);
  });

  it('a lower percentage in the deed is the most that can be charged, and 1,5 % changes nothing', () => {
    const c = only({ deedOn: d('2023-02-01'), rateType: 'fixed', deedPercents: { fixed: 1 } });
    expect(brief(c)).toEqual(['cap', 2, 1, 100, null]);
    expect(keys(c)).toEqual(['fees.lcci_fixed_first', 'fees.deed_lower', 'fees.financial_loss']);
    expect(c.calculation[1]?.vars).toEqual({ percent: { percent: 1 } });
  });

  it('a deed percentage between both caps still gives the day the law goes below it', () => {
    const c = only({ deedOn: d('2023-02-01'), rateType: 'fixed', deedPercents: { fixed: 1.8 } });
    expect(brief(c)).toEqual(['cap', 2, 1.8, 180, ['2033-02-01', 1.5]]);
  });

  it('within its first five years, a variable rate saw the window open and close', () => {
    const input = mortgage({
      deedOn: d('2021-03-01'),
      rateType: 'variable',
      prepaymentOption: 'a_015_5y',
    });
    const on = (day: string) => {
      const item = prepaymentToday(input, d(day), DEPS);
      if (item.kind !== 'single') throw new Error('expected a single finding');
      return brief(item.finding);
    };
    expect(on('2022-06-01')).toEqual(['cap', 0.15, null, 15, ['2022-11-24', 0]]);
    expect(on('2023-06-01')).toEqual(['cap', 0, null, 0, ['2025-01-01', 0.15]]);
    expect(on('2025-06-01')).toEqual(['cap', 0.15, null, 15, ['2026-03-01', 0]]);
  });

  it('a higher percentage in the deed changes nothing: the law caps it', () => {
    const c = only({ deedOn: d('2023-02-01'), rateType: 'fixed', deedPercents: { fixed: 3 } });
    expect(brief(c)).toEqual(['cap', 2, null, 200, ['2033-02-01', 1.5]]);
  });

  it('variable rate of 2010 revised yearly: Ley 41/2007 allows 0,25 % after its first five years', () => {
    const c = only({ deedOn: d('2010-05-01'), rateType: 'variable', rateRevisionMonths: 12 });
    expect(brief(c)).toEqual(['cap', 0.25, null, 25, null]);
    expect(keys(c)).toEqual(['fees.law41_after']);
  });

  it('a deed before 09-12-2007 is not checked', () => {
    const c = only({ deedOn: d('2005-05-01'), rateType: 'variable', rateRevisionMonths: 12 });
    expect(brief(c)).toEqual(['not_checkable', null, null, null, null]);
    expect(keys(c)).toEqual(['fees.before_2007']);
  });

  it('a mixed rate is worked out as fixed and as variable', () => {
    const item = run({
      deedOn: d('2023-02-01'),
      rateType: 'mixed',
      fixedUntil: d('2028-02-01'),
      prepaymentOption: 'a_015_5y',
    });
    expect(item.kind === 'readings' && item.question).toBe('rate_type');
    expect(
      item.kind === 'readings' && item.readings.map((r) => [r.when, ...brief(r.finding)]),
    ).toEqual([
      // Past its tenth year the law leaves open from which day they count: no day is given.
      ['fixed', 'cap', 2, null, 200, null],
      ['variable.option_a', 'cap', 0.15, null, 15, ['2028-02-01', 0]],
    ]);
  });

  it('is part of a completed review, and absent out of scope', async () => {
    const { reviewMortgage } = await import('../../../src/engine/mortgage/review');
    const done = reviewMortgage(
      mortgage({ deedOn: d('2023-02-01'), rateType: 'fixed' }),
      TODAY,
      DEPS,
    );
    expect(done.ok && done.review.prepaymentToday?.kind).toBe('single');
    const out = reviewMortgage(mortgage({ borrower: 'company' }), TODAY, DEPS);
    expect(out.ok && out.review.prepaymentToday).toBeNull();
  });
});
