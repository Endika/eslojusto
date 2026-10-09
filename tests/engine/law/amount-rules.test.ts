import { describe, expect, it } from 'vitest';
import { amountRuleBreaches } from '../../../src/engine/law/verification';
import { amountRule, caseLaw, norm, statute } from './fixtures';
import { LAW_SECTIONS } from './registry';

describe('rules that give an amount', () => {
  it.each(LAW_SECTIONS.map((s) => [s.name, s] as const))(
    '%s rests every amount on verified sources and enacted norms',
    (_, section) => {
      expect(amountRuleBreaches(section.rules, section.sources, section.norms)).toEqual([]);
    },
  );

  const sources = { statute: statute(), ruling: caseLaw({ verified: false }) };
  const norms = { x: norm(), bill: norm({ status: 'draft' }) };

  it('may rest on a verified source and a norm in force', () => {
    expect(amountRuleBreaches({ cap: amountRule() }, sources, norms)).toEqual([]);
  });

  it('may not rest on an unverified source', () => {
    const rules = { cap: amountRule({ sources: ['statute', 'ruling'] }) };
    expect(amountRuleBreaches(rules, sources, norms)).toEqual([
      { rule: 'cap', reason: 'unverified_source', source: 'ruling' },
    ]);
  });

  it('may not rest on a draft', () => {
    expect(amountRuleBreaches({ cap: amountRule({ norm: 'bill' }) }, sources, norms)).toEqual([
      { rule: 'cap', reason: 'draft_norm', norm: 'bill' },
    ]);
  });

  it('may not cite a source or a norm the tables lack', () => {
    const rules = { cap: amountRule({ norm: 'gone', sources: ['missing'] }) };
    expect(amountRuleBreaches(rules, sources, norms)).toEqual([
      { rule: 'cap', reason: 'unknown_norm', norm: 'gone' },
      { rule: 'cap', reason: 'unknown_source', source: 'missing' },
    ]);
  });

  it('other outputs may rest on unverified sources and drafts', () => {
    const rules = {
      indicator: amountRule({ id: 'indicator', output: 'indicator', sources: ['ruling'] }),
      notice: amountRule({ id: 'notice', output: 'info', norm: 'bill', sources: [] }),
    };
    expect(amountRuleBreaches(rules, sources, norms)).toEqual([]);
  });
});
