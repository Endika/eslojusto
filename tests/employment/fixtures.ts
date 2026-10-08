import { parseDate as f, type CivilDate } from '../../src/engine/date';
import { EMPLOYMENT_NORMS } from '../../src/engine/employment/data/norms';
import { MINIMUM_WAGE } from '../../src/engine/employment/data/minimum-wage';
import { reviewEmployment, type EmploymentReview } from '../../src/engine/employment/review';
import type { EmploymentInput } from '../../src/engine/employment/types';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { contract } from '../engine/employment/input';

export { contract };

export const TODAY = f('2026-10-08');
export const tr: Translate = (key, vars) => t('es', key, vars);
export const TABLES = { norms: EMPLOYMENT_NORMS, minimumWage: MINIMUM_WAGE };

export const review = (input: EmploymentInput, today: CivilDate = TODAY): EmploymentReview => {
  const r = reviewEmployment(input, today, TABLES);
  if (!r.ok) throw new Error(`invalid: ${JSON.stringify(r.errors)}`);
  return r.review;
};

// 1.150 € a month in 14 payments: 16.100 € a year, 994 € under the 2026 minimum.
export const belowMinimum = contract({
  startDate: f('2026-01-01'),
  signedOn: null,
  salary: {
    amount: 1150,
    period: 'month',
    payments: 14,
    prorated: false,
    breakdown: [],
    inKind: null,
  },
});

// A work-or-service contract after the 2021 reform.
export const workOrService = contract({
  startDate: f('2023-05-02'),
  signedOn: null,
  modality: 'work_or_service',
});

// A breakdown with a complement of unknown kind: two readings of the minimum wage.
export const unknownComplement = contract({
  startDate: f('2026-01-01'),
  signedOn: null,
  salary: {
    amount: 1300,
    period: 'month',
    payments: 14,
    prorated: false,
    breakdown: [
      { kind: 'base', amount: 1100 },
      { kind: 'unknown', amount: 200 },
    ],
    inKind: null,
  },
});

// Many corners of the review at once, so every phrase they produce is worded.
export const corners: readonly EmploymentInput[] = [
  belowMinimum,
  workOrService,
  unknownComplement,
  contract({
    startDate: f('2024-01-08'),
    endDate: f('2025-02-20'),
    signedOn: null,
    modality: 'production',
    extensions: 2,
    causeStated: false,
    circumstancesStated: true,
    history: [
      {
        startDate: f('2022-06-01'),
        endDate: f('2023-12-31'),
        employer: 'same',
        kind: 'production',
      },
      {
        startDate: f('2021-03-01'),
        endDate: f('2021-12-31'),
        employer: 'same_group',
        kind: 'unknown',
      },
    ],
    trial: { amount: 3, unit: 'months' },
    technical: null,
    smallCompany: null,
  }),
  contract({
    startDate: f('2025-09-01'),
    endDate: f('2026-08-31'),
    signedOn: null,
    modality: 'training_practice',
    training: {
      studiesEndedOn: f('2021-06-30'),
      disability: null,
      planAttached: false,
      effectiveWorkPercent: { year1: null, year2: null },
    },
    trial: { amount: 6, unit: 'weeks' },
    overtimeAgreed: { hoursPerYear: 'as_needed', paidInMoney: null },
  }),
  contract({
    startDate: f('2025-02-01'),
    signedOn: null,
    contractHours: { weekly: 8, annual: null },
    salary: { amount: 9, period: 'hour', payments: 14, prorated: false, breakdown: [], inKind: 50 },
    partTime: {
      hoursStated: true,
      distributionStated: false,
      complementary: { percent: 40, noticeDays: 2 },
      voluntaryPercent: 20,
    },
    schedule: [
      { day: 1, slots: [{ from: '08:00', to: '19:00' }] },
      { day: 2, slots: [{ from: '06:00', to: '14:00' }] },
      { day: 6, slots: [{ from: '22:00', to: '06:00' }] },
      { day: 7, slots: [{ from: '14:00', to: '20:00' }] },
    ],
    nightWorker: null,
    holidays: { days: 22, unit: 'working', workDaysPerWeek: 5, includedInSalary: true },
    extraPays: { count: 1, prorated: false },
    payslips: [
      {
        month: '2026-03',
        wholeMonth: true,
        incidents: false,
        salaryInMoney: 300,
        inKind: 0,
        proratedExtraPay: 0,
        overtimeHours: null,
        complementaryHours: null,
      },
      {
        month: '2026-04',
        wholeMonth: false,
        incidents: true,
        salaryInMoney: 100,
        inKind: 0,
        proratedExtraPay: 0,
        overtimeHours: null,
        complementaryHours: null,
      },
    ],
    remoteShare: 50,
    realWeeklyHours: 10,
    agreement: {
      named: true,
      categoryAnnualSalary: 20000,
      annualHours: 1750,
      holidayDays: 31,
      trialMonths: 1,
    },
    clauses: [
      {
        label: 'non_compete',
        months: 12,
        compensationStated: null,
        trainingDescribed: null,
        waivedRight: null,
        costsOnWorker: null,
        literal: { text: 'Cláusula de ficción.' },
      },
      {
        label: 'retention',
        months: 30,
        compensationStated: null,
        trainingDescribed: false,
        waivedRight: null,
        costsOnWorker: null,
        literal: { text: '' },
      },
      {
        label: 'waiver',
        months: null,
        compensationStated: null,
        trainingDescribed: null,
        waivedRight: 'holidays',
        costsOnWorker: null,
        literal: { text: '' },
      },
      {
        label: 'remote_work_costs',
        months: null,
        compensationStated: null,
        trainingDescribed: null,
        waivedRight: null,
        costsOnWorker: true,
        literal: { text: '' },
      },
      {
        label: 'overtime_included',
        months: null,
        compensationStated: null,
        trainingDescribed: null,
        waivedRight: null,
        costsOnWorker: null,
        literal: { text: '' },
      },
      {
        label: 'other',
        months: null,
        compensationStated: null,
        trainingDescribed: null,
        waivedRight: null,
        costsOnWorker: null,
        literal: { text: '' },
      },
    ],
    offer: {
      grossAnnual: 21000,
      net: false,
      weeklyHours: 10,
      modality: 'production',
      remote: 'full',
    },
  }),
  contract({
    startDate: f('2021-06-01'),
    signedOn: null,
    modality: 'discontinuous',
    discontinuous: { activityPeriod: false, hours: true, distribution: null },
    salary: {
      amount: 900,
      period: 'month',
      payments: 14,
      prorated: false,
      breakdown: [],
      inKind: null,
    },
  }),
  contract({
    startDate: f('2026-07-01'),
    endDate: f('2026-09-15'),
    signedOn: null,
    modality: 'replacement',
    replacedPersonNamed: false,
    replacementCauseStated: null,
    salary: {
      amount: 40,
      period: 'day',
      payments: 12,
      prorated: true,
      breakdown: [],
      inKind: null,
    },
    extraPays: { count: 0, prorated: true },
    holidays: { days: 0, unit: 'calendar', workDaysPerWeek: null, includedInSalary: false },
  }),
];
