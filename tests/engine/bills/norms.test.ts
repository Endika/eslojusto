import { describe, expect, it } from 'vitest';
import { BILLS_NORMS, NORM_REVIEW } from '../../../src/engine/bills/data/norms';
import type { BillsNormId } from '../../../src/engine/bills/norms';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe('bills norm table', () => {
  it.each(Object.entries(BILLS_NORMS))('%s is dated, links to the BOE and was read', (id, n) => {
    expect(n.id).toBe(id);
    expect(n.url).toMatch(/^https:\/\/www\.boe\.es\//);
    expect(n.inForceSince).toMatch(ISO);
    expect(NORM_REVIEW[id as BillsNormId]).toMatch(ISO);
  });

  it('reviews exactly the norms in the table', () => {
    expect(Object.keys(NORM_REVIEW).sort()).toEqual(Object.keys(BILLS_NORMS).sort());
  });
});
