import { describe, expect, it } from 'vitest';
import { MORTGAGE_SOURCES } from '../../../src/engine/mortgage/data/sources';
import { MORTGAGE_TEXTS } from '../../../src/engine/mortgage/data/texts';
import { CASE_LAW_RULES } from '../../../src/engine/mortgage/rules';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe('mortgage case-law sources', () => {
  it.each(Object.entries(MORTGAGE_SOURCES))('%s says where and when it was read', (id, s) => {
    expect(s.id).toBe(id);
    expect(s.basis).toBe('case_law');
    expect(s.lastVerified).toMatch(ISO);
    if (s.basis !== 'case_law') return;
    expect(s.decidedOn).toMatch(ISO);
    expect(s.inForceSince).toBe(s.decidedOn);
  });

  it('every source backs a rule', () => {
    const cited = new Set(Object.values(CASE_LAW_RULES).flatMap((r) => r.sources));
    expect(Object.keys(MORTGAGE_SOURCES).filter((id) => !cited.has(id as never))).toEqual([]);
  });

  it('no Supreme Court ruling counts as read until it is opened in CENDOJ', () => {
    for (const s of Object.values(MORTGAGE_SOURCES)) {
      if (s.basis !== 'case_law' || !s.court.startsWith('Tribunal Supremo')) continue;
      expect(s, s.id).toMatchObject({ verified: false, ecli: null });
      expect(s.url).toBe('https://www.poderjudicial.es/search/indexAN.jsp');
    }
  });

  it('the Court of Justice judgments link to EUR-Lex by their number', () => {
    for (const s of Object.values(MORTGAGE_SOURCES)) {
      if (s.basis !== 'case_law' || s.court.startsWith('Tribunal Supremo')) continue;
      expect(s.verified, s.id).toBe(true);
      const [first] = s.number.split(/[ ,]/);
      const [num, yy] = (first ?? '').replace('C-', '').split('/');
      expect(s.url).toBe(
        `https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:620${yy}CJ${num?.padStart(4, '0')}`,
      );
      expect(s.ecli, s.id).toMatch(new RegExp(`^ECLI:EU:C:${s.decidedOn.slice(0, 4)}:\\d+$`));
    }
  });

  it('quotes nothing yet: a passage is added only when read word for word', () => {
    for (const s of Object.values(MORTGAGE_SOURCES)) expect(s.quotes).toEqual([]);
  });
});

describe('mortgage norm passages', () => {
  it.each(Object.entries(MORTGAGE_TEXTS))(
    '%s is a statute read word for word in the BOE',
    (id, s) => {
      expect(s.id).toBe(id);
      expect(s).toMatchObject({ basis: 'statute', verified: true });
      expect(s.lastVerified).toMatch(ISO);
      expect(s.url).toMatch(/^https:\/\/www\.boe\.es\/buscar\/act\.php\?id=BOE-A-\d{4}-\d+#a/);
      expect(s.quotes.length).toBeGreaterThan(0);
    },
  );
});
