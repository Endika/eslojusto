import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { HOUSEHOLD_NORMS, NORM_REVIEW } from '../../../src/engine/household/data/norms';
import { ARTICLE_WATCH } from '../../../src/engine/household/data/watch';
import type { HouseholdNormId, Norm, NormTable } from '../../../src/engine/household/norms';
import { activeRules, ruleSource, RULES } from '../../../src/engine/household/rules';

const BOE = 'https://www.boe.es/';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const withNorm = (id: HouseholdNormId, change: Partial<Norm>): NormTable => ({
  ...HOUSEHOLD_NORMS,
  [id]: { ...HOUSEHOLD_NORMS[id], ...change },
});

describe('household norm table', () => {
  it.each(Object.entries(HOUSEHOLD_NORMS))('%s is dated and sourced in the BOE', (id, n) => {
    expect(n.id).toBe(id);
    expect(n.url.startsWith(BOE)).toBe(true);
    expect(n.inForceSince).toMatch(ISO);
    if (n.inForceUntil !== null) expect(n.inForceUntil >= n.inForceSince).toBe(true);
    expect(n.status).toBe('in_force');
    expect(NORM_REVIEW[id as HouseholdNormId]).toMatch(ISO);
  });

  it('names the two instruments by their BOE ids', () => {
    expect(HOUSEHOLD_NORMS.rd1620_2011.url).toContain('BOE-A-2011-17975');
    expect(HOUSEHOLD_NORMS.rdl16_2022.url).toContain('BOE-A-2022-14680');
    expect(HOUSEHOLD_NORMS.rdl16_2022.inForceSince).toBe('2022-09-09');
  });

  it('every norm backs a rule, a minimum wage year or a watched article', () => {
    const cited = new Set<string>([
      ...Object.values(RULES).map((r) => r.norm),
      ...MINIMUM_WAGE.map((r) => r.norm),
      ...ARTICLE_WATCH.articles.map((a) => a.norm),
    ]);
    expect(Object.keys(HOUSEHOLD_NORMS).filter((id) => !cited.has(id))).toEqual([]);
  });

  it('holds every decree the minimum wage table rests on', () => {
    for (const row of MINIMUM_WAGE) {
      const norm = Object.values(HOUSEHOLD_NORMS).find((n) => n.id === row.norm);
      expect(norm?.url, row.norm).toBe(row.url);
    }
  });
});

describe('household rule table', () => {
  it.each(Object.entries(RULES))('%s rests on a norm in force when it starts', (id, r) => {
    expect(r.id).toBe(id);
    const norm = HOUSEHOLD_NORMS[r.norm];
    expect(norm).toBeDefined();
    expect(r.from >= norm.inForceSince).toBe(true);
    expect(r.url.startsWith(BOE)).toBe(true);
    expect(r.until).toBeNull();
    expect(r.supersededBy).toBeNull();
  });

  it('watches every article the rules rest on', () => {
    expect(ARTICLE_WATCH.articles.map((a) => [a.norm, a.block])).toEqual([
      ['rd1620_2011', 'a8'],
      ['rd1620_2011', 'a9'],
      ['rd1620_2011', 'a11'],
      ['et', 'a49'],
      ['lgss', 'a267'],
      ['lgss', 'a269'],
      ['cc', 'art5'],
    ]);
    // The versions in force the BOE API lists for each block.
    expect(
      ARTICLE_WATCH.articles.map((a) => [a.block, a.versionInForceSince, a.lastAmendedBy]),
    ).toEqual([
      ['a8', '2011-11-18', 'BOE-A-2011-17975'],
      ['a9', '2013-12-22', 'BOE-A-2013-13426'],
      ['a11', '2022-09-09', 'BOE-A-2022-14680'],
      ['a49', '2025-05-01', 'BOE-A-2025-8567'],
      ['a267', '2023-03-02', 'BOE-A-2023-5365'],
      ['a269', '2024-05-23', 'BOE-A-2024-10235'],
      ['art5', '1974-07-29', 'BOE-A-1974-1083'],
    ]);
    // Each article a rule links to, by its BOE id and anchor, is one of them.
    const cited = new Set(
      Object.values(RULES)
        .filter((r) => r.url.includes('#'))
        .map((r) => `${r.url.replace(/^.*id=/, '').split('#')[0]}#${r.url.split('#')[1]}`),
    );
    const watched = new Set(
      ARTICLE_WATCH.articles.map((a) => `${a.apiUrl.split('/id/')[1]?.split('/')[0]}#${a.block}`),
    );
    expect(watched).toEqual(cited);
  });

  it('every rule starts with the reform, except the unemployment contribution and benefit rules that start on 01-10-2022', () => {
    const starts = Object.values(RULES).map((r) => r.from);
    expect(new Set(starts)).toEqual(new Set(['2022-09-09', '2022-10-01']));
    const late = Object.values(RULES)
      .filter((r) => r.from === '2022-10-01')
      .map((r) => r.id);
    expect(late).toEqual(['unemployment_contribution', 'unemployment_general']);
  });

  it('applies no rule before 09-09-2022', () => {
    expect(activeRules(parseDate('2022-09-08'), HOUSEHOLD_NORMS)).toEqual([]);
    expect(activeRules(parseDate('2022-09-09'), HOUSEHOLD_NORMS).length).toBeGreaterThan(10);
  });

  it('a rule source carries the citation and the norm status', () => {
    expect(ruleSource('desistimiento_notice', HOUSEHOLD_NORMS)).toMatchObject({
      id: 'desistimiento_notice',
      citation:
        'Real Decreto 1620/2011, art. 11.2 (Real Decreto-ley 16/2022, de 6 de septiembre, para la mejora de las condiciones de trabajo y de Seguridad Social de las personas trabajadoras al servicio del hogar)',
      url: `${BOE}buscar/act.php?id=BOE-A-2011-17975#a11`,
      inForceSince: '2022-09-09',
      status: 'in_force',
    });
  });

  it('an injected repeal moves only the rules resting on that norm', () => {
    const repealed = withNorm('cc', {
      status: 'repealed',
      inForceUntil: '2026-12-31',
      statusSince: '2026-12-31',
      statusUrl: `${BOE}diario_boe/txt.php?id=BOE-A-2026-99999`,
    });
    const doubtful = activeRules(parseDate('2026-11-02'), repealed)
      .filter(({ doubt }) => doubt !== null)
      .map(({ rule }) => rule.norm);
    expect(new Set(doubtful)).toEqual(new Set(['cc']));
  });
});
