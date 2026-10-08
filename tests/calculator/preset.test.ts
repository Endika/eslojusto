// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { startStep } from '../../src/calculator/flow';
import { FINAL_PAY_FLOW, STEPS, presetCauseFlow } from '../../src/calculator/steps';
import type { Cause } from '../../src/engine/types';

const CAUSES: readonly Cause[] = [
  'resignation',
  'fixed_term_end',
  'objective_dismissal',
  'collective_dismissal',
  'unfair_dismissal',
  'disciplinary_dismissal',
];

// The cause sheet as the page writes it, with one cause marked when the page is about it.
function form(preset?: Cause): HTMLFormElement {
  const f = document.createElement('form');
  f.innerHTML = CAUSES.map(
    (c) => `<input type="radio" name="cause" value="${c}"${c === preset ? ' checked' : ''}>`,
  ).join('');
  document.body.replaceChildren(f);
  return f;
}

const check = (f: HTMLFormElement, cause: Cause) => {
  const input = f.querySelector<HTMLInputElement>(`[value="${cause}"]`);
  if (input) input.checked = true;
};

const opensOn = (flow: Parameters<typeof startStep>[0], f: HTMLFormElement) =>
  STEPS[startStep(flow, f)];

describe('a preset cause', () => {
  it('the final pay flow opens on the cause, whatever is marked', () => {
    expect(opensOn(FINAL_PAY_FLOW, form())).toBe('causa');
    expect(opensOn(FINAL_PAY_FLOW, form('resignation'))).toBe('causa');
  });

  it.each(CAUSES.filter((c) => c !== 'fixed_term_end'))('%s opens on the dates', (cause) => {
    expect(opensOn(presetCauseFlow(cause), form(cause))).toBe('fechas');
  });

  it('a fixed-term contract opens on its type, which the cause does not answer', () => {
    expect(opensOn(presetCauseFlow('fixed_term_end'), form('fixed_term_end'))).toBe('temporal');
  });

  it('once the visitor picks another cause, the visit starts on the cause again', () => {
    const f = form('resignation');
    check(f, 'unfair_dismissal');
    expect(opensOn(presetCauseFlow('resignation'), f)).toBe('causa');
  });

  it('a reset brings the marked cause back, and with it the start past the cause', () => {
    const f = form('objective_dismissal');
    check(f, 'resignation');
    f.reset();
    expect(opensOn(presetCauseFlow('objective_dismissal'), f)).toBe('fechas');
  });

  it('keeps every other part of the final pay flow', () => {
    const flow = presetCauseFlow('resignation');
    expect({ ...flow, opensOn: undefined }).toEqual({ ...FINAL_PAY_FLOW, opensOn: undefined });
  });
});
