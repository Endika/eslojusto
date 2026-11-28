// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { applyConditions } from '../../src/household/conditions';
import { SHEETS, sheetErrors, type FieldError } from '../../src/household/form';

const TODAY = parseDate('2026-10-08');

const radios = (name: string, values: readonly string[]) =>
  values.map((v) => `<input type="radio" name="${name}" value="${v}" />`).join('');
const text = (name: string) => `<input type="text" name="${name}" />`;

// The sheets' controls as HouseholdForm.astro names and nests them.
function build(): HTMLFormElement {
  const form = document.createElement('form');
  form.innerHTML = `
    ${radios('work', ['hourly_external', 'monthly', 'live_in'])}
    ${text('startDate')}
    ${radios('ending', ['working', 'desistimiento', 'et_cause', 'unknown'])}
    <div data-if="ending:desistimiento et_cause">${text('endDate')}</div>
    <div data-if="work:monthly live_in">${text('monthlyPay')}${text('inKind')}</div>
    <div data-if="work:hourly_external">
      ${text('hourlyRate')}
      <div data-if="ending:desistimiento">${text('monthlyAverage')}</div>
    </div>
    ${text('extraCount')}
    <div data-if-above0="extraCount">
      ${radios('extraProrated', ['yes', 'no'])}
      <div data-if="extraProrated:no">
        ${text('extraAmount')}${radios('extraAccrual', ['semiannual', 'annual', 'unknown'])}
      </div>
    </div>
    ${text('weeklyHours')}${text('shortestRest')}${text('weeklyRest')}
    <div data-if="work:live_in">${radios('restMadeUp', ['yes', 'no', 'unknown'])}</div>
    ${text('holidayDays')}${text('holidayStretch')}
    <div data-if="ending:desistimiento et_cause">${text('holidayTaken')}</div>
    ${radios('cause', ['income_drop_or_expense_rise', 'family_needs_change', 'loss_of_trust', 'other', 'none', 'unknown'])}
    ${radios('inWriting', ['yes', 'no', 'unknown'])}
    ${radios('severanceAvailable', ['yes', 'no', 'unknown'])}
    <div data-if="severanceAvailable:yes">${text('severanceOffered')}</div>
    ${text('noticeDays')}
    <div data-if-below="noticeDays:20">${text('substitutePaid')}</div>
    <div data-if="work:live_in">
      ${radios('nightNotice', ['yes', 'no', 'unknown'])}
      <div data-if="nightNotice:yes">${radios('seriousBreach', ['yes', 'no', 'unknown'])}</div>
    </div>`;
  document.body.replaceChildren(form);
  applyConditions(form);
  return form;
}

// Answers the form the way a person would: choices by value, figures typed, conditions applied
// after each answer.
function answer(form: HTMLFormElement, answers: Record<string, string>): void {
  for (const [name, value] of Object.entries(answers)) {
    const radio = form.querySelector<HTMLInputElement>(
      `input[type="radio"][name="${name}"][value="${value}"]`,
    );
    if (radio) radio.checked = true;
    else {
      const field = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (!field) throw new Error(`No control ${name}`);
      field.value = value;
    }
    applyConditions(form);
  }
}

const COMMON = {
  work: 'monthly',
  startDate: '2024-03-01',
  ending: 'working',
  monthlyPay: '1.500,00',
  extraCount: '2',
  extraProrated: 'no',
  extraAmount: '1.500',
  extraAccrual: 'semiannual',
  holidayDays: '30',
};

const errorsOf = (form: HTMLFormElement, sheet: (typeof SHEETS)[number]): FieldError[] =>
  sheetErrors(form, sheet, TODAY);

let form: HTMLFormElement;
beforeEach(() => {
  form = build();
});

describe('validation', () => {
  it('reports the field an engine rule rejects', () => {
    answer(form, { ...COMMON, ending: 'et_cause', endDate: '2024-01-01' });
    expect(errorsOf(form, 'fechas')).toEqual([{ field: 'endDate', code: 'before_start' }]);
    answer(form, { startDate: '2099-01-01' });
    expect(errorsOf(form, 'trabajo')).toContainEqual({ field: 'startDate', code: 'too_far_ahead' });
  });
});
