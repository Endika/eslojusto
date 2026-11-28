import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import {
  assessMinimumWage,
  compareByYear,
  comparePayslips,
  contractAgainstMinimum,
  contractAnnualPay,
  type MinimumWageDeps,
  type MinimumWageRow,
  type MinimumWageTable,
} from '../../../src/engine/employment/minimum-wage';
import { offerPass } from '../../../src/engine/employment/readings';
import type {
  Assessed,
  EmploymentInput,
  Finding,
  Payslip,
  Salary,
} from '../../../src/engine/employment/types';
import { phrase } from '../../../src/engine/employment/calculation';
import { contract } from './input';

const DEPS: MinimumWageDeps = { norms: EMPLOYMENT_NORMS, minimumWage: MINIMUM_WAGE };
const day = parseDate;

const salary = (change: Partial<Salary>): Salary => ({
  amount: 1500,
  period: 'month',
  payments: 14,
  prorated: false,
  breakdown: [],
  inKind: null,
  ...change,
});

const yearly = (amount: number): Salary => salary({ amount, period: 'year' });

const payslip = (change: Partial<Payslip>): Payslip => ({
  month: '2026-10',
  wholeMonth: true,
  incidents: false,
  salaryInMoney: 1500,
  inKind: 0,
  proratedExtraPay: 0,
  overtimeHours: null,
  complementaryHours: null,
  ...change,
});

const single = (a: Assessed | undefined): Finding => {
  if (a?.kind !== 'single') throw new Error(`expected a single finding, got ${a?.kind}`);
  return a.finding;
};

const byId = (assessed: readonly Assessed[], id: Finding['id']): Assessed | undefined =>
  assessed.find((a) => (a.kind === 'single' ? a.finding : a.readings[0]?.finding)?.id === id);

const review = (input: EmploymentInput, today: string, deps = DEPS) =>
  assessMinimumWage(input, day(today), deps);

const contractFinding = (input: EmploymentInput, today: string, deps = DEPS): Finding =>
  single(review(input, today, deps)[0]);

// A synthetic 2027 decree, injected to show the table is the only thing that changes.
const ROW_2027: MinimumWageRow = {
  ...(MINIMUM_WAGE.at(-1) as MinimumWageRow),
  year: 2027,
  publishedOn: '2027-02-10',
  effectsFrom: '2027-01-01',
  effectsUntil: '2027-12-31',
  monthly: 1300,
  daily: 43.33,
  annual: 18200,
  temporaryPerDay: 61.5,
};

const withRow = (row: MinimumWageRow): MinimumWageTable => [...MINIMUM_WAGE, row];
const changeYear = (year: number, change: Partial<MinimumWageRow>): MinimumWageTable =>
  MINIMUM_WAGE.map((r) => (r.year === year ? { ...r, ...change } : r));

describe('contract against the yearly minimum', () => {
  const fullYear2026 = { startDate: day('2026-01-01'), signedOn: day('2026-01-01') };

  it('is within the limit exactly at 17.094 € in 2026', () => {
    const f = contractFinding(contract({ ...fullYear2026, salary: yearly(17094) }), '2026-12-31');
    expect(f).toMatchObject({ id: 'smi_annual', status: 'within_limit', amount: null });
  });

  it('is 94 € short at 17.000 € over the whole of 2026', () => {
    const f = contractFinding(contract({ ...fullYear2026, salary: yearly(17000) }), '2026-12-31');
    expect(f).toMatchObject({ status: 'below_minimum', amount: { min: 94, max: 94 } });
    expect(offerPass([{ kind: 'single', finding: f }])).toBe(true);
  });

  it('cites the article, the absorption rule and the decree of the year', () => {
    const f = contractFinding(contract({ ...fullYear2026, salary: yearly(17000) }), '2026-12-31');
    // Art. 27.1 backs both the yearly floor and the absorption; it is cited once.
    expect(f.sources.map((s) => s.citation)).toEqual([
      `Estatuto de los Trabajadores, art. 27.1 (${EMPLOYMENT_NORMS.et.citation})`,
      `art. 3.1 (${EMPLOYMENT_NORMS.rd126_2026.citation})`,
    ]);
    expect(f.sources.at(-1)?.url).toBe('https://www.boe.es/eli/es/rd/2026/02/18/126/con');
  });

  it('gives the same verdict for 12 and 14 payments with the same yearly pay', () => {
    const fourteen = salary({ amount: 1221, payments: 14 });
    const twelveProrated = salary({ amount: 1424.5, payments: 12, prorated: true });
    const twelve = salary({ amount: 1424.5, payments: 12 });
    const verdict = (s: Salary) =>
      contractFinding(contract({ ...fullYear2026, salary: s }), '2026-12-31').status;
    expect(verdict(fourteen)).toBe('within_limit');
    expect(verdict(twelveProrated)).toBe('within_limit');
    expect(verdict(twelve)).toBe('within_limit');
    const short = (s: Salary) =>
      contractFinding(
        contract({ ...fullYear2026, salary: { ...s, amount: s.amount - 10 } }),
        '2026-12-31',
      );
    // 10 € less a month: 140 € a year with 14 payments, 120 € with 12.
    expect(short(fourteen).amount).toEqual({ min: 140, max: 140 });
    expect(short(twelveProrated).amount).toEqual({ min: 120, max: 120 });
  });

  it('compares later years with the contract salary only as a doubt: it may have been raised', () => {
    const input = contract({ startDate: day('2024-03-01'), salary: yearly(15876) });
    const years = compareByYear(input, day('2026-10-07'), MINIMUM_WAGE);
    expect(years).toMatchObject([
      { kind: 'compared', year: 2024, verdict: 'within', shortfall: 0, accrued: 0 },
      { kind: 'compared', year: 2025, verdict: 'salary_may_have_risen', shortfall: 700 },
      { kind: 'compared', year: 2026, verdict: 'salary_may_have_risen', shortfall: 1218 },
    ]);
    const f = contractFinding(input, '2026-10-07');
    expect(f).toMatchObject({ status: 'review_it', amount: null });
    expect(f.calculation.map((p) => p.key)).toContain('minimum_wage.year.salary_may_have_risen');
  });

  it('counts nothing for a 2023 contract at 1.080 € × 14 reviewed in 2026', () => {
    const input = contract({
      startDate: day('2023-03-01'),
      signedOn: day('2023-03-01'),
      salary: salary({ amount: 1080, breakdown: [{ kind: 'base', amount: 1080 }] }),
    });
    const assessed = review(input, '2026-10-09');
    const f = single(assessed[0]);
    expect(f).toMatchObject({ status: 'review_it', amount: null });
    expect(offerPass(assessed)).toBe(false);
  });

  it('takes the signing year as known when the contract is signed the year after it starts', () => {
    const input = contract({
      startDate: day('2025-12-01'),
      signedOn: day('2026-01-10'),
      salary: yearly(16000),
    });
    const years = compareByYear(input, day('2026-10-07'), MINIMUM_WAGE);
    expect(years.map((y) => (y.kind === 'compared' ? y.verdict : y.kind))).toEqual([
      'below',
      'below',
    ]);
  });

  it('prorates the first year by days', () => {
    const input = contract({ startDate: day('2026-07-01'), salary: yearly(16094) });
    const [year] = compareByYear(input, day('2026-12-31'), MINIMUM_WAGE);
    // 1.000 € a year over 184 days.
    expect(year).toMatchObject({ shortfall: 1000, days: 184, accrued: 504.11 });
  });

  it('stops at the end date of a finished contract', () => {
    const input = contract({
      startDate: day('2025-01-01'),
      endDate: day('2025-06-30'),
      modality: 'production',
      salary: yearly(16076),
    });
    const years = compareByYear(input, day('2026-10-07'), MINIMUM_WAGE);
    expect(years).toMatchObject([{ year: 2025, shortfall: 500, days: 181, accrued: 247.95 }]);
  });

  it('says the years before 2023 are not loaded and compares from 2023', () => {
    const input = contract({ startDate: day('2022-06-01'), salary: yearly(15120) });
    const years = compareByYear(input, day('2023-12-31'), MINIMUM_WAGE);
    expect(years).toEqual([
      { kind: 'not_loaded', year: 2022 },
      expect.objectContaining({ kind: 'compared', year: 2023, verdict: 'within' }),
    ]);
    const f = contractFinding(input, '2023-12-31');
    expect(f.status).toBe('within_limit');
    expect(f.calculation).toContainEqual({
      key: 'minimum_wage.not_loaded',
      vars: { from: { integer: 2023 } },
    });
  });

  it('is not applicable to a contract that ended before 2023', () => {
    const input = contract({ startDate: day('2022-04-01'), endDate: day('2022-10-31') });
    expect(contractFinding(input, '2026-10-07').status).toBe('not_applicable_to_date');
  });

  it('leaves out variable pay, extras and pay in kind, and says so', () => {
    const input = contract({
      ...fullYear2026,
      salary: salary({
        amount: 1400,
        breakdown: [
          { kind: 'base', amount: 1200 },
          { kind: 'fixed_complement', amount: 100 },
          { kind: 'variable', amount: 100 },
        ],
        inKind: 50,
      }),
    });
    const [strict] = compareByYear(input, day('2026-12-31'), MINIMUM_WAGE, {
      complement: 'complement_variable',
      hours: 'with_paid_rest',
    });
    expect(strict).toMatchObject({ pay: 18200, verdict: 'within' });
    const f = contractFinding(input, '2026-12-31');
    expect(f.calculation.map((p) => p.key)).toEqual(
      expect.arrayContaining(['minimum_wage.excluded', 'minimum_wage.in_kind_not_counted']),
    );
  });

  it('always reminds that the agreement may pay more', () => {
    const f = contractFinding(contract({ ...fullYear2026, salary: yearly(20000) }), '2026-12-31');
    expect(f.calculation.at(-1)).toEqual({ key: 'minimum_wage.agreement_may_pay_more' });
  });
});

describe('part time', () => {
  const start = { startDate: day('2026-01-01') };
  const minimumOf = (input: EmploymentInput) => {
    const [year] = compareByYear(input, day('2026-12-31'), MINIMUM_WAGE);
    return year?.kind === 'compared' ? year.minimum : null;
  };

  it('halves the minimum for 20 hours against the legal 40', () => {
    const input = contract({ ...start, contractHours: { weekly: 20, annual: null } });
    expect(minimumOf(input)).toBe(8547);
    const f = contractFinding({ ...input, salary: yearly(8500) }, '2026-12-31');
    expect(f).toMatchObject({ id: 'smi_prorata', status: 'below_minimum', amount: { min: 47 } });
    expect(f.calculation.map((p) => p.key)).toContain('minimum_wage.legal_week');
  });

  it('prorates to the agreement week: 30 hours of 38 is 13.495,26 €', () => {
    const input = contract({
      ...start,
      contractHours: { weekly: 30, annual: null },
      fullTimeHours: 38,
    });
    expect(minimumOf(input)).toBe(13495.26);
    const f = contractFinding({ ...input, salary: yearly(14000) }, '2026-12-31');
    expect(f.calculation.map((p) => p.key)).not.toContain('minimum_wage.legal_week');
  });

  it('prorates to the agreement year when only yearly hours are known', () => {
    const input = contract({
      ...start,
      contractHours: { weekly: null, annual: 891 },
      agreement: { ...contract().agreement, annualHours: 1782 },
    });
    expect(minimumOf(input)).toBe(8547);
  });

  it('never raises the minimum for more than full time', () => {
    const input = contract({ ...start, contractHours: { weekly: 45, annual: null } });
    expect(minimumOf(input)).toBe(17094);
  });

  it('asks to review a shortfall when the hours are unknown', () => {
    const input = contract({
      ...start,
      contractHours: { weekly: null, annual: null },
      salary: yearly(9000),
    });
    expect(contractFinding(input, '2026-12-31').status).toBe('review_it');
    const enough = { ...input, salary: yearly(17094) };
    expect(contractFinding(enough, '2026-12-31').status).toBe('within_limit');
  });
});

describe('day and hour rates', () => {
  const start = { startDate: day('2026-01-01') };

  it('carries an hour rate over the 365 days of the year when the week is known', () => {
    const hourly = salary({ amount: 9, period: 'hour', payments: 12 });
    // Yearly hours are ignored next to a week: 9 € × 40 h × 365 / 7 = 18.771,43 €.
    const input = contract({
      ...start,
      salary: hourly,
      contractHours: { weekly: 40, annual: 1800 },
    });
    expect(compareByYear(input, day('2026-12-31'), MINIMUM_WAGE)[0]).toMatchObject({
      pay: 18771.43,
      verdict: 'within',
    });
    expect(contractFinding(input, '2026-12-31').status).toBe('within_limit');
  });

  it('reads yearly hours alone with and without the paid rest, never a sure shortfall', () => {
    // 9 € × 1.800 effective hours is 16.200 €; with 36 paid rest days, 1.800 × 260 / 224 =
    // 2.089,29 hours and 18.803,61 €.
    const input = contract({
      ...start,
      salary: salary({ amount: 9, period: 'hour', payments: 12 }),
      contractHours: { weekly: null, annual: 1800 },
      agreement: { ...contract().agreement, annualHours: 1800 },
    });
    const assessed = review(input, '2026-12-31');
    const [first] = assessed;
    expect(first?.kind).toBe('readings');
    if (first?.kind !== 'readings') return;
    expect(first.question).toBe('paid_hours');
    expect(first.readings.map((r) => [r.when, r.finding.status])).toEqual([
      ['effective_hours', 'below_minimum'],
      ['with_paid_rest', 'within_limit'],
    ]);
    expect(offerPass(assessed)).toBe(false);
    const [paid] = compareByYear(input, day('2026-12-31'), MINIMUM_WAGE);
    expect(paid).toMatchObject({ pay: 18803.61, verdict: 'within' });
  });

  it('carries a day rate over 365 days', () => {
    const daily = salary({ amount: 47, period: 'day', payments: 12 });
    const [year] = compareByYear(
      contract({ ...start, salary: daily }),
      day('2026-12-31'),
      MINIMUM_WAGE,
    );
    expect(year).toMatchObject({ pay: 17155, verdict: 'within' });
  });

  it('asks to review when extra payments of unknown size could close the gap', () => {
    // 40,70 € a day over 365 days is 14.855,50 €; two extra payments not given in euros.
    const daily = salary({ amount: 40.7, period: 'day', payments: 14 });
    const f = contractFinding(contract({ ...start, salary: daily }), '2026-12-31');
    expect(f.status).toBe('review_it');
    expect(f.calculation.map((p) => p.key)).toContain('minimum_wage.pay.extra_pays_unknown');
  });
});

describe('fixed-term contracts of up to 120 days', () => {
  const ninetyDays = {
    modality: 'production' as const,
    startDate: day('2026-06-01'),
    endDate: day('2026-08-29'),
    signedOn: day('2026-05-28'),
  };

  it('is 2,82 € short per working day at 55 € in 2026', () => {
    const input = contract({
      ...ninetyDays,
      salary: salary({ amount: 55, period: 'day', prorated: true }),
    });
    expect(compareByYear(input, day('2026-07-01'), MINIMUM_WAGE)).toMatchObject([
      { year: 2026, minimum: 57.82, pay: 55, shortfall: 2.82, accrued: null, verdict: 'below' },
    ]);
    const f = contractFinding(input, '2026-07-01');
    // Per working day only: no total without the number of days worked.
    expect(f).toMatchObject({ id: 'smi_temporary_120', status: 'below_minimum', amount: null });
    expect(f.calculation).toContainEqual({
      key: 'minimum_wage.temporary.below',
      vars: {
        year: { integer: 2026 },
        minimum: { euros: 57.82 },
        pay: { euros: 55 },
        difference: { euros: 2.82 },
      },
    });
    expect(f.sources.at(-1)?.citation).toBe(`art. 4.1 (${EMPLOYMENT_NORMS.rd126_2026.citation})`);
  });

  it('asks to review a day rate with the extra payments paid apart: the floor holds them', () => {
    const input = contract({ ...ninetyDays, salary: salary({ amount: 55, period: 'day' }) });
    const f = contractFinding(input, '2026-07-01');
    expect(f.status).toBe('review_it');
    expect(f.calculation.map((p) => p.key)).toContain('minimum_wage.temporary.extra_pays_unknown');
    const twelve = { ...input, salary: salary({ amount: 55, period: 'day', payments: 12 }) };
    expect(contractFinding(twelve, '2026-07-01').status).toBe('below_minimum');
  });

  it('prorates the per-day floor for part time', () => {
    const input = contract({
      ...ninetyDays,
      salary: salary({ amount: 28, period: 'day', prorated: true }),
      contractHours: { weekly: 20, annual: null },
    });
    expect(compareByYear(input, day('2026-07-01'), MINIMUM_WAGE)[0]).toMatchObject({
      minimum: 28.91,
      shortfall: 0.91,
    });
  });

  it('uses the yearly comparison beyond 120 days', () => {
    const input = contract({
      ...ninetyDays,
      endDate: day('2026-09-29'),
      salary: salary({ amount: 55, period: 'day' }),
    });
    expect(contractFinding(input, '2026-07-01').id).toBe('smi_annual');
  });
});

describe('a year whose minimum is not published yet', () => {
  const input = contract({ startDate: day('2026-01-01'), salary: salary({ amount: 1250 }) });

  it('gives no difference for 2027 and shows 2026 as a reference', () => {
    const years = compareByYear(input, day('2027-03-01'), MINIMUM_WAGE);
    expect(years.at(-1)).toEqual({
      kind: 'not_published',
      year: 2027,
      reference: MINIMUM_WAGE.at(-1),
    });
    const f = contractFinding(input, '2027-03-01');
    expect(f).toMatchObject({ status: 'not_published', amount: null });
    expect(f.calculation).toContainEqual({
      key: 'minimum_wage.not_published',
      vars: {
        year: { integer: 2027 },
        referenceYear: { integer: 2026 },
        reference: { euros: 17094 },
      },
    });
  });

  it('computes the difference once the 2027 decree is injected', () => {
    const deps = { ...DEPS, minimumWage: withRow(ROW_2027) };
    const from2027 = { ...input, startDate: day('2027-01-01'), signedOn: day('2027-01-01') };
    const f = contractFinding(from2027, '2027-03-01', deps);
    // 18.200 − 17.500 = 700 € a year, over the 60 days to 1 March.
    expect(f).toMatchObject({ status: 'below_minimum', amount: { min: 115.07, max: 115.07 } });
  });

  it('still reports a certain shortfall in earlier years', () => {
    const low = contract({ startDate: day('2026-01-01'), salary: yearly(16094) });
    const f = contractFinding(low, '2027-03-01');
    expect(f).toMatchObject({ status: 'below_minimum', amount: { min: 1000, max: 1000 } });
  });
});

describe('payslips', () => {
  const withPayslips = (...payslips: Payslip[]) =>
    contract({ startDate: day('2026-01-01'), payslips });
  const proratedTwo = (...payslips: Payslip[]) => ({
    ...withPayslips(...payslips),
    salary: salary({ amount: 1500, prorated: true }),
  });

  it('leaves a month 71 € under 1.221 € to the yearly count with extra payments paid apart', () => {
    const input = withPayslips(payslip({ salaryInMoney: 1150 }));
    const [c] = comparePayslips(input, MINIMUM_WAGE);
    expect(c).toMatchObject({
      verdict: 'annual_decides',
      minimum: 1221,
      paid: 1150,
      shortfall: 71,
    });
    const f = single(byId(review(input, '2026-10-31'), 'smi_monthly'));
    expect(f).toMatchObject({ status: 'review_it', amount: null });
  });

  it('never says below for a month when the contract year reaches the minimum', () => {
    // 1.300 € × 14 = 18.200 € a year; one October paid 1.200 €.
    const input = {
      ...withPayslips(payslip({ salaryInMoney: 1200 })),
      salary: salary({ amount: 1300 }),
    };
    const assessed = review(input, '2026-10-31');
    expect(single(assessed[0]).status).toBe('within_limit');
    expect(single(byId(assessed, 'smi_monthly')).status).toBe('review_it');
    expect(offerPass(assessed)).toBe(false);
  });

  it('is 24,50 € short with 1.400 € with both extra payments prorated', () => {
    const p = payslip({ salaryInMoney: 1200, proratedExtraPay: 200 });
    const [c] = comparePayslips(proratedTwo(p), MINIMUM_WAGE);
    expect(c).toMatchObject({ verdict: 'below', minimum: 1424.5, paid: 1400, shortfall: 24.5 });
  });

  it('adds a twelfth per extra payment prorated: one is 1.322,75 €', () => {
    const input = {
      ...withPayslips(payslip({ salaryInMoney: 1221, proratedExtraPay: 101.75 })),
      salary: salary({ amount: 1322.75, payments: 13, prorated: true }),
      extraPays: { count: 1, prorated: true },
    };
    expect(comparePayslips(input, MINIMUM_WAGE)[0]).toMatchObject({
      verdict: 'within',
      minimum: 1322.75,
    });
  });

  it('asks to review a month showing less prorated than the contract implies', () => {
    // Two extra payments prorated would be 203,50 € on 1.221 €; the month shows 101,75 €.
    const input = proratedTwo(payslip({ salaryInMoney: 1221, proratedExtraPay: 101.75 }));
    expect(comparePayslips(input, MINIMUM_WAGE)[0]).toMatchObject({
      verdict: 'prorated_count_unknown',
    });
    expect(single(byId(review(input, '2026-10-31'), 'smi_monthly')).status).toBe('review_it');
  });

  it('asks to review when it is unknown how many extra payments are prorated', () => {
    const between = withPayslips(payslip({ salaryInMoney: 1221, proratedExtraPay: 101.75 }));
    expect(comparePayslips(between, MINIMUM_WAGE)[0]).toMatchObject({
      verdict: 'prorated_count_unknown',
      minimum: 1424.5,
    });
    // Even under the bare monthly amount the month is not a sure shortfall.
    const under = withPayslips(payslip({ salaryInMoney: 1100, proratedExtraPay: 101.75 }));
    const assessed = review(under, '2026-10-31');
    expect(comparePayslips(under, MINIMUM_WAGE)[0]).toMatchObject({
      verdict: 'prorated_count_unknown',
    });
    expect(single(byId(assessed, 'smi_monthly')).status).toBe('review_it');
    const over = withPayslips(payslip({ salaryInMoney: 1250, proratedExtraPay: 200 }));
    expect(comparePayslips(over, MINIMUM_WAGE)[0]).toMatchObject({ verdict: 'within' });
  });

  it('does not compare a month with incidents or not whole', () => {
    const compared = comparePayslips(
      withPayslips(
        payslip({ month: '2026-09', salaryInMoney: 500, incidents: true }),
        payslip({ month: '2026-08', salaryInMoney: 500, wholeMonth: false }),
      ),
      MINIMUM_WAGE,
    );
    expect(compared.map((c) => [c.month, c.verdict])).toEqual([
      ['2026-08', 'not_compared'],
      ['2026-09', 'not_compared'],
    ]);
    const f = single(
      byId(review(withPayslips(payslip({ incidents: true })), '2026-10-31'), 'smi_monthly'),
    );
    expect(f.status).toBe('review_it');
  });

  it('is within the limit when the compared months are, listing the ones left out', () => {
    const input = withPayslips(
      payslip({ month: '2026-09', salaryInMoney: 1300 }),
      payslip({ month: '2026-10', salaryInMoney: 400, incidents: true }),
    );
    const f = single(byId(review(input, '2026-10-31'), 'smi_monthly'));
    expect(f.status).toBe('within_limit');
    expect(f.calculation.map((p) => p.key)).toContain('minimum_wage.payslip.not_compared');
  });

  it('adds up the short prorated months when the contract year falls short too', () => {
    const input = {
      ...proratedTwo(
        payslip({ month: '2026-09', salaryInMoney: 1200, proratedExtraPay: 200 }),
        payslip({ month: '2026-10', salaryInMoney: 1150, proratedExtraPay: 200 }),
        payslip({ month: '2026-11', salaryInMoney: 500, incidents: true }),
      ),
      // 1.400 € × 12 = 16.800 € a year, under the 17.094 € of 2026.
      salary: salary({ amount: 1400, prorated: true }),
    };
    const f = single(byId(review(input, '2026-11-30'), 'smi_monthly'));
    // 24,50 € and 74,50 €.
    expect(f).toMatchObject({ status: 'below_minimum', amount: { min: 99, max: 99 } });
    expect(f.calculation.map((p) => p.key)).toEqual([
      'minimum_wage.payslip.below',
      'minimum_wage.payslip.below',
      'minimum_wage.payslip.not_compared',
      'minimum_wage.total',
    ]);
    expect(f.calculation[0]).toEqual(
      phrase('minimum_wage.payslip.below', {
        year: { integer: 2026 },
        month: { integer: 9 },
        minimum: { euros: 1424.5 },
        paid: { euros: 1400 },
        difference: { euros: 24.5 },
      }),
    );
  });

  it('leaves one low prorated payslip to review when the contract year reaches the minimum', () => {
    // 1.500 € × 12 = 18.000 € a year; one month paid 1.400 € with both extras prorated.
    const input = proratedTwo(payslip({ salaryInMoney: 1200, proratedExtraPay: 200 }));
    expect(comparePayslips(input, MINIMUM_WAGE)[0]).toMatchObject({ verdict: 'below' });
    const assessed = review(input, '2026-10-31');
    const f = single(byId(assessed, 'smi_monthly'));
    expect(f).toMatchObject({ status: 'review_it', amount: null });
    expect(f.calculation.map((p) => p.key)).toEqual(['minimum_wage.payslip.annual_within']);
    expect(offerPass(assessed)).toBe(false);
  });

  it('counts a later year only when every whole month of it has a short payslip', () => {
    // Signed in 2025 at 1.200 € × 12 prorated (14.400 €); 2026 may have brought a raise.
    const months = ['2026-01', '2026-02', '2026-03'];
    const input = (entered: readonly string[]) => ({
      ...contract({
        startDate: day('2025-06-01'),
        signedOn: day('2025-06-01'),
        extraPays: { count: 2, prorated: true },
        payslips: entered.map((month) =>
          payslip({ month, salaryInMoney: 1200, proratedExtraPay: 200 }),
        ),
      }),
      salary: salary({ amount: 1400, prorated: true }),
    });
    const partial = single(byId(review(input(months.slice(0, 2)), '2026-04-15'), 'smi_monthly'));
    expect(partial).toMatchObject({ status: 'review_it', amount: null });
    expect(partial.calculation.map((p) => p.key)).toContain('minimum_wage.payslip.annual_unproven');
    const whole = single(byId(review(input(months), '2026-04-15'), 'smi_monthly'));
    // 24,50 € a month over January to March.
    expect(whole).toMatchObject({ status: 'below_minimum', amount: { min: 73.5, max: 73.5 } });
    expect(contractFinding(input(months), '2026-04-15').status).toBe('review_it');
  });

  it('prorates the monthly minimum for part time', () => {
    const input = {
      ...withPayslips(payslip({ salaryInMoney: 600 })),
      contractHours: { weekly: 20, annual: null },
    };
    expect(comparePayslips(input, MINIMUM_WAGE)[0]).toMatchObject({
      minimum: 610.5,
      shortfall: 10.5,
    });
  });

  it('gives no difference for a month whose year is not published', () => {
    const [c] = comparePayslips(
      withPayslips(payslip({ month: '2027-01', salaryInMoney: 900 })),
      MINIMUM_WAGE,
    );
    expect(c).toMatchObject({ verdict: 'not_published', shortfall: 0, row: MINIMUM_WAGE.at(-1) });
  });

  it('a short month with hours of no known fraction is only to review', () => {
    const input = {
      ...withPayslips(payslip({ salaryInMoney: 900 })),
      contractHours: { weekly: null, annual: 1000 },
    };
    expect(comparePayslips(input, MINIMUM_WAGE)[0]?.verdict).toBe('hours_unknown');
  });

  it('is not entered without payslips', () => {
    expect(single(byId(review(withPayslips(), '2026-10-31'), 'smi_monthly')).status).toBe(
      'not_entered',
    );
  });
});

describe('a decree whose effects from 1 January are not verified', () => {
  const table = changeYear(2026, { retroactiveVerified: false });

  it('sends payslips before publication to review and compares the later ones', () => {
    const input = contract({
      startDate: day('2025-06-01'),
      salary: salary({ prorated: true }),
      payslips: [
        payslip({ month: '2026-01', salaryInMoney: 1150, proratedExtraPay: 200 }),
        payslip({ month: '2026-03', salaryInMoney: 1150, proratedExtraPay: 200 }),
      ],
    });
    expect(comparePayslips(input, table).map((c) => c.verdict)).toEqual([
      'effects_unverified',
      'below',
    ]);
  });

  it('sends that year of the contract to review with the year before alongside', () => {
    const input = contract({ startDate: day('2025-01-01'), salary: yearly(16800) });
    const years = compareByYear(input, day('2026-10-07'), table);
    expect(years.map((y) => (y.kind === 'compared' ? y.verdict : y.kind))).toEqual([
      'within',
      'effects_unverified',
    ]);
    const f = contractFinding(input, '2026-10-07', { ...DEPS, minimumWage: table });
    expect(f.status).toBe('review_it');
    expect(f.calculation).toContainEqual({
      key: 'minimum_wage.year.effects_unverified',
      vars: {
        year: { integer: 2026 },
        minimum: { euros: 17094 },
        pay: { euros: 16800 },
        previous: { euros: 16576 },
      },
    });
  });

  it('has no doubt for a contract starting after publication', () => {
    const input = contract({ startDate: day('2026-03-01'), salary: yearly(16800) });
    expect(compareByYear(input, day('2026-10-07'), table)[0]).toMatchObject({ verdict: 'below' });
  });
});

describe('complements of doubtful kind', () => {
  const start = { startDate: day('2026-01-01') };
  const withVariable = (kind: 'variable' | 'unknown', variable: number) =>
    contract({
      ...start,
      salary: salary({
        amount: 1100 + variable,
        breakdown: [
          { kind: 'base', amount: 1100 },
          { kind, amount: variable },
        ],
      }),
    });

  it('opens two labelled readings when the complement changes the verdict', () => {
    const [assessed] = review(withVariable('variable', 200), '2026-12-31');
    expect(assessed?.kind).toBe('readings');
    if (assessed?.kind !== 'readings') return;
    expect(assessed.question).toBe('complement_kind');
    expect(assessed.readings.map((r) => [r.when, r.finding.status])).toEqual([
      ['complement_fixed', 'within_limit'],
      ['complement_variable', 'below_minimum'],
    ]);
    expect(assessed.readings.every((r) => r.finding.basedOnYourAnswer)).toBe(true);
    expect(offerPass([assessed])).toBe(false);
  });

  it('counts a breakdown short of the total as a fixed complement: the contract fixes it', () => {
    // 1.300 € a month with only 1.100 € of base listed: 18.200 € a year either way.
    const input = contract({
      ...start,
      salary: salary({ amount: 1300, breakdown: [{ kind: 'base', amount: 1100 }] }),
    });
    const [assessed] = review(input, '2026-12-31');
    expect(assessed?.kind).toBe('single');
    if (assessed?.kind !== 'single') return;
    expect(assessed.finding.status).toBe('within_limit');
    expect(assessed.finding.calculation).toContainEqual({
      key: 'minimum_wage.breakdown_gap',
      vars: { gap: { euros: 200 } },
    });
  });

  it('opens them for a complement of unknown kind too', () => {
    expect(review(withVariable('unknown', 200), '2026-12-31')[0]?.kind).toBe('readings');
  });

  it('stays single when the verdict is the same either way', () => {
    // 1.300 € of base alone is 18.200 € a year.
    const input = contract({
      ...start,
      salary: salary({
        amount: 1400,
        breakdown: [
          { kind: 'base', amount: 1300 },
          { kind: 'variable', amount: 100 },
        ],
      }),
    });
    expect(single(review(input, '2026-12-31')[0]).status).toBe('within_limit');
  });

  // Both readings fall short by different amounts: neither is folded into the other, so the lower
  // one can be counted.
  const shortfalls = (a: Assessed | undefined) =>
    a?.kind === 'readings'
      ? a.readings.map((r) => [
          r.when,
          r.finding.status,
          r.finding.calculation.flatMap((p) =>
            /^minimum_wage\.(year|temporary)\.below$/.test(p.key) ? [p.vars?.['difference']] : [],
          ),
        ])
      : a?.kind;

  it('keeps both readings of a short contract below the daily minimum by different amounts', () => {
    // 55 € a day, 10 € of it a complement of unknown kind, against the 57,82 € daily minimum.
    const input = contract({
      modality: 'production',
      causeStated: true,
      circumstancesStated: true,
      startDate: day('2026-08-01'),
      endDate: day('2026-10-15'),
      signedOn: null,
      salary: salary({
        amount: 55,
        period: 'day',
        payments: 12,
        breakdown: [
          { kind: 'base', amount: 45 },
          { kind: 'unknown', amount: 10 },
        ],
      }),
      extraPays: { count: 0, prorated: false },
    });
    const [assessed] = review(input, '2026-10-08');
    expect(shortfalls(assessed)).toEqual([
      ['complement_fixed', 'below_minimum', [{ euros: 2.82 }]],
      ['complement_variable', 'below_minimum', [{ euros: 12.82 }]],
    ]);
    expect(offerPass(assessed ? [assessed] : [])).toBe(true);
  });

  it('keeps both readings of a fixed-discontinuous year with no total', () => {
    // 1.150 € a month in 14 payments, 100 € of it of unknown kind: 16.100 € or 14.700 € a year,
    // under 17.094 € either way; the idle periods leave no total to compare.
    const input = contract({
      startDate: day('2026-01-01'),
      modality: 'discontinuous',
      discontinuous: { activityPeriod: true, hours: true, distribution: true },
      salary: salary({
        amount: 1150,
        breakdown: [
          { kind: 'base', amount: 1050 },
          { kind: 'unknown', amount: 100 },
        ],
      }),
    });
    const [assessed] = review(input, '2026-12-31');
    expect(shortfalls(assessed)).toEqual([
      ['complement_fixed', 'below_minimum', [{ euros: 994 }]],
      ['complement_variable', 'below_minimum', [{ euros: 2394 }]],
    ]);
  });

  it('offers the pass when the shortfall holds in both readings', () => {
    const assessed = review(withVariable('variable', 50), '2026-12-31');
    expect(assessed[0]?.kind).toBe('readings');
    expect(offerPass(assessed)).toBe(true);
  });
});

describe('pay in kind', () => {
  const inKind = (money: number, kind: number) =>
    contract({ salary: salary({ amount: money, inKind: kind }) });

  it('is over the legal limit with 1.300 € in money and 700 € in kind a month', () => {
    // 8.400 € in kind against 18.200 € in money over the year: 31,58 %.
    const f = single(byId(review(inKind(1300, 700), '2026-10-07'), 'smi_in_kind_cap'));
    expect(f).toMatchObject({
      status: 'over_legal_limit',
      amount: null,
      agreementMaySetOther: false,
    });
    expect(f.calculation[0]?.vars?.percent).toBe(31.58);
    expect(offerPass([{ kind: 'single', finding: f }])).toBe(true);
  });

  it('reckons the share over the year, not one month without extra payments', () => {
    // 650 / 2.050 is 31,7 % in a month, but 7.800 / 27.400 = 28,47 % over the year.
    const f = single(byId(review(inKind(1400, 650), '2026-10-07'), 'smi_in_kind_cap'));
    expect(f.status).toBe('within_limit');
    expect(f.calculation[0]?.vars?.percent).toBe(28.47);
  });

  it('is within it at exactly 30 %', () => {
    const input = contract({ salary: salary({ amount: 14000, period: 'year', inKind: 6000 }) });
    expect(single(byId(review(input, '2026-10-07'), 'smi_in_kind_cap')).status).toBe(
      'within_limit',
    );
  });

  it('gives no verdict for a day or hour rate', () => {
    const input = contract({ salary: salary({ amount: 60, period: 'day', inKind: 30 }) });
    expect(single(byId(review(input, '2026-10-07'), 'smi_in_kind_cap')).status).toBe('review_it');
  });

  it('has no finding without pay in kind', () => {
    expect(byId(review(inKind(1400, 0), '2026-10-07'), 'smi_in_kind_cap')).toBeUndefined();
  });
});

describe('agreement salary given by the person', () => {
  const withCategory = (categoryAnnualSalary: number) =>
    contract({ agreement: { ...contract().agreement, named: true, categoryAnnualSalary } });

  it('compares it as the person’s figure, never opening the pass', () => {
    const assessed = review(withCategory(22000), '2026-10-07');
    const f = single(byId(assessed, 'agreement_salary'));
    // 1.500 € × 14 = 21.000 €.
    expect(f).toMatchObject({
      status: 'depends_on_agreement',
      amount: null,
      basedOnYourAnswer: true,
    });
    expect(f.calculation[0]?.vars?.difference).toEqual({ euros: 1000 });
    expect(offerPass(assessed)).toBe(false);
  });

  it('is within when the contract reaches it', () => {
    expect(single(byId(review(withCategory(20000), '2026-10-07'), 'agreement_salary')).status).toBe(
      'within_limit',
    );
  });
});

describe('special pay rules', () => {
  it('sends a training contract shortfall to review: its minimum follows effective work', () => {
    const input = contract({
      modality: 'training_alternance',
      startDate: day('2026-01-01'),
      salary: yearly(12000),
    });
    expect(contractFinding(input, '2026-12-31').status).toBe('review_it');
  });

  it('gives no total for a fixed-discontinuous contract, whose idle periods are unknown', () => {
    const input = contract({
      modality: 'discontinuous',
      startDate: day('2026-01-01'),
      salary: yearly(16094),
    });
    const f = contractFinding(input, '2026-12-31');
    expect(f).toMatchObject({ status: 'below_minimum', amount: null });
    expect(f.calculation.map((p) => p.key)).toContain('minimum_wage.discontinuous_periods');
  });
});

describe('how each pay is carried to a year', () => {
  const start2026 = { startDate: day('2026-01-01'), signedOn: day('2026-01-01') };
  const howOf = (change: Partial<EmploymentInput>) =>
    contractFinding(contract({ ...start2026, ...change }), '2026-12-31').calculation[0];
  const euros = (n: number) => ({ euros: n });

  it('says a yearly salary', () => {
    expect(howOf({ salary: yearly(20000) })).toEqual(
      phrase('minimum_wage.pay.year', { annual: euros(20000) }),
    );
  });

  it('says a monthly salary and how many payments it carries', () => {
    expect(howOf({ salary: salary({ amount: 1500, payments: 14 }) })).toEqual(
      phrase('minimum_wage.pay.month', {
        monthly: euros(1500),
        payments: { integer: 14 },
        annual: euros(21000),
      }),
    );
  });

  it('says a monthly salary with the extra pays prorated', () => {
    expect(howOf({ salary: salary({ amount: 1500, payments: 14, prorated: true }) })).toEqual(
      phrase('minimum_wage.pay.month_prorated', { monthly: euros(1500), annual: euros(18000) }),
    );
  });

  it('says a day rate', () => {
    expect(howOf({ salary: salary({ amount: 60, period: 'day', payments: 12 }) })).toEqual(
      phrase('minimum_wage.pay.day', {
        daily: euros(60),
        days: { days: 365 },
        annual: euros(21900),
      }),
    );
  });

  it('says an hour rate over the week', () => {
    expect(
      howOf({
        salary: salary({ amount: 10, period: 'hour', payments: 12 }),
        contractHours: { weekly: 20, annual: null },
      }),
    ).toEqual(
      phrase('minimum_wage.pay.hour_weekly', {
        hourly: euros(10),
        weekly: 20,
        annual: euros(10428.57),
      }),
    );
  });

  it('says an hour rate over yearly hours, with and without the paid rest', () => {
    const assessed = review(
      contract({
        ...start2026,
        salary: salary({ amount: 8, period: 'hour', payments: 12 }),
        contractHours: { weekly: null, annual: 1800 },
      }),
      '2026-12-31',
    )[0];
    expect(assessed?.kind).toBe('readings');
    if (assessed?.kind !== 'readings') return;
    expect(assessed.question).toBe('paid_hours');
    const howOfReading = (when: string) =>
      assessed.readings.find((r) => r.when === when)?.finding.calculation[0];
    expect(howOfReading('effective_hours')).toEqual(
      phrase('minimum_wage.pay.hour', { hourly: euros(8), hours: 1800, annual: euros(14400) }),
    );
    expect(howOfReading('with_paid_rest')).toEqual(
      phrase('minimum_wage.pay.hour_with_paid_rest', {
        hourly: euros(8),
        hours: 1800,
        restDays: { days: 36 },
        paidHours: 2089.29,
        annual: euros(16714.32),
      }),
    );
  });

  it('opens the hours readings with a breakdown that is all base pay', () => {
    const assessed = review(
      contract({
        ...start2026,
        salary: salary({
          amount: 8,
          period: 'hour',
          payments: 12,
          breakdown: [{ kind: 'base', amount: 8 }],
        }),
        contractHours: { weekly: null, annual: 1800 },
      }),
      '2026-12-31',
    )[0];
    expect(assessed?.kind === 'readings' && assessed.question).toBe('paid_hours');
  });

  it('shows what a variable complement leaves out in the reading that leaves it out', () => {
    const assessed = review(
      contract({
        ...start2026,
        salary: salary({
          amount: 18000,
          period: 'year',
          breakdown: [
            { kind: 'base', amount: 15000 },
            { kind: 'variable', amount: 3000 },
          ],
        }),
      }),
      '2026-12-31',
    )[0];
    expect(assessed?.kind === 'readings' && assessed.question).toBe('complement_kind');
    if (assessed?.kind !== 'readings') return;
    const calc = (when: string) =>
      assessed.readings.find((r) => r.when === when)?.finding.calculation;
    expect(calc('complement_variable')).toContainEqual(
      phrase('minimum_wage.excluded', { excluded: euros(3000) }),
    );
    expect(calc('complement_fixed')?.map((p) => p.key)).not.toContain('minimum_wage.excluded');
  });
});

describe('the contract year from its pay', () => {
  const start2026 = { startDate: day('2026-01-01'), signedOn: day('2026-01-01') };
  const fixedComplement = [
    { kind: 'base' as const, amount: 1000 },
    { kind: 'fixed_complement' as const, amount: 500 },
  ];

  it.each([
    [
      'an hour rate with only yearly hours',
      salary({ period: 'hour', amount: 10, payments: 12 }),
      { weekly: null, annual: 1800 },
      null,
    ],
    [
      'an hour rate with its week',
      salary({ period: 'hour', amount: 10, payments: 12 }),
      { weekly: 20, annual: 1800 },
      10428.57,
    ],
    [
      'a day rate with only yearly hours',
      salary({ period: 'day', amount: 60, payments: 12 }),
      { weekly: null, annual: 1800 },
      21900,
    ],
    [
      'a yearly salary with a complement and 14 payments',
      salary({ period: 'year', amount: 20000, breakdown: fixedComplement }),
      { weekly: 40, annual: null },
      20000,
    ],
    [
      'a monthly salary of 12 payments with a complement',
      salary({ amount: 1500, payments: 12, breakdown: fixedComplement }),
      { weekly: 40, annual: null },
      18000,
    ],
    [
      'a prorated monthly salary with a complement',
      salary({ amount: 1500, prorated: true, breakdown: fixedComplement }),
      { weekly: 40, annual: null },
      18000,
    ],
    [
      'a monthly salary of 14 payments with a complement',
      salary({ amount: 1500, breakdown: fixedComplement }),
      { weekly: 40, annual: null },
      null,
    ],
    [
      'a monthly salary of 14 payments of base pay',
      salary({ amount: 1500, breakdown: [{ kind: 'base', amount: 1500 }] }),
      { weekly: 40, annual: null },
      21000,
    ],
  ])('%s: its yearly pay is %s', (_name, theSalary, contractHours, annual) => {
    expect(contractAnnualPay(contract({ salary: theSalary, contractHours, extraPays: null }))).toBe(
      annual,
    );
  });

  it('is unknown when the extra pays entered contradict the salary', () => {
    const base = { salary: salary({ amount: 1500 }) };
    expect(contractAnnualPay(contract({ ...base, extraPays: { count: 2, prorated: false } }))).toBe(
      21000,
    );
    expect(
      contractAnnualPay(contract({ ...base, extraPays: { count: 1, prorated: false } })),
    ).toBeNull();
    expect(
      contractAnnualPay(contract({ ...base, extraPays: { count: 2, prorated: true } })),
    ).toBeNull();
  });

  it.each([
    [
      'an hour rate without its hours',
      {
        salary: salary({ period: 'hour', amount: 10 }),
        contractHours: { weekly: null, annual: null },
      },
    ],
    ['hours of no known fraction', { contractHours: { weekly: null, annual: 1000 } }],
    [
      'hours of no known fraction, from the agreement alone',
      {
        contractHours: { weekly: null, annual: null },
        agreement: { ...contract().agreement, annualHours: 1800 },
      },
    ],
    ['a year not published', { startDate: day('2030-01-01'), signedOn: day('2030-01-01') }],
  ])('has no minimum to compare for %s', (_name, change) => {
    expect(contractAgainstMinimum(contract({ ...start2026, ...change }), MINIMUM_WAGE)).toBeNull();
  });

  it('compares with the minimum of the year the pay is known to apply, in proportion to the hours', () => {
    expect(
      contractAgainstMinimum(contract({ ...start2026, salary: yearly(20000) }), MINIMUM_WAGE),
    ).toEqual({
      year: 2026,
      annual: 20000,
      minimum: 17094,
    });
    expect(
      contractAgainstMinimum(
        contract({
          ...start2026,
          salary: yearly(20000),
          contractHours: { weekly: 20, annual: null },
        }),
        MINIMUM_WAGE,
      )?.minimum,
    ).toBe(8547);
  });

  it('a shortfall with hours of no known fraction is only to review', () => {
    const f = contractFinding(
      contract({
        ...start2026,
        salary: yearly(10000),
        contractHours: { weekly: null, annual: 1000 },
      }),
      '2026-12-31',
    );
    expect(f.status).toBe('review_it');
    expect(f.calculation.map((p) => p.key)).toContain('minimum_wage.year.hours_unknown');
    expect(f.calculation.map((p) => p.key)).not.toContain('minimum_wage.prorata_annual');
  });
});

describe('the part-time proportion, in words', () => {
  const start2026 = { startDate: day('2026-01-01'), signedOn: day('2026-01-01') };
  const keysFor = (change: Partial<EmploymentInput>) =>
    contractFinding(contract({ ...start2026, salary: yearly(20000), ...change }), '2026-12-31')
      .calculation;

  it('says nothing at full time', () => {
    expect(
      keysFor({ contractHours: { weekly: 40, annual: null } }).map((p) => p.key),
    ).not.toContain('minimum_wage.prorata');
  });

  it('says the week against the legal one, and that an agreement week may raise it', () => {
    expect(keysFor({ contractHours: { weekly: 20, annual: null } }).slice(1, 3)).toEqual([
      phrase('minimum_wage.prorata', { hours: 20, fullTime: 40, coefficient: 0.5 }),
      phrase('minimum_wage.legal_week'),
    ]);
  });

  it('says the week against the agreement week without that reminder', () => {
    const calc = keysFor({ fullTimeHours: 38, contractHours: { weekly: 19, annual: null } });
    expect(calc[1]).toEqual(
      phrase('minimum_wage.prorata', { hours: 19, fullTime: 38, coefficient: 0.5 }),
    );
    expect(calc.map((p) => p.key)).not.toContain('minimum_wage.legal_week');
  });

  it('says the year against the agreement year', () => {
    const calc = keysFor({
      contractHours: { weekly: null, annual: 900 },
      agreement: { ...contract().agreement, annualHours: 1800 },
    });
    expect(calc[1]).toEqual(
      phrase('minimum_wage.prorata_annual', { hours: 900, fullTime: 1800, coefficient: 0.5 }),
    );
  });
});

describe('the years of a contract, by days', () => {
  const rate = salary({ amount: 60, period: 'day', payments: 12 });

  it('counts a single day, and none for a contract yet to start', () => {
    const oneDay = contract({
      startDate: day('2026-12-31'),
      signedOn: day('2026-12-31'),
      salary: yearly(20000),
    });
    expect(compareByYear(oneDay, day('2026-12-31'), MINIMUM_WAGE)).toMatchObject([
      { year: 2026, days: 1 },
    ]);
    const future = contract({
      startDate: day('2026-12-01'),
      signedOn: day('2026-12-01'),
      salary: yearly(20000),
    });
    expect(compareByYear(future, day('2026-10-07'), MINIMUM_WAGE)).toMatchObject([
      { year: 2026, days: 0 },
    ]);
  });

  it('counts a short contract up to its end, even when that is before today', () => {
    const short = contract({
      modality: 'production',
      startDate: day('2026-01-01'),
      signedOn: day('2026-01-01'),
      endDate: day('2026-02-28'),
      salary: rate,
    });
    expect(compareByYear(short, day('2026-12-31'), MINIMUM_WAGE)).toMatchObject([
      { year: 2026, days: 59 },
    ]);
  });

  it.each(['permanent', 'discontinuous'] as const)(
    'a %s contract is never a short temporary one, whatever its end date',
    (modality) => {
      const input = contract({
        modality,
        startDate: day('2026-01-01'),
        signedOn: day('2026-01-01'),
        endDate: day('2026-02-28'),
        salary: rate,
      });
      expect(compareByYear(input, day('2026-12-31'), MINIMUM_WAGE)[0]).toMatchObject({
        minimum: 17094,
      });
    },
  );
});

describe('payslip extra pays prorated, by what the contract says', () => {
  const withPayslip = (change: Partial<EmploymentInput>, p: Partial<Payslip>) =>
    contract({ startDate: day('2026-01-01'), payslips: [payslip(p)], ...change });
  const verdictOf = (input: EmploymentInput) => {
    const [c] = comparePayslips(input, MINIMUM_WAGE);
    return [c?.verdict, c?.minimum];
  };

  it.each([
    [
      'one extra pay prorated by the answer, with the salary not prorated',
      { salary: salary({ amount: 1500 }), extraPays: { count: 1, prorated: true } },
      { salaryInMoney: 1221, proratedExtraPay: 101.75 },
      ['within', 1322.75],
    ],
    [
      'one extra pay prorated by a salary of 13 payments, with no answer',
      { salary: salary({ amount: 1500, payments: 13, prorated: true }), extraPays: null },
      { salaryInMoney: 1221, proratedExtraPay: 101.75 },
      ['within', 1322.75],
    ],
    [
      'no extra pay prorated by the answer',
      {
        salary: salary({ amount: 1500, payments: 14, prorated: true }),
        extraPays: { count: 0, prorated: false },
      },
      { salaryInMoney: 1221, proratedExtraPay: 101.75 },
      ['prorated_count_unknown', 1424.5],
    ],
    [
      'a salary not prorated',
      { salary: salary({ amount: 1500, payments: 14 }), extraPays: null },
      { salaryInMoney: 1100, proratedExtraPay: 183.33 },
      ['prorated_count_unknown', 1424.5],
    ],
    [
      'exactly the twelfths the count implies, less a cent',
      { salary: salary({ amount: 1500, prorated: true }), extraPays: { count: 2, prorated: true } },
      { salaryInMoney: 1200, proratedExtraPay: 199.99 },
      ['below', 1424.5],
    ],
    [
      'a cent under that',
      { salary: salary({ amount: 1500, prorated: true }), extraPays: { count: 2, prorated: true } },
      { salaryInMoney: 1200, proratedExtraPay: 199.98 },
      ['prorated_count_unknown', 1424.5],
    ],
  ])('%s', (_name, change, p, expected) => {
    expect(verdictOf(withPayslip(change, p))).toEqual(expected);
  });

  it('a month of a year before the table is not loaded', () => {
    expect(comparePayslips(withPayslip({}, { month: '2022-05' }), MINIMUM_WAGE)).toEqual([
      {
        month: '2022-05',
        verdict: 'not_loaded',
        row: null,
        minimum: null,
        paid: null,
        shortfall: 0,
        prorated: false,
      },
    ]);
  });
});

describe('the payslip finding, in words', () => {
  const monthly = (...payslips: Payslip[]) => contract({ startDate: day('2026-01-01'), payslips });
  const finding = (input: EmploymentInput, today = '2026-10-31') =>
    single(byId(review(input, today), 'smi_monthly'));

  it('says a month not published against the latest decree, in months or prorated', () => {
    const f = finding(
      monthly(
        payslip({ month: '2027-01', salaryInMoney: 900 }),
        payslip({ month: '2027-02', salaryInMoney: 900, proratedExtraPay: 100 }),
      ),
    );
    expect(f.status).toBe('not_published');
    expect(f.calculation).toEqual([
      phrase('minimum_wage.payslip.not_published', {
        year: { integer: 2027 },
        month: { integer: 1 },
        referenceYear: { integer: 2026 },
        reference: { euros: 1221 },
      }),
      phrase('minimum_wage.payslip.not_published', {
        year: { integer: 2027 },
        month: { integer: 2 },
        referenceYear: { integer: 2026 },
        reference: { euros: 1424.5 },
      }),
    ]);
  });

  it('a month of a year not loaded gives no difference to apply', () => {
    const f = finding(monthly(payslip({ month: '2022-05' })));
    expect(f.status).toBe('not_applicable_to_date');
    expect(f.calculation).toEqual([
      phrase('minimum_wage.payslip.not_loaded', { year: { integer: 2022 }, month: { integer: 5 } }),
    ]);
  });

  it('a month with an incident is left out, and says so', () => {
    const f = finding(monthly(payslip({ incidents: true })));
    expect(f.status).toBe('review_it');
    expect(f.calculation).toEqual([
      phrase('minimum_wage.payslip.not_compared', {
        year: { integer: 2026 },
        month: { integer: 10 },
      }),
    ]);
  });

  it('says what a month below and a month within come to', () => {
    const f = finding(
      monthly(
        payslip({ month: '2026-08', salaryInMoney: 1200, proratedExtraPay: 200 }),
        payslip({ month: '2026-09', salaryInMoney: 1300, proratedExtraPay: 200 }),
      ),
    );
    expect(f.calculation).toEqual([
      phrase('minimum_wage.payslip.prorated_count_unknown', {
        year: { integer: 2026 },
        month: { integer: 8 },
        minimum: { euros: 1424.5 },
        paid: { euros: 1400 },
      }),
      phrase('minimum_wage.payslip.within', {
        year: { integer: 2026 },
        month: { integer: 9 },
        minimum: { euros: 1424.5 },
        paid: { euros: 1500 },
      }),
    ]);
  });

  it('cites the monthly rule and the decree of each month it compared', () => {
    const f = finding(monthly(payslip({})));
    expect(f.sources.map((s) => s.id)).toEqual(['smi_monthly', 'rd126_2026']);
    expect(f.sources[1]?.citation.startsWith('art. 1 (')).toBe(true);
  });
});

describe('pay in kind and the agreement figure, in words', () => {
  const start2026 = { startDate: day('2026-01-01'), signedOn: day('2026-01-01') };
  const inKindOf = (change: Partial<EmploymentInput>) =>
    single(byId(review(contract({ ...start2026, ...change }), '2026-10-07'), 'smi_in_kind_cap'));

  it('says the share and cites its rule', () => {
    const f = inKindOf({ salary: salary({ amount: 1300, inKind: 700 }) });
    expect(f.calculation).toEqual([
      phrase('minimum_wage.in_kind', {
        inKind: { euros: 8400 },
        money: { euros: 18200 },
        percent: 31.58,
      }),
    ]);
    expect(f.sources.map((s) => s.id)).toEqual(['smi_in_kind_cap']);
  });

  it('a day or hour rate has the pay in kind to review, with no share', () => {
    const f = inKindOf({
      salary: salary({ amount: 60, period: 'day', payments: 12, inKind: 400 }),
    });
    expect(f).toMatchObject({
      status: 'review_it',
      calculation: [phrase('minimum_wage.in_kind_rate', { inKind: { euros: 400 } })],
    });
    expect(f.sources.map((s) => s.id)).toEqual(['smi_in_kind_cap']);
  });

  const agreementOf = (change: Partial<EmploymentInput>) =>
    single(byId(review(contract({ ...start2026, ...change }), '2026-10-07'), 'agreement_salary'));
  const category = (categoryAnnualSalary: number) => ({
    agreement: { ...contract().agreement, categoryAnnualSalary },
  });

  it.each([
    ['at the figure', 21000, 'within_limit'],
    ['a euro over it', 21001, 'depends_on_agreement'],
  ])('a salary of 21.000 € %s', (_name, figure, status) => {
    const f = agreementOf({ ...category(figure), salary: salary({ amount: 1500 }) });
    expect(f.status).toBe(status);
    expect(f.sources.map((s) => s.id)).toEqual(['agreement_salary']);
  });

  it('prorates the figure to the working hours', () => {
    const f = agreementOf({
      ...category(20000),
      salary: yearly(9000),
      contractHours: { weekly: 20, annual: null },
    });
    expect(f.calculation).toEqual([
      phrase('minimum_wage.agreement.below', {
        category: { euros: 20000 },
        minimum: { euros: 10000 },
        pay: { euros: 9000 },
        difference: { euros: 1000 },
      }),
    ]);
  });

  it('keeps the whole figure when the hours are not known', () => {
    const f = agreementOf({
      ...category(20000),
      salary: yearly(18000),
      contractHours: { weekly: null, annual: 1000 },
    });
    expect(f.calculation[0]?.vars?.minimum).toEqual({ euros: 20000 });
  });
});

describe('the contract finding, in words', () => {
  const start2026 = { startDate: day('2026-01-01'), signedOn: day('2026-01-01') };
  const keysOf = (change: Partial<EmploymentInput>, today = '2026-12-31') =>
    contractFinding(contract({ ...start2026, ...change }), today).calculation.map((p) => p.key);

  it('a plain contract says its pay, its year and that the agreement may pay more', () => {
    const f = contractFinding(contract({ ...start2026, salary: yearly(20000) }), '2026-12-31');
    expect(f.calculation.map((p) => p.key)).toEqual([
      'minimum_wage.pay.year',
      'minimum_wage.year.within',
      'minimum_wage.agreement_may_pay_more',
    ]);
    expect(f.basedOnYourAnswer).toBe(false);
    expect(f.id).toBe('smi_annual');
    expect(f.sources.map((s) => s.id)).toEqual(['smi_annual', 'rd126_2026']);
    expect(f.sources[1]?.citation.startsWith('art. 3.1 (')).toBe(true);
  });

  it('a breakdown that explains the whole, with no pay in kind, adds no note', () => {
    expect(
      keysOf({
        salary: salary({ amount: 1500, breakdown: [{ kind: 'base', amount: 1500 }], inKind: 0 }),
        extraPays: null,
      }),
    ).toEqual([
      'minimum_wage.pay.month',
      'minimum_wage.year.within',
      'minimum_wage.agreement_may_pay_more',
    ]);
  });

  it('a breakdown short of the total says the gap, and pay in kind says it is not counted', () => {
    expect(
      keysOf({
        salary: salary({ amount: 1500, breakdown: [{ kind: 'base', amount: 1400 }], inKind: 50 }),
        extraPays: null,
      }).slice(1, 3),
    ).toEqual(['minimum_wage.breakdown_gap', 'minimum_wage.in_kind_not_counted']);
  });

  it('a day rate with extra pays of unknown size says so', () => {
    const keys = keysOf({ salary: salary({ amount: 60, period: 'day', payments: 14 }) });
    expect(keys.slice(0, 2)).toEqual([
      'minimum_wage.pay.day',
      'minimum_wage.pay.extra_pays_unknown',
    ]);
    expect(keysOf({ salary: salary({ amount: 60, period: 'day', payments: 12 }) })).not.toContain(
      'minimum_wage.pay.extra_pays_unknown',
    );
  });

  it('an hour rate without hours says the hours are unknown', () => {
    const f = contractFinding(
      contract({
        ...start2026,
        salary: salary({ amount: 10, period: 'hour', payments: 12 }),
        contractHours: { weekly: null, annual: null },
      }),
      '2026-12-31',
    );
    expect(f.calculation[0]).toEqual(phrase('minimum_wage.pay.hours_unknown'));
    expect(f.id).toBe('smi_annual');
  });

  it('a short temporary contract says its days and not the yearly pay', () => {
    const f = contractFinding(
      contract({
        modality: 'production',
        startDate: day('2026-01-01'),
        signedOn: day('2026-01-01'),
        endDate: day('2026-02-28'),
        salary: salary({ amount: 60, period: 'day', payments: 12 }),
      }),
      '2026-12-31',
    );
    expect(f.id).toBe('smi_temporary_120');
    expect(f.calculation.map((p) => p.key)).toEqual([
      'minimum_wage.temporary.within',
      'minimum_wage.agreement_may_pay_more',
    ]);
    expect(f.sources.map((s) => s.id)).toEqual(['smi_temporary_120', 'rd126_2026']);
    expect(f.sources[1]?.citation.startsWith('art. 4.1 (')).toBe(true);
  });

  it('a part-time contract cites the yearly rule beside the pro rata one', () => {
    const f = contractFinding(
      contract({
        ...start2026,
        salary: yearly(20000),
        contractHours: { weekly: 20, annual: null },
      }),
      '2026-12-31',
    );
    expect(f.id).toBe('smi_prorata');
    expect(f.sources.map((s) => s.id)).toEqual(['smi_prorata', 'smi_annual', 'rd126_2026']);
  });

  it('a year not published cites the decree it is referred to, for a contract that starts in it', () => {
    const f = contractFinding(
      contract({
        startDate: day('2027-01-01'),
        signedOn: day('2027-01-01'),
        salary: yearly(20000),
      }),
      '2027-03-01',
    );
    expect(f.status).toBe('not_published');
    expect(f.sources.map((s) => s.id)).toEqual(['smi_annual', 'rd126_2026']);
  });

  it('a single year short has no total, and a contract over four years short has one', () => {
    const one = contractFinding(contract({ ...start2026, salary: yearly(16000) }), '2026-12-31');
    expect(one.calculation.map((p) => p.key)).not.toContain('minimum_wage.total');
    const four = contractFinding(
      contract({
        startDate: day('2023-01-01'),
        signedOn: day('2026-01-01'),
        salary: yearly(14000),
      }),
      '2026-12-31',
    );
    expect(four.amount).not.toBeNull();
    expect(four.calculation).toContainEqual(
      phrase('minimum_wage.total', { total: { euros: four.amount?.min ?? 0 } }),
    );
  });

  it('a fixed-discontinuous contract short says its idle periods and has no total', () => {
    const input = (modality: EmploymentInput['modality']) =>
      contract({
        modality,
        startDate: day('2025-01-01'),
        signedOn: day('2026-01-01'),
        salary: yearly(14000),
      });
    const f = contractFinding(input('discontinuous'), '2026-12-31');
    expect(f.calculation.map((p) => p.key)).toContain('minimum_wage.discontinuous_periods');
    expect(f.calculation.map((p) => p.key)).not.toContain('minimum_wage.total');
    expect(f.amount).toBeNull();
    expect(
      contractFinding(input('permanent'), '2026-12-31').calculation.map((p) => p.key),
    ).not.toContain('minimum_wage.discontinuous_periods');
  });

  it('a fixed-discontinuous contract within the minimum says nothing of idle periods', () => {
    const f = contractFinding(
      contract({
        modality: 'discontinuous',
        startDate: day('2025-01-01'),
        signedOn: day('2025-01-01'),
        salary: yearly(20000),
      }),
      '2026-12-31',
    );
    expect(f.calculation.map((p) => p.key)).not.toContain('minimum_wage.discontinuous_periods');
  });

  it('the first year of a decree with its effects unverified has no year before to show', () => {
    const table = changeYear(2023, { retroactiveVerified: false });
    const f = contractFinding(
      contract({
        startDate: day('2023-01-01'),
        signedOn: day('2023-01-01'),
        salary: yearly(15000),
      }),
      '2023-12-31',
      { ...DEPS, minimumWage: table },
    );
    expect(f.calculation).toContainEqual(
      phrase('minimum_wage.year.effects_unverified', {
        year: { integer: 2023 },
        minimum: { euros: 15120 },
        pay: { euros: 15000 },
      }),
    );
  });
});

describe('a payslip short of the minimum against its year', () => {
  const short = (month: string) => payslip({ month, salaryInMoney: 1200, proratedExtraPay: 200 });
  const fine = (month: string) => payslip({ month, salaryInMoney: 1300, proratedExtraPay: 200 });
  const monthsOf = (year: number, last: number) =>
    Array.from({ length: last }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const verdicts = (
    payslips: Payslip[],
    today: string,
    change: Partial<EmploymentInput> = {},
  ): string[] => {
    const input = contract({
      startDate: day('2025-01-01'),
      signedOn: day('2025-01-01'),
      salary: salary({ amount: 1400, prorated: true }),
      extraPays: { count: 2, prorated: true },
      payslips,
      ...change,
    });
    return single(byId(review(input, today), 'smi_monthly')).calculation.map((p) =>
      p.key.replace('minimum_wage.payslip.', ''),
    );
  };

  it('a later year is proven only by a short payslip in every whole month, December included', () => {
    expect(verdicts(monthsOf(2026, 12).map(short), '2027-01-15')).toEqual([
      ...Array<string>(12).fill('below'),
      'minimum_wage.total',
    ]);
    expect(verdicts(monthsOf(2026, 11).map(short), '2027-01-15')).toEqual(
      Array<string>(11).fill('annual_unproven'),
    );
  });

  it('a month that ends today is a whole month of the contract', () => {
    expect(verdicts([short('2026-01'), short('2026-02')], '2026-03-31')).toEqual([
      'annual_unproven',
      'annual_unproven',
    ]);
  });

  it('a month fine in the year is not a short one', () => {
    expect(verdicts([short('2026-01'), short('2026-02'), fine('2026-03')], '2026-03-31')).toEqual([
      'annual_unproven',
      'annual_unproven',
      'within',
    ]);
  });

  it('a year with no whole month yet is proven by nothing', () => {
    expect(verdicts([short('2026-01')], '2026-01-15')).toEqual(['annual_unproven']);
  });

  it('a year of the contract that reaches the minimum clears a short month, proven or not', () => {
    const input = {
      startDate: day('2026-01-01'),
      signedOn: day('2026-01-01'),
      salary: salary({ amount: 1500, prorated: true }),
    };
    expect(
      verdicts([short('2026-01'), short('2026-02'), short('2026-03')], '2026-03-31', input),
    ).toEqual(['annual_within', 'annual_within', 'annual_within']);
  });
});

describe('what the readings and the effects of a decree come to', () => {
  const start2026 = { startDate: day('2026-01-01'), signedOn: day('2026-01-01') };

  it('an hour rate over yearly hours that is within the minimum either way reads the effective hours', () => {
    const f = contractFinding(
      contract({
        ...start2026,
        salary: salary({ amount: 12, period: 'hour', payments: 12 }),
        contractHours: { weekly: null, annual: 1800 },
      }),
      '2026-12-31',
    );
    expect(f.calculation[0]).toEqual(
      phrase('minimum_wage.pay.hour', {
        hourly: { euros: 12 },
        hours: 1800,
        annual: { euros: 21600 },
      }),
    );
  });

  it('a training contract short says why it is not a sure shortfall', () => {
    const f = contractFinding(
      contract({ modality: 'training_alternance', ...start2026, salary: yearly(12000) }),
      '2026-12-31',
    );
    expect(f.calculation.map((p) => p.key)).toContain('minimum_wage.year.training_effective_work');
  });

  describe('a decree that took effect on the day the contract starts', () => {
    const table = changeYear(2026, { retroactiveVerified: false, publishedOn: '2026-03-01' });
    const verdictFrom = (startDate: string) =>
      compareByYear(
        contract({ startDate: day(startDate), salary: yearly(16800) }),
        day('2026-10-07'),
        table,
      )[0];

    it('is verified for that day and not for the day before', () => {
      expect(verdictFrom('2026-03-01')).toMatchObject({ verdict: 'below' });
      expect(verdictFrom('2026-02-28')).toMatchObject({ verdict: 'effects_unverified' });
    });

    it('is verified for a payslip of the month it was published in', () => {
      const short = (month: string) =>
        payslip({ month, salaryInMoney: 1150, proratedExtraPay: 200 });
      const input = contract({
        startDate: day('2026-01-01'),
        salary: salary({ prorated: true }),
        payslips: [short('2026-02'), short('2026-03')],
      });
      expect(comparePayslips(input, table).map((c) => c.verdict)).toEqual([
        'effects_unverified',
        'below',
      ]);
    });
  });

  it('cites when a decree’s end is uncertain', () => {
    const norms = {
      ...EMPLOYMENT_NORMS,
      rd126_2026: { ...EMPLOYMENT_NORMS.rd126_2026, endUncertainUntil: '2027-06-30' },
    };
    const sources = (deps: MinimumWageDeps) =>
      contractFinding(contract({ ...start2026, salary: yearly(20000) }), '2026-12-31', deps)
        .sources;
    expect(sources({ ...DEPS, norms }).at(-1)?.endUncertainUntil).toBe('2027-06-30');
    expect(sources(DEPS).at(-1)?.endUncertainUntil).toBeNull();
  });

  it('adds up the short months with their total, and only when there is more than one', () => {
    const short = (month: string) => payslip({ month, salaryInMoney: 1200, proratedExtraPay: 200 });
    const monthly = (...payslips: Payslip[]) =>
      single(
        byId(
          review(
            contract({
              startDate: day('2026-01-01'),
              signedOn: day('2026-01-01'),
              salary: salary({ amount: 1400, prorated: true }),
              extraPays: { count: 2, prorated: true },
              payslips,
            }),
            '2026-03-31',
          ),
          'smi_monthly',
        ),
      );
    expect(monthly(short('2026-01'), short('2026-02')).calculation.at(-1)).toEqual(
      phrase('minimum_wage.total', { total: { euros: 49 } }),
    );
    expect(monthly(short('2026-01')).calculation.map((p) => p.key)).not.toContain(
      'minimum_wage.total',
    );
  });
});
