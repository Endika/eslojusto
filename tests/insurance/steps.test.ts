// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { INSURANCE_FLOW } from '../../src/insurance/steps';

const today = { y: 2026, m: 10, d: 9 };

describe('the insurance flow', () => {
  it('counts a sheet complete once it answers cleanly, and the result always', () => {
    const form = document.createElement('form');
    form.innerHTML = '<input name="line" value="">';
    expect(INSURANCE_FLOW.complete(form, 'poliza', today)).toBe(false);
    (form.querySelector('[name="line"]') as HTMLInputElement).value = 'home';
    expect(INSURANCE_FLOW.complete(form, 'poliza', today)).toBe(true);
    expect(INSURANCE_FLOW.complete(document.createElement('form'), 'resultado', today)).toBe(true);
  });
});
