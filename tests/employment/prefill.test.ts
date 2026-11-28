import { describe, expect, it } from 'vitest';
import type {
  Confidence,
  EmploymentExtraction,
  ExtractedRow,
  ExtractedValue,
  FailedCheck,
  SourceKind,
} from '../../src/documents/contract';
import { employmentPrefill } from '../../src/employment/prefill';
import { ROW_MAX, type RowList } from '../../src/employment/rows';
import { MINIMUM_WAGE } from '../../src/engine/employment/data/minimum-wage';
import { EMPLOYMENT_NORMS } from '../../src/engine/employment/data/norms';
import { assessHolidaysAndPay } from '../../src/engine/employment/holidays-pay';
import type { EmploymentInput } from '../../src/engine/employment/types';
import { contract as engineInput } from '../engine/employment/input';
import { tr } from './fixtures';

const f = (
  value: ExtractedValue,
  confidence: Confidence = 'high',
  source: SourceKind = 'employment_contract',
) => ({ value, confidence, source });
const row = (
  values: Record<string, ExtractedValue>,
  confidence: Confidence = 'high',
): ExtractedRow => ({ values, confidence });

const none = {
  salaryParts: [],
  clauses: [],
  information: [],
  relationshipHints: [],
  payslips: [],
  lines: [],
  contracts: [],
};

const extraction = (e: Partial<EmploymentExtraction>): EmploymentExtraction => ({
  pages: [],
  documents: [{ kind: 'employment_contract', pages: 2 }],
  fields: {},
  conflicts: [],
  ...none,
  ...e,
});

const prefill = (
  e: Partial<EmploymentExtraction>,
  checks: readonly FailedCheck[] = [],
  answers: Record<string, string> = {},
) => employmentPrefill(extraction(e), answers, tr, checks);

type Prefill = ReturnType<typeof prefill>;
type Fields = EmploymentExtraction['fields'];
const nthMonth = (i: number) =>
  `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const rows = (n: number, values: (i: number) => Record<string, ExtractedValue>) =>
  Array.from({ length: n }, (_, i) => row(values(i)));
const without = (fields: Fields, ...names: (keyof Fields)[]): Fields =>
  Object.fromEntries(Object.entries(fields).filter(([n]) => !names.includes(n as keyof Fields)));
const entry = (p: Prefill, name: string) => p.entries.find(([n]) => n === name)?.[1];
const mark = (p: Prefill, id: string) => p.marks.find((m) => m.id === id);

// A synthetic fixed-term contract with a fictitious company: 1.400 € a month in 14 payments.
const contract: EmploymentExtraction['fields'] = {
  employerType: f('company'),
  companyName: f('Talleres Ficticios del Norte, S.L.'),
  signedOn: f('2025-03-28'),
  startDate: f('2025-04-01'),
  endDate: f('2025-12-31'),
  modalityText: f('Contrato de duración determinada por circunstancias de la producción'),
  modality: f('production'),
  partTime: f(false),
  causeText: f('Aumento de pedidos por la campaña de otoño de la línea de montaje.'),
  category: f('Oficial de segunda'),
  agreementName: f('Convenio colectivo ficticio del metal'),
  agreementCode: f('99000000011999'),
  salaryAmount: f(1400),
  salaryPeriod: f('month'),
  payments: f(14),
  prorated: f(false),
  weeklyHours: f(40),
  scheduleText: f('De lunes a viernes, de 8:00 a 16:00.'),
  shifts: f(false),
  night: f(false),
  overtimeAgreed: f('none'),
  holidayDays: f(30),
  holidayUnit: f('calendar'),
  trialAmount: f(1),
  trialUnit: f('months'),
};

describe('the contract', () => {
  const build = () => prefill({ fields: contract });

  it('fills the dates, the modality and the salary, each marked as read', () => {
    const p = build();
    expect(entry(p, 'startDate')).toBe('2025-04-01');
    expect(entry(p, 'signedOn')).toBe('2025-03-28');
    expect(entry(p, 'endDate')).toBe('2025-12-31');
    expect(entry(p, 'modality')).toBe('production');
    expect(entry(p, 'salaryAmount')).toBe('1.400,00');
    expect(entry(p, 'salaryPeriod')).toBe('month');
    expect(mark(p, 'salaryAmount')).toEqual({
      id: 'salaryAmount',
      container: '[data-field="salaryAmount"]',
      confidence: 'high',
    });
  });

  it('counts the extra pays out of the payments a year, as worked out', () => {
    const p = build();
    expect(entry(p, 'extraPays')).toBe('2');
    expect(mark(p, 'extraPays')?.derived).toBe(true);
    expect(entry(p, 'extraProrated')).toBe('no');
  });

  it('answers the yes/no questions the contract answers', () => {
    const p = build();
    expect(entry(p, 'isPartTime')).toBe('no');
    expect(entry(p, 'shifts')).toBe('no');
    expect(entry(p, 'nightWorker')).toBe('no');
    expect(entry(p, 'hasOvertime')).toBe('no');
    expect(entry(p, 'hasTrial')).toBe('yes');
    expect(entry(p, 'trialAmount')).toBe('1,00');
    expect(entry(p, 'trialUnit')).toBe('months');
    expect(entry(p, 'hasHolidays')).toBe('yes');
    expect(entry(p, 'holidayUnit')).toBe('calendar');
    expect(entry(p, 'agreementNamed')).toBe('yes');
  });

  it('preselects the common relationship, less surely, when the contract names no other', () => {
    const p = build();
    expect(entry(p, 'relationship')).toBe('common');
    expect(mark(p, 'relationship')).toMatchObject({ confidence: 'medium', derived: true });
    expect(entry(p, 'viaTempAgency')).toBe('no');
    expect(entry(p, 'relief')).toBe('no');
    expect(entry(p, 'writtenContract')).toBe('yes');
    expect(entry(p, 'under18')).toBeUndefined();
    for (const name of ['viaTempAgency', 'relief'])
      expect(mark(p, name)).toMatchObject({ confidence: 'medium', derived: true });
    expect(mark(p, 'writtenContract')).toMatchObject({ confidence: 'high', derived: true });
  });

  it('never answers whether the cause is explained: it quotes it beside the question', () => {
    const p = build();
    // Even when the reading labels a replacement's cause as stated.
    const q = prefill({ fields: { ...contract, replacementCauseStated: f(true) } });
    for (const field of ['causeStated', 'circumstancesStated', 'replacementCauseStated'])
      expect(entry(q, field)).toBeUndefined();
    expect(p.quotes).toEqual({
      modality: 'Contrato de duración determinada por circunstancias de la producción',
      causeStated: 'Aumento de pedidos por la campaña de otoño de la línea de montaje.',
      replacementCauseStated: 'Aumento de pedidos por la campaña de otoño de la línea de montaje.',
      agreementNamed: 'Convenio colectivo ficticio del metal (código 99000000011999)',
      categorySalary: 'Oficial de segunda',
      hasSchedule: 'De lunes a viernes, de 8:00 a 16:00.',
    });
  });

  it('twelve payments with the extras prorated leave the extras to the person, and say so', () => {
    const q = prefill({ fields: { ...contract, payments: f(12), prorated: f(true) } });
    expect(entry(q, 'extraPays')).toBeUndefined();
    expect(entry(q, 'extraProrated')).toBeUndefined();
    expect(q.notes).toContain(tr('client.employment.documents.extras_in_twelve'));
    // What a derived 0 would have told on a low salary: no extra pays at all, below the legal
    // minimum, when the two the contract prorates are within it.
    const low = { ...engineInput().salary, amount: 1200, payments: 12 };
    const extraPays = (pays: EmploymentInput['extraPays']) =>
      assessHolidaysAndPay(
        engineInput({ extraPays: pays, salary: { ...low, prorated: pays?.prorated ?? false } }),
        EMPLOYMENT_NORMS,
        MINIMUM_WAGE,
      )
        .flatMap((a) => (a.kind === 'single' ? [a.finding] : []))
        .find((f) => f.id === 'extra_pays')
        ?.calculation.map((p) => p.key);
    expect(extraPays({ count: 0, prorated: false })).toContain('extra_pays.none_below_minimum');
    expect(extraPays({ count: 2, prorated: true })).not.toContain('extra_pays.none_below_minimum');
  });

  const part = (kind: string, amount: ExtractedValue) => row({ concept: 'Parte', amount, kind });
  const annual = { ...without(contract, 'salaryAmount'), annualSalaryAmount: f(19600) };
  it.each([
    [
      'a lone part of unknown kind that is the whole salary',
      contract,
      [part('unknown', 1400)],
      false,
    ],
    ['that part against the annual salary', annual, [part('unknown', 19600)], false],
    [
      'a lone part of unknown kind that is not the whole salary',
      contract,
      [part('unknown', 200)],
      true,
    ],
    ['a lone part of known kind that is the whole salary', contract, [part('base', 1400)], true],
    [
      'two parts of unknown kind, each the whole salary',
      contract,
      [part('unknown', 1400), part('unknown', 1400)],
      true,
    ],
    [
      'two parts, one of them the whole salary',
      contract,
      [part('unknown', 1400), part('base', 1400)],
      true,
    ],
    [
      'one valid part among invalid ones',
      contract,
      [part('bogus', 1400), part('base', 'x'), part('unknown', 1400)],
      false,
    ],
  ])('%s', (_, fields, parts, breakdown) => {
    const p = prefill({ fields, salaryParts: parts });
    expect(entry(p, 'hasBreakdown')).toBe(breakdown ? 'yes' : undefined);
  });

  it('keeps the valid parts, in order, and drops those with no kind or amount the form takes', () => {
    const p = prefill({
      fields: contract,
      salaryParts: [
        part('bogus', 100),
        part('base', 'x'),
        part('base', 1200),
        part('variable', 50),
      ],
    });
    expect(p.entries.filter(([n]) => n.startsWith('parts.'))).toEqual([
      ['parts.0.kind', 'base'],
      ['parts.0.amount', '1.200,00'],
      ['parts.1.kind', 'variable'],
      ['parts.1.amount', '50,00'],
    ]);
  });

  it('enters the salary period once when only the annual salary comes', () => {
    const q = prefill({
      fields: { ...without(contract, 'salaryAmount'), annualSalaryAmount: f(19600) },
    });
    expect(q.entries.filter(([n]) => n === 'salaryPeriod')).toEqual([['salaryPeriod', 'year']]);
  });

  it('works out the end from a duration in months when no end is printed', () => {
    const q = prefill({ fields: { ...without(contract, 'endDate'), durationMonths: f(6) } });
    expect(entry(q, 'endDate')).toBe('2025-09-30');
    expect(mark(q, 'endDate')).toMatchObject({ confidence: 'medium', derived: true });
  });

  it('takes the working week for working holiday days from a schedule «de lunes a viernes»', () => {
    const p = build();
    const q = prefill({ fields: { ...contract, holidayDays: f(22), holidayUnit: f('working') } });
    expect(entry(q, 'workDaysPerWeek')).toBe('5');
    expect(mark(q, 'workDaysPerWeek')).toMatchObject({ derived: true, confidence: 'medium' });
    expect(entry(p, 'workDaysPerWeek')).toBeUndefined();
  });

  it('says when the holidays come without their unit', () => {
    expect(prefill({ fields: without(contract, 'holidayUnit') }).notes).toContain(
      tr('client.documents.holiday_unit'),
    );
  });

  it('takes the annual salary when no other is printed', () => {
    const q = prefill({
      fields: {
        ...without(contract, 'salaryAmount', 'salaryPeriod'),
        annualSalaryAmount: f(19600),
      },
    });
    expect(entry(q, 'salaryAmount')).toBe('19.600,00');
    expect(entry(q, 'salaryPeriod')).toBe('year');
  });

  it('fills the salary parts, the clauses with their words and the information elements', () => {
    const q = prefill({
      fields: contract,
      salaryParts: [
        row({ concept: 'Salario base', amount: 1200, kind: 'base' }),
        row({ amount: 200, kind: 'fixed_complement' }, 'medium'),
      ],
      clauses: [
        row({
          label: 'non_compete',
          literal: 'Durante un año tras el fin del contrato no trabajarás para la competencia.',
          months: 12,
          compensationStated: false,
        }),
      ],
      information: [
        row({ element: 'a', presence: 'present' }),
        row({ element: 'k', presence: 'absent' }),
      ],
    });
    expect(entry(q, 'hasBreakdown')).toBe('yes');
    expect(entry(q, 'parts.1.kind')).toBe('fixed_complement');
    expect(entry(q, 'parts.1.amount')).toBe('200,00');
    expect(entry(q, 'hasClauses')).toBe('yes');
    expect(entry(q, 'clauses.0.label')).toBe('non_compete');
    expect(entry(q, 'clauses.0.months')).toBe('12');
    expect(entry(q, 'clauses.0.compensation')).toBe('no');
    expect(entry(q, 'clauses.0.text')).toBe(
      'Durante un año tras el fin del contrato no trabajarás para la competencia.',
    );
    expect(entry(q, 'info_a')).toBe('present');
    expect(entry(q, 'info_k')).toBe('absent');
  });
});

describe('the relationship', () => {
  it('preselects a special relationship the contract names; the gate acts on it as typed', () => {
    const p = prefill({ relationshipHints: [row({ hint: 'household' }, 'medium')] });
    expect(entry(p, 'relationship')).toBe('household');
    expect(mark(p, 'relationship')).toMatchObject({ confidence: 'medium' });
    expect(entry(p, 'viaTempAgency')).toBeUndefined();
  });
  it('a temporary work agency or a relief contract is a yes to its question', () => {
    const p = prefill({ relationshipHints: [row({ hint: 'temp_agency' }, 'medium')] });
    expect(entry(p, 'relationship')).toBe('common');
    expect(entry(p, 'viaTempAgency')).toBe('yes');
    expect(mark(p, 'viaTempAgency')?.confidence).toBe('medium');
    expect(entry(p, 'relief')).toBe('no');
    const relief = prefill({ relationshipHints: [row({ hint: 'relief' })] });
    expect(entry(relief, 'relief')).toBe('yes');
    expect(entry(relief, 'viaTempAgency')).toBe('no');
  });
  it('a hint that is no string, the common one or none of the relationships preselects nothing special', () => {
    const p = prefill({
      relationshipHints: [row({ hint: 5 }), row({ hint: 'common' }), row({ hint: 'bogus' })],
    });
    expect(entry(p, 'relationship')).toBe('common');
    expect(mark(p, 'relationship')).toMatchObject({ confidence: 'medium', derived: true });
    expect(entry(p, 'viaTempAgency')).toBe('no');
  });
  it('two special relationships keep the first, at low confidence', () => {
    const p = prefill({ relationshipHints: [row({ hint: 'artist' }), row({ hint: 'sport' })] });
    expect(entry(p, 'relationship')).toBe('artist');
    expect(mark(p, 'relationship')?.confidence).toBe('low');
  });
  it('without a contract nothing about the relationship is preselected', () => {
    const p = prefill({ documents: [{ kind: 'payslip', pages: 1, month: '2025-05' }] });
    expect(entry(p, 'relationship')).toBeUndefined();
    expect(entry(p, 'writtenContract')).toBeUndefined();
  });
});

describe('the payslips', () => {
  const slips = [
    row({ month: '2025-05', periodStart: '2025-05-01', periodEnd: '2025-05-31', incidents: false }),
    row({ month: '2025-06', daysWorked: 30, incidents: true }, 'medium'),
  ];
  const lines = [
    row({ month: '2025-05', concept: 'Salario base', amount: 1200, category: 'salary' }),
    row({ month: '2025-05', concept: 'Plus convenio', amount: 200, category: 'fixed_complement' }),
    row({ month: '2025-05', concept: 'Horas extra', amount: 90, category: 'overtime' }),
    row({ month: '2025-05', concept: 'Dietas', amount: 40, category: 'expenses' }),
    // A concept the API dropped as special-category data: its amount still counts.
    row({ month: '2025-06', amount: 1400, category: 'salary' }),
    row({
      month: '2025-06',
      concept: 'Prorrata pagas',
      amount: 233.33,
      category: 'prorated_extra_pay',
    }),
    row({ month: '2025-06', concept: 'Incentivos', amount: 120.5, category: 'variable' }),
  ];
  const build = () => prefill({ payslips: slips, lines });

  it('sums each month’s salary in money from its base and fixed complements', () => {
    const p = build();
    expect(entry(p, 'hasPayslips')).toBe('yes');
    expect(entry(p, 'payslips.0.month')).toBe('2025-05');
    expect(entry(p, 'payslips.0.salary')).toBe('1.400,00');
    expect(mark(p, 'payslips.0.salary')).toMatchObject({ derived: true, confidence: 'high' });
    expect(entry(p, 'payslips.0.prorated')).toBeUndefined();
    expect(entry(p, 'payslips.1.salary')).toBe('1.400,00');
    expect(entry(p, 'payslips.1.prorated')).toBe('233,33');
    expect(mark(p, 'payslips.1.salary')?.confidence).toBe('medium');
  });

  it('a prorated share of the extra pays answers that they are prorated, as worked out', () => {
    const p = build();
    expect(entry(p, 'extraProrated')).toBe('yes');
    expect(mark(p, 'extraProrated')).toMatchObject({ derived: true, confidence: 'medium' });
    const prorated = lines.filter((l) => l.values['category'] === 'prorated_extra_pay');
    expect(entry(prefill({ fields: contract, payslips: slips, lines }), 'extraProrated')).toBe(
      'no',
    );
    expect(
      entry(
        prefill({ payslips: slips, lines: lines.filter((l) => !prorated.includes(l)) }),
        'extraProrated',
      ),
    ).toBeUndefined();
  });

  it('nets a negative line against the one it offsets, such as meal vouchers', () => {
    const vouchers = [
      row({ month: '2025-05', concept: 'Salario base', amount: 1400, category: 'salary' }),
      row({ month: '2025-05', concept: 'Ticket Restaurant', amount: 216.32, category: 'in_kind' }),
      row({ month: '2025-05', concept: 'Pago Ticket', amount: -216.32, category: 'in_kind' }),
    ];
    const q = prefill({ payslips: slips.slice(0, 1), lines: vouchers });
    expect(entry(q, 'payslips.0.salary')).toBe('1.400,00');
    expect(entry(q, 'payslips.0.inKind')).toBeUndefined();
  });

  it('says which lines it left out', () => {
    const p = build();
    expect(p.notes).toContain(
      tr('client.employment.documents.lines_left_out', {
        lineas: 'incentivos y otros pluses variables, horas extra, dietas y gastos',
      }),
    );
  });

  it('reads the whole month from the period, or less surely from the days paid', () => {
    const p = build();
    expect(entry(p, 'payslips.0.wholeMonth')).toBe('yes');
    expect(mark(p, 'payslips.0.wholeMonth')?.derived).toBeUndefined();
    expect(entry(p, 'payslips.1.wholeMonth')).toBe('yes');
    expect(mark(p, 'payslips.1.wholeMonth')).toMatchObject({ derived: true, confidence: 'medium' });
  });

  it.each([
    ['2025-02', 30, 'yes'],
    ['2025-02', 28, undefined],
    ['2024-02', 29, undefined],
    ['2025-02', 20, 'no'],
    ['2025-06', 30, 'yes'],
    ['2025-06', 29, 'no'],
    ['2025-05', 31, 'yes'],
    ['2025-05', 30, undefined],
    ['2025-05', 25, 'no'],
  ])('%s with %i days paid reads whole as %s', (month, days, whole) => {
    const q = prefill({ payslips: [row({ month, daysWorked: days })] });
    expect(entry(q, 'payslips.0.wholeMonth')).toBe(whole);
    expect(mark(q, 'payslips.0.wholeMonth')?.derived).toBe(whole === undefined ? undefined : true);
  });

  it.each([
    ['from the first day to the last', '2025-05-01', '2025-05-31', 'yes'],
    ['from the second day', '2025-05-02', '2025-05-31', 'no'],
    ['to the day before the last', '2025-05-01', '2025-05-30', 'no'],
  ])('a period %s', (_, periodStart, periodEnd, whole) => {
    const q = prefill({ payslips: [row({ month: '2025-05', periodStart, periodEnd })] });
    expect(entry(q, 'payslips.0.wholeMonth')).toBe(whole);
  });

  it('a period with only one end printed falls back on the days paid', () => {
    const q = prefill({
      payslips: [row({ month: '2025-06', periodStart: '2025-06-01', daysWorked: 30 })],
    });
    expect(mark(q, 'payslips.0.wholeMonth')).toMatchObject({ derived: true });
    expect(entry(q, 'payslips.0.wholeMonth')).toBe('yes');
  });

  it('a payslip with neither period nor days says nothing about the whole month', () => {
    const q = prefill({ documents: [], payslips: [row({ month: '2025-05' })] });
    expect(q.entries).toEqual([
      ['hasPayslips', 'yes'],
      ['payslips.0.month', '2025-05'],
    ]);
  });

  it('passes on whether a payslip shows an incident', () => {
    const p = build();
    expect(entry(p, 'payslips.0.incidents')).toBe('no');
    expect(entry(p, 'payslips.1.incidents')).toBe('yes');
  });

  it('a period short of the month is no whole month', () => {
    const q = prefill({
      payslips: [row({ month: '2025-05', periodStart: '2025-05-12', periodEnd: '2025-05-31' })],
    });
    expect(entry(q, 'payslips.0.wholeMonth')).toBe('no');
  });

  it('lines that do not add up to the total leave every sum in doubt, and it is said', () => {
    const q = prefill({ payslips: slips, lines }, ['payslip_lines_do_not_sum']);
    expect(mark(q, 'payslips.0.salary')?.confidence).toBe('low');
    expect(q.notes).toContain(tr('client.employment.documents.check.payslip_lines_do_not_sum'));
  });

  it('lines cut to the most recent rows leave the earliest month’s salary to the person', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      row({ month: i < 5 ? '2025-01' : '2025-02', amount: 20, category: 'salary' }),
    );
    const q = prefill({ lines: many, truncated: true });
    expect(entry(q, 'payslips.0.month')).toBe('2025-01');
    expect(entry(q, 'payslips.0.salary')).toBeUndefined();
    expect(mark(q, 'payslips.1.salary')?.confidence).toBe('high');
    expect(q.notes).toContain(tr('client.employment.documents.cut.lines', { n: 60 }));
    expect(q.notes).toContain(tr('client.employment.documents.payslip_partial'));
  });

  it('a cut no list shows may be in the lines too', () => {
    const q = prefill({ payslips: slips, lines, truncated: true });
    expect(entry(q, 'payslips.0.salary')).toBeUndefined();
    expect(entry(q, 'payslips.1.salary')).toBe('1.400,00');
  });

  it('says nothing of lines it summed, or of lines cut, when none were left', () => {
    const { notes } = build();
    expect(notes).not.toContain(tr('client.employment.documents.payslip_no_lines'));
    expect(notes).not.toContain(tr('client.employment.documents.payslip_partial'));
  });

  it('ignores lines with no month, amount or category the form takes', () => {
    const salary = { month: '2025-05', amount: 100, category: 'salary' };
    const q = prefill({
      lines: [
        row({ ...salary, month: '2025-13' }),
        row({ ...salary, month: '2025-04', amount: '100' }),
        row({ ...salary, month: '2025-03', category: 5 }),
        row({ ...salary, month: '2025-02', category: 'bogus' }),
        row(salary),
      ],
    });
    expect(q.entries.filter(([n]) => n.endsWith('.month'))).toEqual([
      ['payslips.0.month', '2025-05'],
    ]);
    expect(q.notes).toEqual([]);
  });

  it('sums pay in kind, apart from salary, and in cents', () => {
    const q = prefill({
      lines: [
        row({ month: '2025-05', amount: 1000.1, category: 'salary' }),
        row({ month: '2025-05', amount: 0.2, category: 'salary' }),
        row({ month: '2025-05', amount: 100, category: 'in_kind' }),
        row({ month: '2025-05', amount: 50.5, category: 'in_kind' }),
      ],
    });
    expect(entry(q, 'payslips.0.salary')).toBe('1.000,30');
    expect(entry(q, 'payslips.0.inKind')).toBe('150,50');
    expect(mark(q, 'payslips.0.inKind')).toMatchObject({ derived: true });
  });

  it('lists the months in order, however the payslips and lines come', () => {
    const q = prefill({
      payslips: [row({ month: '2025-07' }), row({ month: '2025-05' })],
      lines: [row({ month: '2025-06', amount: 100, category: 'salary' })],
    });
    expect(q.entries.filter(([n]) => n.endsWith('.month'))).toEqual([
      ['payslips.0.month', '2025-05'],
      ['payslips.1.month', '2025-06'],
      ['payslips.2.month', '2025-07'],
    ]);
  });

  it('leaves the earliest month to the person when lines come cut, whatever their order', () => {
    const line = (month: string) => row({ month, amount: 100, category: 'salary' });
    const q = prefill({
      lines: [line('2025-03'), line('2025-01'), line('2025-02')],
      truncated: true,
    });
    expect(entry(q, 'payslips.0.salary')).toBeUndefined();
    expect(entry(q, 'payslips.1.salary')).toBe('100,00');
    expect(entry(q, 'payslips.2.salary')).toBe('100,00');
  });

  it.each([
    ['a payslip alone', [row({ month: '2025-05' }, 'low')], [], 'low'],
    [
      'lines alone',
      [],
      [row({ month: '2025-05', amount: 1, category: 'salary' }, 'medium')],
      'medium',
    ],
    [
      'both, the payslip’s read',
      [row({ month: '2025-05' }, 'medium')],
      [row({ month: '2025-05', amount: 1, category: 'salary' }, 'low')],
      'medium',
    ],
  ])('the month of %s is as sure as what it was read from', (_, payslips, lines, confidence) => {
    expect(mark(prefill({ payslips, lines }), 'payslips.0.month')?.confidence).toBe(confidence);
  });

  it.each([
    ['payslip', 'medium', 'high', 'medium'],
    ['lines', 'high', 'medium', 'medium'],
    ['both', 'low', 'medium', 'low'],
  ])('a salary summed is as sure as the least sure of %s', (_, slip, line, confidence) => {
    const q = prefill({
      payslips: [row({ month: '2025-05' }, slip as Confidence)],
      lines: [row({ month: '2025-05', amount: 1, category: 'salary' }, line as Confidence)],
    });
    expect(mark(q, 'payslips.0.salary')?.confidence).toBe(confidence);
  });

  it('a month of lines that sum to no salary leaves it to the person, and says so', () => {
    const q = prefill({
      lines: [
        row({ month: '2025-05', amount: 100, category: 'in_kind' }),
        row({ month: '2025-05', amount: 233.33, category: 'prorated_extra_pay' }),
      ],
    });
    expect(entry(q, 'payslips.0.salary')).toBeUndefined();
    expect(entry(q, 'payslips.0.prorated')).toBeUndefined();
    expect(q.notes).toContain(tr('client.employment.documents.payslip_no_lines'));
  });

  it('the extra pays are prorated as surely as the least sure month that prorates them', () => {
    const month = (m: string, confidence: Confidence) => [
      row({ month: m, amount: 1400, category: 'salary' }),
      row({ month: m, amount: 233.33, category: 'prorated_extra_pay' }, confidence),
    ];
    const q = prefill({ lines: [...month('2025-05', 'low'), ...month('2025-06', 'high')] });
    expect(mark(q, 'extraProrated')?.confidence).toBe('low');
    expect(mark(q, 'payslips.0.prorated')).toMatchObject({ derived: true });
    const r = prefill({ lines: [...month('2025-05', 'high'), ...month('2025-06', 'medium')] });
    expect(mark(r, 'extraProrated')?.confidence).toBe('medium');
  });

  it('a cut that leaves the lines’ month beyond the sheet’s rows is not said of any listed month', () => {
    const early = Array.from({ length: ROW_MAX.payslips }, (_, i) => row({ month: nthMonth(i) }));
    const q = prefill({
      payslips: early,
      lines: [row({ month: '2030-01', amount: 100, category: 'salary' })],
      truncated: true,
    });
    expect(q.notes).not.toContain(tr('client.employment.documents.payslip_partial'));
  });

  it('a payslip without lines leaves its salary to the person, and says so', () => {
    const q = prefill({ payslips: [row({ month: '2025-07', incidents: false })] });
    expect(entry(q, 'payslips.0.salary')).toBeUndefined();
    expect(q.notes).toContain(tr('client.employment.documents.payslip_no_lines'));
  });
});

describe('the work history', () => {
  const company = (
    start: string,
    end: string | null,
    name: string | null,
    code: string | null,
  ): ExtractedRow =>
    row({
      startDate: start,
      ...(end && { endDate: end }),
      employerType: 'company',
      ...(name && { employerName: name }),
      ...(code && { accountCode: code }),
    });
  const contracts = [
    company('2025-04-01', null, 'TALLERES FICTICIOS DEL NORTE SL', '48 1234567 89'),
    company('2024-09-01', '2024-12-31', 'Otra Empresa Inventada, S.A.', '28 7654321 00'),
    company('2024-03-01', '2024-06-30', null, '48/1234567/89'),
    company('2023-01-10', '2023-02-28', 'Talleres Ficticios del Norte', null),
    row({ startDate: '2022-05-01', endDate: '2022-08-31', employerType: 'person' }),
  ];
  const build = () => prefill({ fields: contract, contracts });

  it('lists every row, the contract’s own with the contract’s end, and no kind', () => {
    const p = build();
    expect(entry(p, 'hasHistory')).toBe('yes');
    expect(entry(p, 'history.0.startDate')).toBe('2025-04-01');
    expect(entry(p, 'history.0.endDate')).toBe('2025-12-31');
    expect(mark(p, 'history.0.endDate')?.derived).toBe(true);
    expect(entry(p, 'history.1.endDate')).toBe('2024-12-31');
    expect(mark(p, 'history.1.endDate')?.derived).toBeUndefined();
    expect(entry(p, 'history.4.startDate')).toBe('2022-05-01');
    expect(p.entries.some(([n]) => n.endsWith('.kind'))).toBe(false);
  });

  it('proposes «misma empresa» by account code or name, and «otra» when both differ', () => {
    const p = build();
    expect(entry(p, 'history.0.employer')).toBe('same');
    expect(mark(p, 'history.0.employer')).toMatchObject({ confidence: 'high', derived: true });
    expect(entry(p, 'history.1.employer')).toBe('other');
    expect(entry(p, 'history.2.employer')).toBe('same');
    expect(entry(p, 'history.3.employer')).toBe('same');
    expect(mark(p, 'history.3.employer')).toMatchObject({ confidence: 'medium', derived: true });
    // A household employer's name is never sent, so there is nothing to compare.
    expect(entry(p, 'history.4.employer')).toBeUndefined();
  });

  it('a whole history is not marked incomplete', () => {
    const p = build();
    expect(entry(p, 'historyIncomplete')).toBeUndefined();
  });

  it('a history cut to its most recent rows is marked incomplete, and it is said', () => {
    const fifteen = Array.from({ length: 15 }, (_, i) =>
      company(`20${10 + i}-01-01`, `20${10 + i}-03-31`, 'Otra Empresa Inventada, S.A.', null),
    );
    const q = prefill({ fields: contract, contracts: fifteen, truncated: true });
    expect(entry(q, 'historyIncomplete')).toBe('yes');
    expect(mark(q, 'historyIncomplete')).toMatchObject({ confidence: 'high', derived: true });
    expect(q.notes).toContain(tr('client.employment.documents.cut.contracts', { n: 15 }));
    expect(q.notes).not.toContain(tr('client.employment.documents.cut.unknown'));
  });

  it('a cut no list shows is taken to touch the history too, and said in general', () => {
    const q = prefill({ fields: contract, contracts, truncated: true });
    expect(entry(q, 'historyIncomplete')).toBe('yes');
    expect(q.notes).toContain(tr('client.employment.documents.cut.unknown'));
  });

  it('any cut marks a read history incomplete, even one another list shows', () => {
    const six = Array.from({ length: 6 }, (_, i) => row({ month: `2025-0${i + 1}` }));
    const q = prefill({ fields: contract, contracts, payslips: six, truncated: true });
    expect(entry(q, 'historyIncomplete')).toBe('yes');
    expect(q.notes).toContain(tr('client.employment.documents.cut.payslips', { n: 6 }));
  });

  it('a history cut at 15 with one row dropped by the API is still incomplete beside full lines', () => {
    const sixty = Array.from({ length: 60 }, () =>
      row({ month: '2025-05', amount: 20, category: 'salary' }),
    );
    const fourteen = Array.from({ length: 14 }, (_, i) =>
      company(`20${10 + i}-01-01`, `20${10 + i}-03-31`, 'Otra Empresa Inventada, S.A.', null),
    );
    const q = prefill({ fields: contract, contracts: fourteen, lines: sixty, truncated: true });
    expect(entry(q, 'historyIncomplete')).toBe('yes');
  });

  it('a contract still running takes the end worked out from its duration', () => {
    const q = prefill({
      fields: { ...without(contract, 'endDate'), durationMonths: f(6) },
      contracts: [company('2025-04-01', null, null, '48 1234567 89')],
    });
    expect(entry(q, 'history.0.endDate')).toBe('2025-09-30');
  });
});

describe('the offer', () => {
  it('fills the offer sheet beside the contract', () => {
    const p = prefill({
      fields: {
        offerSalaryAmount: f(22000, 'high', 'job_offer'),
        offerSalaryPeriod: f('year', 'high', 'job_offer'),
        offerNet: f(false, 'high', 'job_offer'),
        offerWeeklyHours: f(37.5, 'high', 'job_offer'),
        offerModality: f('permanent', 'high', 'job_offer'),
        offerRemote: f('hybrid', 'medium', 'job_offer'),
      },
    });
    expect(entry(p, 'hasOffer')).toBe('yes');
    expect(entry(p, 'offerGross')).toBe('22.000,00');
    expect(entry(p, 'offerNet')).toBe('no');
    expect(entry(p, 'offerHours')).toBe('37,50');
    expect(entry(p, 'offerModality')).toBe('permanent');
    expect(entry(p, 'offerRemote')).toBe('hybrid');
  });
  it('a salary by the month is not turned into a year: it is said', () => {
    const p = prefill({
      fields: {
        offerSalaryAmount: f(1600, 'high', 'job_offer'),
        offerSalaryPeriod: f('month', 'high', 'job_offer'),
      },
    });
    expect(entry(p, 'offerGross')).toBeUndefined();
    expect(p.notes).toContain(tr('client.employment.documents.offer_period'));
  });
});

describe('what the documents disagree on and the API’s checks', () => {
  it('says the category differs between the contract and a payslip', () => {
    const p = prefill({
      fields: contract,
      conflicts: [{ field: 'category', sources: ['employment_contract', 'payslip'] }],
    });
    expect(p.notes).toContain(tr('client.employment.documents.conflict.category'));
  });
  it('words each employment check in its own words, and no other', () => {
    const p = prefill({ fields: contract }, [
      'end_before_start',
      'hours_over_week',
      'invoice_total_mismatch',
    ]);
    expect(p.notes).toEqual([
      tr('client.employment.documents.check.end_before_start'),
      tr('client.employment.documents.check.hours_over_week'),
    ]);
  });
});

describe('what the form does not take', () => {
  const garbage: Fields = {
    startDate: f('garbage'),
    signedOn: f('2025-02-30'),
    endDate: f(20250401),
    durationMonths: f('6'),
    modality: f('bogus'),
    trainingType: f('bogus'),
    replacedPersonNamed: f('yes'),
    planAttached: f(1),
    studiesEndedOn: f('x'),
    effectiveWorkPercent: f('50'),
    salaryAmount: f('1400'),
    annualSalaryAmount: f(-19600),
    salaryPeriod: f('week'),
    payments: f(Infinity),
    weeklyHours: f(-40),
    annualHours: f(Number.NaN),
    shifts: f('no'),
    night: f(0),
    partTime: f('yes'),
    remoteShare: f(true),
    trialAmount: f('1'),
    trialUnit: f('years'),
    holidayDays: f(-1),
    offerNet: f('no'),
  };
  const slips = [
    row({ month: '2025-13' }),
    row({ month: 'bogus' }),
    row({ month: 202505 }),
    row({ month: '25-05' }),
  ];

  it('fills nothing from values of the wrong kind or out of range', () => {
    const p = prefill({
      documents: [],
      fields: garbage,
      payslips: slips,
      lines: slips.map((s) => row({ ...s.values, amount: 100, category: 'salary' })),
      clauses: [row({ label: 'bogus' })],
      information: [
        row({ element: 'a', presence: 'maybe' }),
        row({ element: 'z', presence: 'present' }),
      ],
      contracts: [row({ startDate: 'garbage' })],
    });
    // Only the offer sheet is opened, by the answer it was given; nothing is read from it.
    expect(p).toMatchObject({ entries: [['hasOffer', 'yes']], marks: [], count: 0, notes: [] });
  });

  it.each([
    ['0', 0, '0,00'],
    ['a negative', -1, undefined],
    ['a string', '5', undefined],
    ['infinity', Infinity, undefined],
  ])('%s is read as an amount only when it is one', (_, value, entered) => {
    const p = prefill({ documents: [], fields: { effectiveWorkPercent: f(value) } });
    expect(entry(p, 'effectiveYear1')).toBe(entered);
  });

  it.each([
    ['0', 0, '0'],
    ['a fraction', 1.5, undefined],
    ['a negative', -1, undefined],
    ['a string', '3', undefined],
  ])('%s is read as a whole number only when it is one', (_, value, entered) => {
    const p = prefill({ documents: [], clauses: [row({ label: 'non_compete', months: value })] });
    expect(entry(p, 'clauses.0.months')).toBe(entered);
  });

  it('an end date typed in the form does not break a history beside a contract with no start', () => {
    const p = prefill({ documents: [], contracts: [row({ startDate: '2025-04-01' })] }, [], {
      startDate: 'garbage',
      endDate: 'garbage',
    });
    expect(entry(p, 'history.0.startDate')).toBe('2025-04-01');
  });

  it('quotes the documents’ words trimmed, and none that are blank', () => {
    const quoted = prefill({
      fields: { ...contract, modalityText: f('  Contrato temporal  '), causeText: f('   ') },
    });
    expect(quoted.quotes.modality).toBe('Contrato temporal');
    expect(quoted.quotes).not.toHaveProperty('causeStated');
    expect(prefill({ fields: { agreementName: f('   ') } }).agreement).toEqual({
      name: null,
      code: null,
    });
    expect(prefill({ fields: { agreementName: f(5) } }).agreement.name).toBeNull();
  });

  const day = (i: number) => `${2000 + i}-01-01`;
  const lists: [RowList, (n: number) => Partial<EmploymentExtraction>, string][] = [
    ['parts', (n) => ({ salaryParts: rows(n, () => ({ kind: 'base', amount: 100 })) }), 'kind'],
    ['clauses', (n) => ({ clauses: rows(n, () => ({ label: 'non_compete' })) }), 'label'],
    ['payslips', (n) => ({ payslips: rows(n, (i) => ({ month: nthMonth(i) })) }), 'month'],
    ['history', (n) => ({ contracts: rows(n, (i) => ({ startDate: day(i) })) }), 'startDate'],
  ];

  it.each(lists)(
    '%s holds as many rows as its sheet does, and says when it drops more',
    (list, build, key) => {
      const max = ROW_MAX[list];
      const whole = prefill(build(max));
      expect(entry(whole, `${list}.${max - 1}.${key}`)).toBeDefined();
      expect(whole.notes).not.toContain(tr('client.employment.documents.rows_cut'));
      const over = prefill(build(max + 1));
      expect(entry(over, `${list}.${max - 1}.${key}`)).toBeDefined();
      expect(entry(over, `${list}.${max}.${key}`)).toBeUndefined();
      expect(over.notes).toContain(tr('client.employment.documents.rows_cut'));
    },
  );
});

describe('the contract’s dates, modality and salary', () => {
  const entered = (fields: Fields, extra: Partial<EmploymentExtraction> = {}) =>
    prefill({ documents: [], fields, ...extra });

  it.each([
    ['no start', { durationMonths: f(6) }],
    ['no duration', { startDate: f('2025-04-01') }],
    ['a duration of 0', { startDate: f('2025-04-01'), durationMonths: f(0) }],
    ['a duration in a fraction', { startDate: f('2025-04-01'), durationMonths: f(6.5) }],
    ['a duration in a string', { startDate: f('2025-04-01'), durationMonths: f('6') }],
  ])('%s works out no end', (_, fields) => {
    expect(entry(entered(fields), 'endDate')).toBeUndefined();
  });

  it.each([
    ['no duration', {}],
    ['a duration of 0', { durationMonths: f(0) }],
  ])('a contract with a start, %s and no end still marks its history row as its own', (_, more) => {
    const p = prefill({
      documents: [],
      fields: { startDate: f('2025-04-01'), ...more },
      contracts: [row({ startDate: '2025-04-02', employerName: 'Otra Empresa' })],
    });
    expect(entry(p, 'history.0.employer')).toBe('same');
  });

  it('reads a training modality, its person, plan and studies', () => {
    const p = entered({
      trainingType: f('training_practice'),
      replacedPersonNamed: f(true),
      planAttached: f(false),
      studiesEndedOn: f('2025-01-31'),
    });
    expect(p.entries).toEqual([
      ['modality', 'training_practice'],
      ['replacedPersonNamed', 'yes'],
      ['planAttached', 'no'],
      ['studiesEndedOn', '2025-01-31'],
    ]);
  });

  it('the modality the contract names wins over the training type', () => {
    const p = entered({ modality: f('production'), trainingType: f('training_practice') });
    expect(p.entries).toEqual([['modality', 'production']]);
  });

  it('keeps the salary printed over the annual one, and the period beside it', () => {
    const p = entered({
      salaryAmount: f(1400),
      salaryPeriod: f('month'),
      annualSalaryAmount: f(19600),
    });
    expect(p.entries).toEqual([
      ['salaryAmount', '1.400,00'],
      ['salaryPeriod', 'month'],
    ]);
  });

  it('reads the period with no salary at all', () => {
    expect(entered({ salaryPeriod: f('month') }).entries).toEqual([['salaryPeriod', 'month']]);
  });

  it.each([
    ['twelve payments, extras prorated', 12, true, undefined, undefined, true],
    ['twelve payments, not prorated', 12, false, '0', undefined, false],
    ['twelve payments, no word on proration', 12, undefined, '0', undefined, false],
    ['fourteen payments', 14, false, '2', 'no', false],
    ['fourteen payments, prorated', 14, true, '2', 'yes', false],
    ['thirteen payments, prorated', 13, true, '1', 'yes', false],
    ['eleven payments', 11, false, undefined, 'no', false],
    ['no payments', undefined, false, undefined, 'no', false],
  ])('%s', (_, payments, prorated, extraPays, extraProrated, noted) => {
    const p = entered({
      ...(payments !== undefined && { payments: f(payments) }),
      ...(prorated !== undefined && { prorated: f(prorated) }),
    });
    expect(entry(p, 'extraPays')).toBe(extraPays);
    expect(entry(p, 'extraProrated')).toBe(extraProrated);
    expect(p.notes.includes(tr('client.employment.documents.extras_in_twelve'))).toBe(noted);
  });

  it.each([
    ['a yearly salary', { annualSalaryAmount: f(19600) }, '1.000,00', false],
    ['a salary by the month', { salaryAmount: f(1400), salaryPeriod: f('month') }, '83,33', true],
    ['a salary by the day', { salaryAmount: f(60), salaryPeriod: f('day') }, undefined, false],
    ['no salary', {}, undefined, false],
  ])('pay in kind beside %s', (_, salary, inKind, derived) => {
    const p = entered({ ...salary, inKindAmount: f(1000) });
    expect(entry(p, 'inKind')).toBe(inKind);
    expect(mark(p, 'inKind')?.derived ?? false).toBe(derived);
  });

  it.each([
    ['yearly', { annualSalaryAmount: f(19600) }],
    ['monthly', { salaryAmount: f(1400), salaryPeriod: f('month') }],
  ])('pay in kind that is no amount is not read beside a %s salary', (_, salary) => {
    const p = entered({ ...salary, inKindAmount: f('mucho') });
    expect(entry(p, 'inKind')).toBeUndefined();
  });

  it('reads the hours', () => {
    expect(entered({ weeklyHours: f(37.5), annualHours: f(1800) }).entries).toEqual([
      ['weeklyHours', '37,50'],
      ['annualHours', '1.800,00'],
    ]);
  });

  it.each([
    ['named by the contract itself', f('Convenio', 'high', 'employment_contract'), true],
    ['named by a payslip only', f('Convenio', 'high', 'payslip'), false],
  ])('an agreement %s', (_, field, named) => {
    expect(entry(entered({ agreementName: field }), 'agreementNamed')).toBe(
      named ? 'yes' : undefined,
    );
    expect(entry(entered({ agreementCode: field }), 'agreementNamed')).toBe(
      named ? 'yes' : undefined,
    );
  });
});

describe('the working time, the trial period and the holidays', () => {
  const entered = (fields: Fields) => prefill({ documents: [], fields });

  it.each([
    ['none', undefined, [['hasOvertime', 'no']]],
    [
      'as_needed',
      undefined,
      [
        ['hasOvertime', 'yes'],
        ['overtimeKind', 'as_needed'],
      ],
    ],
    [
      'as_needed',
      100,
      [
        ['hasOvertime', 'yes'],
        ['overtimeKind', 'as_needed'],
      ],
    ],
    [
      'hours',
      undefined,
      [
        ['hasOvertime', 'yes'],
        ['overtimeKind', 'hours'],
      ],
    ],
    [
      'hours',
      100,
      [
        ['hasOvertime', 'yes'],
        ['overtimeKind', 'hours'],
        ['overtimeHours', '100,00'],
      ],
    ],
    [
      'hours',
      'mucho',
      [
        ['hasOvertime', 'yes'],
        ['overtimeKind', 'hours'],
      ],
    ],
    [
      'hours',
      1.5,
      [
        ['hasOvertime', 'yes'],
        ['overtimeKind', 'hours'],
      ],
    ],
    ['none', 100, [['hasOvertime', 'no']]],
    ['included', 100, []],
    ['bogus', undefined, []],
  ])('overtime %s with %j a year', (agreed, hours, expected) => {
    const p = entered({
      overtimeAgreed: f(agreed, 'medium'),
      ...(hours !== undefined && { overtimeHoursPerYear: f(hours, 'medium') }),
    });
    expect(p.entries).toEqual(expected);
    expect(p.marks.every((m) => m.confidence === 'medium')).toBe(true);
  });

  it('overtime hours with no word on whether they are agreed fill nothing', () => {
    expect(entered({ overtimeHoursPerYear: f(100) }).entries).toEqual([]);
  });

  it.each([
    [
      'all of it',
      { complementaryPercent: f(30), complementaryNoticeDays: f(3) },
      [
        ['hasComplementary', 'yes'],
        ['complementaryPercent', '30,00'],
        ['complementaryNotice', '3'],
      ],
    ],
    [
      'the percent only',
      { complementaryPercent: f(30) },
      [
        ['hasComplementary', 'yes'],
        ['complementaryPercent', '30,00'],
      ],
    ],
    [
      'a notice of 0 days',
      { complementaryPercent: f(30), complementaryNoticeDays: f(0) },
      [
        ['hasComplementary', 'yes'],
        ['complementaryPercent', '30,00'],
        ['complementaryNotice', '0'],
      ],
    ],
    [
      'a notice that is no whole number',
      { complementaryPercent: f(30), complementaryNoticeDays: f(1.5) },
      [
        ['hasComplementary', 'yes'],
        ['complementaryPercent', '30,00'],
      ],
    ],
    ['the notice only', { complementaryNoticeDays: f(3) }, []],
    ['a percent that is no amount', { complementaryPercent: f('mucho') }, []],
  ])('part time with %s', (_, more, rest) => {
    const p = entered({ partTime: f(true), ...more });
    expect(p.entries).toEqual([['isPartTime', 'yes'], ...rest]);
  });

  it.each([
    ['full time', f(false), 'no'],
    ['unsaid', undefined, undefined],
  ])('%s asks for no complementary hours', (_, partTime, answer) => {
    const p = entered({
      ...(partTime && { partTime }),
      complementaryPercent: f(30),
      complementaryNoticeDays: f(3),
    });
    expect(entry(p, 'isPartTime')).toBe(answer);
    expect(entry(p, 'hasComplementary')).toBeUndefined();
  });

  it('reads the share of remote work', () => {
    expect(entered({ remoteShare: f(40) }).entries).toEqual([['remoteShare', '40,00']]);
  });

  it.each([
    [
      'a trial',
      { trialAmount: f(6), trialUnit: f('months') },
      [
        ['hasTrial', 'yes'],
        ['trialAmount', '6,00'],
        ['trialUnit', 'months'],
      ],
    ],
    ['an amount with no unit', { trialAmount: f(6) }, []],
    ['an amount with a unit that is none', { trialAmount: f(6), trialUnit: f('years') }, []],
    ['a unit with no amount', { trialUnit: f('months') }, []],
    ['an amount that is none', { trialAmount: f('seis'), trialUnit: f('months') }, []],
  ])('%s', (_, fields, expected) => {
    expect(entered(fields).entries).toEqual(expected);
  });

  it('reads the holidays and their unit, and says nothing of the unit when it is named', () => {
    const p = entered({ holidayDays: f(30), holidayUnit: f('calendar') });
    expect(p.entries).toEqual([
      ['hasHolidays', 'yes'],
      ['holidayDays', '30,00'],
      ['holidayUnit', 'calendar'],
    ]);
    expect(p.notes).toEqual([]);
  });

  it.each([
    ['without a number of days', { holidayUnit: f('calendar') }],
    ['with days that are none', { holidayDays: f('treinta'), holidayUnit: f('calendar') }],
  ])('holidays %s fill nothing', (_, fields) => {
    const p = entered(fields);
    expect(p.entries).toEqual([]);
    expect(p.notes).toEqual([]);
  });

  it.each([
    ['De lunes a viernes, de 8 a 16', 'working', '5'],
    ['DE LUNES A VIERNES', 'working', '5'],
    ['De lunes a sábado', 'working', '6'],
    ['de lunes a sabado', 'working', '6'],
    ['Turnos rotativos', 'working', undefined],
    ['De lunes a viernes', 'calendar', undefined],
    [8, 'working', undefined],
    [undefined, 'working', undefined],
  ])('a schedule «%s» with %s holidays gives %s working days a week', (text, unit, week) => {
    const p = entered({
      holidayDays: f(22),
      holidayUnit: f(unit),
      ...(text !== undefined && { scheduleText: f(text, 'high') }),
    });
    expect(entry(p, 'workDaysPerWeek')).toBe(week);
  });

  it('the working week is as sure as the schedule, at most medium', () => {
    const weekMark = (confidence: Confidence) =>
      mark(
        entered({
          holidayDays: f(22),
          holidayUnit: f('working'),
          scheduleText: f('de lunes a viernes', confidence),
        }),
        'workDaysPerWeek',
      )?.confidence;
    expect(['high', 'medium', 'low'].map((c) => weekMark(c as Confidence))).toEqual([
      'medium',
      'medium',
      'low',
    ]);
  });
});

describe('the clauses', () => {
  const clause = (more: Record<string, ExtractedValue>, confidence: Confidence = 'high') =>
    row({ label: 'non_compete', ...more }, confidence);
  const clauseEntries = (p: Prefill) => p.entries.filter(([n]) => n.startsWith('clauses.'));

  it('reads every answer a clause gives, each from its own word', () => {
    const p = prefill({
      documents: [],
      clauses: [
        clause(
          {
            months: 12,
            compensationStated: true,
            trainingDescribed: false,
            costsOnWorker: true,
            waivedRight: 'salary',
            literal: '  No competirás.  ',
          },
          'medium',
        ),
      ],
    });
    expect(p.entries).toEqual([
      ['hasClauses', 'yes'],
      ['clauses.0.label', 'non_compete'],
      ['clauses.0.months', '12'],
      ['clauses.0.compensation', 'yes'],
      ['clauses.0.training', 'no'],
      ['clauses.0.costs', 'yes'],
      ['clauses.0.waived', 'salary'],
      ['clauses.0.text', 'No competirás.'],
    ]);
    expect(p.marks.every((m) => m.confidence === 'medium')).toBe(true);
  });

  it('reads no answer a clause does not give or gives in a way the form does not take', () => {
    const p = prefill({
      documents: [],
      clauses: [
        clause({
          compensationStated: 'yes',
          trainingDescribed: 1,
          costsOnWorker: 'maybe',
          waivedRight: 'bogus',
          literal: '   ',
        }),
        clause({ literal: 5 }),
      ],
    });
    expect(clauseEntries(p)).toEqual([
      ['clauses.0.label', 'non_compete'],
      ['clauses.1.label', 'non_compete'],
    ]);
  });
});

describe('the offer’s sheet', () => {
  it.each([
    ['its salary', { offerSalaryAmount: f(20000) }, []],
    ['its net or gross', { offerNet: f(true) }, [['offerNet', 'yes']]],
    ['its hours', { offerWeeklyHours: f(30) }, [['offerHours', '30,00']]],
    ['its modality', { offerModality: f('permanent') }, [['offerModality', 'permanent']]],
    ['its remote work', { offerRemote: f('full') }, [['offerRemote', 'full']]],
  ])('opens with only %s', (_, fields, rest) => {
    expect(prefill({ documents: [], fields }).entries).toEqual([['hasOffer', 'yes'], ...rest]);
  });

  it('does not open for what is no part of the offer', () => {
    const p = prefill({
      documents: [],
      fields: { offerSalaryPeriod: f('year'), offerPosition: f('Oficial'), offerVariable: f(true) },
    });
    expect(p.entries).toEqual([]);
  });

  it.each([
    ['a modality it cannot name', { offerModality: f('unknown') }],
    ['a modality that is none', { offerModality: f('bogus') }],
    ['a remote work that is none', { offerRemote: f('sometimes') }],
  ])('opens beside %s, and reads nothing from it', (_, fields) => {
    expect(prefill({ documents: [], fields }).entries).toEqual([['hasOffer', 'yes']]);
  });

  it.each([
    ['by the year', 'year', false],
    ['by the month', 'month', true],
    ['by the hour', 'hour', true],
    ['with no period', undefined, true],
  ])('a salary %s says its period only when it is not a year', (_, period, said) => {
    const p = prefill({
      documents: [],
      fields: {
        offerSalaryAmount: f(1600),
        ...(period && { offerSalaryPeriod: f(period) }),
      },
    });
    expect(p.notes.includes(tr('client.employment.documents.offer_period'))).toBe(said);
    expect(entry(p, 'offerGross')).toBe(period === 'year' ? '1.600,00' : undefined);
  });

  it('a period with no salary says nothing', () => {
    const p = prefill({
      documents: [],
      fields: { offerRemote: f('none'), offerSalaryPeriod: f('month') },
    });
    expect(p.notes).toEqual([]);
  });
});

describe('the work history’s own contract and employers', () => {
  const ours = 'Talleres Ficticios del Norte, S.L.';
  const own = row({ startDate: '2025-04-01', accountCode: '48 1234567 89' });
  const history = (other: Record<string, ExtractedValue>) =>
    entry(
      prefill({
        documents: [],
        fields: { startDate: f('2025-04-01'), companyName: f(ours) },
        contracts: [own, row({ startDate: '2020-01-01', ...other })],
      }),
      'history.1.employer',
    );

  it.each([
    ['2025-04-04', 'same'],
    ['2025-03-29', 'same'],
    ['2025-04-05', 'other'],
    ['2025-03-28', 'other'],
  ])(
    'a row starting %s is the contract itself only within three days of its start',
    (startDate, employer) => {
      const p = prefill({
        documents: [],
        fields: { startDate: f('2025-04-01'), companyName: f(ours) },
        contracts: [row({ startDate, employerName: 'Otra Empresa Inventada' })],
      });
      expect(entry(p, 'history.0.employer')).toBe(employer);
    },
  );

  it.each([
    [
      'the same name, punctuated and in lower case',
      { employerName: 'talleres ficticios del norte sl' },
      'same',
    ],
    ['the same name with other accents', { employerName: 'Tálleres Fictícios del Norte' }, 'same'],
    [
      'the same name with other separators',
      { employerName: 'Talleres - Ficticios del Norte' },
      'same',
    ],
    [
      'the same name with another legal form',
      { employerName: 'Talleres Ficticios del Norte SA' },
      'same',
    ],
    [
      'the same name with stray spaces',
      { employerName: '  Talleres Ficticios del Norte  ' },
      'same',
    ],
    ['the same code, with other separators', { accountCode: '48/1234567/89' }, 'same'],
    [
      'the same code with a different number of separators',
      { accountCode: '4812345-6789' },
      'same',
    ],
    [
      'another name and the same code',
      { employerName: 'Otra Empresa', accountCode: '48 1234567 89' },
      'same',
    ],
    [
      'another name and another code',
      { employerName: 'Otra Empresa', accountCode: '28 7654321 00' },
      'other',
    ],
    ['another name and no code', { employerName: 'Otra Empresa' }, 'other'],
    ['another code and no name', { accountCode: '28 7654321 00' }, 'other'],
    ['a name that is only a legal form', { employerName: 'S.L.' }, undefined],
    ['a code with no digits', { accountCode: '---' }, undefined],
    ['neither', {}, undefined],
  ])('%s is read as %s employer', (_, other, employer) => {
    expect(history(other)).toBe(employer);
  });
});

describe('the work history beside the contract’s dates', () => {
  const own = row({ startDate: '2025-04-01', employerName: 'Otra Empresa' });

  it('a row that is not the contract’s takes no end from the contract, and one that has none says none', () => {
    const q = prefill({
      documents: [],
      fields: { startDate: f('2025-04-01'), endDate: f('2025-12-31') },
      contracts: [own, row({ startDate: '2020-01-01' })],
    });
    expect(entry(q, 'history.0.endDate')).toBe('2025-12-31');
    expect(entry(q, 'history.1.endDate')).toBeUndefined();
  });

  it('skips a row with no start the form takes, and still finds the contract’s among the rest', () => {
    const q = prefill({
      documents: [],
      fields: { startDate: f('2025-04-01') },
      contracts: [row({ startDate: 'garbage' }), row({ employerName: 'x' }), own],
    });
    expect(q.entries.filter(([n]) => n.endsWith('.startDate'))).toEqual([
      ['history.0.startDate', '2025-04-01'],
    ]);
    expect(entry(q, 'history.0.employer')).toBe('same');
  });

  it('takes the contract’s dates typed in the form when the documents give none', () => {
    const q = prefill({ documents: [], contracts: [own] }, [], {
      startDate: '2025-04-02',
      endDate: '2025-09-30',
    });
    expect(entry(q, 'history.0.employer')).toBe('same');
    expect(entry(q, 'history.0.endDate')).toBe('2025-09-30');
  });

  it('with no start for the contract, no row is its own', () => {
    const q = prefill({ documents: [], contracts: [own] });
    expect(entry(q, 'history.0.employer')).toBeUndefined();
  });

  it.each([
    ['names that are only a legal form', { companyName: f('S.A.') }, {}, { employerName: 'S.L.' }],
    [
      'a name that is, against one that is not',
      { companyName: f('S.A.') },
      {},
      { employerName: 'Otra' },
    ],
    ['codes with no digits', {}, { accountCode: '---' }, { accountCode: '/' }],
    [
      'a code with none, against one with',
      {},
      { accountCode: '---' },
      { accountCode: '28 7654321 00' },
    ],
  ])('%s say nothing of the employer', (_, fields, mine, other) => {
    const q = prefill({
      documents: [],
      fields: { startDate: f('2025-04-01'), ...fields },
      contracts: [
        row({ startDate: '2025-04-01', ...mine }),
        row({ startDate: '2020-01-01', ...other }),
      ],
    });
    expect(entry(q, 'history.1.employer')).toBeUndefined();
  });
});

describe('what a reading says beside its answers', () => {
  const code = '99000000011999';
  const codeOnly = tr('client.employment.documents.agreement_code', { codigo: code });
  it.each([
    [
      'a name and a code',
      { agreementName: f('Convenio del metal'), agreementCode: f(code) },
      `Convenio del metal (código ${code})`,
    ],
    ['a name only', { agreementName: f('Convenio del metal') }, 'Convenio del metal'],
    ['a code only', { agreementCode: f(code) }, codeOnly],
    ['a blank name and a code', { agreementName: f('  '), agreementCode: f(code) }, codeOnly],
    ['neither', {}, undefined],
  ])('the agreement is quoted from %s', (_, fields, quote) => {
    expect(prefill({ fields }).quotes.agreementNamed).toBe(quote);
  });

  it('names only the conflicts the form does not ask about', () => {
    const p = prefill({
      conflicts: [
        { field: 'agreementName', sources: ['employment_contract', 'payslip'] },
        { field: 'startDate', sources: ['employment_contract', 'payslip'] },
      ],
    });
    expect(p.notes).toEqual([tr('client.employment.documents.conflict.agreementName')]);
  });

  it('says when a doubtful answer was filled, and only then', () => {
    const sure = prefill({ fields: { startDate: f('2025-04-01', 'medium') } });
    expect(sure.lowConfidence).toBe(false);
    expect(sure.notes).not.toContain(tr('client.documents.done_low'));
    const doubtful = prefill({ fields: { startDate: f('2025-04-01', 'low') } });
    expect(doubtful.lowConfidence).toBe(true);
    expect(doubtful.notes).toContain(tr('client.documents.done_low'));
  });
});
