import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUpElectricity } from '../../../src/bills/electricity/main';
import { gate } from '../../../src/bills/electricity/conditions';
import { readElectricityForm } from '../../../src/bills/electricity/form';
import { renderElectricityResult } from '../../../src/bills/electricity/render';
import { renderErrors, renderOutOfScope } from '../../../src/bills/result';
import { setUpSection } from '../../../src/calculator/section';
import { reviewElectricityBill } from '../../../src/engine/bills/electricity-review';
import { ELECTRICITY_FLOW } from '../../../src/bills/electricity/steps';
import { SHEETS, sheetErrors, sheetOfField } from '../../../src/bills/electricity/form';
import { applyConditions } from '../../../src/calculator/review-form';

vi.mock('../../../src/calculator/section', () => ({ setUpSection: vi.fn((_root, c) => c) }));
vi.mock('../../../src/bills/electricity/conditions', async (original) => ({
  ...(await original<typeof import('../../../src/bills/electricity/conditions')>()),
  gate: vi.fn(),
}));
vi.mock('../../../src/bills/electricity/form', async (original) => ({
  ...(await original<typeof import('../../../src/bills/electricity/form')>()),
  readElectricityForm: vi.fn(),
}));
vi.mock('../../../src/bills/electricity/render', () => ({ renderElectricityResult: vi.fn() }));
vi.mock('../../../src/bills/result', () => ({ renderErrors: vi.fn(), renderOutOfScope: vi.fn() }));
vi.mock('../../../src/engine/bills/electricity-review', () => ({ reviewElectricityBill: vi.fn() }));

interface Config {
  formId: string;
  flow: unknown;
  sheets: unknown;
  events: unknown;
  today: unknown;
  applyConditions: unknown;
  sheetOfField: unknown;
  sheetErrors: unknown;
  renderErrors(form: unknown, errors: unknown): void;
  stopsAtGate(form: unknown, result: unknown): boolean;
  review(form: unknown, result: unknown, day: unknown): unknown;
  restarted(): void;
  beforeFill(): void;
  refreshResult(result: unknown): void;
}

const events = {
  reviewCleared: vi.fn(),
  outOfScope: vi.fn(),
  reviewCompleted: vi.fn(),
};
const tables = { norms: 'norms' } as never;
const tr = (k: string) => k;
const today = () => ({ y: 2026, m: 10, d: 13 });
const root = {} as HTMLElement;
const form = {} as never;
const result = {} as never;
const DAY = { y: 2026, m: 10, d: 13 };
const input = { id: 'input' };
const review = { id: 'review', scope: { inScope: true } };

function config(extra: { detail?: () => string; offered?: (r: unknown) => boolean } = {}): Config {
  return setUpElectricity(root, { events, today, tr, tables, ...extra } as never) as never;
}

let c: Config;
let rootGiven: unknown;
beforeAll(() => {
  c = config();
  rootGiven = vi.mocked(setUpSection).mock.calls[0]?.[0];
});
beforeEach(() => {
  vi.clearAllMocks();
});

describe('the electricity section', () => {
  it('sets the section up with its form, flow, sheets and questions', () => {
    expect(rootGiven).toBe(root);
    expect(c).toMatchObject({
      formId: 'electricity',
      flow: ELECTRICITY_FLOW,
      sheets: SHEETS,
      events,
      today,
      applyConditions,
      sheetOfField,
      sheetErrors,
    });
  });

  it('words the errors with its translator', () => {
    c.renderErrors(form, ['e']);
    expect(renderErrors).toHaveBeenCalledWith(form, ['e'], tr);
  });

  it('goes on past a gate the bill is within', () => {
    vi.mocked(gate).mockReturnValue({ inScope: true });
    expect(c.stopsAtGate(form, result)).toBe(false);
    expect(renderOutOfScope).not.toHaveBeenCalled();
    expect(events.reviewCleared).not.toHaveBeenCalled();
  });

  it('stops at a gate the bill is outside, clearing the review and saying why', () => {
    const reach = { inScope: false, reason: 'over_15kw' };
    vi.mocked(gate).mockReturnValue(reach as never);
    expect(c.stopsAtGate(form, result)).toBe(true);
    expect(renderOutOfScope).toHaveBeenCalledWith(result, reach, tr);
    expect(events.reviewCleared).toHaveBeenCalledOnce();
    expect(events.outOfScope).toHaveBeenCalledWith('over_15kw');
  });

  it('gives the errors of a form that does not read', () => {
    vi.mocked(readElectricityForm).mockReturnValue({ errors: ['x'] } as never);
    expect(c.review(form, result, DAY)).toEqual(['x']);
    expect(reviewElectricityBill).not.toHaveBeenCalled();
  });

  it('gives the questions of an engine error the form did not find', () => {
    vi.mocked(readElectricityForm).mockReturnValue({ input } as never);
    vi.mocked(reviewElectricityBill).mockReturnValue({
      ok: false,
      errors: [{ field: 'total', code: 'amount_range' }],
    } as never);
    expect(c.review(form, result, DAY)).toEqual([{ field: 'total', code: 'amount_range' }]);
    expect(events.reviewCompleted).not.toHaveBeenCalled();
  });

  it('shows and reports a review within the scope, with the detail the pass gives', () => {
    vi.mocked(readElectricityForm).mockReturnValue({ input } as never);
    vi.mocked(reviewElectricityBill).mockReturnValue({ ok: true, review } as never);
    expect(c.review(form, result, DAY)).toEqual([]);
    expect(reviewElectricityBill).toHaveBeenCalledWith(input, DAY, tables);
    expect(renderElectricityResult).toHaveBeenCalledWith(result, review, input, 'norms', false, tr);
    expect(events.reviewCompleted).toHaveBeenCalledWith({ review, input });
    expect(events.reviewCleared).not.toHaveBeenCalled();
  });

  it('keeps what a locked year offers out of the result only when it is offered', () => {
    vi.mocked(readElectricityForm).mockReturnValue({ input } as never);
    vi.mocked(reviewElectricityBill).mockReturnValue({ ok: true, review } as never);
    const withDefaults = (extra: Parameters<typeof config>[0]) => {
      vi.mocked(renderElectricityResult).mockClear();
      (config(extra) as Config).review(form, result, DAY);
      return vi.mocked(renderElectricityResult).mock.lastCall?.[4];
    };
    expect(withDefaults({ detail: () => 'locked' })).toBe(false);
    expect(withDefaults({ offered: () => true })).toBe(false);
    for (const [detail, offered, expected] of [
      ['locked', true, true],
      ['locked', false, false],
      ['unlocked', true, false],
    ] as const) {
      const section = config({ detail: () => detail, offered: () => offered });
      (section as unknown as Config).review(form, result, DAY);
      expect(vi.mocked(renderElectricityResult).mock.lastCall?.[4]).toBe(expected);
    }
  });

  it('clears the review of a bill outside the scope, and says why', () => {
    const outside = { id: 'out', scope: { inScope: false, reason: 'not_2_0td' } };
    vi.mocked(readElectricityForm).mockReturnValue({ input } as never);
    vi.mocked(reviewElectricityBill).mockReturnValue({ ok: true, review: outside } as never);
    expect(c.review(form, result, DAY)).toEqual([]);
    expect(renderOutOfScope).toHaveBeenCalledWith(result, outside.scope, tr);
    expect(events.reviewCleared).toHaveBeenCalledOnce();
    expect(events.outOfScope).toHaveBeenCalledWith('not_2_0td');
    expect(events.reviewCompleted).not.toHaveBeenCalled();
  });

  it('shows the review again only while there is one, and not after a restart or a fill', () => {
    const own = config();
    vi.mocked(readElectricityForm).mockReturnValue({ input } as never);
    vi.mocked(reviewElectricityBill).mockReturnValue({ ok: true, review } as never);
    (own as unknown as Config).review(form, result, DAY);
    vi.mocked(renderElectricityResult).mockClear();
    (own as unknown as Config).refreshResult(result);
    expect(renderElectricityResult).toHaveBeenCalledOnce();
    (own as unknown as Config).restarted();
    expect(events.reviewCleared).toHaveBeenCalled();
    vi.mocked(renderElectricityResult).mockClear();
    (own as unknown as Config).refreshResult(result);
    expect(renderElectricityResult).not.toHaveBeenCalled();
    (own as unknown as Config).review(form, result, DAY);
    (own as unknown as Config).beforeFill();
    vi.mocked(renderElectricityResult).mockClear();
    (own as unknown as Config).refreshResult(result);
    expect(renderElectricityResult).not.toHaveBeenCalled();
  });
});
