import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import {
  assessMinimumWage,
  compareByYear,
  comparePayslips,
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

  it('follows each year from 2024 with an unchanged 15.876 € up to 07-10-2026', () => {
    const input = contract({ startDate: day('2024-03-01'), salary: yearly(15876) });
    const years = compareByYear(input, day('2026-10-07'), MINIMUM_WAGE);
    expect(years).toMatchObject([
      { kind: 'compared', year: 2024, verdict: 'within', shortfall: 0, accrued: 0 },
      { kind: 'compared', year: 2025, verdict: 'below', shortfall: 700, days: 365, accrued: 700 },
      // 1.218 € a year over the 280 days from 1 January to 7 October.
      {
        kind: 'compared',
        year: 2026,
        verdict: 'below',
        shortfall: 1218,
        days: 280,
        accrued: 934.36,
      },
    ]);
    const f = contractFinding(input, '2026-10-07');
    expect(f.amount).toEqual({ min: 1634.36, max: 1634.36 });
    expect(f.calculation.map((p) => p.key)).toContain('minimum_wage.total');
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

  it('carries an hour rate over the week times 52 when the week is known', () => {
    const hourly = salary({ amount: 9, period: 'hour', payments: 12 });
    // Yearly hours are ignored next to a week: 9 € × 40 h × 52 = 18.720 €.
    const input = contract({
      ...start,
      salary: hourly,
      contractHours: { weekly: 40, annual: 1800 },
    });
    expect(compareByYear(input, day('2026-12-31'), MINIMUM_WAGE)[0]).toMatchObject({
      pay: 18720,
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
    const f = contractFinding(input, '2027-03-01', deps);
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

  it('adds up the short prorated months', () => {
    const input = proratedTwo(
      payslip({ month: '2026-09', salaryInMoney: 1200, proratedExtraPay: 200 }),
      payslip({ month: '2026-10', salaryInMoney: 1150, proratedExtraPay: 200 }),
      payslip({ month: '2026-11', salaryInMoney: 500, incidents: true }),
    );
    const f = single(byId(review(input, '2026-11-30'), 'smi_monthly'));
    // 24,50 € and 74,50 €.
    expect(f).toMatchObject({ status: 'below_minimum', amount: { min: 99, max: 99 } });
    expect(f.calculation.map((p) => p.key)).toEqual([
      'minimum_wage.payslip.below',
      'minimum_wage.payslip.below',
      'minimum_wage.payslip.not_compared',
      'minimum_wage.total',
    ]);
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

  it('reads a breakdown short of the total as a complement of unknown kind', () => {
    // 1.300 € a month with only 1.100 € of base listed: 18.200 € or 15.400 € a year.
    const input = contract({
      ...start,
      salary: salary({ amount: 1300, breakdown: [{ kind: 'base', amount: 1100 }] }),
    });
    const [assessed] = review(input, '2026-12-31');
    expect(assessed?.kind).toBe('readings');
    if (assessed?.kind !== 'readings') return;
    expect(assessed.readings.map((r) => r.finding.status)).toEqual([
      'within_limit',
      'below_minimum',
    ]);
    expect(assessed.readings[0]?.finding.calculation).toContainEqual({
      key: 'minimum_wage.breakdown_gap',
      vars: { gap: { euros: 200 } },
    });
    expect(offerPass([assessed])).toBe(false);
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
