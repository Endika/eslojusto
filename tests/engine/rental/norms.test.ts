import { describe, expect, it } from 'vitest';
import { addDays, parseDate, toIso } from '../../../src/engine/date';
import { NORMS } from '../../../src/engine/rental/data/norms';
import {
  normStanding,
  type Norm,
  type NormId,
  type NormTable,
} from '../../../src/engine/rental/norms';
import { activeRules, ruleSource, RULES, type RuleId } from '../../../src/engine/rental/rules';

const BOE = 'https://www.boe.es/';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const withNorm = (id: NormId, change: Partial<Norm>): NormTable => ({
  ...NORMS,
  [id]: { ...NORMS[id], ...change },
});
const rdl29Repealed = withNorm('rdl29_2026', {
  status: 'repealed',
  inForceUntil: '2026-11-05',
  statusSince: '2026-11-05',
  statusUrl: `${BOE}diario_boe/txt.php?id=BOE-A-2026-99999`,
});

const rulesOn = (day: string, norms: NormTable, prefix: string) =>
  activeRules(parseDate(day), norms)
    .filter(({ rule }) => rule.id.startsWith(prefix))
    .map(({ rule, doubt }) => [rule.id, doubt]);

describe('norm table', () => {
  it.each(Object.entries(NORMS))('%s is dated, sourced in the BOE and keyed by its id', (id, n) => {
    expect(n.id).toBe(id);
    expect(n.url.startsWith(BOE)).toBe(true);
    expect(n.inForceSince).toMatch(ISO);
    if (n.inForceUntil !== null && n.status !== 'repealed')
      expect(n.inForceUntil >= n.inForceSince).toBe(true);
    if (n.endUncertainUntil !== undefined)
      expect(n.endUncertainUntil > (n.inForceUntil ?? '')).toBe(true);
    expect(n.statusSince === null).toBe(n.statusUrl === null);
    if (n.statusUrl !== null) expect(n.statusUrl.startsWith(BOE)).toBe(true);
  });

  it('a repealed norm says when it ended and where the repeal was published', () => {
    const repealed = Object.values(NORMS).filter((n) => n.status === 'repealed');
    expect(repealed.map((n) => n.id).sort()).toEqual(['rdl26_2026', 'rdl8_2026']);
    for (const n of repealed) {
      expect(n.inForceUntil).toMatch(ISO);
      expect(n.statusSince).toMatch(ISO);
    }
  });
});

describe('rule table', () => {
  it.each(Object.entries(RULES))('%s rests on a norm in force when it starts', (id, r) => {
    expect(r.id).toBe(id);
    const norm = NORMS[r.norm];
    expect(norm).toBeDefined();
    expect(r.from >= norm.inForceSince).toBe(true);
    if (r.until !== null) expect(r.until >= r.from).toBe(true);
    expect(r.url.startsWith(BOE)).toBe(true);
    if (r.supersededBy !== null) {
      expect(r.supersededBy).not.toBe(id);
      expect(RULES[r.supersededBy].from > r.from).toBe(true);
    }
  });

  it('every norm backs at least one rule', () => {
    const cited = new Set(Object.values(RULES).map((r) => r.norm));
    expect(Object.keys(NORMS).filter((id) => !cited.has(id as NormId))).toEqual([]);
  });
});

describe('rule sources', () => {
  it('carry the norm validity and status', () => {
    const s = ruleSource('cap_2_rdl29', NORMS);
    expect(s).toMatchObject({
      id: 'cap_2_rdl29',
      citation: 'disposición final 6.ª (Real Decreto-ley 29/2026, de 6 de octubre)',
      inForceSince: '2026-10-08',
      inForceUntil: null,
      status: 'pending_validation',
      statusSince: null,
    });
  });

  it('follow a change of status without touching the rule', () => {
    expect(ruleSource('cap_2_rdl29', rdl29Repealed)).toMatchObject({
      status: 'repealed',
      inForceUntil: '2026-11-05',
      statusSince: '2026-11-05',
    });
  });

  it('show the widened end of a repealed norm', () => {
    expect(ruleSource('cap_2_rdl8', NORMS)).toMatchObject({
      status: 'repealed',
      inForceUntil: '2026-04-29',
      endUncertainUntil: '2026-04-30',
      statusUrl: `${BOE}diario_boe/txt.php?id=BOE-A-2026-9359`,
    });
  });
});

describe('rules active on a day', () => {
  it.each([
    ['2019-03-05', []],
    ['2019-03-06', [['fees_2019', null]]],
    ['2023-05-25', [['fees_2019', null]]],
    ['2023-05-26', [['fees_2023', null]]],
    ['2026-10-07', [['fees_2023', null]]],
  ])('agency fees for a contract signed on %s', (day, expected) => {
    expect(rulesOn(day, NORMS, 'fees_')).toEqual(expected);
  });

  it('a rule pending validation keeps the one it would replace, both in doubt', () => {
    expect(rulesOn('2026-10-08', NORMS, 'fees_')).toEqual([
      ['fees_2023', 'pending_validation'],
      ['fees_2026', 'pending_validation'],
    ]);
  });

  it('once validated, the new rule stands alone', () => {
    const validated = withNorm('rdl29_2026', {
      status: 'in_force',
      statusSince: '2026-11-05',
      statusUrl: `${BOE}diario_boe/txt.php?id=BOE-A-2026-99998`,
    });
    expect(rulesOn('2026-10-20', validated, 'fees_')).toEqual([['fees_2026', null]]);
  });

  it('once repealed, its window is in doubt and the earlier rule comes back after it', () => {
    expect(rulesOn('2026-10-20', rdl29Repealed, 'fees_')).toEqual([
      ['fees_2023', 'repealed_window'],
      ['fees_2026', 'repealed_window'],
    ]);
    expect(rulesOn('2026-11-06', rdl29Repealed, 'fees_')).toEqual([['fees_2023', null]]);
  });

  it.each([
    ['2026-03-21', []],
    ['2026-03-22', [['cap_2_rdl8', 'repealed_window']]],
    ['2026-04-30', [['cap_2_rdl8', 'repealed_window']]],
    ['2026-05-01', []],
    ['2026-10-01', [['cap_2_rdl26', 'repealed_window']]],
    ['2026-10-02', [['cap_2_rdl26', 'repealed_window']]],
    ['2026-10-03', []],
    ['2026-10-08', [['cap_2_rdl29', 'pending_validation']]],
    ['2027-12-31', [['cap_2_rdl29', 'pending_validation']]],
    ['2028-01-01', []],
  ])('a 2 %% cap on an anniversary of %s', (day, expected) => {
    expect(rulesOn(day, NORMS, 'cap_2_')).toEqual(expected);
  });

  it('a clause naming no index follows the IRAV only in the reading where RDL 29/2026 holds', () => {
    expect(rulesOn('2026-10-07', NORMS, 'update_clause')).toEqual([['update_clause', null]]);
    expect(rulesOn('2026-10-08', NORMS, 'update_clause')).toEqual([
      ['update_clause', 'pending_validation'],
      ['update_clause_rdl29', 'pending_validation'],
    ]);
  });

  it('the tacit renewal in force is in doubt once RDL 28/2026 takes effect', () => {
    expect(rulesOn('2026-11-14', NORMS, 'term_')).toEqual([
      ['term_minimum', null],
      ['term_tacit', null],
    ]);
    expect(rulesOn('2026-11-15', NORMS, 'term_')).toEqual([
      ['term_minimum', null],
      ['term_tacit', 'pending_validation'],
      ['term_rdl28', 'pending_validation'],
    ]);
  });

  it('a norm repealed before it took effect never applies', () => {
    const neverInForce = withNorm('rdl28_2026', {
      status: 'repealed',
      inForceUntil: '2026-11-13',
      statusSince: '2026-11-14',
      statusUrl: `${BOE}diario_boe/txt.php?id=BOE-A-2026-99997`,
    });
    expect(normStanding(neverInForce.rdl28_2026, '2026-11-15')).toBe('not_in_force');
    expect(rulesOn('2026-11-20', neverInForce, 'term_')).toEqual([
      ['term_minimum', null],
      ['term_tacit', null],
    ]);
  });

  it('a temporary cap ends on its last day', () => {
    expect(rulesOn('2024-12-31', NORMS, 'cap_3_')).toEqual([['cap_3_2024', null]]);
    expect(rulesOn('2025-01-01', NORMS, 'cap_3_')).toEqual([]);
  });

  it('changing one norm only moves the rules that rest on it', () => {
    const touches = (id: RuleId): boolean => {
      const r = RULES[id];
      return (
        r.norm === 'rdl29_2026' ||
        (r.supersededBy !== null && RULES[r.supersededBy].norm === 'rdl29_2026')
      );
    };
    const untouched = (norms: NormTable, day: string) =>
      activeRules(parseDate(day), norms).filter(({ rule }) => !touches(rule.id));
    for (let i = 0; i < 4000; i += 7) {
      const day = toIso(addDays(parseDate('2019-01-01'), i));
      expect(untouched(rdl29Repealed, day)).toEqual(untouched(NORMS, day));
    }
  });
});
