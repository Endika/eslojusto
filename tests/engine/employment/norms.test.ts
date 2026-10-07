import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { EMPLOYMENT_NORMS, NORM_REVIEW } from '../../../src/engine/employment/data/norms';
import { ARTICLE_WATCH } from '../../../src/engine/employment/data/watch';
import type { EmploymentNormId, Norm, NormTable } from '../../../src/engine/employment/norms';
import { activeRules, ruleSource, RULES } from '../../../src/engine/employment/rules';

const BOE = 'https://www.boe.es/';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const withNorm = (id: EmploymentNormId, change: Partial<Norm>): NormTable => ({
  ...EMPLOYMENT_NORMS,
  [id]: { ...EMPLOYMENT_NORMS[id], ...change },
});

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });

describe('employment norm table', () => {
  it.each(Object.entries(EMPLOYMENT_NORMS))('%s is dated and sourced in the BOE', (id, n) => {
    expect(n.id).toBe(id);
    expect(n.url.startsWith(BOE)).toBe(true);
    expect(n.inForceSince).toMatch(ISO);
    if (n.inForceUntil !== null) expect(n.inForceUntil >= n.inForceSince).toBe(true);
    expect(n.status).toBe('in_force');
    expect(NORM_REVIEW[id as EmploymentNormId]).toMatch(ISO);
  });

  it('every norm backs a rule, a minimum wage year or a watched article', () => {
    const cited = new Set<string>([
      ...Object.values(RULES).map((r) => r.norm),
      ...MINIMUM_WAGE.map((r) => r.norm),
      ...ARTICLE_WATCH.articles.map((a) => a.norm),
    ]);
    const amending = ARTICLE_WATCH.articles.map((a) => a.lastAmendedBy);
    const unused = Object.values(EMPLOYMENT_NORMS).filter(
      (n) => !cited.has(n.id) && !amending.some((boeId) => n.url.includes(boeId)),
    );
    expect(unused.map((n) => n.id)).toEqual([]);
  });
});

describe('employment rule table', () => {
  it.each(Object.entries(RULES))('%s rests on a norm in force when it starts', (id, r) => {
    expect(r.id).toBe(id);
    const norm = EMPLOYMENT_NORMS[r.norm];
    expect(norm).toBeDefined();
    expect(r.from >= norm.inForceSince).toBe(true);
    expect(r.url.startsWith(BOE)).toBe(true);
    expect(r.until).toBeNull();
    expect(r.supersededBy).toBeNull();
  });

  it('has no rule for a working week or a time record that is not in the BOE', () => {
    expect(Object.keys(RULES).filter((id) => /375|digital/.test(id))).toEqual([]);
    const offending = filesUnder('src/engine/employment').filter((path) =>
      /\b37[.,]5\b/.test(readFileSync(path, 'utf8')),
    );
    expect(offending).toEqual([]);
  });

  it('the reformed fixed-term rules start on 30-03-2022', () => {
    const on = (day: string) =>
      activeRules(parseDate(day), EMPLOYMENT_NORMS)
        .map(({ rule }) => rule.id)
        .filter((id) => id === 'fixed_term_presumption' || id === 'abolished_modalities');
    expect(on('2022-03-29')).toEqual([]);
    expect(on('2022-03-30')).toEqual(['fixed_term_presumption', 'abolished_modalities']);
  });

  it('the agri-food occasional limit applies from 02-01-2025', () => {
    const has = (day: string) =>
      activeRules(parseDate(day), EMPLOYMENT_NORMS).some(
        ({ rule }) => rule.id === 'production_occasional_agrifood_120',
      );
    expect(has('2025-01-01')).toBe(false);
    expect(has('2025-01-02')).toBe(true);
  });

  it('a rule source carries the citation and the norm status', () => {
    expect(ruleSource('permanent_on_breach', EMPLOYMENT_NORMS)).toMatchObject({
      id: 'permanent_on_breach',
      citation:
        'Estatuto de los Trabajadores, art. 15.4 (Real Decreto-ley 32/2021, de 28 de diciembre)',
      url: `${BOE}buscar/act.php?id=BOE-A-2015-11430#a15`,
      inForceSince: '2021-12-31',
      status: 'in_force',
    });
  });

  it('an injected repeal moves only the rules resting on that norm', () => {
    const repealed = withNorm('rd723_2026', {
      status: 'repealed',
      inForceUntil: '2026-12-31',
      statusSince: '2026-12-31',
      statusUrl: `${BOE}diario_boe/txt.php?id=BOE-A-2026-99999`,
    });
    const doubtful = activeRules(parseDate('2026-11-02'), repealed)
      .filter(({ doubt }) => doubt !== null)
      .map(({ rule }) => rule.norm);
    expect(new Set(doubtful)).toEqual(new Set(['rd723_2026']));
    expect(ruleSource('info_elements', repealed).status).toBe('repealed');
  });
});
