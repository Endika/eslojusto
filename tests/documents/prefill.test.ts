import { describe, expect, it } from 'vitest';
import { hasLowConfidence, prefillFrom, prefilledCount } from '../../src/documents/prefill';
import type { Extraction } from '../../src/documents/contract';

const f = (value: string | number | boolean, confidence: 'high' | 'medium' | 'low' = 'high') => ({
  value,
  confidence,
});

describe('a settlement proposal', () => {
  const e: Extraction = {
    kind: 'settlement',
    fields: {
      detectedKind: f('settlement'),
      startDate: f('2010-03-01'),
      endDate: f('2026-09-15'),
      cause: f('fixed_term_end'),
      fixedTermType: f('replacement', 'medium'),
      monthlySalary: f(1850),
      severance: f(40000.5, 'low'),
      holiday_pay: f(1234.56),
      totalAccrued: f(41235.06),
    },
    lists: { otherAccruals: [] },
  };
  it('fills the form fields and the employer figures, in the form’s own format', () => {
    expect(prefillFrom(e).fields).toEqual([
      { name: 'startDate', value: '2010-03-01', confidence: 'high' },
      { name: 'endDate', value: '2026-09-15', confidence: 'high' },
      { name: 'cause', value: 'fixed_term_end', confidence: 'high' },
      { name: 'fixedTermType', value: 'replacement', confidence: 'medium' },
      { name: 'monthlySalary', value: '1.850,00', confidence: 'high' },
      { name: 'figure_holiday_pay', value: '1.234,56', confidence: 'high' },
      { name: 'figure_severance', value: '40.000,50', confidence: 'low' },
    ]);
  });
  it('leaves out the total, which only checks the reading, and counts what it fills', () => {
    const p = prefillFrom(e);
    expect(p.fields.map((x) => x.name)).not.toContain('totalAccrued');
    expect(prefilledCount(p)).toBe(7);
    expect(hasLowConfidence(p)).toBe(true);
  });
  it('a contract type only goes with a fixed-term end', () => {
    const p = prefillFrom({ ...e, fields: { ...e.fields, cause: f('resignation') } });
    expect(p.fields.map((x) => x.name)).not.toContain('fixedTermType');
  });
});

describe('a payslip', () => {
  const base = {
    periodStart: f('2026-08-01'),
    periodEnd: f('2026-08-31'),
    startDate: f('2019-02-11'),
    totalAccrued: f(2100),
  };
  it('with proration: the salary is the month’s total, marked as worked out', () => {
    const p = prefillFrom({
      kind: 'payslip',
      fields: { ...base, extraPayProrated: f(true, 'medium'), extraPayProratedAmount: f(300) },
      lists: {},
    });
    expect(p.fields).toEqual([
      { name: 'startDate', value: '2019-02-11', confidence: 'high' },
      { name: 'extraPayProrated', value: 'yes', confidence: 'medium' },
      { name: 'monthlySalary', value: '2.100,00', confidence: 'medium', derived: true },
    ]);
  });
  it('without proration and an extra payment paid that month: the total less that payment', () => {
    const p = prefillFrom({
      kind: 'payslip',
      fields: {
        ...base,
        extraPayProrated: f(false),
        extraPayPaid: f(true, 'medium'),
        extraPayAmount: f(1800, 'low'),
      },
      lists: {},
    });
    expect(p.fields).toContainEqual({
      name: 'extraPayAmount',
      value: '1.800,00',
      confidence: 'low',
    });
    expect(p.fields).toContainEqual({
      name: 'monthlySalary',
      value: '300,00',
      confidence: 'low',
      derived: true,
    });
  });
  it('without proration and no extra payment paid that month: the whole total', () => {
    const p = prefillFrom({
      kind: 'payslip',
      fields: { ...base, extraPayProrated: f(false), extraPayPaid: f(false, 'medium') },
      lists: {},
    });
    expect(p.fields).toContainEqual({
      name: 'monthlySalary',
      value: '2.100,00',
      confidence: 'medium',
      derived: true,
    });
  });
  it('an extra payment said to be paid but without its amount gives no salary', () => {
    const p = prefillFrom({
      kind: 'payslip',
      fields: { ...base, extraPayProrated: f(false), extraPayPaid: f(true) },
      lists: {},
    });
    expect(p.fields.map((x) => x.name)).not.toContain('monthlySalary');
  });
  it('a period that is not a whole month gives no salary', () => {
    const p = prefillFrom({
      kind: 'payslip',
      fields: { ...base, periodEnd: f('2026-08-15'), extraPayProrated: f(true) },
      lists: {},
    });
    expect(p.fields.map((x) => x.name)).not.toContain('monthlySalary');
  });
});

describe('a work history', () => {
  const e: Extraction = {
    kind: 'work_history',
    fields: { detectedKind: f('work_history') },
    lists: {
      contracts: [
        { values: { startDate: '2010-03-01' }, confidence: 'high' },
        { values: { startDate: '2018-01-01', endDate: '2019-06-30' }, confidence: 'high' },
        { values: { startDate: '2005-01-01', endDate: '2008-06-30' }, confidence: 'high' },
        { values: { startDate: '2021-01-01', endDate: '2022-01-31' }, confidence: 'low' },
        { values: { startDate: '2026-01-01', endDate: '2027-01-31' }, confidence: 'high' },
      ],
    },
  };
  it('fills other jobs: not the one under review, nor older than 6 years, nor ending after it', () => {
    expect(
      prefillFrom(e, { startDate: '2016-03-01', endDate: '2026-09-15' }).otherContracts,
    ).toEqual([{ startDate: '2021-01-01', endDate: '2022-01-31', confidence: 'low' }]);
  });
  it('without the dates of this job yet, every finished row', () => {
    expect(prefillFrom(e).otherContracts).toHaveLength(4);
  });
});
