import { describe, expect, it } from 'vitest';
import {
  hasHolidayDays,
  hasLowConfidence,
  prefillFrom,
  prefilledCount,
} from '../../src/documents/prefill';
import type { Extraction, SourceKind } from '../../src/documents/contract';

const f = (
  value: string | number | boolean,
  confidence: 'high' | 'medium' | 'low' = 'high',
  source: SourceKind = 'settlement_proposal',
) => ({ value, confidence, source });
const p = (value: string | number | boolean, confidence: 'high' | 'medium' | 'low' = 'high') =>
  f(value, confidence, 'payslip');

const extraction = (fields: Extraction['fields'], contracts: Extraction['contracts'] = []) => ({
  pages: [],
  documents: [],
  fields,
  contracts,
  conflicts: [],
});

describe('what the documents state', () => {
  const e = extraction({
    startDate: f('2010-03-01'),
    endDate: f('2026-09-15', 'high', 'dismissal_letter'),
    cause: f('fixed_term_end'),
    fixedTermType: f('replacement', 'medium', 'company_certificate'),
    monthlySalary: f(1850),
    severance: f(40000.5, 'low'),
    holiday_pay: f(1234.56, 'high', 'payslip'),
    annualHolidayDays: f(30),
    holidayDaysTaken: f(12, 'medium'),
    noticeDaysReceived: f(15, 'high', 'dismissal_letter'),
  });
  it('fills the form fields and the employer figures, in the form’s own format', () => {
    expect(prefillFrom(e).fields).toEqual([
      { name: 'startDate', value: '2010-03-01', confidence: 'high' },
      { name: 'endDate', value: '2026-09-15', confidence: 'high' },
      { name: 'cause', value: 'fixed_term_end', confidence: 'high' },
      { name: 'fixedTermType', value: 'replacement', confidence: 'medium' },
      { name: 'monthlySalary', value: '1.850,00', confidence: 'high' },
      { name: 'annualHolidayDays', value: '30', confidence: 'low' },
      { name: 'holidayDaysTaken', value: '12', confidence: 'low' },
      { name: 'noticeDaysReceived', value: '15', confidence: 'high' },
      { name: 'figure_holiday_pay', value: '1.234,56', confidence: 'high' },
      { name: 'figure_severance', value: '40.000,50', confidence: 'low' },
    ]);
  });
  it('counts what it fills and whether any of it is unsure', () => {
    const filled = prefillFrom(e);
    expect(prefilledCount(filled)).toBe(10);
    expect(hasLowConfidence(filled)).toBe(true);
  });
  it('holiday days come without a unit, so they are always to check', () => {
    expect(hasHolidayDays(prefillFrom(e))).toBe(true);
    const { annualHolidayDays, holidayDaysTaken, ...rest } = e.fields;
    void annualHolidayDays;
    void holidayDaysTaken;
    expect(hasHolidayDays(prefillFrom({ ...e, fields: rest }))).toBe(false);
  });
  it('says nothing about other jobs without a work history', () => {
    expect(prefillFrom(e).otherContracts).toBeNull();
  });
});

describe('the latest monthly payslip', () => {
  const base = {
    payslipPeriodStart: p('2026-08-01'),
    payslipPeriodEnd: p('2026-08-31'),
    startDate: p('2019-02-11'),
    payslipTotalAccrued: p(2100),
  };
  it('without proration and an extra payment paid that month: the total less that payment', () => {
    const filled = prefillFrom(
      extraction({
        ...base,
        extraPayProrated: p(false),
        extraPayPaid: p(true, 'medium'),
        extraPayAmount: p(1800, 'low'),
      }),
    );
    expect(filled.fields).toContainEqual({
      name: 'extraPayAmount',
      value: '1.800,00',
      confidence: 'low',
    });
    expect(filled.fields).toContainEqual({
      name: 'monthlySalary',
      value: '300,00',
      confidence: 'low',
      derived: true,
    });
  });
  it('a period that is not a whole month gives no salary', () => {
    const filled = prefillFrom(
      extraction({
        ...base,
        payslipPeriodEnd: p('2026-08-15'),
        extraPayProrated: p(true),
      }),
    );
    expect(filled.fields.map((x) => x.name)).not.toContain('monthlySalary');
  });
  it('a salary the settlement prints comes before one worked out from the payslip', () => {
    const filled = prefillFrom(
      extraction({ ...base, extraPayProrated: p(true), monthlySalary: f(1900) }),
    );
    expect(filled.fields.filter((x) => x.name === 'monthlySalary')).toEqual([
      { name: 'monthlySalary', value: '1.900,00', confidence: 'high' },
    ]);
  });
});

describe('a work history', () => {
  const rows: Extraction['contracts'] = [
    { values: { startDate: '2010-03-01' }, confidence: 'high' },
    { values: { startDate: '2018-01-01', endDate: '2019-06-30' }, confidence: 'high' },
    { values: { startDate: '2005-01-01', endDate: '2008-06-30' }, confidence: 'high' },
    { values: { startDate: '2021-01-01', endDate: '2022-01-31' }, confidence: 'low' },
    { values: { startDate: '2026-01-01', endDate: '2027-01-31' }, confidence: 'high' },
  ];
  it('takes this job’s dates from the same pack before the form', () => {
    const pack = extraction(
      { startDate: f('2016-03-01'), endDate: f('2026-09-15', 'high', 'dismissal_letter') },
      rows,
    );
    expect(prefillFrom(pack, { endDate: '2030-01-01' }).otherContracts).toEqual([
      { startDate: '2021-01-01', endDate: '2022-01-31', confidence: 'low' },
    ]);
  });
});

describe('a reading that gives another kind of value than the field takes', () => {
  const names = (fields: Extraction['fields']) =>
    prefillFrom(extraction(fields)).fields.map((x) => x.name);

  it.each([['a contract type with no cause', { fixedTermType: f('replacement') }, []]])(
    'fills nothing wrong from %s',
    (_name, fields, expected) => {
      expect(names(fields)).toEqual(expected);
    },
  );
});

describe('the payslip, in what it needs to propose a salary', () => {
  const month = { payslipPeriodStart: p('2026-08-01'), payslipPeriodEnd: p('2026-08-31') };
  const salaryOf = (fields: Extraction['fields']) =>
    prefillFrom(extraction(fields)).fields.find((x) => x.name === 'monthlySalary');
  const prorated = { ...month, payslipTotalAccrued: p(2100), extraPayProrated: p(true) };
  it.each([
    ['a period that starts after the first', { payslipPeriodStart: p('2026-08-02') }],
    ['a period across two years', { payslipPeriodStart: p('2025-08-01') }],
    ['a period across two months', { payslipPeriodStart: p('2026-07-01') }],
    ['an end that is no date', { payslipPeriodEnd: p('agosto') }],
    ['no start', { payslipPeriodStart: undefined }],
    ['no end', { payslipPeriodEnd: undefined }],
  ])('proposes no salary with %s', (_name, change) => {
    expect(salaryOf({ ...prorated, ...change } as Extraction['fields'])).toBeUndefined();
  });

  it('says whether the extra pay is prorated, and takes the amount only when it is not', () => {
    const fields = (o: object) =>
      prefillFrom(extraction({ ...prorated, ...o } as Extraction['fields'])).fields;
    expect(fields({ extraPayProrated: p(false) })).toContainEqual({
      name: 'extraPayProrated',
      value: 'no',
      confidence: 'high',
    });
    expect(fields({ extraPayProrated: p(true, 'low') })).toContainEqual({
      name: 'extraPayProrated',
      value: 'yes',
      confidence: 'low',
    });
    expect(fields({ extraPayProrated: p('yes') }).map((x) => x.name)).not.toContain(
      'extraPayProrated',
    );
    const names = (o: object) => fields(o).map((x) => x.name);
    expect(names({ extraPayAmount: p(300) })).not.toContain('extraPayAmount');
    expect(names({ extraPayProrated: undefined, extraPayAmount: p(300) })).not.toContain(
      'extraPayAmount',
    );
    expect(names({ extraPayProrated: p(false), extraPayAmount: p('300') })).not.toContain(
      'extraPayAmount',
    );
  });
  it('takes it off only when it was paid and the pay is not prorated', () => {
    const apart = { ...prorated, extraPayProrated: p(false) };
    expect(salaryOf({ ...apart, extraPayPaid: p(true), extraPayAmount: p(300) })?.value).toBe(
      '1.800,00',
    );
    expect(salaryOf({ ...apart, extraPayPaid: p(false), extraPayAmount: p(300) })?.value).toBe(
      '2.100,00',
    );
    expect(salaryOf({ ...apart, extraPayAmount: p(300) })?.value).toBe('2.100,00');
    expect(salaryOf({ ...apart, extraPayPaid: p('yes'), extraPayAmount: p(300) })?.value).toBe(
      '2.100,00',
    );
    expect(salaryOf({ ...apart, extraPayPaid: p(true), extraPayAmount: p('300') })).toBeUndefined();
    expect(salaryOf({ ...apart, extraPayPaid: p(true), extraPayAmount: p(2100) })).toBeUndefined();
    expect(salaryOf({ ...apart, extraPayPaid: p(true), extraPayAmount: p(2500) })).toBeUndefined();
  });
  it('is as unsure as the least sure of what it is worked out from', () => {
    const apart = { ...prorated, extraPayProrated: p(false) };
    const conf = (o: object) => salaryOf({ ...apart, ...o } as Extraction['fields'])?.confidence;
    expect(conf({ payslipTotalAccrued: p(2100, 'low'), extraPayPaid: p(false) })).toBe('low');
    expect(conf({ extraPayProrated: p(false, 'medium'), extraPayPaid: p(false) })).toBe('medium');
    expect(conf({ extraPayPaid: p(false, 'low') })).toBe('low');
    expect(conf({ extraPayPaid: p(true), extraPayAmount: p(300, 'low') })).toBe('low');
    expect(conf({ extraPayPaid: p(true, 'medium'), extraPayAmount: p(300) })).toBe('medium');
    expect(conf({ extraPayPaid: p(true), extraPayAmount: p(0, 'low') })).toBe('high');
    expect(conf({ extraPayProrated: p(true), extraPayPaid: p(false, 'low') })).toBe('high');
  });
});

describe('the other jobs, at the edges of what counts', () => {
  const job = (startDate: string, endDate: string) => ({
    values: { startDate, endDate },
    confidence: 'high' as const,
  });
  const current = { startDate: '2016-03-01', endDate: '2026-09-15' };
  const kept = (
    rows: Extraction['contracts'],
    now: { startDate?: string; endDate?: string } = current,
  ) => prefillFrom(extraction({}, rows), now).otherContracts?.length;

  it('keeps a job ending exactly six years before this one ended, and not one day earlier', () => {
    expect(kept([job('2015-01-01', '2020-09-15')])).toBe(1);
    expect(kept([job('2015-01-01', '2020-09-14')])).toBe(0);
  });
  it('keeps a job ending the day this one ended, and not one day later', () => {
    expect(kept([job('2020-01-01', '2026-09-15')])).toBe(1);
    expect(kept([job('2020-01-01', '2026-09-16')])).toBe(0);
  });
  it('leaves out a row without both dates as text', () => {
    expect(
      kept([
        { values: { startDate: 5, endDate: '2022-01-01' }, confidence: 'high' },
        { values: { startDate: '2021-01-01', endDate: 5 }, confidence: 'high' },
        { values: { endDate: '2022-01-01' }, confidence: 'high' },
      ]),
    ).toBe(0);
  });
  it('takes the dates of this job from the reading, each on its own', () => {
    const rows = [job('2016-03-01', '2026-01-01'), job('2020-01-01', '2026-09-30')];
    const only = (fields: Extraction['fields']) =>
      prefillFrom(extraction(fields, rows), {
        startDate: '2000-01-01',
        endDate: '2030-01-01',
      }).otherContracts?.map((c) => c.startDate);
    expect(only({ startDate: f('2016-03-01') })).toEqual(['2020-01-01']);
    expect(only({ endDate: f('2026-09-15') })).toEqual(['2016-03-01']);
    expect(only({ startDate: f(5), endDate: f(6) })).toEqual(['2016-03-01', '2020-01-01']);
  });
});

describe('counting what was filled', () => {
  it('adds the rows of other jobs to the fields', () => {
    const filled = prefillFrom(
      extraction({ startDate: f('2016-03-01') }, [
        { values: { startDate: '2020-01-01', endDate: '2022-01-01' }, confidence: 'high' },
      ]),
    );
    expect(prefilledCount(filled)).toBe(2);
  });
  it('is unsure of several other jobs when only one is, and not when nothing is', () => {
    const row = (confidence: 'high' | 'low') => ({
      values: { startDate: '2020-01-01', endDate: '2022-01-01' },
      confidence,
    });
    const jobs = (rows: Extraction['contracts']) =>
      hasLowConfidence(prefillFrom(extraction({ startDate: f('2016-03-01') }, rows)));
    expect(jobs([row('high'), row('low')])).toBe(true);
    expect(jobs([])).toBe(false);
  });
});
