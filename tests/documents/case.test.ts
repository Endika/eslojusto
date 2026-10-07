import { describe, expect, it } from 'vitest';
import { finalPayCase, hasShortfall } from '../../src/documents/case';
import { letterKind, type LetterDetails } from '../../src/documents/letter';
import { letterModel, reportModel } from '../../src/documents/report';
import { completed, today, tr, unfairDismissal } from './fixtures';

const details: LetterDetails = {
  name: 'Alex Ejemplo',
  id: '',
  company: 'Empresa Ficticia SL',
  place: 'Villaficticia',
  date: today,
};

describe('the final pay as a paid review', () => {
  it('builds the same report and letter as before', () => {
    const r = completed();
    const paid = finalPayCase(r);
    expect(paid.report(tr, today)).toEqual(reportModel(r, tr, today));
    expect(paid.letter('items', details, tr)).toEqual(letterModel(r, tr, details));
  });

  it('offers the pass only when something falls short, with the letter that fits', () => {
    for (const r of [completed(), completed(unfairDismissal, { severance: 41000 })]) {
      const paid = finalPayCase(r);
      expect(paid.offer).toBe(hasShortfall(r.review));
      expect(paid.letterKinds).toEqual([letterKind(r.review)]);
    }
    expect(finalPayCase(completed()).offer).toBe(true);
    expect(finalPayCase(completed(unfairDismissal, { severance: 41000 })).offer).toBe(false);
  });
});
