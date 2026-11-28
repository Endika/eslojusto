import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyConditions } from '../../src/calculator/review-form';
import type { setUpSection as realSetUp } from '../../src/calculator/section';
import { reviewMortgage } from '../../src/engine/mortgage/review';
import { gate } from '../../src/mortgage/conditions';
import {
  SHEETS,
  onQuestions,
  readMortgageForm,
  sheetErrors,
  sheetOfField,
} from '../../src/mortgage/form';
import type { MortgageEvents } from '../../src/mortgage/ports';
import { renderErrors, renderMortgageResult, renderOutOfScope } from '../../src/mortgage/render';
import { MORTGAGE_FLOW } from '../../src/mortgage/steps';

const { setUpSection } = vi.hoisted(() => ({ setUpSection: vi.fn(() => 'the section') }));
vi.mock('../../src/calculator/section', () => ({ setUpSection }));
vi.mock('../../src/mortgage/conditions', async (original) => ({
  ...(await original<typeof import('../../src/mortgage/conditions')>()),
  gate: vi.fn(),
}));
vi.mock('../../src/mortgage/render', () => ({
  renderErrors: vi.fn(),
  renderMortgageResult: vi.fn(),
  renderOutOfScope: vi.fn(),
}));
vi.mock('../../src/engine/mortgage/review', () => ({ reviewMortgage: vi.fn() }));
vi.mock('../../src/mortgage/form', async (original) => ({
  ...(await original<typeof import('../../src/mortgage/form')>()),
  readMortgageForm: vi.fn(),
  onQuestions: vi.fn(),
}));

type Config = Required<
  Parameters<typeof realSetUp<string, string, { field: string; code: string }>>[1]
>;
let setUpMortgage: typeof import('../../src/mortgage/main').setUpMortgage;
beforeAll(async () => {
  ({ setUpMortgage } = await import('../../src/mortgage/main'));
});

const root = {} as HTMLElement;
const form = {} as HTMLFormElement;
const result = {} as HTMLElement;
const today = () => ({ y: 2026, m: 10, d: 9 });
const tr = (key: string) => key;
const tables = {} as never;
const day = { y: 2026, m: 10, d: 10 };
const review = { scope: { inScope: true }, id: 'review' };
const input = { id: 'input' };
const events = {
  reviewCompleted: vi.fn(),
  reviewCleared: vi.fn(),
  outOfScope: vi.fn(),
} as unknown as MortgageEvents;

function setUp(detail?: () => 'locked' | 'unlocked'): Config {
  const section = setUpMortgage(root, { events, today, tr, tables, ...(detail ? { detail } : {}) });
  expect(section).toBe('the section');
  return (setUpSection.mock.calls.at(-1) as unknown as [HTMLElement, Config])[1];
}

const reads = (outcome: unknown, engine: unknown = { ok: true, review }) => {
  vi.mocked(readMortgageForm).mockReturnValue(outcome as never);
  vi.mocked(reviewMortgage).mockReturnValue(engine as never);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the mortgage section', () => {
  it('is set up on its sheets, flow and form helpers', () => {
    setUp();
    expect(setUpSection).toHaveBeenCalledWith(root, {
      formId: 'mortgage',
      flow: MORTGAGE_FLOW,
      sheets: SHEETS,
      events,
      today,
      applyConditions,
      sheetOfField,
      sheetErrors,
      renderErrors: expect.any(Function),
      stopsAtGate: expect.any(Function),
      review: expect.any(Function),
      restarted: expect.any(Function),
      refreshResult: expect.any(Function),
    });
  });

  it('shows the errors with its own words', () => {
    const errors = [{ field: 'deedOn', code: 'missing_value' }] as never;
    setUp().renderErrors(form, errors);
    expect(renderErrors).toHaveBeenCalledWith(form, errors, tr);
  });

  it('lets a loan inside the review go past the gate', () => {
    vi.mocked(gate).mockReturnValue({ inScope: true });
    expect(setUp().stopsAtGate(form, result)).toBe(false);
    expect(renderOutOfScope).not.toHaveBeenCalled();
    expect(events.reviewCleared).not.toHaveBeenCalled();
    expect(events.outOfScope).not.toHaveBeenCalled();
  });

  it('stops a loan outside the review at the gate, saying so and clearing the review', () => {
    const scope = { inScope: false, reason: 'company' } as const;
    vi.mocked(gate).mockReturnValue(scope);
    expect(setUp().stopsAtGate(form, result)).toBe(true);
    expect(renderOutOfScope).toHaveBeenCalledWith(result, scope, tr);
    expect(events.reviewCleared).toHaveBeenCalledTimes(1);
    expect(events.outOfScope).toHaveBeenCalledWith('company');
  });

  it('returns what the form lacks instead of reviewing', () => {
    const errors = [{ field: 'deedOn', code: 'missing_value' }];
    reads({ errors });
    expect(setUp().review(form, result, day)).toBe(errors);
    expect(readMortgageForm).toHaveBeenCalledWith(form, day);
    expect(reviewMortgage).not.toHaveBeenCalled();
    expect(events.reviewCompleted).not.toHaveBeenCalled();
  });

  it('puts the engine’s refusals on the questions, whatever the form let through', () => {
    const asked = [{ field: 'loanKind', code: 'missing_choice' }];
    const refused = [{ field: 'invoices.total', code: 'amount_range', index: 0 }];
    reads({ input, invoiceFields: ['agency'] }, { ok: false, errors: refused });
    vi.mocked(onQuestions).mockReturnValue(asked as never);
    expect(setUp().review(form, result, day)).toBe(asked);
    expect(reviewMortgage).toHaveBeenCalledWith(input, day, tables);
    expect(onQuestions).toHaveBeenCalledWith(refused, ['agency']);
    expect(events.reviewCompleted).not.toHaveBeenCalled();
  });

  it.each([
    ['unlocked unless told otherwise', undefined, false],
    ['unlocked', () => 'unlocked' as const, false],
    ['locked', () => 'locked' as const, true],
  ])('shows a review inside the scope %s, and tells who listens', (_name, detail, locked) => {
    reads({ input, invoiceFields: [] });
    expect(setUp(detail).review(form, result, day)).toEqual([]);
    expect(renderMortgageResult).toHaveBeenCalledWith(result, review, locked, tr);
    expect(events.reviewCompleted).toHaveBeenCalledWith({ review, input });
    expect(renderOutOfScope).not.toHaveBeenCalled();
    expect(events.reviewCleared).not.toHaveBeenCalled();
    expect(events.outOfScope).not.toHaveBeenCalled();
  });

  it('says a review outside the scope is, and clears what was shown', () => {
    const scope = { inScope: false, reason: 'reverse' };
    const outside = { scope };
    reads({ input, invoiceFields: [] }, { ok: true, review: outside });
    const config = setUp();
    expect(config.review(form, result, day)).toEqual([]);
    expect(renderOutOfScope).toHaveBeenCalledWith(result, scope, tr);
    expect(events.reviewCleared).toHaveBeenCalledTimes(1);
    expect(events.outOfScope).toHaveBeenCalledWith('reverse');
    expect(renderMortgageResult).not.toHaveBeenCalled();
    expect(events.reviewCompleted).not.toHaveBeenCalled();
    config.refreshResult(result);
    expect(renderMortgageResult).not.toHaveBeenCalled();
  });

  describe('showing the review again', () => {
    it('shows nothing before there is a review', () => {
      setUp().refreshResult(result);
      expect(renderMortgageResult).not.toHaveBeenCalled();
    });

    it('shows the one on screen as the pass leaves its detail', () => {
      reads({ input, invoiceFields: [] });
      let detail: 'locked' | 'unlocked' = 'unlocked';
      const config = setUp(() => detail);
      config.review(form, result, day);
      vi.mocked(renderMortgageResult).mockClear();
      detail = 'locked';
      config.refreshResult(result);
      expect(renderMortgageResult).toHaveBeenCalledWith(result, review, true, tr);
      detail = 'unlocked';
      config.refreshResult(result);
      expect(renderMortgageResult).toHaveBeenLastCalledWith(result, review, false, tr);
    });

    it('forgets it on starting over, and the gate forgets it too', () => {
      reads({ input, invoiceFields: [] });
      const config = setUp();
      config.review(form, result, day);
      config.restarted();
      expect(events.reviewCleared).toHaveBeenCalledTimes(1);
      vi.mocked(renderMortgageResult).mockClear();
      config.refreshResult(result);
      expect(renderMortgageResult).not.toHaveBeenCalled();
      config.review(form, result, day);
      vi.mocked(gate).mockReturnValue({ inScope: false, reason: 'company' });
      config.stopsAtGate(form, result);
      vi.mocked(renderMortgageResult).mockClear();
      config.refreshResult(result);
      expect(renderMortgageResult).not.toHaveBeenCalled();
    });
  });
});
