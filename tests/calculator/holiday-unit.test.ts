// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { applyConditions, followHolidayDefault } from '../../src/calculator/conditions';
import { readForm } from '../../src/calculator/form';

function sheet(annual: string): HTMLFormElement {
  const form = document.createElement('form');
  form.innerHTML = `
    <input type="radio" name="holidayUnit" value="working" checked>
    <input type="radio" name="holidayUnit" value="calendar">
    <fieldset data-if-holiday-unit="working">
      <input type="radio" name="workDaysPerWeek" value="5" checked>
      <input type="radio" name="workDaysPerWeek" value="6">
      <input type="radio" name="workDaysPerWeek" value="other">
      <div data-if-work-week="other" hidden><input name="workDaysPerWeekOther"></div>
    </fieldset>
    <div data-field="annualHolidayDays" data-hint-working="Laborables" data-hint-calendar="Naturales">
      <p class="hint">Laborables</p>
      <input name="annualHolidayDays" value="${annual}">
    </div>`;
  return form;
}

const pick = (form: HTMLFormElement, name: string, value: string) => {
  const radio = form.querySelector<HTMLInputElement>(`[name="${name}"][value="${value}"]`);
  if (!radio) throw new Error(value);
  radio.checked = true;
  applyConditions(form);
  followHolidayDefault(form);
};
const value = (form: HTMLFormElement, name: string) =>
  form.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value;

describe('the holiday unit and the work week', () => {
  it('the untouched yearly default follows the unit and the week, and the hint the unit', () => {
    const form = sheet('22');
    pick(form, 'workDaysPerWeek', '6');
    expect(value(form, 'annualHolidayDays')).toBe('26');
    pick(form, 'holidayUnit', 'calendar');
    expect(value(form, 'annualHolidayDays')).toBe('30');
    expect(form.querySelector('.hint')?.textContent).toBe('Naturales');
    pick(form, 'holidayUnit', 'working');
    expect(value(form, 'annualHolidayDays')).toBe('26');
    pick(form, 'workDaysPerWeek', 'other');
    const other = form.querySelector<HTMLInputElement>('[name="workDaysPerWeekOther"]');
    if (!other) throw new Error('other');
    expect(other.disabled).toBe(false);
    other.value = '3';
    followHolidayDefault(form);
    expect(value(form, 'annualHolidayDays')).toBe('13');
  });

  it('never rewrites a figure the person typed', () => {
    const form = sheet('22');
    const annual = form.querySelector<HTMLInputElement>('[name="annualHolidayDays"]');
    if (!annual) throw new Error('annual');
    annual.value = '25';
    pick(form, 'workDaysPerWeek', '6');
    pick(form, 'holidayUnit', 'calendar');
    expect(value(form, 'annualHolidayDays')).toBe('25');
  });

  it('the week is asked only with working days', () => {
    const form = sheet('22');
    pick(form, 'holidayUnit', 'calendar');
    const week = form.querySelector<HTMLInputElement>('[name="workDaysPerWeek"]');
    expect(week?.disabled).toBe(true);
  });
});

describe('reading the work week', () => {
  function full(week: string, other = ''): HTMLFormElement {
    const form = document.createElement('form');
    form.innerHTML = `
      <input name="cause" value="unfair_dismissal">
      <input name="startDate" value="2022-01-10"><input name="endDate" value="2026-09-15">
      <input name="extraPayProrated" value="yes"><input name="monthlySalary" value="1850">
      <input name="extraPayCount" value="2"><input name="holidayUnit" value="working">
      <input name="workDaysPerWeek" value="${week}">
      <input name="workDaysPerWeekOther" value="${other}">
      <input name="annualHolidayDays" value="26"><input name="holidayDaysTaken" value="0">`;
    return form;
  }
  it('5, 6 or another number of days', () => {
    const days = (f: HTMLFormElement) => {
      const r = readForm(f);
      return 'input' in r ? r.input.workDaysPerWeek : r.errors;
    };
    expect(days(full('6'))).toBe(6);
    expect(days(full('other', '4'))).toBe(4);
    expect(days(full('other', ''))).toEqual([
      { field: 'workDaysPerWeek', code: 'work_week_out_of_range' },
    ]);
  });
});
