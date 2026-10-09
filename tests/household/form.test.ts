// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { applies, applyConditions, gate } from '../../src/household/conditions';
import {
  SHEETS,
  SHEET_FIELDS,
  endingOf,
  readHouseholdForm,
  sheetErrors,
  sheetOfField,
  type FieldError,
} from '../../src/household/form';
import { HOUSEHOLD_FIELDS } from '../../src/household/ports';

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

const readInput = (form: HTMLFormElement) => {
  const r = readHouseholdForm(form, TODAY);
  if ('errors' in r) throw new Error(`errors: ${JSON.stringify(r.errors)}`);
  return r.input;
};

const errorsOf = (form: HTMLFormElement, sheet: (typeof SHEETS)[number]): FieldError[] =>
  sheetErrors(form, sheet, TODAY);

let form: HTMLFormElement;
beforeEach(() => {
  form = build();
});

describe('reading the form', () => {
  it('reads a monthly worker still employed', () => {
    answer(form, { ...COMMON, weeklyHours: '37,5', inKind: '200' });
    const input = readInput(form);
    expect(input).toMatchObject({
      startDate: { y: 2024, m: 3, d: 1 },
      payYear: 2026,
      liveIn: false,
      regime: 'monthly',
      monthlyCash: 1500,
      inKindMonthly: 200,
      weeklyHours: 37.5,
      extraPays: { count: 2, amount: 1500, prorated: false, accrual: 'semiannual' },
      holidays: { days: 30, longestStretch: null, taken: null },
      termination: null,
    });
  });

  it('reads an external worker paid by the hour, with no extra payments', () => {
    answer(form, {
      work: 'hourly_external',
      startDate: '2025-01-07',
      ending: 'working',
      hourlyRate: '9,5',
      holidayDays: '30',
    });
    expect(readInput(form)).toMatchObject({
      regime: 'hourly_external',
      liveIn: false,
      hourlyRate: 9.5,
      monthlyCash: null,
      extraPays: null,
    });
  });

  it('reads the hours of an hourly worker whose relationship ended by desistimiento', () => {
    answer(form, {
      work: 'hourly_external',
      startDate: '2025-01-07',
      ending: 'desistimiento',
      endDate: '2026-09-21',
      hourlyRate: '9,5',
      monthlyAverage: '800',
      holidayDays: '30',
      cause: 'loss_of_trust',
      inWriting: 'yes',
      severanceAvailable: 'no',
    });
    const input = readInput(form);
    expect(input.monthlyCash).toBe(800);
    expect(input.payYear).toBe(2026);
  });

  it('reads a live-in desistimiento: the notice date from the days, the night as a yes or no', () => {
    answer(form, {
      ...COMMON,
      work: 'live_in',
      ending: 'desistimiento',
      endDate: '2026-09-21',
      cause: 'family_needs_change',
      inWriting: 'no',
      severanceAvailable: 'yes',
      severanceOffered: '1.000',
      noticeDays: '7',
      substitutePaid: '150',
      nightNotice: 'yes',
      seriousBreach: 'no',
      restMadeUp: 'yes',
      shortestRest: '10',
      holidayTaken: '12',
    });
    const input = readInput(form);
    expect(input).toMatchObject({
      liveIn: true,
      restMadeUpWithinFourWeeks: true,
      shortestRestHours: 10,
    });
    expect(input.holidays?.taken).toBe(12);
    expect(input.termination).toEqual({
      route: 'desistimiento',
      noticeGivenOn: { y: 2026, m: 9, d: 14 },
      effectiveOn: { y: 2026, m: 9, d: 21 },
      noticeTime: '22:00',
      inWriting: false,
      cause: 'family_needs_change',
      severanceAvailable: true,
      severanceOffered: 1000,
      substitutePaid: 150,
      seriousBreachAlleged: false,
    });
  });

  it('reads an external desistimiento without the night question, which only a live-in is asked', () => {
    answer(form, {
      ...COMMON,
      ending: 'desistimiento',
      endDate: '2026-09-30',
      cause: 'family_needs_change',
      inWriting: 'yes',
      severanceAvailable: 'no',
      noticeDays: '15',
    });
    const input = readInput(form);
    expect(input.termination).toMatchObject({ noticeTime: null, seriousBreachAlleged: null });
  });

  it('turns «No lo sé» into an unknown, never into a guess', () => {
    answer(form, {
      ...COMMON,
      work: 'live_in',
      ending: 'desistimiento',
      endDate: '2026-09-21',
      cause: 'unknown',
      inWriting: 'unknown',
      severanceAvailable: 'unknown',
      nightNotice: 'unknown',
    });
    expect(readInput(form).termination).toMatchObject({
      cause: null,
      inWriting: null,
      severanceAvailable: null,
      noticeTime: null,
      noticeGivenOn: null,
    });
  });

  it('reads another cause of the Estatuto with the last day only', () => {
    answer(form, { ...COMMON, ending: 'et_cause', endDate: '2026-06-30' });
    expect(readInput(form).termination).toMatchObject({
      route: 'et_cause',
      effectiveOn: { y: 2026, m: 6, d: 30 },
      cause: null,
      inWriting: null,
    });
  });

  it('leaves the end out when the person does not know how it ended', () => {
    answer(form, { ...COMMON, ending: 'unknown' });
    expect(readInput(form).termination).toBeNull();
    expect(endingOf(form)).toBe('unknown');
  });

  it('reads the extra payments: none, spread over the year, or apart', () => {
    answer(form, { ...COMMON, extraCount: '0' });
    expect(readInput(form).extraPays).toEqual({
      count: 0,
      amount: null,
      prorated: false,
      accrual: 'semiannual',
    });
    answer(form, { extraCount: '2', extraProrated: 'yes' });
    expect(readInput(form).extraPays).toMatchObject({ count: 2, prorated: true });
    answer(form, { extraProrated: 'no', extraAmount: '' });
    expect(readInput(form).extraPays).toMatchObject({ prorated: false, amount: null });
  });

  it('never reads a question that is switched off', () => {
    answer(form, { ...COMMON, work: 'live_in', nightNotice: 'yes', ending: 'working' });
    answer(form, { ending: 'working' });
    const input = readInput(form);
    expect(input.termination).toBeNull();
    expect(input.holidays?.taken).toBeNull();
    // The seriousBreach question exists only after a night notice; it is off with the ending.
    expect(form.querySelector<HTMLInputElement>('[name="holidayTaken"]')?.disabled).toBe(true);
  });
});

describe('the sheets that apply', () => {
  it('asks the extra payments only of a worker paid by the month', () => {
    answer(form, { work: 'hourly_external' });
    expect(applies(form, 'pagas')).toBe(false);
    answer(form, { work: 'live_in' });
    expect(applies(form, 'pagas')).toBe(true);
  });

  it('asks the three desistimiento sheets only after a desistimiento', () => {
    for (const ending of ['working', 'et_cause', 'unknown']) {
      answer(form, { ending });
      for (const sheet of ['desistimiento', 'escrito', 'preaviso', 'noche'] as const)
        expect(applies(form, sheet)).toBe(false);
    }
    answer(form, { ending: 'desistimiento' });
    for (const sheet of ['desistimiento', 'escrito', 'preaviso'] as const)
      expect(applies(form, sheet)).toBe(true);
    // The night notice is asked only of a worker who lives in the house.
    expect(applies(form, 'noche')).toBe(false);
    answer(form, { work: 'live_in' });
    expect(applies(form, 'noche')).toBe(true);
  });

  it('asks when the extra payments are paid only if they are apart', () => {
    answer(form, { work: 'monthly', extraCount: '2', extraProrated: 'yes' });
    expect(applies(form, 'pagas-cuando')).toBe(false);
    answer(form, { extraProrated: 'no' });
    expect(applies(form, 'pagas-cuando')).toBe(true);
    answer(form, { extraCount: '0' });
    expect(applies(form, 'pagas-cuando')).toBe(false);
    answer(form, { extraCount: '2', work: 'hourly_external' });
    expect(applies(form, 'pagas-cuando')).toBe(false);
  });

  it('opens the substitute pay only under twenty days of notice', () => {
    const substitute = () => form.querySelector<HTMLInputElement>('[name="substitutePaid"]');
    answer(form, { noticeDays: '19' });
    expect(substitute()?.disabled).toBe(false);
    answer(form, { noticeDays: '20' });
    expect(substitute()?.disabled).toBe(true);
    answer(form, { noticeDays: '' });
    expect(substitute()?.disabled).toBe(true);
  });

  it('asks the proration only once there are extra payments', () => {
    const prorated = () => form.querySelector<HTMLInputElement>('[name="extraProrated"]');
    answer(form, { extraCount: '0' });
    expect(prorated()?.disabled).toBe(true);
    answer(form, { extraCount: '00' });
    expect(prorated()?.disabled).toBe(true);
    answer(form, { extraCount: '2' });
    expect(prorated()?.disabled).toBe(false);
  });
});

describe('validation', () => {
  it('asks for what each sheet needs', () => {
    expect(errorsOf(form, 'trabajo').map((e) => e.field)).toEqual(['work', 'startDate']);
    answer(form, { work: 'monthly', startDate: '2024-03-01' });
    expect(errorsOf(form, 'trabajo')).toEqual([]);
    expect(errorsOf(form, 'fechas').map((e) => e.field)).toEqual(['ending']);
    answer(form, { ending: 'desistimiento' });
    expect(errorsOf(form, 'fechas')).toEqual([{ field: 'endDate', code: 'missing_value' }]);
    expect(errorsOf(form, 'sueldo')).toEqual([{ field: 'monthlyPay', code: 'missing_value' }]);
  });

  it('reports the field an engine rule rejects', () => {
    answer(form, { ...COMMON, ending: 'et_cause', endDate: '2024-01-01' });
    expect(errorsOf(form, 'fechas')).toEqual([{ field: 'endDate', code: 'before_start' }]);
    answer(form, { startDate: '2099-01-01' });
    expect(errorsOf(form, 'trabajo')).toContainEqual({ field: 'startDate', code: 'too_far_ahead' });
  });

  it('rejects figures that are not figures, and amounts and hours out of range', () => {
    answer(form, { ...COMMON, monthlyPay: 'mucho' });
    expect(errorsOf(form, 'sueldo')).toEqual([{ field: 'monthlyPay', code: 'invalid_amount' }]);
    answer(form, { monthlyPay: '0' });
    expect(errorsOf(form, 'sueldo')).toEqual([{ field: 'monthlyPay', code: 'amount_range' }]);
    answer(form, { weeklyHours: '100' });
    expect(errorsOf(form, 'jornada')).toEqual([{ field: 'weeklyHours', code: 'hours_range' }]);
    answer(form, { weeklyHours: '-3' });
    expect(errorsOf(form, 'jornada')).toEqual([{ field: 'weeklyHours', code: 'hours_range' }]);
    answer(form, { weeklyHours: '', shortestRest: '500' });
    expect(errorsOf(form, 'descansos')).toEqual([{ field: 'shortestRest', code: 'hours_range' }]);
    answer(form, { shortestRest: '', extraCount: '1,5' });
    expect(errorsOf(form, 'pagas')).toEqual([{ field: 'extraCount', code: 'invalid_number' }]);
    answer(form, { extraCount: '9' });
    expect(errorsOf(form, 'pagas')).toEqual([{ field: 'extraCount', code: 'count_range' }]);
  });

  it('puts a notice longer than the service on the notice field', () => {
    answer(form, {
      ...COMMON,
      startDate: '2026-09-10',
      ending: 'desistimiento',
      endDate: '2026-09-21',
      noticeDays: '30',
    });
    expect(errorsOf(form, 'preaviso')).toEqual([
      { field: 'noticeDays', code: 'notice_before_start' },
    ]);
  });

  it('lets the optional questions stay blank', () => {
    answer(form, COMMON);
    for (const sheet of ['jornada', 'vacaciones'] as const)
      expect(errorsOf(form, sheet)).toEqual([]);
    const input = readInput(form);
    expect(input).toMatchObject({
      weeklyHours: null,
      shortestRestHours: null,
      weeklyRestHours: null,
      inKindMonthly: null,
    });
  });

  it("lets the holidays stay blank, but not the year's days once another figure needs them", () => {
    answer(form, { ...COMMON, holidayDays: '' });
    expect(errorsOf(form, 'vacaciones')).toEqual([]);
    expect(readInput(form).holidays).toBeNull();
    answer(form, { holidayStretch: '15' });
    expect(errorsOf(form, 'vacaciones')).toEqual([{ field: 'holidayDays', code: 'missing_value' }]);
  });

  it('keeps every question on exactly one sheet', () => {
    const listed = SHEETS.flatMap((s) => SHEET_FIELDS[s]);
    expect([...listed].sort()).toEqual([...HOUSEHOLD_FIELDS].sort());
    for (const sheet of SHEETS)
      for (const field of SHEET_FIELDS[sheet]) expect(sheetOfField(field)).toBe(sheet);
  });
});

describe('the gate', () => {
  it('stops a relationship that ended before the reform', () => {
    answer(form, { ending: 'et_cause', endDate: '2022-05-01' });
    expect(gate(form)).toEqual({ inScope: false, reason: 'before_reform' });
  });

  it('lets the day of the reform and later through, and a relationship still running', () => {
    answer(form, { ending: 'et_cause', endDate: '2022-09-09' });
    expect(gate(form)).toEqual({ inScope: true });
    answer(form, { ending: 'working' });
    expect(gate(form)).toEqual({ inScope: true });
  });
});
