// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CivilDate } from '../../src/engine/date';
import { SHEETS } from '../../src/insurance/form';
import { setUpInsurance } from '../../src/insurance/main';
import type { InsuranceEvents, InsuranceSetup } from '../../src/insurance/ports';
import { INSURANCE_FLOW } from '../../src/insurance/steps';

const m = vi.hoisted(() => ({
  setUpSection: vi.fn(),
  gate: vi.fn(),
  applyConditions: vi.fn(),
  readInsuranceForm: vi.fn(),
  onQuestions: vi.fn(),
  sheetErrors: vi.fn(),
  sheetOfField: vi.fn(),
  reviewInsurance: vi.fn(),
  renderErrors: vi.fn(),
  renderInsuranceResult: vi.fn(),
  renderOutOfScope: vi.fn(),
}));

vi.mock('../../src/calculator/section', () => ({ setUpSection: m.setUpSection }));
vi.mock('../../src/engine/insurance/review', () => ({ reviewInsurance: m.reviewInsurance }));
vi.mock('../../src/insurance/conditions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/insurance/conditions')>()),
  applyConditions: m.applyConditions,
  gate: m.gate,
}));
vi.mock('../../src/insurance/form', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/insurance/form')>()),
  onQuestions: m.onQuestions,
  readInsuranceForm: m.readInsuranceForm,
  sheetErrors: m.sheetErrors,
  sheetOfField: m.sheetOfField,
}));
vi.mock('../../src/insurance/render', () => ({
  renderErrors: m.renderErrors,
  renderInsuranceResult: m.renderInsuranceResult,
  renderOutOfScope: m.renderOutOfScope,
}));

const day: CivilDate = { y: 2026, m: 10, d: 9 };
const tr = vi.fn();
const tables = {} as InsuranceSetup['tables'];
const root = {} as HTMLElement;
const form = {} as HTMLFormElement;
const result = {} as HTMLElement;
const input = { line: 'home' };

const events = {
  outOfScope: vi.fn(),
  reviewCompleted: vi.fn(),
  reviewCleared: vi.fn(),
} as unknown as InsuranceEvents;
const today = () => day;

type Config = {
  [key: string]: unknown;
  stopsAtGate(form: HTMLFormElement, result: HTMLElement): boolean;
  review(form: HTMLFormElement, result: HTMLElement, day: CivilDate): unknown;
  restarted(): void;
  renderErrors(form: HTMLFormElement, errors: unknown): void;
};
let config: Config;
let returned: unknown;

beforeEach(() => {
  vi.clearAllMocks();
  returned = {};
  m.setUpSection.mockReturnValue(returned);
  expect(setUpInsurance(root, { events, today, tr, tables })).toBe(returned);
  config = m.setUpSection.mock.calls[0]?.[1] as Config;
});

describe('the insurance section', () => {
  it('is set up on its form with its sheets, flow and checks', () => {
    expect(m.setUpSection.mock.calls[0]?.[0]).toBe(root);
    expect(config).toMatchObject({
      formId: 'insurance',
      flow: INSURANCE_FLOW,
      sheets: SHEETS,
      events,
      today,
      applyConditions: m.applyConditions,
      sheetOfField: m.sheetOfField,
      sheetErrors: m.sheetErrors,
    });
  });

  it('renders the errors with its translator', () => {
    const errors = [{ field: 'line', code: 'missing_choice' }];
    config.renderErrors(form, errors);
    expect(m.renderErrors).toHaveBeenCalledWith(form, errors, tr);
  });

  it('clears the review when the person starts over', () => {
    config.restarted();
    expect(events.reviewCleared).toHaveBeenCalledOnce();
  });

  describe('at the gate', () => {
    it('lets a policy in scope through', () => {
      m.gate.mockReturnValue({ inScope: true });
      expect(config.stopsAtGate(form, result)).toBe(false);
      expect(m.renderOutOfScope).not.toHaveBeenCalled();
      expect(events.reviewCleared).not.toHaveBeenCalled();
      expect(events.outOfScope).not.toHaveBeenCalled();
    });

    it('stops one out of scope, clears the review and says why', () => {
      m.gate.mockReturnValue({ inScope: false, reason: 'before_2016' });
      expect(config.stopsAtGate(form, result)).toBe(true);
      expect(m.renderOutOfScope).toHaveBeenCalledWith(result, 'before_2016', tr);
      expect(events.reviewCleared).toHaveBeenCalledOnce();
      expect(events.outOfScope).toHaveBeenCalledWith('before_2016');
    });
  });

  describe('reviewing', () => {
    it('hands back the errors of a form that does not read', () => {
      const errors = [{ field: 'line', code: 'missing_choice' }];
      m.readInsuranceForm.mockReturnValue({ errors });
      expect(config.review(form, result, day)).toBe(errors);
      expect(m.readInsuranceForm).toHaveBeenCalledWith(form, day);
      expect(m.reviewInsurance).not.toHaveBeenCalled();
    });

    it('hands back the questions of what the engine rejects', () => {
      const rejected = [{ field: 'line' }];
      const questions = [{ field: 'line', code: 'missing_choice' }];
      m.readInsuranceForm.mockReturnValue({ input });
      m.reviewInsurance.mockReturnValue({ ok: false, errors: rejected });
      m.onQuestions.mockReturnValue(questions);
      expect(config.review(form, result, day)).toBe(questions);
      expect(m.reviewInsurance).toHaveBeenCalledWith(input, day, tables);
      expect(m.onQuestions).toHaveBeenCalledWith(rejected);
      expect(m.renderInsuranceResult).not.toHaveBeenCalled();
    });

    it('renders a review in scope and reports it', () => {
      const review = { scope: { inScope: true } };
      m.readInsuranceForm.mockReturnValue({ input });
      m.reviewInsurance.mockReturnValue({ ok: true, review });
      expect(config.review(form, result, day)).toEqual([]);
      expect(m.renderInsuranceResult).toHaveBeenCalledWith(result, review, tr);
      expect(events.reviewCompleted).toHaveBeenCalledWith({ review, input });
      expect(m.renderOutOfScope).not.toHaveBeenCalled();
      expect(events.reviewCleared).not.toHaveBeenCalled();
    });

    it('renders a review out of scope, clears it and says why', () => {
      const review = { scope: { inScope: false, reason: 'before_2016' } };
      m.readInsuranceForm.mockReturnValue({ input });
      m.reviewInsurance.mockReturnValue({ ok: true, review });
      expect(config.review(form, result, day)).toEqual([]);
      expect(m.renderOutOfScope).toHaveBeenCalledWith(result, 'before_2016', tr);
      expect(events.reviewCleared).toHaveBeenCalledOnce();
      expect(events.outOfScope).toHaveBeenCalledWith('before_2016');
      expect(m.renderInsuranceResult).not.toHaveBeenCalled();
      expect(events.reviewCompleted).not.toHaveBeenCalled();
    });
  });
});
