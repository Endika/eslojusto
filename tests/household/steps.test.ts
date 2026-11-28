// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { HOUSEHOLD_FLOW } from '../../src/household/steps';

const today = { y: 2026, m: 10, d: 8 };

describe('the household flow', () => {
  it('counts a sheet complete once it answers cleanly, and the result always', () => {
    const form = document.createElement('form');
    form.innerHTML = '<input type="radio" name="work" value="monthly"><input name="startDate">';
    expect(HOUSEHOLD_FLOW.complete(form, 'trabajo', today)).toBe(false);
    (form.querySelector('[name="work"]') as HTMLInputElement).checked = true;
    (form.querySelector('[name="startDate"]') as HTMLInputElement).value = '2024-03-01';
    expect(HOUSEHOLD_FLOW.complete(form, 'trabajo', today)).toBe(true);
    expect(HOUSEHOLD_FLOW.complete(form, 'resultado', today)).toBe(true);
  });
});
