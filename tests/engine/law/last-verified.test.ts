import { describe, expect, it } from 'vitest';
import type { LawSource } from '../../../src/engine/law/sources';
import { CASE_LAW_REVIEW_DAYS, staleCaseLaw } from '../../../src/engine/law/verification';
import { caseLaw, statute } from './fixtures';
import { LAW_SECTIONS } from './registry';

// CI checks on fixed days. The monthly review runs `CASE_LAW_REVIEW=1 npm run case-law:review`,
// which reads the real clock: a criterion nobody has reread in six months is listed there, and
// never turns an unrelated PR red.
const REVIEW = process.env['CASE_LAW_REVIEW'] === '1';

const latestReading = (sources: Readonly<Record<string, LawSource>>) =>
  Object.values(sources)
    .map((s) => s.lastVerified)
    .sort()
    .at(-1);

describe('case law last read', () => {
  const sources = { ruling: caseLaw({ lastVerified: '2030-06-01' }) };

  it(`is fresh up to ${CASE_LAW_REVIEW_DAYS} days after the reading`, () => {
    expect(staleCaseLaw(sources, '2030-11-28')).toEqual([]);
  });

  it('goes stale on the next day', () => {
    expect(staleCaseLaw(sources, '2030-11-29')).toEqual([sources.ruling]);
  });

  it('applies only to case law', () => {
    expect(
      staleCaseLaw({ statute: statute({ lastVerified: '2020-01-01' }) }, '2030-11-29'),
    ).toEqual([]);
  });

  // A review rereads the section's case law together: none is left over six months behind it.
  it.each(LAW_SECTIONS.map((s) => [s.name, s] as const))(
    '%s has no case law unread for over six months on the day of its latest reading',
    (_, section) => {
      const day = latestReading(section.sources);
      if (day === undefined) return;
      expect(staleCaseLaw(section.sources, day).map((s) => s.id)).toEqual([]);
    },
  );
});

describe.runIf(REVIEW)('monthly review of case law (by hand)', () => {
  it.each(LAW_SECTIONS.map((s) => [s.name, s] as const))(
    '%s has no case law unread for over six months today',
    (_, section) => {
      const today = new Date().toISOString().slice(0, 10);
      expect(staleCaseLaw(section.sources, today).map((s) => s.id)).toEqual([]);
    },
  );
});
