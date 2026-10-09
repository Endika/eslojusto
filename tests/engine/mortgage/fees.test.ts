import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import {
  feeFindings,
  feeTotal,
  reviewFees,
  type FeeFinding,
  type FeeItem,
} from '../../../src/engine/mortgage/fees';
import type { MortgageInput, Operation } from '../../../src/engine/mortgage/types';
import { DEPS, mortgage } from './input';

const d = parseDate;

const operation = (
  on: string,
  kind: Operation['kind'],
  principal: number,
  feeCharged: number,
  change: Partial<Operation> = {},
): Operation => ({ on: d(on), kind, principal, feeCharged, hadInsurance: null, ...change });

const run = (change: Partial<MortgageInput>) => reviewFees(mortgage(change), DEPS);

const only = (change: Partial<MortgageInput>): FeeFinding => {
  const [item] = run(change);
  if (item?.kind !== 'single') throw new Error(`expected a single finding, got ${item?.kind}`);
  return item.finding;
};

const brief = (f: FeeFinding) => [f.status, f.capPercent, f.cap, f.amount];

const readings = (item: FeeItem | undefined) =>
  item?.kind === 'readings'
    ? [item.question, item.readings.map((r) => [r.when, ...brief(r.finding)])]
    : null;

const keys = (f: FeeFinding) => f.calculation.map((c) => c.key);
const sourceIds = (f: FeeFinding) => f.sources.map((s) => s.id);

// A consumer's variable rate under the LCCI, deed of 01-03-2020.
const lcciVariable = (option: MortgageInput['prepaymentOption'], ops: readonly Operation[]) => ({
  deedOn: d('2020-03-01'),
  rateType: 'variable' as const,
  prepaymentOption: option,
  operations: ops,
});

describe('art. 23.5 LCCI, variable rate', () => {
  it('option a: 0,15 % of 20.000 € in the first five years is 30 €; 100 € charged is 70 € over', () => {
    const f = only(
      lcciVariable('a_015_5y', [operation('2021-05-10', 'partial_prepayment', 20_000, 100)]),
    );
    expect(brief(f)).toEqual(['above_cap', 0.15, 30, 70]);
    expect(keys(f)).toEqual(['fees.lcci_variable', 'fees.above_cap']);
    expect(f.calculation[1]?.vars).toEqual({
      charged: { euros: 100 },
      principal: { euros: 20_000 },
      cap: { euros: 30 },
      over: { euros: 70 },
    });
    expect(sourceIds(f)).toEqual(['prepayment_lcci_variable']);
  });

  it('option b: 0,25 % of 20.000 € in the first three years is 50 €; 50 € is within, loss aside', () => {
    const f = only(
      lcciVariable('b_025_3y', [operation('2022-01-10', 'partial_prepayment', 20_000, 50)]),
    );
    expect(brief(f)).toEqual(['within_cap', 0.25, 50, null]);
    expect(keys(f)).toEqual(['fees.lcci_variable', 'fees.within_cap', 'fees.financial_loss']);
    expect(sourceIds(f)).toEqual(['prepayment_lcci_variable', 'financial_loss_cap']);
  });

  it('option b after its third year allows nothing: all 25 € are over', () => {
    const f = only(
      lcciVariable('b_025_3y', [operation('2025-06-01', 'partial_prepayment', 10_000, 25)]),
    );
    expect(brief(f)).toEqual(['above_cap', 0, 0, 25]);
    expect(keys(f)).toEqual(['fees.lcci_variable', 'fees.after_period', 'fees.above_cap']);
  });

  it('an unknown option is worked out both ways; the total counts the higher cap', () => {
    const items = run(
      lcciVariable('unknown', [operation('2025-02-10', 'partial_prepayment', 10_000, 25)]),
    );
    expect(readings(items[0])).toEqual([
      'prepayment_option',
      [
        ['variable.option_a', 'above_cap', 0.15, 15, 10],
        ['variable.option_b', 'above_cap', 0, 0, 25],
      ],
    ]);
    expect(feeTotal(items)).toEqual({ counted: 10, upTo: 25 });
  });

  it('a fee of nothing is within either cap', () => {
    const items = run(
      lcciVariable(null, [operation('2021-05-10', 'partial_prepayment', 20_000, 0)]),
    );
    expect(feeFindings(items[0] as FeeItem).map((f) => [f.status, f.cap])).toEqual([
      ['within_cap', 30],
      ['within_cap', 50],
    ]);
  });
});

describe('art. 23.7 LCCI, fixed rate', () => {
  const fixed = (on: string, principal: number, fee: number, deedOn = '2020-03-01') => ({
    deedOn: d(deedOn),
    rateType: 'fixed' as const,
    operations: [operation(on, 'full_prepayment', principal, fee)],
  });

  it('2 % of 100.000 € in the first ten years is 2.000 €; 2.500 € is 500 € over', () => {
    const f = only(fixed('2021-05-10', 100_000, 2_500));
    expect(brief(f)).toEqual(['above_cap', 2, 2_000, 500]);
    expect(sourceIds(f)).toEqual(['prepayment_lcci_fixed']);
  });

  it('1,5 % from the tenth year: 1.500 € on 100.000 €', () => {
    const f = only(fixed('2029-07-01', 100_000, 1_500, '2019-07-01'));
    expect(brief(f)).toEqual(['within_cap', 1.5, 1_500, null]);
    expect(keys(f)[0]).toBe('fees.lcci_fixed_after');
  });

  it('the last day of the tenth year is still in the first ten', () => {
    expect(only(fixed('2029-06-30', 100_000, 0, '2019-07-01')).capPercent).toBe(2);
  });
});

describe('art. 23.6 LCCI, a switch to a fixed rate, by the day of the switch', () => {
  it('2021: 0,15 % in the first three years, 150 € on 100.000 €', () => {
    const f = only(
      lcciVariable(null, [operation('2021-05-10', 'fixed_rate_novation', 100_000, 300)]),
    );
    expect(brief(f)).toEqual(['above_cap', 0.15, 150, 150]);
    expect(keys(f)).toEqual(['fees.conversion', 'fees.above_cap']);
    expect(sourceIds(f)).toEqual(['conversion_cap_2019']);
  });

  it.each([
    ['2023-03-15', 'conversion_cap_2022'],
    ['2024-02-15', 'conversion_cap_2023'],
  ])('%s: 0,05 % under %s for a mixed rate read as fixed', (on, rule) => {
    const items = run({
      deedOn: d('2021-06-15'),
      rateType: 'mixed',
      operations: [operation(on, 'fixed_rate_novation', 100_000, 100)],
    });
    expect(readings(items[0])).toEqual([
      'rate_type',
      [
        ['fixed', 'above_cap', 0.05, 50, 50],
        ['variable', 'above_cap', 0, 0, 100],
      ],
    ]);
    const [asFixed, asVariable] = feeFindings(items[0] as FeeItem);
    expect(asFixed && sourceIds(asFixed)).toEqual([rule]);
    expect(asVariable && sourceIds(asVariable)).toEqual(['fee_free_window']);
    expect(feeTotal(items)).toEqual({ counted: 50, upTo: 100 });
  });

  it('from 24-11-2022 a switch that repays nothing allows no fee', () => {
    const items = run({
      deedOn: d('2021-06-15'),
      rateType: 'mixed',
      operations: [operation('2025-03-10', 'fixed_rate_novation', 0, 120)],
    });
    const [asFixed] = feeFindings(items[0] as FeeItem);
    expect(asFixed && [...brief(asFixed), keys(asFixed), sourceIds(asFixed)]).toEqual([
      'above_cap',
      0,
      0,
      120,
      ['fees.conversion_no_repayment', 'fees.above_cap'],
      ['conversion_cap_2023'],
    ]);
  });

  it('under the 2019 wording a fee on a switch that repays nothing is not checkable', () => {
    const f = only(lcciVariable(null, [operation('2021-05-10', 'fixed_rate_novation', 0, 120)]));
    expect([...brief(f), keys(f)]).toEqual([
      'not_checkable',
      null,
      null,
      null,
      ['fees.conversion_no_repayment_2019'],
    ]);
  });

  it('after the first three years nothing may be charged for the switch', () => {
    const f = only(
      lcciVariable(null, [operation('2025-03-10', 'fixed_rate_novation', 100_000, 80)]),
    );
    expect(brief(f)).toEqual(['above_cap', 0, 0, 80]);
  });

  it('a loan already at a fixed rate has no switch to check', () => {
    const f = only({
      deedOn: d('2020-03-01'),
      rateType: 'fixed',
      operations: [operation('2021-05-10', 'fixed_rate_novation', 100_000, 300)],
    });
    expect(brief(f)).toEqual(['not_checkable', null, null, null]);
    expect(keys(f)).toEqual(['fees.already_fixed']);
  });
});

describe('the window without compensation, 24-11-2022 to 31-12-2024', () => {
  it.each([
    ['2022-11-24', 'above_cap'],
    ['2024-02-15', 'above_cap'],
    ['2024-12-31', 'above_cap'],
  ])('a variable-rate repayment on %s allows nothing', (on, status) => {
    const f = only(lcciVariable('a_015_5y', [operation(on, 'partial_prepayment', 20_000, 30)]));
    expect(brief(f)).toEqual([status, 0, 0, 30]);
    expect(keys(f)).toEqual(['fees.window', 'fees.above_cap']);
    expect(sourceIds(f)).toEqual(['fee_free_window']);
  });

  it.each(['2022-11-23', '2025-01-01'])('on %s the cap of art. 23.5 is back', (on) => {
    const f = only(lcciVariable('a_015_5y', [operation(on, 'partial_prepayment', 20_000, 30)]));
    expect(brief(f)).toEqual(['within_cap', 0.15, 30, null]);
  });

  it('a fixed rate keeps its cap inside the window', () => {
    const f = only({
      deedOn: d('2020-03-01'),
      rateType: 'fixed',
      operations: [operation('2023-03-15', 'partial_prepayment', 10_000, 200)],
    });
    expect(brief(f)).toEqual(['within_cap', 2, 200, null]);
  });
});

describe('Ley 41/2007, deeds from 09-12-2007 to 15-06-2019', () => {
  const law41 = (
    rateType: MortgageInput['rateType'],
    on: string,
    principal: number,
    fee: number,
  ) => ({
    deedOn: d('2010-04-20'),
    rateType,
    operations: [operation(on, 'partial_prepayment', principal, fee)],
  });

  it('variable 2010 repaid in its first five years: 0,5 % of 30.000 € is 150 €; 300 € is 150 € over', () => {
    const f = only(law41('variable', '2012-06-01', 30_000, 300));
    expect(brief(f)).toEqual(['above_cap', 0.5, 150, 150]);
    expect(keys(f)).toEqual(['fees.law41_first', 'fees.above_cap']);
    expect(sourceIds(f)).toEqual(['prepayment_law41']);
  });

  it('variable 2010 repaid after five years: 0,25 % of 30.000 € is 75 €; 60 € is within', () => {
    const f = only(law41('variable', '2016-06-01', 30_000, 60));
    expect(brief(f)).toEqual(['within_cap', 0.25, 75, null]);
    // The loss bound is the LCCI's: Ley 41/2007 caps are not told with it.
    expect(keys(f)).toEqual(['fees.law41_after', 'fees.within_cap']);
  });

  it('a rate fixed for over twelve months may add what the deed agreed: no cap to check', () => {
    const f = only(law41('fixed', '2012-06-01', 30_000, 300));
    expect(brief(f)).toEqual(['not_checkable', null, null, null]);
    expect(keys(f)).toEqual(['fees.law41_fixed']);
  });

  it('a variable rate revised less often than yearly may add what the deed agreed: no cap', () => {
    const f = only({ ...law41('variable', '2012-06-01', 30_000, 300), rateRevisionMonths: 24 });
    expect([...brief(f), keys(f)]).toEqual([
      'not_checkable',
      null,
      null,
      null,
      ['fees.law41_revised_less_often'],
    ]);
  });

  it('a variable rate with an unknown revision is worked out both ways and counts nothing', () => {
    const items = run({
      ...law41('variable', '2012-06-01', 30_000, 300),
      rateRevisionMonths: null,
    });
    expect(readings(items[0])).toEqual([
      'rate_revision',
      [
        ['variable.revised_yearly', 'above_cap', 0.5, 150, 150],
        ['variable.revised_less_often', 'not_checkable', null, null, null],
      ],
    ]);
    expect(feeTotal(items)).toEqual({ counted: 0, upTo: 150 });
  });

  it('inside the window, an unknown revision splits only the reading by the deed regime', () => {
    const items = run({ ...law41('variable', '2023-05-10', 30_000, 75), rateRevisionMonths: null });
    expect(readings(items[0])).toEqual([
      'earlier_deed_and_rate_revision',
      [
        ['variable.deed_regime.revised_yearly', 'within_cap', 0.25, 75, null],
        ['variable.deed_regime.revised_less_often', 'not_checkable', null, null, null],
        ['variable.lcci_reach', 'above_cap', 0, 0, 75],
      ],
    ]);
    expect(feeTotal(items)).toEqual({ counted: 0, upTo: 75 });
  });

  it('the last day before the LCCI is still under Ley 41/2007', () => {
    const f = only({ ...law41('variable', '2020-06-01', 30_000, 0), deedOn: d('2019-06-15') });
    expect(sourceIds(f)).toEqual(['prepayment_law41']);
  });
});

describe('deeds the regime of their date leaves unchecked', () => {
  it('a repayment under a 2006 deed is not checkable', () => {
    const f = only({
      deedOn: d('2006-09-12'),
      operations: [operation('2012-06-01', 'partial_prepayment', 30_000, 300)],
    });
    expect(brief(f)).toEqual(['not_checkable', null, null, null]);
    expect(keys(f)).toEqual(['fees.before_2007']);
  });

  it('09-12-2007 is the first day of Ley 41/2007', () => {
    const f = only({
      deedOn: d('2007-12-09'),
      operations: [operation('2009-06-01', 'partial_prepayment', 30_000, 0)],
    });
    expect(sourceIds(f)).toEqual(['prepayment_law41']);
  });

  it('a 2006 repayment inside the window is worked out with and without the window; counts nothing', () => {
    const items = run({
      deedOn: d('2006-09-12'),
      operations: [operation('2023-05-10', 'partial_prepayment', 30_000, 300)],
    });
    expect(readings(items[0])).toEqual([
      'earlier_deed',
      [
        ['variable.deed_regime', 'not_checkable', null, null, null],
        ['variable.lcci_reach', 'above_cap', 0, 0, 300],
      ],
    ]);
    expect(feeTotal(items)).toEqual({ counted: 0, upTo: 300 });
  });

  it('a 2015 deed switched to fixed in 2023: two readings, only the lower one counts', () => {
    const items = run({
      deedOn: d('2015-02-20'),
      operations: [operation('2023-03-15', 'fixed_rate_novation', 90_000, 450)],
    });
    expect(readings(items[0])).toEqual([
      'earlier_deed',
      [
        ['variable.deed_regime', 'not_checkable', null, null, null],
        ['variable.lcci_reach', 'above_cap', 0, 0, 450],
      ],
    ]);
    expect(feeTotal(items)).toEqual({ counted: 0, upTo: 450 });
  });

  it('a 2015 deed switched to fixed in 2021: art. 23.6 reading, past its first three years', () => {
    const items = run({
      deedOn: d('2015-02-20'),
      operations: [operation('2021-05-10', 'fixed_rate_novation', 90_000, 450)],
    });
    const [deedRegime, lcciReach] = feeFindings(items[0] as FeeItem);
    expect(deedRegime && keys(deedRegime)).toEqual(['fees.earlier_deed_novation']);
    expect(lcciReach && [...brief(lcciReach), sourceIds(lcciReach)]).toEqual([
      'above_cap',
      0,
      0,
      450,
      ['conversion_cap_2019'],
    ]);
  });

  it('a 2015 repayment outside the window follows Ley 41/2007 alone', () => {
    const f = only({
      deedOn: d('2015-02-20'),
      operations: [operation('2021-05-10', 'partial_prepayment', 30_000, 75)],
    });
    // Past its fifth year: 0,25 % of 30.000 € is 75 €.
    expect([...brief(f), sourceIds(f)]).toEqual([
      'within_cap',
      0.25,
      75,
      null,
      ['prepayment_law41'],
    ]);
  });
});

describe('notes beside the cap', () => {
  it('a change of lender is checked as a repayment, with a note on the switch cap', () => {
    const f = only(
      lcciVariable('a_015_5y', [operation('2021-05-10', 'creditor_subrogation', 20_000, 30)]),
    );
    expect(brief(f)).toEqual(['within_cap', 0.15, 30, null]);
    expect(keys(f)).toEqual([
      'fees.lcci_variable',
      'fees.within_cap',
      'fees.financial_loss',
      'fees.subrogation',
    ]);
  });

  it('a full repayment with an ancillary insurance tells of the unused premium, no figure', () => {
    const f = only(
      lcciVariable('a_015_5y', [
        operation('2021-05-10', 'full_prepayment', 20_000, 0, { hadInsurance: true }),
      ]),
    );
    expect(keys(f)).toContain('fees.unused_premium');
    expect(sourceIds(f)).toContain('unused_premium');
  });

  it('the unused premium is not told for a deed before the LCCI', () => {
    const f = only({
      deedOn: d('2010-04-20'),
      operations: [operation('2012-06-01', 'full_prepayment', 30_000, 0, { hadInsurance: true })],
    });
    expect(keys(f)).not.toContain('fees.unused_premium');
  });
});

describe('mixed rates', () => {
  it('are read as fixed and as variable, each with its own cap', () => {
    const items = run({
      deedOn: d('2020-03-01'),
      rateType: 'mixed',
      prepaymentOption: 'a_015_5y',
      operations: [operation('2021-05-10', 'partial_prepayment', 10_000, 100)],
    });
    expect(readings(items[0])).toEqual([
      'rate_type',
      [
        ['fixed', 'within_cap', 2, 200, null],
        ['variable.option_a', 'above_cap', 0.15, 15, 85],
      ],
    ]);
    expect(feeTotal(items)).toEqual({ counted: 0, upTo: 85 });
  });

  it('with the option unknown too, every reading is worked out', () => {
    const items = run({
      deedOn: d('2020-03-01'),
      rateType: 'mixed',
      prepaymentOption: 'unknown',
      operations: [operation('2025-06-01', 'partial_prepayment', 10_000, 100)],
    });
    expect(items[0]?.kind === 'readings' && items[0].question).toBe(
      'rate_type_and_prepayment_option',
    );
    expect(feeFindings(items[0] as FeeItem)).toHaveLength(3);
  });
});

describe('fee total', () => {
  it('adds the lowest reading of each operation, and the highest apart', () => {
    const items = run(
      lcciVariable('unknown', [
        operation('2021-05-10', 'partial_prepayment', 20_000, 100),
        operation('2025-02-10', 'partial_prepayment', 10_000, 25),
      ]),
    );
    expect(feeTotal(items)).toEqual({ counted: 50 + 10, upTo: 70 + 25 });
  });

  it('is nothing without operations', () => {
    expect(feeTotal(run({}))).toEqual({ counted: 0, upTo: 0 });
  });
});
