import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import type { NormTable } from '../../../src/engine/law/norms';
import { activeRules, ruleSource, type RuleTable } from '../../../src/engine/law/rules';

type TestNormId = 'base' | 'reform';
type TestRuleId = 'old_limit' | 'new_limit' | 'temporary';

const BOE = 'https://www.boe.es/buscar/doc.php?id=';

const NORMS: NormTable<TestNormId> = {
  base: {
    id: 'base',
    citation: 'Ley de prueba 1/2030',
    url: `${BOE}BOE-A-2030-1`,
    inForceSince: '2030-01-01',
    inForceUntil: null,
    status: 'in_force',
    statusSince: null,
    statusUrl: null,
  },
  reform: {
    id: 'reform',
    citation: 'Real Decreto-ley de prueba 2/2031',
    url: `${BOE}BOE-A-2031-2`,
    inForceSince: '2031-06-01',
    inForceUntil: null,
    status: 'pending_validation',
    statusSince: null,
    statusUrl: null,
  },
};

const RULES: RuleTable<TestRuleId, TestNormId> = {
  old_limit: {
    id: 'old_limit',
    norm: 'base',
    article: 'art. 1',
    url: `${BOE}BOE-A-2030-1#a1`,
    from: '2030-01-01',
    until: null,
    supersededBy: 'new_limit',
  },
  new_limit: {
    id: 'new_limit',
    norm: 'reform',
    article: 'art. 2',
    url: `${BOE}BOE-A-2031-2#a2`,
    from: '2031-06-01',
    until: null,
    supersededBy: null,
  },
  temporary: {
    id: 'temporary',
    norm: 'base',
    article: 'disposición transitoria única',
    url: `${BOE}BOE-A-2030-1#dtunica`,
    from: '2030-01-01',
    until: '2030-12-31',
    supersededBy: null,
  },
};

const withReform = (change: Partial<NormTable<TestNormId>['reform']>): NormTable<TestNormId> => ({
  ...NORMS,
  reform: { ...NORMS.reform, ...change },
});

const on = (day: string, norms: NormTable<TestNormId> = NORMS) =>
  activeRules(RULES, parseDate(day), norms).map(({ rule, doubt }) => [rule.id, doubt]);

describe('rule sources', () => {
  it('cite the article with its norm and carry the norm validity and status', () => {
    expect(ruleSource(RULES, 'new_limit', NORMS)).toEqual({
      id: 'new_limit',
      citation: 'art. 2 (Real Decreto-ley de prueba 2/2031)',
      url: `${BOE}BOE-A-2031-2#a2`,
      inForceSince: '2031-06-01',
      inForceUntil: null,
      endUncertainUntil: null,
      status: 'pending_validation',
      statusSince: null,
      statusUrl: null,
    });
  });

  it('follow the norm table they are given', () => {
    const repealed = withReform({
      status: 'repealed',
      inForceUntil: '2031-07-01',
      endUncertainUntil: '2031-07-02',
      statusSince: '2031-07-01',
      statusUrl: `${BOE}BOE-A-2031-3`,
    });
    expect(ruleSource(RULES, 'new_limit', repealed)).toMatchObject({
      status: 'repealed',
      inForceUntil: '2031-07-01',
      endUncertainUntil: '2031-07-02',
      statusSince: '2031-07-01',
    });
  });
});

describe('rules active on a day', () => {
  it.each([
    ['2029-12-31', []],
    [
      '2030-12-31',
      [
        ['old_limit', null],
        ['temporary', null],
      ],
    ],
    ['2031-01-01', [['old_limit', null]]],
  ])('within their own window, on %s', (day, expected) => {
    expect(on(day)).toEqual(expected);
  });

  it('a successor pending validation keeps the rule it would replace, both in doubt', () => {
    expect(on('2031-06-01')).toEqual([
      ['old_limit', 'pending_validation'],
      ['new_limit', 'pending_validation'],
    ]);
  });

  it('a successor certainly in force displaces the earlier rule', () => {
    expect(on('2031-06-01', withReform({ status: 'in_force' }))).toEqual([['new_limit', null]]);
  });

  it('a repealed successor leaves both in doubt over its window, then the earlier rule alone', () => {
    const repealed = withReform({
      status: 'repealed',
      inForceUntil: '2031-07-01',
      endUncertainUntil: '2031-07-02',
      statusSince: '2031-07-01',
      statusUrl: `${BOE}BOE-A-2031-3`,
    });
    expect(on('2031-07-02', repealed)).toEqual([
      ['old_limit', 'repealed_window'],
      ['new_limit', 'repealed_window'],
    ]);
    expect(on('2031-07-03', repealed)).toEqual([['old_limit', null]]);
  });

  it('a successor still a draft never applies nor displaces the rule it would replace', () => {
    expect(on('2031-06-01', withReform({ status: 'draft' }))).toEqual([['old_limit', null]]);
  });

  it('a successor resting on an open condition leaves both in doubt until it is settled', () => {
    const condition = {
      text: 'Que el dato de prueba supere el 15 %',
      decidesOn: '2031-05-31',
      source: 'x',
      met: null,
    };
    expect(on('2031-06-01', withReform({ status: 'conditional', condition }))).toEqual([
      ['old_limit', 'conditional'],
      ['new_limit', 'conditional'],
    ]);
    const notMet = withReform({ status: 'conditional', condition: { ...condition, met: false } });
    expect(on('2031-06-01', notMet)).toEqual([['old_limit', null]]);
    const met = withReform({ status: 'conditional', condition: { ...condition, met: true } });
    expect(on('2031-06-01', met)).toEqual([['new_limit', null]]);
  });
});
