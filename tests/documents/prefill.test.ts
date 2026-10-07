import { describe, expect, it } from 'vitest';
import { hasLowConfidence, prefillFrom, prefilledCount } from '../../src/documents/prefill';
import type { Extraction, SourceKind } from '../../src/documents/contract';

const f = (
  value: string | number | boolean,
  confidence: 'high' | 'medium' | 'low' = 'high',
  source: SourceKind = 'settlement_proposal',
) => ({ value, confidence, source });
const p = (value: string | number | boolean, confidence: 'high' | 'medium' | 'low' = 'high') =>
  f(value, confidence, 'payslip');

const extraction = (fields: Extraction['fields'], contracts: Extraction['contracts'] = []) => ({
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
      { name: 'annualHolidayDays', value: '30', confidence: 'high' },
      { name: 'holidayDaysTaken', value: '12', confidence: 'medium' },
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
  it('a contract type only goes with a fixed-term end', () => {
    const filled = prefillFrom({ ...e, fields: { ...e.fields, cause: f('resignation') } });
    expect(filled.fields.map((x) => x.name)).not.toContain('fixedTermType');
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
  it('with proration: the salary is the month’s total, marked as worked out', () => {
    const filled = prefillFrom(
      extraction({ ...base, extraPayProrated: p(true, 'medium'), extraPayProratedAmount: p(300) }),
    );
    expect(filled.fields).toEqual([
      { name: 'startDate', value: '2019-02-11', confidence: 'high' },
      { name: 'extraPayProrated', value: 'yes', confidence: 'medium' },
      { name: 'monthlySalary', value: '2.100,00', confidence: 'medium', derived: true },
    ]);
  });
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
  it('without proration and no extra payment paid that month: the whole total', () => {
    const filled = prefillFrom(
      extraction({ ...base, extraPayProrated: p(false), extraPayPaid: p(false, 'medium') }),
    );
    expect(filled.fields).toContainEqual({
      name: 'monthlySalary',
      value: '2.100,00',
      confidence: 'medium',
      derived: true,
    });
  });
  it('an extra payment said to be paid but without its amount gives no salary', () => {
    const filled = prefillFrom(
      extraction({ ...base, extraPayProrated: p(false), extraPayPaid: p(true) }),
    );
    expect(filled.fields.map((x) => x.name)).not.toContain('monthlySalary');
  });
  it('without knowing whether extra pay is prorated, no salary is proposed', () => {
    expect(prefillFrom(extraction({ ...base })).fields.map((x) => x.name)).toEqual(['startDate']);
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
  it('fills other jobs: not the one under review, nor older than 6 years, nor ending after it', () => {
    expect(
      prefillFrom(extraction({}, rows), { startDate: '2016-03-01', endDate: '2026-09-15' })
        .otherContracts,
    ).toEqual([{ startDate: '2021-01-01', endDate: '2022-01-31', confidence: 'low' }]);
  });
  it('takes this job’s dates from the same pack before the form', () => {
    const pack = extraction(
      { startDate: f('2016-03-01'), endDate: f('2026-09-15', 'high', 'dismissal_letter') },
      rows,
    );
    expect(prefillFrom(pack, { endDate: '2030-01-01' }).otherContracts).toEqual([
      { startDate: '2021-01-01', endDate: '2022-01-31', confidence: 'low' },
    ]);
  });
  it('without the dates of this job yet, every finished row', () => {
    expect(prefillFrom(extraction({}, rows)).otherContracts).toHaveLength(4);
  });
});
