// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CivilDate } from '../../src/engine/date';
import { SHEETS } from '../../src/household/form';
import { setUpHousehold } from '../../src/household/main';
import { HOUSEHOLD_FLOW } from '../../src/household/steps';
import type { HouseholdEvents, HouseholdPageDeps } from '../../src/household/ports';

const m = vi.hoisted(() => ({
  setUpSection: vi.fn(),
  gate: vi.fn(),
  applyConditions: vi.fn(),
  readHouseholdForm: vi.fn(),
  endingOf: vi.fn(),
  sheetErrors: vi.fn(),
  sheetOfField: vi.fn(),
  reviewHousehold: vi.fn(),
  renderErrors: vi.fn(),
  renderHouseholdResult: vi.fn(),
  renderOutOfScope: vi.fn(),
}));

vi.mock('../../src/calculator/section', () => ({ setUpSection: m.setUpSection }));
vi.mock('../../src/engine/household/review', () => ({ reviewHousehold: m.reviewHousehold }));
vi.mock('../../src/household/conditions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/household/conditions')>()),
  applyConditions: m.applyConditions,
  gate: m.gate,
}));
vi.mock('../../src/household/form', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/household/form')>()),
  endingOf: m.endingOf,
  readHouseholdForm: m.readHouseholdForm,
  sheetErrors: m.sheetErrors,
  sheetOfField: m.sheetOfField,
}));
vi.mock('../../src/household/render', () => ({
  renderErrors: m.renderErrors,
  renderHouseholdResult: m.renderHouseholdResult,
  renderOutOfScope: m.renderOutOfScope,
}));

const day: CivilDate = { y: 2026, m: 10, d: 8 };
const tr = vi.fn();
const tables = {} as HouseholdPageDeps['tables'];
const root = {} as HTMLElement;
const form = {} as HTMLFormElement;
const result = {} as HTMLElement;
const input = { regime: 'monthly' };
const review = { items: [] };

const events = {
  outOfScope: vi.fn(),
  reviewCompleted: vi.fn(),
  detailOpened: vi.fn(),
} as unknown as HouseholdEvents;
const today = () => day;

// The configuration the section is set up with.
type Config = {
  [key: string]: unknown;
  stopsAtGate(form: HTMLFormElement, result: HTMLElement): boolean;
  review(form: HTMLFormElement, result: HTMLElement, day: CivilDate): unknown;
  reviewed(): void;
  opened(d: HTMLDetailsElement): void;
  renderErrors(form: HTMLFormElement, errors: unknown): void;
};
let config: Config;

beforeEach(() => {
  vi.clearAllMocks();
  setUpHousehold(root, { events, today, tr, tables });
  config = m.setUpSection.mock.calls[0]?.[1] as Config;
});

const details = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.querySelector('details') as HTMLDetailsElement;
};

describe('the household section', () => {
  it('is set up on its form with its sheets, flow and checks', () => {
    expect(m.setUpSection.mock.calls[0]?.[0]).toBe(root);
    expect(config).toMatchObject({
      formId: 'household',
      flow: HOUSEHOLD_FLOW,
      sheets: SHEETS,
      events,
      today,
      applyConditions: m.applyConditions,
      conditionsOnInput: true,
      sheetOfField: m.sheetOfField,
      sheetErrors: m.sheetErrors,
    });
  });

  it('renders the errors with its translator', () => {
    const errors = [{ field: 'work', code: 'required' }];
    config.renderErrors(form, errors);
    expect(m.renderErrors).toHaveBeenCalledWith(form, errors, tr);
  });

  describe('at the gate', () => {
    it('lets a relationship in scope through', () => {
      m.gate.mockReturnValue({ inScope: true });
      expect(config.stopsAtGate(form, result)).toBe(false);
      expect(m.renderOutOfScope).not.toHaveBeenCalled();
      expect(events.outOfScope).not.toHaveBeenCalled();
    });

    it('stops one out of scope, with why', () => {
      m.gate.mockReturnValue({ inScope: false, reason: 'before_reform' });
      expect(config.stopsAtGate(form, result)).toBe(true);
      expect(m.renderOutOfScope).toHaveBeenCalledWith(result, 'before_reform', tr);
      expect(events.outOfScope).toHaveBeenCalledWith('before_reform');
    });
  });

  describe('reviewing', () => {
    it('hands back the errors of a form that does not read', () => {
      const errors = [{ field: 'work', code: 'required' }];
      m.readHouseholdForm.mockReturnValue({ errors });
      expect(config.review(form, result, day)).toBe(errors);
      expect(m.readHouseholdForm).toHaveBeenCalledWith(form, day);
      expect(m.reviewHousehold).not.toHaveBeenCalled();
    });

    it('hands back only the field and code of what the engine rejects', () => {
      m.readHouseholdForm.mockReturnValue({ input });
      m.reviewHousehold.mockReturnValue({
        ok: false,
        errors: [{ field: 'work', code: 'required', extra: 1 }],
      });
      expect(config.review(form, result, day)).toEqual([{ field: 'work', code: 'required' }]);
      expect(m.reviewHousehold).toHaveBeenCalledWith(input, day, tables);
      expect(m.renderHouseholdResult).not.toHaveBeenCalled();
    });

    it.each([
      ['unknown', true],
      ['working', false],
    ])('renders the result of a relationship ending «%s»', (ending, endingUnknown) => {
      m.readHouseholdForm.mockReturnValue({ input });
      m.reviewHousehold.mockReturnValue({ ok: true, review });
      m.endingOf.mockReturnValue(ending);
      expect(config.review(form, result, day)).toEqual([]);
      expect(m.renderHouseholdResult).toHaveBeenCalledWith(
        result,
        { review, input, endingUnknown },
        tr,
      );
      config.reviewed();
      expect(events.reviewCompleted).toHaveBeenCalledWith({ review, input, ending });
    });

    it('reports nothing completed before a review has run', () => {
      config.reviewed();
      expect(events.reviewCompleted).not.toHaveBeenCalled();
    });
  });

  describe('opening a detail', () => {
    it('reports the item of a detail opened inside a card', () => {
      config.opened(
        details('<div data-item data-kind="notice"><details data-detail></details></div>'),
      );
      expect(events.detailOpened).toHaveBeenCalledWith('notice');
    });

    it.each([
      ['a help topic, not a detail', '<div data-item data-kind="notice"><details></details></div>'],
      ['a detail outside a card', '<details data-detail></details>'],
      ['a card with no kind', '<div data-item><details data-detail></details></div>'],
    ])('reports nothing for %s', (_, html) => {
      config.opened(details(html));
      expect(events.detailOpened).not.toHaveBeenCalled();
    });
  });
});
