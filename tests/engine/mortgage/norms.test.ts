import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { amountRuleBreaches } from '../../../src/engine/law/verification';
import { MORTGAGE_NORMS, NORM_REVIEW } from '../../../src/engine/mortgage/data/norms';
import { MORTGAGE_SOURCES } from '../../../src/engine/mortgage/data/sources';
import type { MortgageNormId, SourceTable } from '../../../src/engine/mortgage/norms';
import {
  activeRules,
  CASE_LAW_RULES,
  caseLawSources,
  criterionReaches,
  ruleApplies,
  ruleSource,
  RULES,
  STATUTE_RULES,
  type CaseLawRuleId,
  type StatuteRuleId,
} from '../../../src/engine/mortgage/rules';

// Block ids of the consolidated texts as the BOE open data index gives them: the whole index of
// each norm, or only the cited blocks of the codes.
interface BoeIndex {
  readonly norms: Readonly<
    Record<string, { readonly whole: boolean; readonly blocks: Readonly<Record<string, string>> }>
  >;
}
const BOE_INDEX = JSON.parse(
  readFileSync(new URL('./fixtures/boe-index.json', import.meta.url), 'utf8'),
) as BoeIndex;

// The heading a rule's article should lead to: «Artículo 14» for «art. 14.1.e», «Artículo 25 bis»,
// «Disposición adicional primera».
const headingOf = (article: string): string => {
  const provision = /disposición (adicional|transitoria|final) [a-záéíóú]+/i.exec(article)?.[0];
  if (provision !== undefined)
    return provision.charAt(0).toUpperCase() + provision.slice(1).toLowerCase();
  const number = /arts?\. (\d+(?: bis)?)/.exec(article)?.[1];
  return `Artículo ${number ?? '?'}`;
};

// A wording of art. 23.6 LCCI links to the article of the decree-law that rewrote it.
const AMENDING_ARTICLE: Partial<Record<StatuteRuleId, string>> = {
  conversion_cap_2022: 'Artículo 12',
  conversion_cap_2023: 'Artículo 2',
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const BOE_ACT = /^https:\/\/www\.boe\.es\/buscar\/act\.php\?id=BOE-A-\d{4}-\d+$/;
const LCCI = 'https://www.boe.es/buscar/act.php?id=BOE-A-2019-3814';

const active = (day: string) =>
  activeRules(parseDate(day), MORTGAGE_NORMS).map(({ rule }) => rule.id);
const applies = (id: StatuteRuleId, day: string) => ruleApplies(id, parseDate(day), MORTGAGE_NORMS);
const reaches = (id: CaseLawRuleId, day: string) => criterionReaches(id, parseDate(day));

describe('mortgage norm table', () => {
  it.each(Object.entries(MORTGAGE_NORMS))('%s is dated and links to the BOE', (id, n) => {
    expect(n.id).toBe(id);
    expect(n.url).toMatch(BOE_ACT);
    expect(n.inForceSince).toMatch(ISO);
    expect(n.inForceUntil).toBeNull();
    expect(n.status).toBe(id === 'lcci_25bis' ? 'pending_validation' : 'in_force');
    expect(NORM_REVIEW[id as MortgageNormId]).toBeNull();
  });

  it('art. 25 bis rests on RDL 29/2026, pending validation, and is only explained', () => {
    expect(MORTGAGE_NORMS.lcci_25bis).toMatchObject({
      url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2026-20823',
      inForceSince: '2026-10-08',
      status: 'pending_validation',
    });
    expect(STATUTE_RULES.loan_assignment).toMatchObject({
      norm: 'lcci_25bis',
      url: `${LCCI}#a2`,
      from: '2026-10-08',
      output: 'info',
    });
    expect(applies('loan_assignment', '2026-10-07')).toBe(false);
    expect(ruleSource('loan_assignment', MORTGAGE_NORMS).status).toBe('pending_validation');
  });

  it.each([
    ['lcci', 'BOE-A-2019-3814', '2019-06-16'],
    ['trlitpajd29', 'BOE-A-1993-25359', '2018-11-10'],
    ['law41_2007', 'BOE-A-2007-21086', '2007-12-09'],
    ['rdl19_2022', 'BOE-A-2022-19403', '2022-11-24'],
    ['rdl8_2023', 'BOE-A-2023-26452', '2023-12-29'],
    ['lh114', 'BOE-A-1946-2453', '2013-05-15'],
    ['law1_2013', 'BOE-A-2013-5073', '2013-05-15'],
    ['cc', 'BOE-A-1889-4763', '1889-08-16'],
    ['lo1_2025', 'BOE-A-2025-76', '2025-04-03'],
    ['law44_2002', 'BOE-A-2002-22807', '2002-11-24'],
    ['lcci_25bis', 'BOE-A-2026-20823', '2026-10-08'],
  ] as const)('%s is %s, applied from %s', (id, boe, since) => {
    expect(MORTGAGE_NORMS[id].url.endsWith(`id=${boe}`)).toBe(true);
    expect(MORTGAGE_NORMS[id].inForceSince).toBe(since);
  });

  it('every norm backs a rule', () => {
    const cited = new Set(Object.values(STATUTE_RULES).map((r) => r.norm));
    expect(Object.keys(MORTGAGE_NORMS).filter((id) => !cited.has(id as MortgageNormId))).toEqual(
      [],
    );
  });
});

describe('mortgage statute rules', () => {
  it.each(Object.entries(STATUTE_RULES))('%s rests on its norm, within its days', (id, r) => {
    expect(r.id).toBe(id);
    expect(r.basis).toBe('statute');
    expect(r.sources).toEqual([]);
    expect(r.from >= MORTGAGE_NORMS[r.norm].inForceSince).toBe(true);
    if (r.until !== null) expect(r.until > r.from).toBe(true);
    expect(r.url).toMatch(/^https:\/\/www\.boe\.es\/buscar\/act\.php\?id=BOE-A-\d{4}-\d+#[\w-]+$/);
    expect(r.supersededBy).toBeNull();
  });

  it.each(Object.entries(STATUTE_RULES))(
    '%s links to a block of the BOE index headed by its article',
    (id, r) => {
      const [page, anchor] = r.url.split('#');
      const boeId = /id=(BOE-A-\d{4}-\d+)/.exec(page ?? '')?.[1] ?? '';
      const heading = BOE_INDEX.norms[boeId]?.blocks[anchor ?? ''];
      expect(heading, `${boeId}#${anchor ?? ''}`).toBeDefined();
      expect(heading?.replace(/^Art /, 'Artículo ')).toBe(
        AMENDING_ARTICLE[id as StatuteRuleId] ?? headingOf(r.article),
      );
    },
  );

  it('anchors the LCCI the way its consolidated text does', () => {
    const lcci = BOE_INDEX.norms['BOE-A-2019-3814']?.blocks ?? {};
    expect(lcci['ar']).toBe('Artículo 1');
    expect(lcci['ar-23']).toBe('Artículo 23');
    expect(lcci['a2']).toBe('Artículo 25 bis');
    expect(lcci['a14']).toBeUndefined();
    expect(STATUTE_RULES.expenses_lcci.url).toBe(`${LCCI}#ar-14`);
    expect(STATUTE_RULES.conversion_cap_2022.url).toBe(
      'https://www.boe.es/buscar/act.php?id=BOE-A-2022-19403#a1-4',
    );
  });

  it('a rule source carries the article, the norm and its status', () => {
    expect(ruleSource('expenses_lcci', MORTGAGE_NORMS)).toMatchObject({
      id: 'expenses_lcci',
      citation:
        'Ley de contratos de crédito inmobiliario, art. 14.1.e (Ley 5/2019, de 15 de marzo, reguladora de los contratos de crédito inmobiliario)',
      url: `${LCCI}#ar-14`,
      inForceSince: '2019-06-16',
      status: 'in_force',
    });
  });

  it('only the set-up costs by law, the deed tax and the fee caps yield euros', () => {
    expect(
      Object.values(RULES)
        .filter((r) => r.output === 'amount')
        .map((r) => [r.id, r.basis]),
    ).toEqual([
      ['expenses_lcci', 'statute'],
      ['transparency_act_free', 'statute'],
      ['ajd_lender', 'statute'],
      ['prepayment_lcci_variable', 'statute'],
      ['prepayment_lcci_fixed', 'statute'],
      ['conversion_cap_2019', 'statute'],
      ['conversion_cap_2022', 'statute'],
      ['conversion_cap_2023', 'statute'],
      ['fee_free_window', 'statute'],
      ['prepayment_law41', 'statute'],
    ]);
  });
});

describe('the regime follows the date', () => {
  it.each([
    ['2019-06-15', false],
    ['2019-06-16', true],
  ])('the LCCI set-up costs reach a deed of %s: %s', (day, expected) => {
    expect(applies('expenses_lcci', day)).toBe(expected);
    expect(reaches('expenses_ts_split', day)).toBe(!expected);
  });

  it.each([
    ['2018-11-09', false],
    ['2018-11-10', true],
  ])('the lender bears the deed tax on a deed of %s: %s', (day, expected) => {
    expect(applies('ajd_lender', day)).toBe(expected);
    expect(reaches('ajd_borrower_before_2018', day)).toBe(!expected);
  });

  it.each([
    ['2021-05-10', 'conversion_cap_2019'],
    ['2022-11-23', 'conversion_cap_2019'],
    ['2022-11-24', 'conversion_cap_2022'],
    ['2023-03-15', 'conversion_cap_2022'],
    ['2023-12-28', 'conversion_cap_2022'],
    ['2023-12-29', 'conversion_cap_2023'],
    ['2024-02-15', 'conversion_cap_2023'],
  ] as const)('a switch to fixed on %s falls under %s alone', (day, id) => {
    expect(active(day).filter((r) => r.startsWith('conversion_cap'))).toEqual([id]);
  });

  it.each([
    ['2022-11-23', false],
    ['2022-11-24', true],
    ['2024-12-31', true],
    ['2025-01-01', false],
  ])('the window without compensation covers %s: %s', (day, expected) => {
    expect(applies('fee_free_window', day)).toBe(expected);
  });

  it.each([
    ['2007-12-08', false],
    ['2007-12-09', true],
    ['2019-06-15', true],
    ['2019-06-16', false],
  ])('Ley 41/2007 caps reach a deed of %s: %s', (day, expected) => {
    expect(applies('prepayment_law41', day)).toBe(expected);
  });

  it.each([
    ['2013-05-14', false],
    ['2013-05-15', true],
    ['2019-06-15', true],
    ['2019-06-16', false],
  ])('the 2013 late interest cap and handwritten statement reach %s: %s', (day, expected) => {
    expect(applies('default_interest_lh114', day)).toBe(expected);
    expect(applies('handwritten_statement', day)).toBe(expected);
    expect(applies('default_interest_statute', day)).toBe(!expected && day >= '2019-06-16');
  });

  it.each([
    ['2025-04-02', false],
    ['2025-04-03', true],
  ])('the step of art. 439 bis LEC exists on %s: %s', (day, expected) => {
    expect(applies('prior_step_439bis', day)).toBe(expected);
  });
});

describe('mortgage case-law rules', () => {
  it.each(Object.entries(CASE_LAW_RULES))('%s rests only on rulings', (id, r) => {
    expect(r.id).toBe(id);
    expect(r.norm).toBeNull();
    expect(r.basis).toBe('case_law');
    expect(r.sources.length).toBeGreaterThan(0);
    for (const s of caseLawSources(r.id, MORTGAGE_SOURCES)) expect(s.basis).toBe('case_law');
  });

  it('give no figure while a ruling they rest on is unread at its source', () => {
    for (const r of Object.values(CASE_LAW_RULES)) {
      const unverified = caseLawSources(r.id, MORTGAGE_SOURCES).some((s) => !s.verified);
      if (unverified) expect(r.output, r.id).toBe('info');
    }
    expect(CASE_LAW_RULES.expenses_ts_split.output).toBe('info');
    expect(CASE_LAW_RULES.expenses_interest.output).toBe('info');
  });

  // Once the rulings are opened in CENDOJ the split and its interest may give a figure again.
  it.each(['expenses_ts_split', 'expenses_interest'] as const)(
    '%s may yield an amount once its rulings are verified',
    (id) => {
      const rules = { ...RULES, [id]: { ...CASE_LAW_RULES[id], output: 'amount' as const } };
      const read: SourceTable = Object.fromEntries(
        Object.entries(MORTGAGE_SOURCES).map(([k, s]) => [k, { ...s, verified: true }]),
      ) as SourceTable;
      expect(amountRuleBreaches(rules, read, MORTGAGE_NORMS)).toEqual([]);
      expect(amountRuleBreaches(rules, MORTGAGE_SOURCES, MORTGAGE_NORMS)).not.toEqual([]);
    },
  );

  it('the Supreme Court split cites only rulings 35/2021 and 816/2023 and C-224/19', () => {
    expect(CASE_LAW_RULES.expenses_ts_split.sources).toEqual([
      'sts35_2021',
      'sts816_2023',
      'tjue_c224_19',
    ]);
  });

  it('a statute rule never rests on case law alone, nor a criterion on a norm', () => {
    for (const r of Object.values(RULES)) {
      if (r.basis === 'statute') expect(r.norm, r.id).not.toBeNull();
      else expect(r.norm, r.id).toBeNull();
    }
  });
});
