import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { CREDIT_NORMS, NORM_REVIEW } from '../../../src/engine/credit/data/norms';
import { CREDIT_SOURCES } from '../../../src/engine/credit/data/sources';
import type { CreditNormId, Norm, NormTable } from '../../../src/engine/credit/norms';
import {
  activeRules,
  CRITERION_RULES,
  criterionSource,
  ruleApplies,
  ruleSource,
  RULES,
  STATUTE_RULES,
} from '../../../src/engine/credit/rules';
import { amountRuleBreaches } from '../../../src/engine/law/verification';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LCC = 'https://www.boe.es/buscar/act.php?id=BOE-A-2011-10970';

const withNorm = (id: CreditNormId, change: Partial<Norm>): NormTable => ({
  ...CREDIT_NORMS,
  [id]: { ...CREDIT_NORMS[id], ...change },
});

const active = (day: string, norms: NormTable = CREDIT_NORMS) =>
  activeRules(parseDate(day), norms).map(({ rule }) => rule.id);

describe('credit norm table', () => {
  it.each(Object.entries(CREDIT_NORMS))('%s is dated and links to its official text', (id, n) => {
    expect(n.id).toBe(id);
    expect(n.url).toMatch(
      /^https:\/\/(www\.boe\.es|eur-lex\.europa\.eu|portal\.mineco\.gob\.es)\//,
    );
    expect(n.inForceSince).toMatch(ISO);
    expect(n.inForceUntil).toBeNull();
    const reviewed = NORM_REVIEW[id as CreditNormId];
    if (reviewed !== null) expect(reviewed).toMatch(ISO);
  });

  it('the consumer credit law applies from 25-09-2011', () => {
    expect(CREDIT_NORMS.lcc).toMatchObject({ inForceSince: '2011-09-25', status: 'in_force' });
    const lccRules = (day: string) => active(day).filter((id) => STATUTE_RULES[id].norm === 'lcc');
    expect(lccRules('2011-09-24')).toEqual([]);
    expect(lccRules('2011-09-25')).toContain('withdrawal');
  });

  it.each([
    ['lru', 'BOE-A-1908-5579', '1908-08-13'],
    ['oeha', 'BOE-A-2011-17015', '2012-04-29'],
    ['lcc_annex_2013', 'BOE-A-2013-1338', '2013-02-09'],
  ] as const)('%s is %s, in force from %s', (id, boe, since) => {
    expect(CREDIT_NORMS[id]).toMatchObject({ status: 'in_force', inForceSince: since });
    expect(CREDIT_NORMS[id].url).toMatch(new RegExp(`id=${boe}$`));
  });

  it('the usury law reaches contracts of any date; the revolving chapter, from 27-01-2021', () => {
    expect(active('1990-01-01')).toEqual(['usury_law']);
    expect(active('2021-01-26')).not.toContain('revolving_info');
    expect(active('2021-01-27')).toContain('revolving_info');
    expect(active('2013-02-08')).not.toContain('tae_assumptions');
    expect(active('2013-02-09')).toContain('tae_assumptions');
  });

  it('the 2023 directive and the bill are drafts until a Spanish law is in force', () => {
    expect(CREDIT_NORMS.dcc_2023).toMatchObject({ status: 'draft', inForceSince: '2026-11-20' });
    expect(CREDIT_NORMS.consumer_credit_bill).toMatchObject({ status: 'draft' });
  });

  it('every norm backs a rule', () => {
    const cited = new Set(Object.values(STATUTE_RULES).map((r) => r.norm));
    expect(Object.keys(CREDIT_NORMS).filter((id) => !cited.has(id as CreditNormId))).toEqual([]);
  });
});

describe('credit rule table', () => {
  it.each(Object.entries(STATUTE_RULES))('%s rests on its norm from the day it starts', (id, r) => {
    expect(r.id).toBe(id);
    const norm = CREDIT_NORMS[r.norm];
    expect(r.from >= norm.inForceSince).toBe(true);
    expect(r.url.startsWith(norm.url)).toBe(true);
    expect(r.until).toBeNull();
    expect(r.supersededBy).toBeNull();
  });

  it('each rule of the consumer credit law links to its article in the consolidated BOE text', () => {
    const anchors = Object.fromEntries(
      Object.values(STATUTE_RULES)
        .filter((r) => r.norm === 'lcc')
        .map((r) => [r.id, r.url.replace(LCC, '')]),
    );
    expect(anchors).toEqual({
      consumer: '#a2',
      exclusions: '#a3',
      tae_formula: '#a32',
      tae_missing: '#a21',
      tae_inexact: '#a21',
      contract_mentions: '#a16',
      withdrawal: '#a28',
      early_repayment_cap: '#a30',
      early_repayment_none: '#a30',
      early_repayment_losses: '#a30',
      early_repayment_interest_cap: '#a30',
      unused_premium: '#a30',
    });
  });

  it('only the early repayment caps of art. 30 yield euros', () => {
    expect(
      Object.values(RULES)
        .filter((r) => r.output === 'amount')
        .map((r) => r.id),
    ).toEqual(['early_repayment_cap', 'early_repayment_none', 'early_repayment_interest_cap']);
  });

  it('a rule source carries the article, the norm and its status', () => {
    expect(ruleSource('early_repayment_cap', CREDIT_NORMS)).toMatchObject({
      id: 'early_repayment_cap',
      citation:
        'Ley de contratos de crédito al consumo, art. 30.2 (Ley 16/2011, de 24 de junio, de contratos de crédito al consumo)',
      url: `${LCC}#a30`,
      inForceSince: '2011-09-25',
      status: 'in_force',
    });
  });
});

describe('average-rate criteria', () => {
  it.each(Object.entries(CRITERION_RULES))('%s rests on case law and the BdE series', (id, r) => {
    expect(r.id).toBe(id);
    expect(r.norm).toBeNull();
    expect(r.output).toBe('indicator');
    expect(CREDIT_SOURCES[r.source].basis).toBe('case_law');
    expect(r.sources).toEqual([r.source, 'bde_be1904']);
  });

  it('the revolving criterion is read in its text; the loan one is not yet', () => {
    expect(criterionSource('usury_indicator_revolving', CREDIT_SOURCES)).toMatchObject({
      number: '258/2023',
      decidedOn: '2023-02-15',
      verified: true,
      ecli: null,
    });
    expect(criterionSource('usury_indicator_loan', CREDIT_SOURCES)).toMatchObject({
      number: '366/2026',
      decidedOn: '2026-03-09',
      verified: false,
      ecli: null,
    });
  });

  it.each(Object.entries(CREDIT_SOURCES))('%s says where and when it was read', (id, s) => {
    expect(s.id).toBe(id);
    expect(s.url).toMatch(/^https:\/\//);
    expect(s.lastVerified).toMatch(ISO);
    expect(s.inForceSince).toMatch(ISO);
  });
});

describe('the regime follows the day of the contract', () => {
  const BILL_RULES = ['repayment_under_500', 'withdrawal_cap_12m', 'tae_caps'];

  it('a draft changes nothing on any day', () => {
    for (const day of ['2026-01-07', '2026-11-19', '2026-11-20', '2030-01-01']) {
      expect(active(day)).not.toContain('directive_notice');
      for (const id of BILL_RULES) expect(active(day)).not.toContain(id);
    }
  });

  it('the bill brought into force from a later day reaches only contracts from that day', () => {
    const enacted = withNorm('consumer_credit_bill', {
      status: 'in_force',
      inForceSince: '2027-03-01',
    });
    const fromDay = (day: string) =>
      activeRules(parseDate(day), enacted)
        .map(({ rule }) => rule.id)
        .filter((id) => BILL_RULES.includes(id));
    expect(fromDay('2027-02-28')).toEqual([]);
    expect(active('2027-02-28', enacted)).toEqual(active('2027-02-28'));
    expect(fromDay('2027-03-01')).toEqual(BILL_RULES);
  });

  it('a draft brought into force reaches only contracts from its first day', () => {
    const enacted = withNorm('dcc_2023', { status: 'in_force' });
    expect(active('2026-11-19', enacted)).toEqual(active('2026-11-19'));
    expect(active('2026-11-20', enacted)).toEqual([...active('2026-11-20'), 'directive_notice']);
    expect(ruleApplies('directive_notice', parseDate('2026-11-20'), enacted)).toBe(true);
  });

  it('an amount can never rest on the draft', () => {
    const onDraft = {
      ...RULES,
      early_repayment_cap: { ...STATUTE_RULES.early_repayment_cap, norm: 'dcc_2023' as const },
    };
    expect(amountRuleBreaches(onDraft, CREDIT_SOURCES, CREDIT_NORMS)).toEqual([
      { rule: 'early_repayment_cap', reason: 'draft_norm', norm: 'dcc_2023' },
    ]);
  });
});
