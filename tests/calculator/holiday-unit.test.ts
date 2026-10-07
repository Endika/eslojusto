// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { applyConditions, followHolidayUnit } from '../../src/calculator/conditions';

function sheet(annual: string): HTMLFormElement {
  const form = document.createElement('form');
  form.innerHTML = `
    <input type="radio" name="holidayUnit" value="working" data-default-days="22" checked>
    <input type="radio" name="holidayUnit" value="calendar" data-default-days="30">
    <div data-field="annualHolidayDays" data-hint-working="Días laborables" data-hint-calendar="Días naturales">
      <p class="hint">Días laborables</p>
      <input name="annualHolidayDays" value="${annual}">
    </div>`;
  return form;
}

const choose = (form: HTMLFormElement, unit: string) => {
  const radio = form.querySelector<HTMLInputElement>(`[value="${unit}"]`);
  if (!radio) throw new Error(unit);
  radio.checked = true;
  followHolidayUnit(form, radio);
  applyConditions(form);
};
const annual = (form: HTMLFormElement) =>
  form.querySelector<HTMLInputElement>('[name="annualHolidayDays"]')?.value;

describe('the holiday unit', () => {
  it('carries the untouched yearly default along, both ways, and swaps the hint', () => {
    const form = sheet('22');
    choose(form, 'calendar');
    expect(annual(form)).toBe('30');
    expect(form.querySelector('.hint')?.textContent).toBe('Días naturales');
    choose(form, 'working');
    expect(annual(form)).toBe('22');
    expect(form.querySelector('.hint')?.textContent).toBe('Días laborables');
  });

  it('never rewrites a figure the person typed', () => {
    const form = sheet('25');
    choose(form, 'calendar');
    expect(annual(form)).toBe('25');
  });
});
