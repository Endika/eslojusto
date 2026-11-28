import { describe, expect, it } from 'vitest';
import { parseDate, type CivilDate } from '../../../src/engine/date';
import { validate, validationWarnings } from '../../../src/engine/employment/validate';
import type {
  Clause,
  EmploymentInput,
  Offer,
  PartTime,
  ScheduleDay,
} from '../../../src/engine/employment/types';
import { contract } from './input';

const TODAY = parseDate('2026-10-07');
const errorsOf = (change: Partial<EmploymentInput>) =>
  validate(contract(change), TODAY).map(({ field, index, code }) => [field, index, code]);
const unchecked = (y: number, m: number, d: number): CivilDate => ({ y, m, d });

describe('validate', () => {
  it('accepts the synthetic contract', () => {
    expect(validate(contract(), TODAY)).toEqual([]);
  });

  it('rejects a date that does not exist', () => {
    expect(errorsOf({ startDate: unchecked(2026, 2, 30) })).toEqual([
      ['startDate', null, 'invalid_date'],
    ]);
  });

  it('accepts a contract starting up to a year ahead, not later', () => {
    expect(errorsOf({ startDate: parseDate('2027-10-07') })).toEqual([]);
    expect(errorsOf({ startDate: parseDate('2027-10-08') })).toEqual([
      ['startDate', null, 'too_far_ahead'],
    ]);
  });

  it('rejects an end before the start', () => {
    expect(errorsOf({ endDate: parseDate('2024-02-29') })).toEqual([
      ['endDate', null, 'before_start'],
    ]);
    expect(errorsOf({ endDate: parseDate('2024-03-01') })).toEqual([]);
  });

  it.each([0, -1, 1_000_001, Number.NaN])('rejects a salary of %s', (amount) => {
    expect(errorsOf({ salary: { ...contract().salary, amount } })).toEqual([
      ['salary.amount', null, 'amount_range'],
    ]);
  });

  it('accepts a salary of 1.000.000 €', () => {
    expect(errorsOf({ salary: { ...contract().salary, amount: 1_000_000 } })).toEqual([]);
  });

  it.each([
    [0, false],
    [80, true],
    [80.5, false],
  ])('weekly hours of %s valid: %s', (weekly, valid) => {
    expect(errorsOf({ contractHours: { weekly, annual: null } }).length === 0).toBe(valid);
  });

  it.each([
    [-1, false],
    [0, true],
    [100, true],
    [101, false],
  ])('a remote share of %s %% valid: %s', (remoteShare, valid) => {
    expect(errorsOf({ remoteShare }).length === 0).toBe(valid);
  });

  it.each([
    [0, false],
    [1, true],
    [16, true],
    [17, false],
    [14.5, false],
  ])('%s payments valid: %s', (payments, valid) => {
    expect(errorsOf({ salary: { ...contract().salary, payments } }).length === 0).toBe(valid);
  });

  it('points at the slot whose start and end are the same', () => {
    expect(
      errorsOf({
        schedule: [
          { day: 1, slots: [{ from: '09:00', to: '14:00' }] },
          { day: 2, slots: [{ from: '09:00', to: '09:00' }] },
          { day: 3, slots: [{ from: '25:00', to: '09:00' }] },
        ],
      }),
    ).toEqual([
      ['schedule', 1, 'empty_slot'],
      ['schedule', 2, 'invalid_time'],
    ]);
  });

  it('accepts a night slot that crosses midnight', () => {
    expect(errorsOf({ schedule: [{ day: 5, slots: [{ from: '22:00', to: '06:00' }] }] })).toEqual(
      [],
    );
  });

  it('checks each payslip on its own', () => {
    expect(
      errorsOf({ payslips: [payslip, { ...payslip, month: '2026-13', salaryInMoney: 0 }] }),
    ).toEqual([
      ['payslips.month', 1, 'invalid_month'],
      ['payslips.salaryInMoney', 1, 'amount_range'],
    ]);
  });

  it('checks the periods of the work history', () => {
    expect(
      errorsOf({
        history: [
          {
            startDate: parseDate('2023-01-01'),
            endDate: parseDate('2022-12-31'),
            employer: 'same',
            kind: 'production',
          },
        ],
      }),
    ).toEqual([['history', 0, 'before_start']]);
  });

  it('checks percentages of a training contract', () => {
    expect(
      errorsOf({
        modality: 'training_alternance',
        training: {
          studiesEndedOn: null,
          disability: null,
          planAttached: null,
          effectiveWorkPercent: { year1: 65, year2: 120 },
        },
      }),
    ).toEqual([['training.effectiveWorkPercent', null, 'percent_range']]);
  });

  it.each([
    ['months', 12, true],
    ['months', 13, false],
    ['weeks', 52, true],
    ['weeks', 53, false],
    ['days', 366, true],
    ['days', 367, false],
  ] as const)('a trial of %s %s valid: %s', (unit, amount, valid) => {
    expect(errorsOf({ trial: { amount, unit } }).length === 0).toBe(valid);
  });

  it.each([
    [12, true],
    [13, false],
  ])('an agreement trial of %s months valid: %s', (trialMonths, valid) => {
    expect(errorsOf({ agreement: { ...contract().agreement, trialMonths } }).length === 0).toBe(
      valid,
    );
  });

  it('rejects a signing day over a year ahead of today', () => {
    expect(
      errorsOf({ startDate: parseDate('2027-10-01'), signedOn: parseDate('2027-10-08') }),
    ).toEqual([['signedOn', null, 'too_far_ahead']]);
  });

  it('accepts the history period ending the day it starts', () => {
    expect(
      errorsOf({ history: [periodOf(parseDate('2023-01-01'), parseDate('2023-01-01'))] }),
    ).toEqual([]);
  });

  it('rejects a signing day more than a year after the start', () => {
    expect(errorsOf({ signedOn: parseDate('2025-03-01') })).toEqual([]);
    expect(errorsOf({ signedOn: parseDate('2025-03-02') })).toEqual([
      ['signedOn', null, 'too_late_after_start'],
    ]);
  });

  it.each([
    ['1999-12', false],
    ['2000-01', true],
    ['2027-12', true],
    ['2028-01', false],
  ])('a payslip of %s valid: %s', (month, valid) => {
    const payslip = {
      month,
      wholeMonth: true,
      incidents: false,
      salaryInMoney: 1200,
      inKind: 0,
      proratedExtraPay: 0,
      overtimeHours: null,
      complementaryHours: null,
    };
    expect(errorsOf({ payslips: [payslip] }).length === 0).toBe(valid);
  });
});

const base = contract();
const payslip = {
  month: '2026-09',
  wholeMonth: true,
  incidents: false,
  salaryInMoney: 1200,
  inKind: 0,
  proratedExtraPay: 0,
  overtimeHours: null,
  complementaryHours: null,
};
const training = (change: Partial<NonNullable<EmploymentInput['training']>>) =>
  ({
    studiesEndedOn: null,
    disability: null,
    planAttached: null,
    effectiveWorkPercent: { year1: 65, year2: 65 },
    ...change,
  }) as NonNullable<EmploymentInput['training']>;
const periodOf = (startDate: CivilDate, endDate: CivilDate) => ({
  startDate,
  endDate,
  employer: 'same' as const,
  kind: 'production' as const,
});
const partTime = (change: Partial<PartTime>): PartTime => ({
  hoursStated: true,
  distributionStated: true,
  complementary: null,
  voluntaryPercent: null,
  ...change,
});
const clauseOf = (months: number | null): Clause => ({
  label: 'other',
  months,
  compensationStated: null,
  trainingDescribed: null,
  waivedRight: null,
  costsOnWorker: null,
  literal: { text: 'Cláusula sintética de prueba.' },
});
const offerOf = (change: Partial<Offer>): Offer => ({
  grossAnnual: null,
  net: false,
  weeklyHours: null,
  modality: null,
  remote: null,
  ...change,
});
const holidays = (workDaysPerWeek: number | null): EmploymentInput['holidays'] => ({
  days: 30,
  unit: 'calendar',
  workDaysPerWeek,
  includedInSalary: false,
});
const slot = (from: string, to: string): ScheduleDay => ({ day: 1, slots: [{ from, to }] });

describe('validate reports each field with its own code', () => {
  it.each<[string, Partial<EmploymentInput>, string, number | null, string]>([
    [
      'endDate that does not exist',
      { endDate: unchecked(2026, 2, 30) },
      'endDate',
      null,
      'invalid_date',
    ],
    [
      'signedOn that does not exist',
      { signedOn: unchecked(2026, 2, 30) },
      'signedOn',
      null,
      'invalid_date',
    ],
    ['negative extensions', { extensions: -1 }, 'extensions', null, 'count_range'],
    [
      'studies ended on a day that does not exist',
      { training: training({ studiesEndedOn: unchecked(2026, 13, 1) }) },
      'training.studiesEndedOn',
      null,
      'invalid_date',
    ],
    [
      'first-year effective work over 100',
      { training: training({ effectiveWorkPercent: { year1: 101, year2: 65 } }) },
      'training.effectiveWorkPercent',
      null,
      'percent_range',
    ],
    [
      'no payments',
      { salary: { ...base.salary, payments: 0 } },
      'salary.payments',
      null,
      'payments_range',
    ],
    [
      'second breakdown line out of range',
      {
        salary: {
          ...base.salary,
          breakdown: [
            { kind: 'base', amount: 1500 },
            { kind: 'base', amount: 0 },
          ],
        },
      },
      'salary.breakdown',
      1,
      'amount_range',
    ],
    [
      'negative in-kind pay',
      { salary: { ...base.salary, inKind: -1 } },
      'salary.inKind',
      null,
      'amount_range',
    ],
    [
      'no weekly hours',
      { contractHours: { weekly: 0, annual: null } },
      'contractHours.weekly',
      null,
      'hours_range',
    ],
    [
      'no annual hours',
      { contractHours: { weekly: null, annual: 0 } },
      'contractHours.annual',
      null,
      'hours_range',
    ],
    ['no full-time hours', { fullTimeHours: 0 }, 'fullTimeHours', null, 'hours_range'],
    [
      'no agreement category salary',
      { agreement: { ...base.agreement, categoryAnnualSalary: 0 } },
      'agreement.categoryAnnualSalary',
      null,
      'amount_range',
    ],
    [
      'no agreement annual hours',
      { agreement: { ...base.agreement, annualHours: 0 } },
      'agreement.annualHours',
      null,
      'hours_range',
    ],
    [
      'negative agreement holidays',
      { agreement: { ...base.agreement, holidayDays: -1 } },
      'agreement.holidayDays',
      null,
      'count_range',
    ],
    [
      'agreement trial of 13 months',
      { agreement: { ...base.agreement, trialMonths: 13 } },
      'agreement.trialMonths',
      null,
      'count_range',
    ],
    [
      'negative in-kind on a payslip',
      { payslips: [{ ...payslip, inKind: -1 }] },
      'payslips.inKind',
      0,
      'amount_range',
    ],
    [
      'negative extra pay on a payslip',
      { payslips: [{ ...payslip, proratedExtraPay: -1 }] },
      'payslips.proratedExtraPay',
      0,
      'amount_range',
    ],
    [
      'negative overtime on a payslip',
      { payslips: [{ ...payslip, overtimeHours: -1 }] },
      'payslips.hours',
      0,
      'hours_range',
    ],
    [
      'a trial of no length',
      { trial: { amount: 0, unit: 'months' } },
      'trial.amount',
      null,
      'count_range',
    ],
    [
      'negative agreed overtime',
      { overtimeAgreed: { hoursPerYear: -1, paidInMoney: null } },
      'overtimeAgreed.hoursPerYear',
      null,
      'hours_range',
    ],
    [
      'complementary hours over 100 %',
      { partTime: partTime({ complementary: { percent: 101, noticeDays: 3 } }) },
      'partTime.complementary',
      null,
      'percent_range',
    ],
    [
      'negative complementary notice',
      { partTime: partTime({ complementary: { percent: 30, noticeDays: -1 } }) },
      'partTime.complementary',
      null,
      'count_range',
    ],
    [
      'voluntary percent over 100',
      { partTime: partTime({ voluntaryPercent: 101 }) },
      'partTime.voluntaryPercent',
      null,
      'percent_range',
    ],
    ['remote share over 100', { remoteShare: 101 }, 'remoteShare', null, 'percent_range'],
    ['no real weekly hours', { realWeeklyHours: 0 }, 'realWeeklyHours', null, 'hours_range'],
    [
      'negative extra pays',
      { extraPays: { count: -1, prorated: false } },
      'extraPays.count',
      null,
      'count_range',
    ],
    [
      'negative clause months',
      { clauses: [clauseOf(3), clauseOf(-1)] },
      'clauses.months',
      1,
      'count_range',
    ],
    [
      'history period starting on a day that does not exist',
      { history: [periodOf(unchecked(2026, 2, 30), parseDate('2026-03-01'))] },
      'history',
      0,
      'invalid_date',
    ],
    [
      'negative offer',
      { offer: offerOf({ grossAnnual: -1 }) },
      'offer.grossAnnual',
      null,
      'amount_range',
    ],
    [
      'offer of no hours',
      { offer: offerOf({ weeklyHours: 0 }) },
      'offer.weeklyHours',
      null,
      'hours_range',
    ],
  ])('%s', (_name, change, field, index, code) => {
    expect(errorsOf(change)).toEqual([[field, index, code]]);
  });

  it.each<[string, Partial<EmploymentInput>]>([
    [
      'a signing day exactly a year ahead of today',
      { startDate: parseDate('2027-10-01'), signedOn: parseDate('2027-10-07') },
    ],
    ['a week of 1 work day', { holidays: holidays(1) }],
  ])('accepts %s', (_name, change) => {
    expect(errorsOf(change)).toEqual([]);
  });

  it.each([0])('rejects %s work days a week', (workDaysPerWeek) => {
    expect(errorsOf({ holidays: holidays(workDaysPerWeek) })).toEqual([
      ['holidays.workDaysPerWeek', null, 'count_range'],
    ]);
  });

  it.each(['x09:00', '09:00x'])('rejects a slot start of %s', (from) => {
    expect(errorsOf({ schedule: [slot(from, '10:00')] })).toEqual([
      ['schedule', 0, 'invalid_time'],
    ]);
  });

  it.each(['x2026-09', '2026-09x'])('rejects the payslip month %s', (month) => {
    expect(errorsOf({ payslips: [{ ...payslip, month }] })).toEqual([
      ['payslips.month', 0, 'invalid_month'],
    ]);
  });
});

describe('validate holidays', () => {
  const withDays = (days: number): Partial<EmploymentInput> => ({
    holidays: { days, unit: 'calendar', workDaysPerWeek: null, includedInSalary: false },
  });

  it.each([0, 8.22, 366])('accepts %s holiday days', (days) => {
    expect(errorsOf(withDays(days))).toEqual([]);
  });

  it.each([-1, 367, Number.NaN])('rejects %s holiday days', (days) => {
    expect(errorsOf(withDays(days))).toEqual([['holidays.days', null, 'count_range']]);
  });
});

describe('validationWarnings', () => {
  const withBreakdown = (amount: number, base: number) =>
    contract({
      salary: { ...contract().salary, amount, breakdown: [{ kind: 'base', amount: base }] },
    });

  it('warns when the breakdown falls short of the total, without failing', () => {
    const input = withBreakdown(1300, 1100);
    expect(validationWarnings(input)).toEqual([
      { field: 'salary.breakdown', index: null, code: 'breakdown_short_of_total' },
    ]);
    expect(validate(input, parseDate('2026-10-07'))).toEqual([]);
  });

  it('is quiet when the breakdown adds up', () => {
    expect(validationWarnings(withBreakdown(1300, 1300))).toEqual([]);
  });

  it('tolerates half a cent of rounding', () => {
    expect(validationWarnings(withBreakdown(0.005, 0))).toEqual([]);
  });

  it('has nothing to compare without a breakdown', () => {
    expect(
      validationWarnings(
        contract({ salary: { ...contract().salary, amount: 1300, breakdown: [] } }),
      ),
    ).toEqual([]);
  });
});
