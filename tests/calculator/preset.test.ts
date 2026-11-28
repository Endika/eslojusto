// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { startStep } from '../../src/calculator/flow';
import { STEPS, presetCauseFlow } from '../../src/calculator/steps';
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
  it.each(CAUSES.filter((c) => c !== 'fixed_term_end' && c !== 'resignation'))(
    '%s opens on the dates',
    (cause) => {
      expect(opensOn(presetCauseFlow(cause), form(cause))).toBe('fechas');
    },
  );

  it('once the visitor picks another cause, the visit starts on the cause again', () => {
    const f = form('resignation');
    check(f, 'unfair_dismissal');
    expect(presetCauseFlow('resignation').opensOn?.(f)).toBe('causa');
  });
});
