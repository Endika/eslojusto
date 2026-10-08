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
  const p = prefill({ fields: contract });

  it('fills the dates, the modality and the salary, each marked as read', () => {
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
    expect(entry(p, 'extraPays')).toBe('2');
    expect(mark(p, 'extraPays')?.derived).toBe(true);
    expect(entry(p, 'extraProrated')).toBe('no');
  });

  it('answers the yes/no questions the contract answers', () => {
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
    expect(entry(p, 'relationship')).toBe('common');
    expect(mark(p, 'relationship')).toMatchObject({ confidence: 'medium', derived: true });
    expect(entry(p, 'viaTempAgency')).toBe('no');
    expect(entry(p, 'relief')).toBe('no');
    expect(entry(p, 'writtenContract')).toBe('yes');
    expect(entry(p, 'under18')).toBeUndefined();
  });

  it('never answers whether the cause is explained: it quotes it beside the question', () => {
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
    // What a derived 0 would have told: no extra pays at all, below the legal minimum, when the
    // two the contract prorates are within it.
    const extraPays = (pays: EmploymentInput['extraPays']) =>
      assessHolidaysAndPay(engineInput({ extraPays: pays }), EMPLOYMENT_NORMS)
        .flatMap((a) => (a.kind === 'single' ? [a.finding] : []))
        .find((f) => f.id === 'extra_pays')?.status;
    expect(extraPays({ count: 0, prorated: false })).toBe('below_minimum');
    expect(extraPays({ count: 2, prorated: true })).not.toBe('below_minimum');
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
    const p = prefill({ relationshipHints: [row({ hint: 'household' })] });
    expect(entry(p, 'relationship')).toBe('household');
    expect(entry(p, 'viaTempAgency')).toBeUndefined();
  });
  it('a temporary work agency or a relief contract is a yes to its question', () => {
    const p = prefill({ relationshipHints: [row({ hint: 'temp_agency' }, 'medium')] });
    expect(entry(p, 'relationship')).toBe('common');
    expect(entry(p, 'viaTempAgency')).toBe('yes');
    expect(mark(p, 'viaTempAgency')?.confidence).toBe('medium');
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
  const p = prefill({ payslips: slips, lines });

  it('sums each month’s salary in money from its base and fixed complements', () => {
    expect(entry(p, 'hasPayslips')).toBe('yes');
    expect(entry(p, 'payslips.0.month')).toBe('2025-05');
    expect(entry(p, 'payslips.0.salary')).toBe('1.400,00');
    expect(mark(p, 'payslips.0.salary')).toMatchObject({ derived: true, confidence: 'high' });
    expect(entry(p, 'payslips.0.prorated')).toBeUndefined();
    expect(entry(p, 'payslips.1.salary')).toBe('1.400,00');
    expect(entry(p, 'payslips.1.prorated')).toBe('233,33');
    expect(mark(p, 'payslips.1.salary')?.confidence).toBe('medium');
  });

  it('says which lines it left out', () => {
    expect(p.notes).toContain(
      tr('client.employment.documents.lines_left_out', {
        lineas: 'incentivos y otros pluses variables, horas extra, dietas y gastos',
      }),
    );
  });

  it('reads the whole month from the period, or less surely from the days paid', () => {
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
  });

  it('passes on whether a payslip shows an incident', () => {
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
  const p = prefill({ fields: contract, contracts });

  it('lists every row, the contract’s own with the contract’s end, and no kind', () => {
    expect(entry(p, 'hasHistory')).toBe('yes');
    expect(entry(p, 'history.0.startDate')).toBe('2025-04-01');
    expect(entry(p, 'history.0.endDate')).toBe('2025-12-31');
    expect(mark(p, 'history.0.endDate')?.derived).toBe(true);
    expect(entry(p, 'history.4.startDate')).toBe('2022-05-01');
    expect(p.entries.some(([n]) => n.endsWith('.kind'))).toBe(false);
  });

  it('proposes «misma empresa» by account code or name, and «otra» when both differ', () => {
    expect(entry(p, 'history.0.employer')).toBe('same');
    expect(entry(p, 'history.1.employer')).toBe('other');
    expect(entry(p, 'history.2.employer')).toBe('same');
    expect(entry(p, 'history.3.employer')).toBe('same');
    expect(mark(p, 'history.3.employer')).toMatchObject({ confidence: 'medium', derived: true });
    // A household employer's name is never sent, so there is nothing to compare.
    expect(entry(p, 'history.4.employer')).toBeUndefined();
  });

  it('a whole history is not marked incomplete', () => {
    expect(entry(p, 'historyIncomplete')).toBeUndefined();
  });

  it('a history cut to its most recent rows is marked incomplete, and it is said', () => {
    const fifteen = Array.from({ length: 15 }, (_, i) =>
      company(`20${10 + i}-01-01`, `20${10 + i}-03-31`, 'Otra Empresa Inventada, S.A.', null),
    );
    const q = prefill({ fields: contract, contracts: fifteen, truncated: true });
    expect(entry(q, 'historyIncomplete')).toBe('yes');
    expect(q.notes).toContain(tr('client.employment.documents.cut.contracts', { n: 15 }));
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
