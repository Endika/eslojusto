// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { contractAnnualPay } from '../../src/engine/employment/minimum-wage';
import { INFO_ELEMENTS } from '../../src/engine/employment/types';
import { gate } from '../../src/employment/conditions';
import { readEmploymentForm, sheetApplies, sheetErrors } from '../../src/employment/form';
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
  it('reads a complete contract, its extra pays matching its payments', () => {
    const r = readEmploymentForm(form(), TODAY);
    if (!('input' in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.input.salary).toMatchObject({ amount: 1500, payments: 14, prorated: false });
    expect(r.input.extraPays).toEqual({ count: 2, prorated: false });
    // Payments and extra pays agree, so the contract has a yearly pay to compare with an offer.
    expect(contractAnnualPay(r.input)).toBe(21000);
  });

  it('stops household employment at the gate, whatever else it says', () => {
    const el = form({ relationship: 'household' });
    expect(gate(el)).toEqual({ inScope: false, reason: 'special_relationship' });
    expect(sheetApplies(el, 'salario')).toBe(false);
  });

  it('stops a minor at the gate', () => {
    expect(gate(form({ under18: 'yes' }))).toEqual({ inScope: false, reason: 'minor' });
  });

  it('skips the modality and the work history of a contract from before the reform', () => {
    const el = form({ startDate: '2021-06-01', modality: '' });
    expect(gate(el)).toMatchObject({ inScope: true, partial: true });
    expect(sheetApplies(el, 'modalidad')).toBe(false);
    expect(sheetApplies(el, 'historial')).toBe(false);
    expect(sheetApplies(el, 'salario')).toBe(true);
    // The modality left unanswered on a skipped sheet never blocks the review.
    expect('input' in readEmploymentForm(el, TODAY)).toBe(true);
  });

  it('asks for the work history only of a contract that is not open-ended', () => {
    expect(sheetApplies(form(), 'historial')).toBe(false);
    expect(sheetApplies(form({ modality: 'production' }), 'historial')).toBe(true);
  });

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

  it('groups the schedule by day', () => {
    const el = form(
      { hasSchedule: 'yes' },
      {
        schedule: [
          { day: '1', from: '09:00', to: '14:00' },
          { day: '1', from: '15:00', to: '18:00' },
          { day: '2', from: '09:00', to: '17:00' },
        ],
      },
    );
    const r = readEmploymentForm(el, TODAY);
    if (!('input' in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.input.schedule).toEqual([
      {
        day: 1,
        slots: [
          { from: '09:00', to: '14:00' },
          { from: '15:00', to: '18:00' },
        ],
      },
      { day: 2, slots: [{ from: '09:00', to: '17:00' }] },
    ]);
  });

  it('says a payslip month it cannot read is not a month', () => {
    const el = form(
      { hasPayslips: 'yes' },
      { payslips: [{ month: 'marzo', wholeMonth: 'yes', incidents: 'no', salary: '1.200' }] },
    );
    expect(sheetErrors(el, 'nominas', TODAY)).toEqual([
      { field: 'payslips.0.month', code: 'invalid_month' },
    ]);
  });
});
