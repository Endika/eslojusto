import { describe, expect, it } from 'vitest';
import { CASE_LAW_REVIEW_DAYS, staleCaseLaw } from '../../../src/engine/law/verification';
import { caseLaw, statute } from './fixtures';
import { LAW_SECTIONS } from './registry';

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

  // Reads the real clock on purpose: a criterion nobody has reread in six months stops the build
  // until the monthly review reads it again.
  it.each(LAW_SECTIONS.map((s) => [s.name, s] as const))(
    '%s has no case law unread for over six months today',
    (_, section) => {
      const today = new Date().toISOString().slice(0, 10);
      expect(staleCaseLaw(section.sources, today).map((s) => s.id)).toEqual([]);
    },
  );
});
