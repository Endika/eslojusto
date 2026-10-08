import { LIMITS } from '../../src/domain/documents';
import { EMPLOYMENT_LIST_MAXIMA, INFO_ELEMENTS } from '../../src/domain/employment-schema';

// What an employment read of 25 pages can record, to measure its output: a four-page contract,
// up to twelve one-page payslips, a job offer and a work history on the pages left. `largest`
// fills every list and every copied text to its limit; `typical` copies texts of the length
// real documents print. Made-up values only.

export interface RecordShape {
  readonly payslips: number;
  readonly lines: number;
  readonly contracts: number;
  readonly texts: 'largest' | 'typical';
}

export const LARGEST: RecordShape = {
  payslips: EMPLOYMENT_LIST_MAXIMA.payslips,
  lines: EMPLOYMENT_LIST_MAXIMA.lines,
  contracts: EMPLOYMENT_LIST_MAXIMA.contracts,
  texts: 'largest',
};

const f = (value: unknown) => ({ value, confidence: 'high' });
const page = (n: number, kind: string, document: number, month?: string) => ({
  page: n,
  kind,
  document,
  ...(month !== undefined && { month }),
  readability: f('ok'),
  confidence: 'high',
});
const PROSE =
  'La contratación se realiza para atender el incremento ocasional e imprevisible de la actividad derivado de la campaña de verano en el centro de trabajo, que genera un desajuste temporal entre el empleo estable disponible y el que se requiere, por un periodo que no excederá de seis meses según lo previsto en el convenio colectivo de aplicación. ';
const prose = (length: number) => PROSE.repeat(Math.ceil(length / PROSE.length)).slice(0, length);
const month = (i: number) => `2025-${String((i % 12) + 1).padStart(2, '0')}`;
const CONTRACT_PAGES = 4;

export function employmentRecord(shape: RecordShape = LARGEST): Record<string, unknown> {
  const largest = shape.texts === 'largest';
  const text = (limit: number, typical: number) => prose(largest ? limit : typical);
  const named = (name: string, limit: number) => (largest ? name.padEnd(limit, 'X') : name);
  const company = named('Empresa Ficticia de Mantenimiento S.L.', 80);
  const category = named('Oficial de primera', 80);
  const concept = named('PLUS TRANSPORTE', 80);
  const historyPages = LIMITS.maxImages - CONTRACT_PAGES - shape.payslips - 1;
  const pages = [
    ...Array.from({ length: CONTRACT_PAGES }, (_, i) => page(i + 1, 'employment_contract', 1)),
    ...Array.from({ length: shape.payslips }, (_, i) =>
      page(CONTRACT_PAGES + i + 1, 'payslip', i + 2, month(i)),
    ),
    page(CONTRACT_PAGES + shape.payslips + 1, 'job_offer', shape.payslips + 2),
    ...Array.from({ length: historyPages }, (_, i) =>
      page(CONTRACT_PAGES + shape.payslips + i + 2, 'work_history', shape.payslips + 3),
    ),
  ];
  const lists = largest
    ? { salaryParts: 12, clauses: 10, hints: 3 }
    : { salaryParts: 4, clauses: 3, hints: 0 };
  return {
    pages,
    employment_contract: {
      employerType: f('company'),
      companyName: f(company),
      companyTaxId: f('B00000000'),
      workplaceRegion: f('PV'),
      signedOn: f('2025-01-02'),
      startDate: f('2025-01-02'),
      endDate: f('2025-06-30'),
      durationMonths: f(6),
      modalityText: f(text(120, 45)),
      modality: f('production_occasional'),
      partTime: f(true),
      causeText: f(text(600, 300)),
      replacedPersonNamed: f(false),
      replacementCauseStated: f(false),
      category: f(category),
      agreementName: f(text(160, 80)),
      agreementCode: f('99000000011900'),
      salaryAmount: f(1234.56),
      salaryPeriod: f('month'),
      annualSalaryAmount: f(17283.84),
      payments: f(14),
      prorated: f(false),
      inKindAmount: f(1234.56),
      weeklyHours: f(37.5),
      annualHours: f(1720.5),
      scheduleText: f(text(400, 150)),
      shifts: f(true),
      night: f(false),
      complementaryPercent: f(30),
      complementaryNoticeDays: f(3),
      overtimeAgreed: f('hours'),
      overtimeHoursPerYear: f(80),
      holidayDays: f(30),
      holidayUnit: f('calendar'),
      trialAmount: f(15),
      trialUnit: f('days'),
      remoteShare: f(40),
      trainingType: f('training_alternance'),
      studiesEndedOn: f('2024-06-30'),
      planAttached: f(true),
      effectiveWorkPercent: f(65),
      salaryParts: Array.from({ length: lists.salaryParts }, () => ({
        concept,
        amount: 1234.56,
        kind: 'fixed_complement',
        confidence: 'high',
      })),
      clauses: Array.from({ length: lists.clauses }, () => ({
        label: 'non_compete',
        literal: text(600, 450),
        months: 24,
        compensationStated: true,
        trainingDescribed: false,
        waivedRight: 'holidays',
        costsOnWorker: false,
        confidence: 'high',
      })),
      information: INFO_ELEMENTS.map((element) => ({
        element,
        presence: 'by_reference',
        confidence: 'high',
      })),
      relationshipHints: ['household', 'temp_agency', 'relief']
        .slice(0, lists.hints)
        .map((hint) => ({ hint, confidence: 'high' })),
    },
    job_offer: {
      position: f(category),
      salaryAmount: f(18000),
      salaryPeriod: f('year'),
      net: f(true),
      variable: f(true),
      weeklyHours: f(40),
      modality: f('permanent'),
      remote: f('hybrid'),
      publishedOn: f('2024-12-01'),
    },
    employment_payslips: {
      payslips: Array.from({ length: shape.payslips }, (_, i) => ({
        month: month(i),
        periodStart: `${month(i)}-01`,
        periodEnd: `${month(i)}-28`,
        daysWorked: 30,
        incidents: false,
        totalAccrued: 12345.67,
        partTimeCoefficient: 62.5,
        agreementName: text(160, 80),
        category,
        confidence: 'high',
      })),
      lines: Array.from({ length: shape.lines }, (_, i) => ({
        month: month(i),
        concept,
        amount: 1234.56,
        category: 'prorated_extra_pay',
        confidence: 'high',
      })),
    },
    employment_work_history: {
      contracts: Array.from({ length: shape.contracts }, (_, i) => ({
        startDate: `${2010 + Math.floor(i / 4)}-01-01`,
        endDate: `${2010 + Math.floor(i / 4)}-03-31`,
        employerType: 'company',
        employerName: company,
        accountCode: '28/0000000/00',
        partTimeCoefficient: 625,
        confidence: 'high',
      })),
    },
  };
}
