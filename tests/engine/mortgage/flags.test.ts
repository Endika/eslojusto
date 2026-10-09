import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { reviewFlags, type ClauseFlag } from '../../../src/engine/mortgage/flags';
import type { SourceTable } from '../../../src/engine/mortgage/norms';
import type { Clause, MortgageInput } from '../../../src/engine/mortgage/types';
import { DEPS, mortgage, TODAY } from './input';

const d = parseDate;

const flagsOf = (deedOn: string, clauses: readonly Clause[], change: Partial<MortgageInput> = {}) =>
  reviewFlags(mortgage({ deedOn: d(deedOn), clauses, ...change }), TODAY, DEPS);

const one = (deedOn: string, clause: Clause, change: Partial<MortgageInput> = {}): ClauseFlag => {
  const [flag] = flagsOf(deedOn, [clause], change);
  if (flag === undefined) throw new Error('no flag');
  return flag;
};

const parts = (flag: ClauseFlag) =>
  flag.parts.map((part) => [
    part.basis,
    part.rule,
    part.calculation.map((c) => c.key),
    part.sources.map((s) => s.id),
    part.statusAsOf,
  ]);

const clause = (label: Clause['label'], change: Partial<Clause> = {}): Clause => ({
  label,
  present: true,
  ...change,
});

describe('floor clause', () => {
  it('variable 2010 with a 3 % floor: the courts, with the rulings read at their source', () => {
    const flag = one('2010-06-01', clause('floor_clause', { floorPercent: 3 }));
    expect(flag.state).toBe('in_deed');
    expect(parts(flag)).toEqual([
      [
        'case_law',
        'floor_case_law',
        ['flags.floor_case_law'],
        // STS 241/2013 stays out until it is opened in CENDOJ.
        ['tjue_c154_15', 'tjue_c452_18'],
        '2026-10-07',
      ],
    ]);
    expect(flag.parts[0]?.calculation[0]?.vars).toEqual({ floor: { percent: 3 } });
  });

  it('variable 2020 with a 1 % floor: the law, art. 21.3', () => {
    const flag = one('2020-06-01', clause('floor_clause', { floorPercent: 1 }));
    expect(parts(flag)).toEqual([
      ['statute', 'floor_statute', ['flags.floor_statute'], ['floor_statute'], null],
    ]);
  });

  it('a floor at 0 %, the rate never below zero, is no floor', () => {
    const flag = one('2020-06-01', clause('floor_clause', { floorPercent: 0 }));
    expect(flag).toEqual({
      label: 'floor_clause',
      state: 'not_in_deed',
      calculation: [{ key: 'flags.floor_zero' }],
      parts: [],
    });
  });

  it.each([
    ['2019-06-15', 'case_law'],
    ['2019-06-16', 'statute'],
  ])('a floor in a deed of %s rests on %s', (deed, basis) => {
    expect(one(deed, clause('floor_clause', { floorPercent: 2 })).parts[0]?.basis).toBe(basis);
  });

  it('a mixed rate under the LCCI gets its own wording; a fixed rate, no rule', () => {
    expect(
      parts(
        one('2020-06-01', clause('floor_clause', { floorPercent: 1 }), { rateType: 'mixed' }),
      )[0]?.[2],
    ).toEqual(['flags.floor_statute_mixed']);
    const fixed = one('2020-06-01', clause('floor_clause', { floorPercent: 1 }), {
      rateType: 'fixed',
    });
    expect([fixed.calculation.map((c) => c.key), fixed.parts]).toEqual([['flags.floor_fixed'], []]);
  });
});

describe('IRPH', () => {
  it('is shown with the Court of Justice rulings and the day they were read', () => {
    expect(parts(one('2005-03-01', clause('irph')))).toEqual([
      ['case_law', 'irph', ['flags.irph'], ['tjue_c125_18', 'tjue_c265_22'], '2026-10-07'],
    ]);
  });

  it('gives the state as of the oldest reading among its rulings', () => {
    const sources: SourceTable = {
      ...DEPS.sources,
      tjue_c125_18: { ...DEPS.sources.tjue_c125_18, lastVerified: '2026-09-01' },
    };
    const [flag] = reviewFlags(
      mortgage({ deedOn: d('2005-03-01'), clauses: [clause('irph')] }),
      TODAY,
      { ...DEPS, sources },
    );
    expect(flag?.parts[0]?.statusAsOf).toBe('2026-09-01');
  });

  it('has no part once none of its rulings counts as read', () => {
    const sources: SourceTable = {
      ...DEPS.sources,
      tjue_c125_18: { ...DEPS.sources.tjue_c125_18, verified: false },
      tjue_c265_22: { ...DEPS.sources.tjue_c265_22, verified: false },
    };
    const [flag] = reviewFlags(
      mortgage({ deedOn: d('2005-03-01'), clauses: [clause('irph')] }),
      TODAY,
      { ...DEPS, sources },
    );
    expect(flag?.parts).toEqual([]);
  });
});

describe('late interest', () => {
  const late = (defaultRate: number, ordinaryRate = 2) =>
    clause('default_interest', { defaultRate, ordinaryRate });

  it('from the LCCI on, the ordinary rate plus three points: 2 % + 3 = 5 %', () => {
    const flag = one('2020-06-01', late(5));
    expect(parts(flag)).toEqual([
      [
        'statute',
        'default_interest_statute',
        ['flags.default_interest_lcci', 'flags.default_interest_lcci_matches'],
        ['default_interest_statute'],
        null,
      ],
    ]);
  });

  it('from the LCCI on, 12 % against 2 % + 3 differs', () => {
    const flag = one('2020-06-01', late(12));
    expect(flag.parts[0]?.calculation[1]).toEqual({
      key: 'flags.default_interest_lcci_differs',
      vars: { default: { percent: 12 }, ordinary: { percent: 2 }, legal: { percent: 5 } },
    });
  });

  it('2016, main home: over three times the legal interest of any year since, and over + 2', () => {
    // Legal interest 2016-2026: 3,00 % to 3,25 %; three times the highest is 9,75 %.
    const flag = one('2016-03-01', late(10));
    expect(parts(flag)).toEqual([
      [
        'statute',
        'default_interest_lh114',
        ['flags.default_interest_lh114', 'flags.default_interest_lh114_above'],
        ['default_interest_lh114'],
        null,
      ],
      [
        'case_law',
        'default_interest_case_law',
        ['flags.default_interest_case_law', 'flags.default_interest_case_law_above'],
        ['tjue_c96_16'],
        '2026-10-07',
      ],
    ]);
    expect(flag.parts[0]?.calculation[1]?.vars).toEqual({
      default: { percent: 10 },
      limit: { percent: 9.75 },
    });
    expect(flag.parts[1]?.calculation[1]?.vars).toEqual({
      default: { percent: 10 },
      ordinary: { percent: 2 },
      reference: { percent: 4 },
    });
  });

  it('2016 at 9,5 %: within three times the highest legal interest, still over + 2', () => {
    const keys = one('2016-03-01', late(9.5)).parts.map((x) => x.calculation.map((c) => c.key));
    expect(keys).toEqual([
      ['flags.default_interest_lh114'],
      ['flags.default_interest_case_law', 'flags.default_interest_case_law_above'],
    ]);
  });

  it('2010: before Ley 1/2013, only the courts; 4 % is within ordinary + 2', () => {
    const flag = one('2010-06-01', late(4));
    expect(parts(flag)).toEqual([
      [
        'case_law',
        'default_interest_case_law',
        ['flags.default_interest_case_law'],
        ['tjue_c96_16'],
        '2026-10-07',
      ],
    ]);
  });

  it('without the rates, the rule alone', () => {
    expect(parts(one('2020-06-01', clause('default_interest')))[0]?.[2]).toEqual([
      'flags.default_interest_lcci',
    ]);
  });
});

describe('early termination', () => {
  it('a 2012 deed that calls in the loan on a single missed instalment', () => {
    const flag = one('2012-05-10', clause('early_termination', { missedInstalments: 1 }));
    expect(parts(flag)).toEqual([
      [
        'statute',
        'early_termination',
        [
          'flags.early_termination',
          'flags.early_termination_earlier_deed',
          'flags.early_termination_fewer',
        ],
        ['early_termination'],
        null,
      ],
      [
        'case_law',
        'early_termination_case_law',
        ['flags.early_termination_case_law'],
        ['tjue_c70_17'],
        '2026-10-07',
      ],
    ]);
    expect(flag.parts[0]?.calculation[2]?.vars).toEqual({ instalments: { integer: 1 } });
  });

  it('a 2021 deed with twelve instalments: art. 24 alone', () => {
    const flag = one('2021-05-10', clause('early_termination', { missedInstalments: 12 }));
    expect(parts(flag)).toEqual([
      ['statute', 'early_termination', ['flags.early_termination'], ['early_termination'], null],
    ]);
  });
});

describe('other clauses', () => {
  it('rounding up is shown without a rule this review reads', () => {
    expect(one('2010-06-01', clause('rounding_up'))).toEqual({
      label: 'rounding_up',
      state: 'in_deed',
      calculation: [{ key: 'flags.rounding_up' }],
      parts: [],
    });
  });

  it('an opening fee charged with a study fee from 2019: art. 14.4, then the courts', () => {
    const flag = one('2021-05-10', clause('opening_fee', { duplicateFee: true }));
    expect(parts(flag)).toEqual([
      [
        'statute',
        'opening_fee_duplicate',
        ['flags.opening_fee_duplicate'],
        ['opening_fee_duplicate'],
        null,
      ],
      [
        'case_law',
        'opening_fee_case_law',
        ['flags.opening_fee_case_law'],
        ['tjue_c565_21'],
        '2026-10-07',
      ],
    ]);
  });

  it('an opening fee is given in euros and as a share of the capital lent, with no usual range', () => {
    const flag = one('2015-05-10', clause('opening_fee', { feeAmount: 1_500 }), {
      loanAmount: 150_000,
    });
    expect(flag.calculation).toEqual([
      { key: 'flags.opening_fee_amount', vars: { fee: { euros: 1_500 } } },
      { key: 'flags.opening_fee_share', vars: { share: { percent: 1 } } },
    ]);
    const unknownLoan = one('2015-05-10', clause('opening_fee', { feeAmount: 1_500 }));
    expect(unknownLoan.calculation.map((c) => c.key)).toEqual(['flags.opening_fee_amount']);
  });

  it('an opening fee with a study fee before 2019: the courts only', () => {
    const flag = one('2015-05-10', clause('opening_fee', { duplicateFee: true }));
    expect(flag.parts.map((x) => x.rule)).toEqual(['opening_fee_case_law']);
  });

  it('required insurance: art. 17 from the LCCI on; before it, no rule read', () => {
    expect(one('2021-05-10', clause('insurance_required')).parts.map((x) => x.rule)).toEqual([
      'insurance_tied',
    ]);
    expect(one('2015-05-10', clause('insurance_required')).calculation).toEqual([
      { key: 'flags.insurance_before_lcci' },
    ]);
  });
});

describe('flag states', () => {
  it('not in the deed, or not readable, carries no rule', () => {
    expect(
      flagsOf('2012-05-10', [
        clause('irph', { present: false }),
        clause('floor_clause', { present: null, floorPercent: 3 }),
      ]),
    ).toEqual([
      { label: 'irph', state: 'not_in_deed', calculation: [], parts: [] },
      { label: 'floor_clause', state: 'unreadable', calculation: [], parts: [] },
    ]);
  });

  it('only flag labels count, each once, in the order they came', () => {
    const flags = flagsOf('2012-05-10', [
      clause('euribor'),
      clause('expenses_clause'),
      clause('prepayment_fee'),
      clause('irph'),
      clause('irph', { present: false }),
    ]);
    expect(flags.map((f) => [f.label, f.state])).toEqual([['irph', 'in_deed']]);
  });

  it('never cite a Supreme Court ruling not yet opened in CENDOJ', () => {
    const all = flagsOf('2016-03-01', [
      clause('floor_clause', { floorPercent: 3 }),
      clause('irph'),
      clause('default_interest', { defaultRate: 20, ordinaryRate: 2 }),
      clause('early_termination', { missedInstalments: 1 }),
      clause('opening_fee', { duplicateFee: true }),
    ]);
    const cited = all.flatMap((f) => f.parts.flatMap((x) => x.sources.map((s) => s.id)));
    expect(cited.filter((id) => id.startsWith('sts'))).toEqual([]);
  });
});
