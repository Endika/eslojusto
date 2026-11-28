import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gate } from '../../../src/bills/telecom/conditions';
import {
  SHEETS,
  readTelecomForm,
  sheetErrors,
  sheetOfField,
} from '../../../src/bills/telecom/form';
import { setUpTelecom } from '../../../src/bills/telecom/main';
import { renderTelecomResult } from '../../../src/bills/telecom/render';
import { TELECOM_FLOW } from '../../../src/bills/telecom/steps';
import { renderErrors, renderOutOfScope } from '../../../src/bills/result';
import { applyConditions } from '../../../src/calculator/review-form';
import { setUpSection } from '../../../src/calculator/section';
import { reviewTelecom } from '../../../src/engine/bills/telecom-review';

vi.mock('../../../src/calculator/section', () => ({ setUpSection: vi.fn((_root, c) => c) }));
vi.mock('../../../src/bills/telecom/conditions', async (original) => ({
  ...(await original<typeof import('../../../src/bills/telecom/conditions')>()),
  gate: vi.fn(),
}));
vi.mock('../../../src/bills/telecom/form', async (original) => ({
  ...(await original<typeof import('../../../src/bills/telecom/form')>()),
  readTelecomForm: vi.fn(),
}));
vi.mock('../../../src/bills/telecom/render', () => ({ renderTelecomResult: vi.fn() }));
vi.mock('../../../src/bills/result', () => ({ renderErrors: vi.fn(), renderOutOfScope: vi.fn() }));
vi.mock('../../../src/engine/bills/telecom-review', () => ({ reviewTelecom: vi.fn() }));

interface Config {
  [key: string]: unknown;
  renderErrors(form: unknown, errors: unknown): void;
  stopsAtGate(form: unknown, result: unknown): boolean;
  review(form: unknown, result: unknown, day: unknown): unknown;
  restarted(): void;
  refreshResult(result: unknown): void;
}

const events = { reviewCleared: vi.fn(), outOfScope: vi.fn(), reviewCompleted: vi.fn() };
const tables = { norms: 'norms' } as never;
const tr = (k: string) => k;
const today = () => ({ y: 2026, m: 10, d: 13 });
const root = {} as HTMLElement;
const form = {} as never;
const result = {} as never;
const DAY = today();
const input = { id: 'input' };
const review = { id: 'review', scope: { inScope: true } };

const config = (detail?: () => string): Config =>
  setUpTelecom(root, { events, today, tr, tables, ...(detail && { detail }) } as never) as never;

let c: Config;
let rootGiven: unknown;
beforeAll(() => {
  c = config();
  rootGiven = vi.mocked(setUpSection).mock.calls[0]?.[0];
});
beforeEach(() => vi.clearAllMocks());

describe('the telecom section', () => {
  it('sets the section up with its form, flow, sheets and questions', () => {
    expect(rootGiven).toBe(root);
    expect(c).toMatchObject({
      formId: 'telecom',
      flow: TELECOM_FLOW,
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

  it('goes on past a gate the exit is within', () => {
    vi.mocked(gate).mockReturnValue({ inScope: true });
    expect(c.stopsAtGate(form, result)).toBe(false);
    expect(renderOutOfScope).not.toHaveBeenCalled();
    expect(events.reviewCleared).not.toHaveBeenCalled();
  });

  it('stops at a gate the exit is outside, clearing the review and saying why', () => {
    const reach = { inScope: false, reason: 'exit_before_2022' };
    vi.mocked(gate).mockReturnValue(reach as never);
    expect(c.stopsAtGate(form, result)).toBe(true);
    expect(renderOutOfScope).toHaveBeenCalledWith(result, reach, tr);
    expect(events.reviewCleared).toHaveBeenCalledOnce();
    expect(events.outOfScope).toHaveBeenCalledWith('exit_before_2022');
  });

  it('gives the errors of a form that does not read', () => {
    vi.mocked(readTelecomForm).mockReturnValue({ errors: ['x'] } as never);
    expect(c.review(form, result, DAY)).toEqual(['x']);
    expect(reviewTelecom).not.toHaveBeenCalled();
  });

  it('gives the questions of an engine error the form did not find', () => {
    vi.mocked(readTelecomForm).mockReturnValue({ input } as never);
    vi.mocked(reviewTelecom).mockReturnValue({
      ok: false,
      errors: [{ field: 'penaltyCharged', code: 'amount_range' }],
    } as never);
    expect(c.review(form, result, DAY)).toEqual([
      { field: 'penaltyCharged', code: 'amount_range' },
    ]);
    expect(events.reviewCompleted).not.toHaveBeenCalled();
  });

  it.each([
    ['locked', true],
    ['unlocked', false],
  ])('shows and reports a review within the scope, %s as the pass says', (detail, locked) => {
    vi.mocked(readTelecomForm).mockReturnValue({ input } as never);
    vi.mocked(reviewTelecom).mockReturnValue({ ok: true, review } as never);
    expect(config(() => detail).review(form, result, DAY)).toEqual([]);
    expect(reviewTelecom).toHaveBeenCalledWith(input, DAY, tables);
    expect(renderTelecomResult).toHaveBeenCalledWith(result, review, 'norms', locked, tr);
    expect(events.reviewCompleted).toHaveBeenCalledWith({ review, input });
    expect(events.reviewCleared).not.toHaveBeenCalled();
  });

  it('clears the review of an exit outside the scope, and says why', () => {
    const outside = { id: 'out', scope: { inScope: false, reason: 'exit_before_2022' } };
    vi.mocked(readTelecomForm).mockReturnValue({ input } as never);
    vi.mocked(reviewTelecom).mockReturnValue({ ok: true, review: outside } as never);
    expect(c.review(form, result, DAY)).toEqual([]);
    expect(renderOutOfScope).toHaveBeenCalledWith(result, outside.scope, tr);
    expect(events.reviewCleared).toHaveBeenCalledOnce();
    expect(events.outOfScope).toHaveBeenCalledWith('exit_before_2022');
    expect(events.reviewCompleted).not.toHaveBeenCalled();
    expect(renderTelecomResult).not.toHaveBeenCalled();
  });

  it('shows the review again as the pass now says, only while there is one', () => {
    const own = config(() => 'locked');
    vi.mocked(readTelecomForm).mockReturnValue({ input } as never);
    vi.mocked(reviewTelecom).mockReturnValue({ ok: true, review } as never);
    own.review(form, result, DAY);
    vi.mocked(renderTelecomResult).mockClear();
    own.refreshResult(result);
    expect(renderTelecomResult).toHaveBeenCalledWith(result, review, 'norms', true, tr);
    own.restarted();
    expect(events.reviewCleared).toHaveBeenCalled();
    vi.mocked(renderTelecomResult).mockClear();
    own.refreshResult(result);
    expect(renderTelecomResult).not.toHaveBeenCalled();
  });

  it('shows the review again unlocked when the pass does not lock it', () => {
    const own = config();
    vi.mocked(readTelecomForm).mockReturnValue({ input } as never);
    vi.mocked(reviewTelecom).mockReturnValue({ ok: true, review } as never);
    own.review(form, result, DAY);
    vi.mocked(renderTelecomResult).mockClear();
    own.refreshResult(result);
    expect(renderTelecomResult).toHaveBeenCalledWith(result, review, 'norms', false, tr);
  });
});
