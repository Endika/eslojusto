import type { FieldSpec, ListSpec, SectionSchema } from './extraction-schema';

// Mirrors of the site's employment engine unions (src/engine/employment/types.ts);
// test/employment-contract.test.ts keeps them equal.
export const MODALITIES = [
  'permanent',
  'discontinuous',
  'production',
  'production_occasional',
  'replacement',
  'replacement_selection',
  'training_alternance',
  'training_practice',
  'work_or_service',
  'eventual',
  'interim',
  'unknown',
] as const;
export const TRAINING_TYPES = ['training_alternance', 'training_practice'] as const;
export const SALARY_PERIODS = ['year', 'month', 'day', 'hour'] as const;
export const SALARY_PART_KINDS = ['base', 'fixed_complement', 'variable', 'unknown'] as const;
export const CLAUSE_LABELS = [
  'non_compete',
  'retention',
  'exclusivity',
  'waiver',
  'mandatory_overtime',
  'overtime_included',
  'remote_work_costs',
  'other',
] as const;
export const WAIVED_RIGHTS = ['holidays', 'salary', 'severance', 'other'] as const;
export const TRIAL_UNITS = ['days', 'weeks', 'months'] as const;
export const HOLIDAY_UNITS = ['calendar', 'working'] as const;
export const REMOTE_WORK = ['none', 'hybrid', 'full'] as const;
// The seventeen elements of art. 3.2 RD 723/2026, letters a) to q).
export const INFO_ELEMENTS = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
] as const;
// The engine's `unknown` is a field left out.
export const INFO_PRESENCE = ['present', 'by_reference', 'absent'] as const;
// The engine's special relationships, as hints only: the person confirms the one that applies. A
// special employment centre is left out: naming one would say something about the worker's health.
export const RELATIONSHIP_HINTS = [
  'household',
  'senior_management',
  'sport',
  'artist',
  'law_firm',
  'medical_resident',
  'public_servant',
  'other_special',
  'temp_agency',
  'relief',
] as const;

export const OVERTIME_AGREEMENTS = ['none', 'hours', 'as_needed', 'included'] as const;
export const EMPLOYER_TYPES = ['person', 'company'] as const;
// ISO 3166-2:ES codes of the autonomous communities and cities.
export const REGIONS = [
  'AN',
  'AR',
  'AS',
  'CB',
  'CE',
  'CL',
  'CM',
  'CN',
  'CT',
  'EX',
  'GA',
  'IB',
  'MC',
  'MD',
  'ML',
  'NC',
  'PV',
  'RI',
  'VC',
] as const;

// What each earnings line of a payslip pays for; the sums by month are done in code.
export const EMPLOYMENT_LINE_CATEGORIES = [
  'salary',
  'fixed_complement',
  'variable',
  'overtime',
  'complementary_hours',
  'in_kind',
  'extra_pay',
  'prorated_extra_pay',
  'expenses',
  'one_off',
  'other',
] as const;

export const MAX_CLAUSE_LITERAL = 600;
export const MAX_CAUSE_TEXT = 600;
export const MAX_SCHEDULE_TEXT = 400;
export const MAX_MODALITY_TEXT = 120;
export const MAX_AGREEMENT_NAME = 160;
const MAX_SHORT_TEXT = 80;
// A week has 168 hours; anything the contract prints up to that is kept for the checks to see.
const MAX_WEEKLY_HOURS = 168;
const MAX_ANNUAL_HOURS = 8784;

export const EMPLOYMENT_LIST_MAXIMA = {
  salaryParts: 12,
  clauses: 10,
  relationshipHints: 3,
  payslips: 12,
  lines: 150,
  contracts: 60,
} as const;

const field = (type: FieldSpec['type'], description: string): FieldSpec => ({ type, description });
const date = (description: string) => field({ type: 'date' }, description);
const money = (description: string) => field({ type: 'money' }, description);
const flag = (description: string) => field({ type: 'boolean' }, description);
const text = (maxLength: number, description: string) =>
  field({ type: 'text', maxLength }, description);
const oneOf = (values: readonly string[], description: string) =>
  field({ type: 'enum', values }, description);
const percent = (description: string) => field({ type: 'percent' }, description);
const whole = (min: number, max: number, description: string) =>
  field({ type: 'integer', min, max }, description);
const decimal = (min: number, max: number, description: string) =>
  field({ type: 'decimal', min, max }, description);

const list = (
  description: string,
  maxItems: number,
  item: Readonly<Record<string, FieldSpec>>,
  required: readonly string[],
): ListSpec => ({ description, maxItems, item, required });

// Literal texts are copied so the person can check the label against them; the prompt says how
// (persons' names become «[nombre]») and that the model never judges them.
const LITERAL = ' Word for word.';

const CONTRACT_KEY = field(
  { type: 'text', maxLength: 3, pattern: '^[0-9]{3}$' },
  'Contract code (clave de contrato), such as 100 or 402.',
);
const SALARY_PERIOD = oneOf(SALARY_PERIODS, 'What that amount is for.');
const MODALITY_LABELS =
  'permanent (indefinido), discontinuous (fijo-discontinuo), production (circunstancias de la producción), production_occasional (at most 90 days a year), replacement (sustitución), replacement_selection (cover during a selection), training_alternance, training_practice, work_or_service (obra o servicio), eventual, interim (interinidad), unknown.';

const employmentContract = {
  description: 'Employment contract with its annexes, extensions and training plan.',
  source: 'employment_contract',
  fields: {
    employerType: oneOf(
      EMPLOYER_TYPES,
      'person (a natural person, such as a household) or company.',
    ),
    companyName: text(MAX_SHORT_TEXT, 'Only for a company employer: its name.'),
    companyTaxId: field(
      { type: 'text', maxLength: 12, pattern: '^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$' },
      'The company’s CIF, without spaces or dashes.',
    ),
    workplaceRegion: oneOf(REGIONS, 'ISO code of the workplace’s community.'),
    signedOn: date('Date it was signed.'),
    startDate: date('Start date.'),
    endDate: date('End date of a temporary contract.'),
    durationMonths: whole(1, 120, 'Duration in months, if stated so.'),
    modalityText: text(MAX_MODALITY_TEXT, 'The modality as printed (modalidad).' + LITERAL),
    modality: oneOf(MODALITIES, 'Its label: ' + MODALITY_LABELS),
    contractKey: CONTRACT_KEY,
    partTime: flag('true for part time (tiempo parcial), false for full time.'),
    causeText: text(
      MAX_CAUSE_TEXT,
      'The cause and circumstances of a temporary contract.' + LITERAL,
    ),
    replacedPersonNamed: flag('For a replacement: whether it identifies who is replaced.'),
    replacementCauseStated: flag('For a replacement: whether it states why.'),
    category: text(MAX_SHORT_TEXT, 'Professional group or category.'),
    agreementName: text(MAX_AGREEMENT_NAME, 'Collective agreement (convenio).'),
    agreementCode: text(20, 'Code of that agreement.'),
    salaryAmount: money('Gross salary.'),
    salaryPeriod: SALARY_PERIOD,
    annualSalaryAmount: money('Gross annual salary, if printed besides another.'),
    payments: whole(1, 24, 'Payments a year (pagas).'),
    prorated: flag('Whether extra payments are prorated.'),
    inKindAmount: money('Salary in kind (en especie) a year.'),
    weeklyHours: decimal(0, MAX_WEEKLY_HOURS, 'Working hours a week.'),
    annualHours: decimal(0, MAX_ANNUAL_HOURS, 'Working hours a year.'),
    scheduleText: text(MAX_SCHEDULE_TEXT, 'Schedule (horario).' + LITERAL),
    shifts: flag('Shift work (turnos).'),
    night: flag('Night work (nocturno).'),
    complementaryPercent: percent('Horas complementarias, % of the contract hours.'),
    complementaryNoticeDays: whole(0, 30, 'Days of notice before complementary hours.'),
    overtimeAgreed: oneOf(
      OVERTIME_AGREEMENTS,
      'Overtime: none, hours (a number), as_needed, included (in the salary).',
    ),
    overtimeHoursPerYear: whole(0, 2000, 'Overtime hours a year, for hours.'),
    holidayDays: field({ type: 'days' }, 'Holiday days a year.'),
    holidayUnit: oneOf(HOLIDAY_UNITS, 'calendar (naturales) or working (laborables) days.'),
    trialAmount: whole(1, 366, 'Trial period (periodo de prueba).'),
    trialUnit: oneOf(TRIAL_UNITS, 'Its unit.'),
    remoteShare: percent('Remote share of the working time, %.'),
    trainingType: oneOf(TRAINING_TYPES, 'For training: its kind.'),
    studiesEndedOn: date('For training: when the qualification was obtained.'),
    planAttached: flag('For training: whether its plan is attached.'),
    effectiveWorkPercent: percent('For alternance: maximum effective work in year 1, %.'),
  },
  lists: {
    salaryParts: list(
      'Every part of the salary.',
      EMPLOYMENT_LIST_MAXIMA.salaryParts,
      {
        concept: text(MAX_SHORT_TEXT, 'The concept as printed.'),
        amount: money('Amount, for the period of salaryAmount.'),
        kind: oneOf(SALARY_PART_KINDS, 'base, fixed_complement (monthly), variable, unknown.'),
      },
      ['amount', 'kind'],
    ),
    clauses: list(
      'Every clause of one of these kinds.',
      EMPLOYMENT_LIST_MAXIMA.clauses,
      {
        label: oneOf(CLAUSE_LABELS, 'retention is permanencia; overtime_included, in the salary.'),
        literal: text(MAX_CLAUSE_LITERAL, 'The clause.' + LITERAL),
        months: whole(0, 120, 'Months it lasts.'),
        compensationStated: flag('Whether it states a payment in return.'),
        trainingDescribed: flag(
          'For retention: whether it describes training paid by the company.',
        ),
        waivedRight: oneOf(WAIVED_RIGHTS, 'For a waiver: what is given up.'),
        costsOnWorker: flag('For remote work costs: whether the worker pays them.'),
      },
      ['label', 'literal'],
    ),
    information: list(
      'Each element of art. 3.2 RD 723/2026, one entry per letter: a) parties; b) start and end or duration; c) registered office and workplace; d) job and cause of a temporary one; e) category and job description; f) salary and each complement; g) working time; h) trial period; i) training; j) temporary work agency; k) automated decisions; l) equality plan, harassment protocol; m) LGTBI measures; n) ending and notice; o) agreement and its code; p) mutual insurer, improvements, pensions; q) changes to conditions.',
      INFO_ELEMENTS.length,
      {
        element: oneOf(INFO_ELEMENTS, 'The letter.'),
        presence: oneOf(
          INFO_PRESENCE,
          'present, by_reference (only a reference to the law or agreement), absent.',
        ),
      },
      ['element', 'presence'],
    ),
    relationshipHints: list(
      'As the contract states: household (hogar), senior_management (alta dirección), sport, artist, law_firm, medical_resident, public_servant, other_special, temp_agency (ETT), relief (relevo).',
      EMPLOYMENT_LIST_MAXIMA.relationshipHints,
      { hint: oneOf(RELATIONSHIP_HINTS, 'The kind.') },
      ['hint'],
    ),
  },
} as const satisfies SectionSchema;

const jobOffer = {
  description: 'Job offer (oferta de empleo).',
  source: 'job_offer',
  fields: {
    position: text(MAX_SHORT_TEXT, 'The job offered.'),
    salaryAmount: money('Salary announced.'),
    salaryPeriod: SALARY_PERIOD,
    net: flag('true if that salary is net, false if gross.'),
    variable: flag('Whether part of it is variable.'),
    weeklyHours: decimal(0, MAX_WEEKLY_HOURS, 'Working hours a week.'),
    modality: oneOf(MODALITIES, 'Contract offered, labelled as the modality.'),
    remote: oneOf(REMOTE_WORK, 'Remote work.'),
    publishedOn: date('Date of the offer.'),
  },
  lists: {},
} as const satisfies SectionSchema;

const employmentPayslips = {
  description: 'Payslips (nóminas) and their earnings lines.',
  source: 'payslip',
  fields: {},
  lists: {
    payslips: list(
      'Every payslip; past twelve, the most recent.',
      EMPLOYMENT_LIST_MAXIMA.payslips,
      {
        month: field({ type: 'month' }, 'Month of its pay period.'),
        periodStart: date('First day of the period.'),
        periodEnd: date('Last day of the period.'),
        daysWorked: field({ type: 'days' }, 'Days it pays.'),
        incidents: flag('Whether it shows an incident or absence. Never which.'),
        totalAccrued: money('Total gross (total devengado).'),
        partTimeCoefficient: percent('Part-time coefficient, as a %.'),
        agreementName: text(MAX_AGREEMENT_NAME, 'Collective agreement.'),
        category: text(MAX_SHORT_TEXT, 'Professional group or category.'),
      },
      ['month'],
    ),
    lines: list(
      'Every earnings line (devengo); never deductions.',
      EMPLOYMENT_LIST_MAXIMA.lines,
      {
        month: field({ type: 'month' }, 'Month of its payslip.'),
        concept: text(MAX_SHORT_TEXT, 'The concept as printed.'),
        amount: money('Amount.'),
        category: oneOf(
          EMPLOYMENT_LINE_CATEGORIES,
          'salary (base), fixed_complement (monthly plus: antigüedad, convenio), variable (incentivos), overtime, complementary_hours, in_kind, extra_pay (a full one), prorated_extra_pay, expenses (dietas), one_off (atrasos, bonus), other.',
        ),
      },
      ['month', 'concept', 'amount', 'category'],
    ),
  },
} as const satisfies SectionSchema;

const employmentWorkHistory = {
  description: 'Work history (vida laboral).',
  source: 'work_history',
  fields: {},
  lists: {
    contracts: list(
      'Every row; past sixty, the most recent.',
      EMPLOYMENT_LIST_MAXIMA.contracts,
      {
        startDate: date('Start (alta).'),
        endDate: date('End (baja); omit while active.'),
        employerType: oneOf(EMPLOYER_TYPES, 'Who the employer is.'),
        employerName: text(MAX_SHORT_TEXT, 'Only for a company employer: its name.'),
        accountCode: field(
          { type: 'text', maxLength: 15, pattern: '^[0-9]{2}[ /-]?[0-9]{7}[ /-]?[0-9]{2}$' },
          'Employer account code (C.C.C.).',
        ),
        contractKey: CONTRACT_KEY,
        partTimeCoefficient: whole(0, 1000, 'Part-time coefficient (C.T.P.), per thousand.'),
      },
      ['startDate'],
    ),
  },
} as const satisfies SectionSchema;

// One section per kind of document; payslips and work histories get sections of their own, so
// the final pay's stay as they are.
export const EMPLOYMENT_SECTIONS = {
  employment_contract: employmentContract,
  job_offer: jobOffer,
  employment_payslips: employmentPayslips,
  employment_work_history: employmentWorkHistory,
} as const satisfies Readonly<Record<string, SectionSchema>>;

export type EmploymentSectionKind = keyof typeof EMPLOYMENT_SECTIONS;

export const EMPLOYMENT_PAGE_KIND_DESCRIPTION =
  'employment_contract: a contract, its annex, extension or training plan. job_offer: a job offer. payslip: a nómina. work_history: the vida laboral. settlement_proposal, dismissal_letter, company_certificate, settlement_agreement: a finiquito, despido, certificado de empresa or conciliation. other: anything else.';
