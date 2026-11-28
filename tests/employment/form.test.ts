// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { INFO_ELEMENTS } from '../../src/engine/employment/types';
import { EMPLOYMENT_FLOW } from '../../src/employment/steps';
import { sheetErrors } from '../../src/employment/form';
import { TODAY } from './fixtures';

type Values = Readonly<Record<string, string>>;
type RowsOf = Readonly<Record<string, readonly Values[]>>;

// Every question answered as a full-time open-ended contract from 2026; tests change what they check.
const ANSWERS: Values = {
  relationship: 'common',
  viaTempAgency: 'no',
  relief: 'no',
  under18: 'no',
  writtenContract: 'yes',
  startDate: '2026-01-01',
  signedOn: '',
  endDate: '',
  modality: 'permanent',
  hasHistory: 'no',
  salaryAmount: '1.500,00',
  salaryPeriod: 'month',
  extraPays: '2',
  extraProrated: 'no',
  hasBreakdown: 'no',
  inKind: '',
  weeklyHours: '40',
  annualHours: '',
  fullTimeHours: '',
  agreementNamed: 'yes',
  categorySalary: '',
  agreementAnnualHours: '',
  hasPayslips: 'no',
  hasSchedule: 'no',
  shifts: 'no',
  nightWorker: 'no',
  irregular: 'no',
  hasOvertime: 'no',
  isPartTime: 'no',
  remoteShare: '',
  realWeeklyHours: '',
  hasTrial: 'no',
  technical: 'no',
  smallCompany: 'no',
  sameDutiesBefore: 'no',
  afterTraining: 'no',
  agreementTrialMonths: '',
  hasHolidays: 'no',
  agreementHolidayDays: '',
  hasClauses: 'no',
  hasOffer: 'no',
  ...Object.fromEntries(INFO_ELEMENTS.map((e) => [`info_${e}`, 'present'])),
};

// The sheets' controls as EmploymentForm.astro names them, with the rows already numbered.
function form(change: Values = {}, rows: RowsOf = {}): HTMLFormElement {
  const el = document.createElement('form');
  const values = { ...ANSWERS, ...change };
  const lists = ['history', 'parts', 'payslips', 'schedule', 'clauses'];
  el.innerHTML =
    Object.entries(values)
      .map(([name, value]) => `<input name="${name}" value="${value}" />`)
      .join('') +
    lists
      .map(
        (list) =>
          `<div data-rows="${list}"><ol>${(rows[list] ?? [])
            .map(
              (row, i) =>
                `<li data-row="${i}">${Object.entries(row)
                  .map(([key, v]) => `<input name="${list}.${i}.${key}" value="${v}" />`)
                  .join('')}</li>`,
            )
            .join('')}</ol></div>`,
      )
      .join('');
  return el;
}

describe('the employment form', () => {
  it('puts an engine error on the row that caused it', () => {
    const el = form(
      { modality: 'production', hasHistory: 'yes' },
      {
        history: [
          { startDate: '2024-06-01', endDate: '2024-01-01', employer: 'same', kind: 'production' },
        ],
      },
    );
    expect(sheetErrors(el, 'historial', TODAY)).toEqual([
      { field: 'history.0.endDate', code: 'before_start' },
    ]);
  });
});

describe('the employment flow', () => {
  it('asks a sheet to answer cleanly, and the result nothing', () => {
    const wrong = form(
      { modality: 'production', hasHistory: 'yes' },
      {
        history: [
          { startDate: '2024-06-01', endDate: '2024-01-01', employer: 'same', kind: 'production' },
        ],
      },
    );
    expect(EMPLOYMENT_FLOW.complete(wrong, 'historial', TODAY)).toBe(false);
    expect(EMPLOYMENT_FLOW.complete(wrong, 'salario', TODAY)).toBe(true);
    expect(EMPLOYMENT_FLOW.complete(wrong, 'resultado', TODAY)).toBe(true);
  });
});
