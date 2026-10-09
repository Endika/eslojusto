import { compareDates, parseDate, type CivilDate } from '../engine/date';
import { scope } from '../engine/employment/scope';
import {
  INFO_ELEMENTS,
  type Clause,
  type ClauseLabel,
  type EmploymentInput,
  type EmploymentPeriod,
  type InfoElement,
  type InfoPresence,
  type Modality,
  type Offer,
  type Payslip,
  type Relationship,
  type SalaryComponent,
  type SalaryComponentKind,
  type SalaryPeriod,
  type ScheduleDay,
  type Scope,
  type Trial,
  type Weekday,
} from '../engine/employment/types';
import {
  validate,
  type EmploymentField,
  type ValidationCode,
  type ValidationError,
} from '../engine/employment/validate';
import { parseAmount } from '../calculator/number';
import type { EmploymentFormField } from './ports';
import { ROW_LISTS, parseRowField, rowField, type RowList } from './rows';

// The sheets in order, each small enough for a phone's screen. The work history sits right after
// the modality: both are about how long the contract may be fixed-term, and its tab holds both.
// What the contract has to say comes last, so the walk always ends on a sheet that is asked.
export const SHEETS = [
  'relacion',
  'contratacion',
  'escrito',
  'fechas',
  'modalidad',
  'prorrogas',
  'causa',
  'sustitucion',
  'discontinuo',
  'formacion',
  'formacion-datos',
  'historial',
  'salario',
  'periodo',
  'horas',
  'pagas-extra',
  'desglose',
  'convenio',
  'convenio-cifras',
  'nominas',
  'jornada',
  'noche',
  'horas-extra',
  'horas-extra-pacto',
  'parcial',
  'parcial-horas',
  'complementarias',
  'prueba',
  'prueba-duracion',
  'prueba-antes',
  'vacaciones',
  'vacaciones-pago',
  'convenio-condiciones',
  'clausulas',
  'oferta',
  'oferta-salario',
  'oferta-contrato',
  'informacion',
  'informacion-puesto',
  'informacion-salario',
  'informacion-duracion',
  'informacion-igualdad',
  'informacion-otros',
] as const;
export type Sheet = (typeof SHEETS)[number];

// What the contract has to say, three points a sheet by topic; the first sheet carries the help.
export const INFO_SHEETS = [
  ['informacion', ['a', 'i']],
  ['informacion-puesto', ['c', 'd', 'e']],
  ['informacion-salario', ['f', 'g', 'h']],
  ['informacion-duracion', ['b', 'n', 'q']],
  ['informacion-igualdad', ['l', 'm', 'o']],
  ['informacion-otros', ['j', 'k', 'p']],
] as const satisfies readonly (readonly [Sheet, readonly InfoElement[]])[];
// The sheets that ask about the relationship: the gate reads them all before it decides.
const RELATION_SHEETS: readonly Sheet[] = ['relacion', 'contratacion', 'escrito', 'fechas'];
// The modality's sheets, skipped with it when the review is partial.
const MODALITY_SHEETS: readonly Sheet[] = [
  'modalidad',
  'prorrogas',
  'causa',
  'sustitucion',
  'discontinuo',
  'formacion',
  'formacion-datos',
];

export const RELATIONSHIPS: readonly Relationship[] = [
  'common',
  'household',
  'senior_management',
  'sport',
  'artist',
  'law_firm',
  'medical_resident',
  'special_employment_centre',
  'public_servant',
  'other_special',
];
export const MODALITIES: readonly Modality[] = [
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
];
// Modalities whose cause the contract must spell out (art. 15.1 ET).
export const CAUSED: readonly Modality[] = ['production', 'production_occasional', 'eventual'];
// Production contracts that may be extended once (art. 15.2 ET).
export const EXTENDABLE: readonly Modality[] = ['production', 'eventual'];
export const REPLACEMENTS: readonly Modality[] = ['replacement', 'interim'];
export const TRAINING: readonly Modality[] = ['training_alternance', 'training_practice'];
// Already open-ended: the work history cannot change anything.
export const OPEN_ENDED: readonly Modality[] = ['permanent', 'discontinuous'];
export const SALARY_PERIODS: readonly SalaryPeriod[] = ['year', 'month', 'day', 'hour'];
export const PART_KINDS: readonly SalaryComponentKind[] = [
  'base',
  'fixed_complement',
  'variable',
  'unknown',
];
export const EMPLOYERS: readonly EmploymentPeriod['employer'][] = [
  'same',
  'same_group',
  'same_via_agency',
  'other',
];
export const PERIOD_KINDS: readonly EmploymentPeriod['kind'][] = [
  'production',
  'replacement',
  'training',
  'permanent',
  'unknown',
];
export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];
export const TRIAL_UNITS: readonly Trial['unit'][] = ['days', 'weeks', 'months'];
export const CLAUSE_LABELS: readonly ClauseLabel[] = [
  'non_compete',
  'retention',
  'exclusivity',
  'waiver',
  'mandatory_overtime',
  'overtime_included',
  'remote_work_costs',
  'other',
];
export const WAIVED_RIGHTS = ['holidays', 'salary', 'severance', 'other'] as const;
export const INFO_PRESENCES: readonly InfoPresence[] = [
  'present',
  'by_reference',
  'absent',
  'unknown',
];
export const REMOTE_KINDS: readonly NonNullable<Offer['remote']>[] = ['none', 'hybrid', 'full'];

export const infoField = (element: InfoElement): `info_${InfoElement}` => `info_${element}`;

export type FieldErrorCode =
  ValidationCode | 'missing_value' | 'missing_choice' | 'invalid_amount' | 'invalid_number';

// The UI words `code` through `client.employment.error.<code>`.
export interface FieldError {
  readonly field: string;
  readonly code: FieldErrorCode;
}

const infoFields = (sheet: Sheet): EmploymentFormField[] =>
  INFO_SHEETS.find(([s]) => s === sheet)?.[1].map(infoField) ?? [];

// The questions each sheet asks; a row list counts by its name.
export const SHEET_FIELDS: Record<Sheet, readonly EmploymentFormField[]> = {
  relacion: ['relationship'],
  contratacion: ['viaTempAgency', 'relief'],
  escrito: ['under18', 'writtenContract'],
  fechas: ['signedOn', 'startDate', 'endDate'],
  modalidad: ['modality'],
  prorrogas: ['extensions'],
  causa: ['causeStated', 'circumstancesStated'],
  sustitucion: ['replacedPersonNamed', 'replacementCauseStated'],
  discontinuo: ['activityPeriod', 'discontinuousHours', 'distribution'],
  formacion: ['planAttached', 'studiesEndedOn'],
  'formacion-datos': ['disability', 'effectiveYear1', 'effectiveYear2'],
  historial: ['hasHistory', 'history', 'historyIncomplete'],
  salario: ['salaryAmount'],
  periodo: ['salaryPeriod', 'inKind'],
  horas: ['weeklyHours', 'annualHours'],
  'pagas-extra': ['extraPays', 'extraProrated'],
  desglose: ['hasBreakdown', 'parts'],
  convenio: ['agreementNamed'],
  'convenio-cifras': ['fullTimeHours', 'categorySalary', 'agreementAnnualHours'],
  nominas: ['hasPayslips', 'payslips'],
  jornada: ['hasSchedule', 'schedule', 'shifts'],
  noche: ['nightWorker', 'irregular'],
  'horas-extra': ['hasOvertime', 'overtimePaid'],
  'horas-extra-pacto': ['overtimeKind', 'overtimeHours'],
  parcial: ['remoteShare', 'realWeeklyHours', 'isPartTime'],
  'parcial-horas': ['hoursStated', 'distributionStated', 'hasComplementary'],
  complementarias: ['complementaryPercent', 'complementaryNotice', 'voluntaryPercent'],
  prueba: ['technical', 'hasTrial'],
  'prueba-duracion': ['trialAmount', 'trialUnit', 'smallCompany'],
  'prueba-antes': ['sameDutiesBefore', 'afterTraining'],
  vacaciones: ['hasHolidays', 'holidayDays', 'holidayUnit'],
  'vacaciones-pago': ['workDaysPerWeek', 'holidaysInSalary'],
  'convenio-condiciones': ['agreementTrialMonths', 'agreementHolidayDays'],
  clausulas: ['hasClauses', 'clauses'],
  oferta: ['hasOffer'],
  'oferta-salario': ['offerGross', 'offerHours', 'offerNet'],
  'oferta-contrato': ['offerModality', 'offerRemote'],
  informacion: infoFields('informacion'),
  'informacion-puesto': infoFields('informacion-puesto'),
  'informacion-salario': infoFields('informacion-salario'),
  'informacion-duracion': infoFields('informacion-duracion'),
  'informacion-igualdad': infoFields('informacion-igualdad'),
  'informacion-otros': infoFields('informacion-otros'),
};

// «payslips.0.salary» belongs to «payslips».
export const baseField = (field: string): string => field.split('.')[0] ?? field;

export const sheetOfField = (field: string): Sheet =>
  SHEETS.find((s) => (SHEET_FIELDS[s] as readonly string[]).includes(baseField(field))) ??
  'relacion';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// What a question that is not asked reads as: never a choice the person did not make, so every
// yes/no left out is «No lo sé» (null) and every list is empty.
const DEFAULTS: EmploymentInput = {
  relationship: 'common',
  viaTempAgency: false,
  relief: false,
  under18: false,
  writtenContract: null,
  startDate: { y: 2024, m: 1, d: 1 },
  endDate: null,
  signedOn: null,
  modality: 'unknown',
  extensions: 0,
  causeStated: null,
  circumstancesStated: null,
  replacedPersonNamed: null,
  replacementCauseStated: null,
  discontinuous: null,
  training: null,
  salary: {
    amount: 1000,
    period: 'month',
    payments: 14,
    prorated: false,
    breakdown: [],
    inKind: null,
  },
  contractHours: { weekly: null, annual: null },
  fullTimeHours: null,
  agreement: {
    named: false,
    categoryAnnualSalary: null,
    annualHours: null,
    holidayDays: null,
    trialMonths: null,
  },
  payslips: [],
  trial: null,
  technical: null,
  smallCompany: null,
  sameDutiesBefore: null,
  afterTraining: null,
  schedule: null,
  shifts: false,
  nightWorker: null,
  irregular: false,
  overtimeAgreed: null,
  partTime: null,
  remoteShare: null,
  realWeeklyHours: null,
  holidays: null,
  extraPays: null,
  clauses: [],
  info: Object.fromEntries(INFO_ELEMENTS.map((e) => [e, 'unknown'])) as Record<
    InfoElement,
    InfoPresence
  >,
  history: null,
  historyIncomplete: false,
  offer: null,
};

export const completeInput = (partial: Partial<EmploymentInput>): EmploymentInput => ({
  ...DEFAULTS,
  ...partial,
});

// Where each item of a list in the input sits on screen, so an engine error lands on its row. The
// schedule groups its rows by day: one day of the input holds every row of that day.
export type RowsOnScreen = Readonly<Record<RowList, readonly (readonly number[])[]>>;

interface Reading {
  readonly partial: Partial<Mutable<EmploymentInput>>;
  readonly errors: FieldError[];
  readonly rows: RowsOnScreen;
  // Null until the questions on the relationship read; then the reach of the review.
  readonly scope: Scope | null;
  readonly sheets: ReadonlySet<Sheet>;
}

const pick = <T extends string>(value: string | null, options: readonly T[]): T | null =>
  value !== null && (options as readonly string[]).includes(value) ? (value as T) : null;

const triState = (value: string | null): boolean | null | undefined =>
  value === 'yes' ? true : value === 'no' ? false : value === 'unknown' ? null : undefined;

const MONTH = /^(\d{4})-(\d{2})$/;

// The questions on the relationship decide the reach; the rest of the sheets follow from it.
function sheetsFor(reach: Scope | null, modality: Modality | undefined): Set<Sheet> {
  if (reach === null || !reach.inScope) return new Set(RELATION_SHEETS);
  return new Set(
    SHEETS.filter((s) => {
      if (MODALITY_SHEETS.includes(s)) return !reach.partial;
      if (s === 'historial')
        return !reach.partial && (modality === undefined || !OPEN_ENDED.includes(modality));
      return true;
    }),
  );
}

// FormData leaves out disabled controls, so a question that does not apply never reaches the
// engine; neither does a sheet the visit skips.
function read(form: HTMLFormElement): Reading {
  const data = new FormData(form);
  const partial: Partial<Mutable<EmploymentInput>> = {};
  const errors: FieldError[] = [];
  const text = (field: string): string | null => {
    const v = data.get(field);
    return typeof v === 'string' ? v : null;
  };
  const filled = (field: string): boolean => (text(field)?.trim() ?? '') !== '';
  // Whether the question is asked: some control of it is on and enabled.
  const asked = (field: string) => form.querySelector(`[name="${field}"]:not(:disabled)`) !== null;
  const fail = (field: string, code: FieldErrorCode) => errors.push({ field, code });

  const choice = <T extends string>(field: string, options: readonly T[]): T | null => {
    const v = pick(text(field), options);
    if (v === null) fail(field, 'missing_choice');
    return v;
  };
  const date = (field: string, required: boolean): CivilDate | null => {
    const t = text(field)?.trim() ?? '';
    if (t === '') {
      if (required) fail(field, 'missing_value');
      return null;
    }
    try {
      return parseDate(t);
    } catch {
      fail(field, 'invalid_date');
      return null;
    }
  };
  // Any figure: an amount, hours or a percentage; the engine checks its range.
  const figure = (field: string, required: boolean): number | null => {
    const n = parseAmount(text(field) ?? '');
    if (n === null) {
      if (required) fail(field, 'missing_value');
      return null;
    }
    if (Number.isNaN(n)) fail(field, 'invalid_amount');
    else return n;
    return null;
  };
  const whole = (field: string, required: boolean): number | null => {
    const n = parseAmount(text(field) ?? '');
    if (n === null) {
      if (required) fail(field, 'missing_value');
      return null;
    }
    if (Number.isNaN(n) || !Number.isInteger(n)) fail(field, 'invalid_number');
    else return n;
    return null;
  };
  const answer = (field: string): boolean | null | undefined => {
    const v = triState(text(field));
    if (v === undefined) fail(field, 'missing_choice');
    return v;
  };
  const yesNo = (field: string): boolean | undefined => {
    const v = triState(text(field));
    if (v === undefined || v === null) {
      fail(field, 'missing_choice');
      return undefined;
    }
    return v;
  };
  const enabledRows = (list: RowList): number[] =>
    [...form.querySelectorAll<HTMLElement>(`[data-rows="${list}"] [data-row]`)]
      .filter((row) => row.querySelector(`[name^="${list}."]:not(:disabled)`) !== null)
      .map((row) => Number(row.dataset['row']));
  const rows: Record<RowList, number[][]> = Object.fromEntries(
    ROW_LISTS.map((list) => [list, []]),
  ) as unknown as Record<RowList, number[][]>;

  // ---- relacion
  const relationship = choice('relationship', RELATIONSHIPS);
  if (relationship) partial.relationship = relationship;
  // Asked only of a common relationship: any other is outside the review whatever they say.
  const onlyIfCommon = (field: string): boolean | undefined =>
    asked(field) ? yesNo(field) : false;
  const agency = onlyIfCommon('viaTempAgency');
  if (agency !== undefined) partial.viaTempAgency = agency;
  const relief = onlyIfCommon('relief');
  if (relief !== undefined) partial.relief = relief;
  const minor = onlyIfCommon('under18');
  if (minor !== undefined) partial.under18 = minor;
  const written = asked('writtenContract') ? answer('writtenContract') : null;
  if (written !== undefined) partial.writtenContract = written;
  const start = date('startDate', true);
  if (start) partial.startDate = start;
  const signed = date('signedOn', false);
  if (signed || !filled('signedOn')) partial.signedOn = signed;
  const end = date('endDate', false);
  if (end || !filled('endDate')) partial.endDate = end;

  const relationRead =
    relationship !== null &&
    agency !== undefined &&
    relief !== undefined &&
    minor !== undefined &&
    start !== null &&
    (signed !== null || !filled('signedOn'));
  const reach = relationRead ? scope(completeInput(partial)) : null;

  // ---- modalidad
  const modalityAsked = sheetsFor(reach, undefined).has('modalidad');
  if (modalityAsked) {
    const modality = choice('modality', MODALITIES);
    if (modality) partial.modality = modality;
    if (asked('extensions')) {
      const n = whole('extensions', false);
      partial.extensions = n ?? 0;
    }
    if (asked('causeStated')) {
      const cause = answer('causeStated');
      if (cause !== undefined) partial.causeStated = cause;
      const circumstances = answer('circumstancesStated');
      if (circumstances !== undefined) partial.circumstancesStated = circumstances;
    }
    if (asked('replacedPersonNamed')) {
      const named = answer('replacedPersonNamed');
      if (named !== undefined) partial.replacedPersonNamed = named;
      const cause = answer('replacementCauseStated');
      if (cause !== undefined) partial.replacementCauseStated = cause;
    }
    if (asked('activityPeriod')) {
      const activityPeriod = answer('activityPeriod');
      const hours = answer('discontinuousHours');
      const distribution = answer('distribution');
      if (activityPeriod !== undefined && hours !== undefined && distribution !== undefined)
        partial.discontinuous = { activityPeriod, hours, distribution };
    }
    if (asked('planAttached')) {
      const plan = answer('planAttached');
      const studies = asked('studiesEndedOn') ? date('studiesEndedOn', false) : null;
      const disability = asked('disability') ? answer('disability') : null;
      const year1 = asked('effectiveYear1') ? figure('effectiveYear1', false) : null;
      const year2 = asked('effectiveYear2') ? figure('effectiveYear2', false) : null;
      if (plan !== undefined && disability !== undefined)
        partial.training = {
          studiesEndedOn: studies,
          disability,
          planAttached: plan,
          effectiveWorkPercent: { year1, year2 },
        };
    }
  }

  const sheets = sheetsFor(reach, partial.modality);

  // ---- historial
  if (sheets.has('historial')) {
    if (text('hasHistory') === 'yes') {
      const history: EmploymentPeriod[] = [];
      for (const i of enabledRows('history')) {
        const field = (key: string) => rowField('history', i, key);
        const from = date(field('startDate'), true);
        const to = date(field('endDate'), true);
        const employer = choice(field('employer'), EMPLOYERS);
        const kind = choice(field('kind'), PERIOD_KINDS);
        if (from && to && employer && kind) {
          history.push({ startDate: from, endDate: to, employer, kind });
          rows.history.push([i]);
        }
      }
      partial.history = history;
      partial.historyIncomplete = text('historyIncomplete') === 'yes';
    } else if (asked('hasHistory')) {
      if (text('hasHistory') !== 'no') fail('hasHistory', 'missing_choice');
      partial.history = null;
    }
  }

  // ---- salario
  if (sheets.has('salario')) {
    const amount = figure('salaryAmount', true);
    const period = choice('salaryPeriod', SALARY_PERIODS);
    const extras = whole('extraPays', true);
    // Without extra pays there is nothing to prorate, and the question is not asked.
    const prorated = asked('extraProrated') ? yesNo('extraProrated') : false;
    const inKind = figure('inKind', false);
    const breakdown: SalaryComponent[] = [];
    if (text('hasBreakdown') === 'yes') {
      for (const i of enabledRows('parts')) {
        const kind = choice(rowField('parts', i, 'kind'), PART_KINDS);
        const part = figure(rowField('parts', i, 'amount'), true);
        if (kind && part !== null) {
          breakdown.push({ kind, amount: part });
          rows.parts.push([i]);
        }
      }
    } else if (text('hasBreakdown') !== 'no') fail('hasBreakdown', 'missing_choice');
    if (amount !== null && period && extras !== null && prorated !== undefined) {
      // Twelve monthly payments and the extra ones, prorated or not (art. 31 ET).
      partial.salary = {
        amount,
        period,
        payments: 12 + extras,
        prorated,
        breakdown,
        inKind,
      };
      partial.extraPays = { count: extras, prorated };
    }
    partial.contractHours = {
      weekly: figure('weeklyHours', false),
      annual: figure('annualHours', false),
    };
    partial.fullTimeHours = figure('fullTimeHours', false);
    const named = yesNo('agreementNamed');
    partial.agreement = {
      ...DEFAULTS.agreement,
      ...partial.agreement,
      named: named ?? false,
      categoryAnnualSalary: figure('categorySalary', false),
      annualHours: figure('agreementAnnualHours', false),
    };
  }

  // ---- nominas
  if (sheets.has('nominas')) {
    if (text('hasPayslips') === 'yes') {
      const payslips: Payslip[] = [];
      for (const i of enabledRows('payslips')) {
        const field = (key: string) => rowField('payslips', i, key);
        const raw = text(field('month'))?.trim() ?? '';
        let month: string | null = null;
        if (raw === '') fail(field('month'), 'missing_value');
        else if (!MONTH.test(raw)) fail(field('month'), 'invalid_month');
        else month = raw;
        const wholeMonth = yesNo(field('wholeMonth'));
        const incidents = yesNo(field('incidents'));
        const salary = figure(field('salary'), true);
        const inKind = figure(field('inKind'), false);
        const prorated = figure(field('prorated'), false);
        if (month && wholeMonth !== undefined && incidents !== undefined && salary !== null) {
          payslips.push({
            month,
            wholeMonth,
            incidents,
            salaryInMoney: salary,
            inKind: inKind ?? 0,
            proratedExtraPay: prorated ?? 0,
            overtimeHours: null,
            complementaryHours: null,
          });
          rows.payslips.push([i]);
        }
      }
      partial.payslips = payslips;
    } else {
      if (text('hasPayslips') !== 'no') fail('hasPayslips', 'missing_choice');
      partial.payslips = [];
    }
  }

  // ---- jornada
  if (sheets.has('jornada')) {
    if (text('hasSchedule') === 'yes') {
      const byDay = new Map<Weekday, { slots: { from: string; to: string }[]; rows: number[] }>();
      for (const i of enabledRows('schedule')) {
        const field = (key: string) => rowField('schedule', i, key);
        const day = pick(
          text(field('day')),
          WEEKDAYS.map((d) => String(d)),
        );
        if (day === null) fail(field('day'), 'missing_choice');
        const from = text(field('from'))?.trim() ?? '';
        const to = text(field('to'))?.trim() ?? '';
        if (from === '') fail(field('from'), 'missing_value');
        if (to === '') fail(field('to'), 'missing_value');
        if (day === null || from === '' || to === '') continue;
        const d = Number(day) as Weekday;
        const group = byDay.get(d) ?? { slots: [], rows: [] };
        group.slots.push({ from, to });
        group.rows.push(i);
        byDay.set(d, group);
      }
      const days = [...byDay.entries()].sort(([a], [b]) => a - b);
      partial.schedule = days.map(([day, g]): ScheduleDay => ({ day, slots: g.slots }));
      rows.schedule.push(...days.map(([, g]) => g.rows));
    } else {
      if (text('hasSchedule') !== 'no') fail('hasSchedule', 'missing_choice');
      partial.schedule = null;
    }
    const shifts = yesNo('shifts');
    if (shifts !== undefined) partial.shifts = shifts;
    const night = answer('nightWorker');
    if (night !== undefined) partial.nightWorker = night;
    const irregular = yesNo('irregular');
    if (irregular !== undefined) partial.irregular = irregular;
    if (text('hasOvertime') === 'yes') {
      const kind = choice('overtimeKind', ['hours', 'as_needed'] as const);
      const hours = kind === 'hours' ? figure('overtimeHours', true) : null;
      const paid = answer('overtimePaid');
      if (kind && (kind === 'as_needed' || hours !== null) && paid !== undefined)
        partial.overtimeAgreed = {
          hoursPerYear: kind === 'as_needed' ? 'as_needed' : (hours ?? 0),
          paidInMoney: paid,
        };
    } else {
      if (text('hasOvertime') !== 'no') fail('hasOvertime', 'missing_choice');
      partial.overtimeAgreed = null;
    }
    if (text('isPartTime') === 'yes') {
      const hoursStated = yesNo('hoursStated');
      const distributionStated = yesNo('distributionStated');
      let complementary: { percent: number; noticeDays: number | null } | null = null;
      if (text('hasComplementary') === 'yes') {
        const percent = figure('complementaryPercent', true);
        const notice = whole('complementaryNotice', false);
        if (percent !== null) complementary = { percent, noticeDays: notice };
      } else if (text('hasComplementary') !== 'no') fail('hasComplementary', 'missing_choice');
      const voluntary = figure('voluntaryPercent', false);
      if (hoursStated !== undefined && distributionStated !== undefined)
        partial.partTime = {
          hoursStated,
          distributionStated,
          complementary,
          voluntaryPercent: voluntary,
        };
    } else {
      if (text('isPartTime') !== 'no') fail('isPartTime', 'missing_choice');
      partial.partTime = null;
    }
    partial.remoteShare = figure('remoteShare', false);
    partial.realWeeklyHours = figure('realWeeklyHours', false);
  }

  // ---- prueba
  if (sheets.has('prueba')) {
    if (text('hasTrial') === 'yes') {
      const amount = figure('trialAmount', true);
      const unit = choice('trialUnit', TRIAL_UNITS);
      if (amount !== null && unit) partial.trial = { amount, unit };
    } else {
      if (text('hasTrial') !== 'no') fail('hasTrial', 'missing_choice');
      partial.trial = null;
    }
    for (const field of ['technical', 'smallCompany', 'sameDutiesBefore', 'afterTraining'] as const)
      if (asked(field)) {
        const v = answer(field);
        if (v !== undefined) partial[field] = v;
      }
    const trialMonths = figure('agreementTrialMonths', false);
    partial.agreement = {
      ...DEFAULTS.agreement,
      ...partial.agreement,
      trialMonths,
    };
  }

  // ---- vacaciones
  if (sheets.has('vacaciones')) {
    if (text('hasHolidays') === 'yes') {
      const days = figure('holidayDays', true);
      const unit = choice('holidayUnit', ['calendar', 'working'] as const);
      const perWeek = unit === 'working' ? whole('workDaysPerWeek', false) : null;
      const included = yesNo('holidaysInSalary');
      if (days !== null && unit && included !== undefined)
        partial.holidays = {
          days,
          unit,
          workDaysPerWeek: perWeek,
          includedInSalary: included,
        };
    } else {
      if (text('hasHolidays') !== 'no') fail('hasHolidays', 'missing_choice');
      partial.holidays = null;
    }
    partial.agreement = {
      ...DEFAULTS.agreement,
      ...partial.agreement,
      holidayDays: whole('agreementHolidayDays', false),
    };
  }

  // ---- clausulas
  if (sheets.has('clausulas')) {
    if (text('hasClauses') === 'yes') {
      const clauses: Clause[] = [];
      for (const i of enabledRows('clauses')) {
        const field = (key: string) => rowField('clauses', i, key);
        const label = choice(field('label'), CLAUSE_LABELS);
        const months = asked(field('months')) ? whole(field('months'), false) : null;
        const compensation = asked(field('compensation')) ? answer(field('compensation')) : null;
        const training = asked(field('training')) ? answer(field('training')) : null;
        const waived = asked(field('waived')) ? choice(field('waived'), WAIVED_RIGHTS) : null;
        const costs = asked(field('costs')) ? answer(field('costs')) : null;
        const words = text(field('text'))?.trim() ?? '';
        if (
          label &&
          compensation !== undefined &&
          training !== undefined &&
          costs !== undefined &&
          (label !== 'waiver' || waived !== null)
        ) {
          clauses.push({
            label,
            months,
            compensationStated: compensation,
            trainingDescribed: training,
            waivedRight: waived,
            costsOnWorker: costs,
            literal: { text: words },
          });
          rows.clauses.push([i]);
        }
      }
      partial.clauses = clauses;
    } else {
      if (text('hasClauses') !== 'no') fail('hasClauses', 'missing_choice');
      partial.clauses = [];
    }
  }

  // ---- informacion
  if (sheets.has('informacion')) {
    const info = { ...DEFAULTS.info };
    for (const element of INFO_ELEMENTS) {
      const presence = choice(infoField(element), INFO_PRESENCES);
      if (presence) info[element] = presence;
    }
    partial.info = info;
  }

  // ---- oferta
  if (sheets.has('oferta')) {
    if (text('hasOffer') === 'yes') {
      const gross = figure('offerGross', false);
      const net = yesNo('offerNet');
      const hours = figure('offerHours', false);
      const modality = pick(text('offerModality'), MODALITIES);
      const remote = pick(text('offerRemote'), REMOTE_KINDS);
      if (net !== undefined)
        partial.offer = {
          grossAnnual: gross,
          net,
          weeklyHours: hours,
          modality: modality === 'unknown' ? null : modality,
          remote,
        };
    } else {
      if (text('hasOffer') !== 'no') fail('hasOffer', 'missing_choice');
      partial.offer = null;
    }
  }

  return {
    partial,
    errors: errors.filter((e) => sheets.has(sheetOfField(e.field))),
    rows,
    scope: reach,
    sheets,
  };
}

// The reach of the review once the questions on the relationship read; null until then.
export const formScope = (form: HTMLFormElement): Scope | null => read(form).scope;

// Whether the visit asks a sheet, given the answers so far.
export const sheetApplies = (form: HTMLFormElement, sheet: Sheet): boolean =>
  read(form).sheets.has(sheet);

// The answers so far with every question not asked at its neutral value: what the gate and an
// out-of-scope result are worked out from.
export const answersSoFar = (form: HTMLFormElement): EmploymentInput =>
  completeInput(read(form).partial);

const rowOf = (rows: RowsOnScreen, list: RowList, index: number | null): number =>
  rows[list][index ?? 0]?.[0] ?? index ?? 0;

const FIELD_OF: Partial<Record<EmploymentField, string>> = {
  'training.studiesEndedOn': 'studiesEndedOn',
  'salary.amount': 'salaryAmount',
  'salary.payments': 'extraPays',
  'salary.inKind': 'inKind',
  'contractHours.weekly': 'weeklyHours',
  'contractHours.annual': 'annualHours',
  'agreement.categoryAnnualSalary': 'categorySalary',
  'agreement.annualHours': 'agreementAnnualHours',
  'agreement.holidayDays': 'agreementHolidayDays',
  'agreement.trialMonths': 'agreementTrialMonths',
  'trial.amount': 'trialAmount',
  'overtimeAgreed.hoursPerYear': 'overtimeHours',
  'partTime.voluntaryPercent': 'voluntaryPercent',
  'holidays.days': 'holidayDays',
  'holidays.workDaysPerWeek': 'workDaysPerWeek',
  'extraPays.count': 'extraPays',
  'offer.grossAnnual': 'offerGross',
  'offer.weeklyHours': 'offerHours',
};

const outOfPercent = (v: number | null): boolean => v !== null && (v < 0 || v > 100);

// Puts an engine error on the field that asked for it.
export function fieldOfError(
  e: ValidationError,
  rows: RowsOnScreen,
  input: EmploymentInput,
): string {
  const { field, index } = e;
  switch (field) {
    case 'training.effectiveWorkPercent':
      return outOfPercent(input.training?.effectiveWorkPercent.year1 ?? null)
        ? 'effectiveYear1'
        : 'effectiveYear2';
    case 'salary.breakdown':
      return rowField('parts', rowOf(rows, 'parts', index), 'amount');
    case 'payslips.month':
      return rowField('payslips', rowOf(rows, 'payslips', index), 'month');
    case 'payslips.salaryInMoney':
    case 'payslips.hours':
      return rowField('payslips', rowOf(rows, 'payslips', index), 'salary');
    case 'payslips.inKind':
      return rowField('payslips', rowOf(rows, 'payslips', index), 'inKind');
    case 'payslips.proratedExtraPay':
      return rowField('payslips', rowOf(rows, 'payslips', index), 'prorated');
    case 'schedule':
      return rowField('schedule', rowOf(rows, 'schedule', index), 'to');
    case 'partTime.complementary':
      return outOfPercent(input.partTime?.complementary?.percent ?? null)
        ? 'complementaryPercent'
        : 'complementaryNotice';
    case 'clauses.months':
      return rowField('clauses', rowOf(rows, 'clauses', index), 'months');
    case 'history': {
      const period = input.history?.[index ?? 0];
      const key =
        e.code === 'before_start' ||
        (period !== undefined && compareDates(period.endDate, period.startDate) < 0)
          ? 'endDate'
          : 'startDate';
      return rowField('history', rowOf(rows, 'history', index), key);
    }
    default:
      return FIELD_OF[field] ?? field;
  }
}

// The engine's checks for whatever the form already says, on the fields that asked.
function engineErrors(r: Reading, today: CivilDate): FieldError[] {
  const input = completeInput(r.partial);
  return validate(input, today)
    .map((e) => ({ field: fieldOfError(e, r.rows, input), code: e.code }))
    .filter((e) => r.sheets.has(sheetOfField(e.field)));
}

export function sheetErrors(form: HTMLFormElement, sheet: Sheet, today: CivilDate): FieldError[] {
  const r = read(form);
  const fields: readonly string[] = SHEET_FIELDS[sheet];
  const own = r.errors.filter((e) => fields.includes(baseField(e.field)));
  const withError = new Set(own.map((e) => e.field));
  const fromEngine = engineErrors(r, today).filter(
    (e) => fields.includes(baseField(e.field)) && !withError.has(e.field),
  );
  return [...own, ...fromEngine];
}

export function readEmploymentForm(
  form: HTMLFormElement,
  today: CivilDate,
): { readonly input: EmploymentInput } | { readonly errors: readonly FieldError[] } {
  const r = read(form);
  if (r.errors.length > 0) return { errors: r.errors };
  const errors = engineErrors(r, today);
  if (errors.length > 0) return { errors };
  return { input: completeInput(r.partial) };
}

// The list a row field belongs to, for focusing the right sheet.
export const listOfField = (field: string): RowList | null => parseRowField(field)?.list ?? null;
