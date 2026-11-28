import { beforeEach, describe, expect, it, vi } from 'vitest';
import { electricityCase } from '../../../src/bills/electricity/case';
import { officialBlocks } from '../../../src/bills/electricity/official';
import type { CompletedElectricityReview } from '../../../src/bills/electricity/ports';
import { NO_DETAILS } from '../../../src/documents/letter';
import type { Block } from '../../../src/documents/ports';
import { billFinding, single } from '../../../src/engine/bills/finding';
import type { Translate } from '../../../src/i18n/client';
import { juneBill } from '../../engine/bills/input';
import { NORMS_BEFORE_FIGURE } from '../../engine/bills/norms-before-figure';
import { entryWith, finding } from './support';

vi.mock('../../../src/bills/electricity/official', () => ({
  officialBlocks: vi.fn((): Block[] => [{ type: 'note', text: 'EXTRA' }]),
}));

const tr: Translate = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);
const TODAY = { y: 2026, m: 10, d: 13 };

const june = juneBill();
const july = { readingFrom: june.readingTo, readingTo: june.dueOn };
const clear = () =>
  entryWith([single(billFinding('vat', 'matches', [], [], NORMS_BEFORE_FIGURE))], {}, {});
const over = (change = {}) => entryWith([single(finding('vat', 3))], change, { counted: 3 });
const outside = (): CompletedElectricityReview => {
  const e = entryWith([], { supplyFingerprint: 'out' });
  return {
    ...e,
    review: { ...e.review, scope: { inScope: false, reason: 'over_15kw' } },
  } as CompletedElectricityReview;
};

const blocksOf = (
  entries: CompletedElectricityReview[],
  official?: Parameters<typeof electricityCase>[2],
) => electricityCase(entries, NORMS_BEFORE_FIGURE, official).report(tr, TODAY).blocks;
const texts = (blocks: readonly Block[]) => blocks.map((b) => ('text' in b ? b.text : b.type));

beforeEach(() => vi.mocked(officialBlocks).mockClear());

describe('the electricity case', () => {
  it('is quiet when every bill is clear, and not with one that is not', () => {
    const quiet = (entries: CompletedElectricityReview[]) =>
      electricityCase(entries, NORMS_BEFORE_FIGURE).quiet;
    expect(quiet([clear()])).toBe(true);
    expect(quiet([clear(), clear()])).toBe(true);
    expect(quiet([clear(), over(july)])).toBe(false);
    expect(quiet([over()])).toBe(false);
    expect(quiet([])).toBe(false);
  });

  it('adds the year to the report from two bills, not for one', () => {
    expect(texts(blocksOf([over()]))).not.toContain('client.bills.report.year');
    expect(texts(blocksOf([over(), over(july)]))).toContain('client.bills.report.year');
  });

  it('lists a copy of a bill as a copy, and a bill outside the review as no copy', () => {
    const list = texts(blocksOf([over(), over(), outside()]));
    expect(list.filter((t) => t === 'client.bills.basket.duplicate')).toHaveLength(1);
  });

  it('gives the official figures only the bills that count', () => {
    const official = () => ({ deps: {} as never, pvpc: { source: 's', url: 'u' } });
    const a = over();
    const b = over(july);
    const list = blocksOf([a, over(), outside(), b], official);
    expect(vi.mocked(officialBlocks).mock.calls[0]?.[0]).toEqual([a, b]);
    expect(vi.mocked(officialBlocks).mock.calls[0]?.[1]).toEqual(official());
    expect(list.at(-1)).toEqual({ type: 'note', text: 'EXTRA' });
  });

  it('asks for the official figures as unavailable until they load', () => {
    blocksOf([over()]);
    expect(vi.mocked(officialBlocks).mock.calls[0]?.[1]).toBeNull();
  });

  it('builds the correction letter of the bills kept', () => {
    const c = electricityCase([over()], NORMS_BEFORE_FIGURE);
    const model = c.letter('bill_correction', NO_DETAILS, tr);
    expect(model.title).toBe('client.bills.letter.correction.title_one');
  });
});
