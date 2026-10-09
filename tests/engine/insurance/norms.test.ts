import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { INSURANCE_NORMS, NORM_REVIEW } from '../../../src/engine/insurance/data/norms';
import type { InsuranceNormId, Norm, NormTable } from '../../../src/engine/insurance/norms';
import { activeRules, ruleSource, RULES } from '../../../src/engine/insurance/rules';

const BOE = 'https://www.boe.es/';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const withNorm = (id: InsuranceNormId, change: Partial<Norm>): NormTable => ({
  ...INSURANCE_NORMS,
  [id]: { ...INSURANCE_NORMS[id], ...change },
});

describe('insurance norm table', () => {
  it.each(Object.entries(INSURANCE_NORMS))('%s is dated and sourced in the BOE', (id, n) => {
    expect(n.id).toBe(id);
    expect(n.url.startsWith(BOE)).toBe(true);
    expect(n.inForceSince).toMatch(ISO);
    expect(n.inForceUntil).toBeNull();
    expect(n.status).toBe('in_force');
    const reviewed = NORM_REVIEW[id as InsuranceNormId];
    if (reviewed !== null) expect(reviewed).toMatch(ISO);
  });

  it('every norm backs a rule', () => {
    const cited = new Set(Object.values(RULES).map((r) => r.norm));
    expect(Object.keys(INSURANCE_NORMS).filter((id) => !cited.has(id as InsuranceNormId))).toEqual(
      [],
    );
  });
});

describe('insurance rule table', () => {
  it.each(Object.entries(RULES))('%s rests on a norm in force when it starts', (id, r) => {
    expect(r.id).toBe(id);
    const norm = INSURANCE_NORMS[r.norm];
    expect(r.from >= norm.inForceSince).toBe(true);
    expect(r.url.startsWith(norm.url)).toBe(true);
    expect(r.until).toBeNull();
    expect(r.supersededBy).toBeNull();
  });

  // The consolidated LCS names its blocks in words, Ley 22/2007 in figures.
  it('each rule links to its article block in the consolidated BOE text', () => {
    expect(
      Object.fromEntries(Object.values(RULES).map((r) => [r.id, r.url.split('#')[1]])),
    ).toEqual({
      non_renewal: 'aveintidos',
      change_notice: 'aveintidos',
      policy_correction: 'aoctavo',
      questionnaire: 'adiez',
      proportional_rule: 'atreinta',
      overinsurance: 'atreintayuno',
      distance_withdrawal: 'a10',
      distance_withdrawal_excluded: 'a10',
    });
  });

  it('the distance selling law applies from its entry into force, three months after publication', () => {
    expect(INSURANCE_NORMS.law22_2007.inForceSince).toBe('2007-10-12');
    expect(INSURANCE_NORMS.lcs.inForceSince).toBe('1981-04-17');
    const applies = (day: string) =>
      activeRules(parseDate(day), INSURANCE_NORMS).some(
        ({ rule }) => rule.id === 'distance_withdrawal',
      );
    expect(applies('2007-10-11')).toBe(false);
    expect(applies('2007-10-12')).toBe(true);
  });

  it('no rule yields euros', () => {
    expect(Object.values(RULES).filter((r) => r.output === 'amount')).toEqual([]);
  });

  it('the notice periods of art. 22 LCS apply in their current wording from 01-01-2016', () => {
    const on = (day: string) =>
      activeRules(parseDate(day), INSURANCE_NORMS)
        .map(({ rule }) => rule.id)
        .filter((id) => id === 'non_renewal' || id === 'change_notice');
    expect(on('2015-12-31')).toEqual([]);
    expect(on('2016-01-01')).toEqual(['non_renewal', 'change_notice']);
  });

  it('a rule source carries the citation and the norm status', () => {
    expect(ruleSource('non_renewal', INSURANCE_NORMS)).toMatchObject({
      id: 'non_renewal',
      citation:
        'Ley de Contrato de Seguro, art. 22.2 (Ley 50/1980, de 8 de octubre, de Contrato de Seguro)',
      url: `${BOE}buscar/act.php?id=BOE-A-1980-22501#aveintidos`,
      inForceUntil: null,
      status: 'in_force',
    });
  });

  it('an injected repeal of the distance selling law moves only its rules', () => {
    const repealed = withNorm('law22_2007', {
      status: 'repealed',
      inForceUntil: '2027-06-30',
      statusSince: '2027-06-30',
      statusUrl: `${BOE}diario_boe/txt.php?id=BOE-A-2027-99999`,
    });
    const doubtful = activeRules(parseDate('2027-03-01'), repealed)
      .filter(({ doubt }) => doubt !== null)
      .map(({ rule }) => rule.id);
    expect(doubtful).toEqual(['distance_withdrawal', 'distance_withdrawal_excluded']);
    expect(ruleSource('distance_withdrawal', repealed).status).toBe('repealed');
  });
});
