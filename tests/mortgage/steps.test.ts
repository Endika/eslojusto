// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { MORTGAGE_FLOW } from '../../src/mortgage/steps';

const TODAY = parseDate('2026-10-10');

function form(loanKind: string): HTMLFormElement {
  const el = document.createElement('form');
  el.innerHTML = `<input name="loanKind" value="${loanKind}" />`;
  return el;
}

describe('when a step of the mortgage flow is complete', () => {
  it('asks its sheet to read, and the result of nothing', () => {
    expect(MORTGAGE_FLOW.complete(form('standard'), 'hipoteca', TODAY)).toBe(true);
    expect(MORTGAGE_FLOW.complete(form('bogus'), 'hipoteca', TODAY)).toBe(false);
    expect(MORTGAGE_FLOW.complete(form('bogus'), 'resultado', TODAY)).toBe(true);
  });
});
