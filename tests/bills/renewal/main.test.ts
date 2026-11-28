import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyConditions } from '../../../src/bills/renewal/conditions';
import {
  SHEETS,
  readRenewalForm,
  sheetErrors,
  sheetOfField,
} from '../../../src/bills/renewal/form';
import { setUpRenewal } from '../../../src/bills/renewal/main';
import { clearRenewalResult, renderRenewalResult } from '../../../src/bills/renewal/render';
import { RENEWAL_FLOW } from '../../../src/bills/renewal/steps';
import { renderErrors } from '../../../src/bills/result';
import { setUpSection } from '../../../src/calculator/section';
import { reviewRenewal } from '../../../src/engine/bills/renewal-review';

vi.mock('../../../src/calculator/section', () => ({ setUpSection: vi.fn((_root, c) => c) }));
vi.mock('../../../src/bills/renewal/form', async (original) => ({
  ...(await original<typeof import('../../../src/bills/renewal/form')>()),
  readRenewalForm: vi.fn(),
}));
vi.mock('../../../src/bills/renewal/render', () => ({
  clearRenewalResult: vi.fn(),
  renderRenewalResult: vi.fn(),
}));
vi.mock('../../../src/bills/result', () => ({ renderErrors: vi.fn() }));
vi.mock('../../../src/engine/bills/renewal-review', () => ({ reviewRenewal: vi.fn() }));

interface Config {
  [key: string]: unknown;
  renderErrors(form: unknown, errors: unknown): void;
  stopsAtGate(): boolean;
  review(form: unknown, result: unknown, day: unknown): unknown;
  restarted(): void;
}

const events = { reviewCleared: vi.fn(), reviewCompleted: vi.fn() };
const norms = 'norms';
const tables = { norms, other: 'x' };
const tr = (k: string) => k;
const today = () => ({ y: 2026, m: 10, d: 13 });
const root = {} as HTMLElement;
const form = {} as never;
const result = {} as never;
const DAY = today();
const input = { id: 'input' };
const review = { id: 'review' };
const loaded = { id: 'loaded' };

const setup = (official = () => Promise.resolve(loaded)): Config =>
  setUpRenewal(root, { events, today, tr, tables, official } as never) as never;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let c: Config;
let rootGiven: unknown;
beforeAll(() => {
  c = setup();
  rootGiven = vi.mocked(setUpSection).mock.calls[0]?.[0];
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readRenewalForm).mockReturnValue({ input } as never);
  vi.mocked(reviewRenewal).mockImplementation(
    (_input, _day, deps) =>
      ({
        ok: true,
        review: { ...review, official: (deps as { official: unknown }).official },
      }) as never,
  );
});

describe('the renewal section', () => {
  it('sets the section up with its form, flow and sheets, and no gate', () => {
    expect(rootGiven).toBe(root);
    expect(c).toMatchObject({
      formId: 'renewal',
      flow: RENEWAL_FLOW,
      sheets: SHEETS,
      events,
      today,
      applyConditions,
      sheetOfField,
      sheetErrors,
    });
    expect(c.stopsAtGate()).toBe(false);
  });

  it('words the errors with its translator', () => {
    c.renderErrors(form, ['e']);
    expect(renderErrors).toHaveBeenCalledWith(form, ['e'], tr);
  });

  it('gives the errors of a form that does not read', () => {
    vi.mocked(readRenewalForm).mockReturnValue({ errors: ['x'] } as never);
    expect(c.review(form, result, DAY)).toEqual(['x']);
    expect(reviewRenewal).not.toHaveBeenCalled();
  });

  it('gives the questions of an engine error the form did not find', () => {
    vi.mocked(reviewRenewal).mockReturnValue({
      ok: false,
      errors: [{ field: 'annualKwh', code: 'kwh_range' }],
    } as never);
    expect(c.review(form, result, DAY)).toEqual([{ field: 'annualKwh', code: 'kwh_range' }]);
    expect(clearRenewalResult).not.toHaveBeenCalled();
  });

  it('clears the result, then draws it once the prices are in', async () => {
    expect(c.review(form, result, DAY)).toEqual([]);
    expect(reviewRenewal).toHaveBeenNthCalledWith(1, input, DAY, { ...tables, official: null });
    expect(clearRenewalResult).toHaveBeenCalledWith(result);
    expect(renderRenewalResult).not.toHaveBeenCalled();
    await settle();
    expect(reviewRenewal).toHaveBeenNthCalledWith(2, input, DAY, { ...tables, official: loaded });
    const drawn = { ...review, official: loaded };
    expect(renderRenewalResult).toHaveBeenCalledWith(result, drawn, norms, tr);
    expect(events.reviewCompleted).toHaveBeenCalledWith({ review: drawn });
  });

  it('draws neither the review before a restart nor the one a restart leaves behind', async () => {
    const own = setup();
    own.review(form, result, DAY);
    own.restarted();
    own.review(form, result, DAY);
    await settle();
    expect(renderRenewalResult).toHaveBeenCalledOnce();
  });

  it('draws only the latest review, not one the person has moved past', async () => {
    const own = setup();
    own.review(form, result, DAY);
    own.review(form, result, DAY);
    await settle();
    expect(renderRenewalResult).toHaveBeenCalledOnce();
    vi.clearAllMocks();
    own.review(form, result, DAY);
    own.restarted();
    await settle();
    expect(renderRenewalResult).not.toHaveBeenCalled();
    expect(events.reviewCleared).toHaveBeenCalledOnce();
  });
});
