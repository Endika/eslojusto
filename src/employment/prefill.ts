import { formatAmountInput } from '../calculator/number';
import {
  EMPLOYMENT_CHECKS,
  EMPLOYMENT_LIST_MAXIMA,
  type Confidence,
  type EmploymentExtraction,
  type ExtractedRow,
  type ExtractedValue,
  type FailedCheck,
  type SourcedField,
} from '../documents/contract';
import type { ReadMark, ReadPrefill } from '../documents/ports';
import {
  addDays,
  addMonthsClamped,
  compareDates,
  daysInMonth,
  parseDate,
  toIso,
  type CivilDate,
} from '../engine/date';
import { INFO_ELEMENTS, type SalaryPeriod } from '../engine/employment/types';
import type { ClientKey, Translate } from '../i18n/client';
import {
  CLAUSE_LABELS,
  MODALITIES,
  PART_KINDS,
  RELATIONSHIPS,
  REMOTE_KINDS,
  SALARY_PERIODS,
  TRIAL_UNITS,
  WAIVED_RIGHTS,
  infoField,
} from './form';
import { ROW_MAX, rowField, type RowList } from './rows';

// The questions beside which the documents' own words are shown, so the person can check the
// answer against them.
export const QUOTED = [
  'modality',
  'causeStated',
  'replacementCauseStated',
  'agreementNamed',
  'categorySalary',
  'hasSchedule',
] as const;
export type Quoted = (typeof QUOTED)[number];

export interface EmploymentPrefill extends ReadPrefill {
  readonly quotes: Readonly<Partial<Record<Quoted, string>>>;
}

const RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };
const lowest = (...cs: Confidence[]): Confidence =>
  cs.reduce((a, b) => (RANK[b] < RANK[a] ? b : a), 'high');

const isNumber = (v: ExtractedValue | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const amountOf = (v: ExtractedValue | undefined): number | null =>
  isNumber(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
const wholeOf = (v: ExtractedValue | undefined): number | null =>
  isNumber(v) && Number.isInteger(v) && v >= 0 ? v : null;
const textOf = (v: ExtractedValue | undefined): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
const oneOf = <T extends string>(v: ExtractedValue | undefined, options: readonly T[]): T | null =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : null;
const yesNo = (v: ExtractedValue | undefined): 'yes' | 'no' | null =>
  v === true ? 'yes' : v === false ? 'no' : null;

function dateOf(v: ExtractedValue | undefined): CivilDate | null {
  if (typeof v !== 'string') return null;
  try {
    return parseDate(v);
  } catch {
    return null;
  }
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthOf = (v: ExtractedValue | undefined): string | null =>
  typeof v === 'string' && MONTH.test(v) ? v : null;

const amountText = formatAmountInput;

class Answers {
  readonly entries: [string, string][] = [];
  readonly marks: ReadMark[] = [];
  cut = false;

  // An answer read, or worked out from what was read, marked as such.
  read(name: string, value: string, confidence: Confidence, derived = false) {
    this.entries.push([name, value]);
    this.marks.push({
      id: name,
      container: `[data-field="${name}"]`,
      confidence,
      ...(derived && { derived: true as const }),
    });
  }

  // An answer that only opens what was read, such as «Sí, añadirlas» above its rows.
  open(name: string, value: string) {
    this.entries.push([name, value]);
  }

  // At most as many rows as the list holds; the rest is said, never dropped quietly.
  rows<T>(list: RowList, items: readonly T[]): readonly T[] {
    if (items.length > ROW_MAX[list]) this.cut = true;
    return items.slice(0, ROW_MAX[list]);
  }
}

type Fields = EmploymentExtraction['fields'];
type FieldName = keyof Fields;

// Reads a field into an answer when it holds a value the form takes.
function fieldReader(a: Answers, fields: Fields) {
  return {
    date(form: string, name: FieldName) {
      const f = fields[name];
      const d = dateOf(f?.value);
      if (f && d) a.read(form, toIso(d), f.confidence);
      return d;
    },
    choice<T extends string>(form: string, name: FieldName, options: readonly T[]) {
      const f = fields[name];
      const v = oneOf(f?.value, options);
      if (f && v) a.read(form, v, f.confidence);
      return v;
    },
    flag(form: string, name: FieldName) {
      const f = fields[name];
      const v = yesNo(f?.value);
      if (f && v) a.read(form, v, f.confidence);
      return v;
    },
    figure(form: string, name: FieldName) {
      const f = fields[name];
      const v = amountOf(f?.value);
      if (f && v !== null) a.read(form, amountText(v), f.confidence);
      return v;
    },
  };
}

// The relationship the contract states, as a hint the person confirms; the gate acts on it as if
// it were typed. A contract that names none is preselected as the common one, less surely.
function relationship(a: Answers, e: EmploymentExtraction, contractRead: boolean) {
  const hints = e.relationshipHints.flatMap((row) => {
    const hint = row.values['hint'];
    return typeof hint === 'string' ? [{ hint, confidence: row.confidence }] : [];
  });
  const special = hints.filter(
    (h) => h.hint !== 'common' && (RELATIONSHIPS as readonly string[]).includes(h.hint),
  );
  const first = special[0];
  if (first) {
    a.read('relationship', first.hint, special.length > 1 ? 'low' : first.confidence);
    return;
  }
  if (contractRead) a.read('relationship', 'common', 'medium', true);
  for (const [name, hint] of [
    ['viaTempAgency', 'temp_agency'],
    ['relief', 'relief'],
  ] as const) {
    const named = hints.find((h) => h.hint === hint);
    if (named) a.read(name, 'yes', named.confidence);
    else if (contractRead) a.read(name, 'no', 'medium', true);
  }
  if (contractRead) a.read('writtenContract', 'yes', 'high', true);
}

function dates(
  a: Answers,
  fields: Fields,
): { readonly start: CivilDate | null; readonly end: CivilDate | null } {
  const read = fieldReader(a, fields);
  const start = read.date('startDate', 'startDate');
  read.date('signedOn', 'signedOn');
  const end = read.date('endDate', 'endDate');
  if (end) return { start, end };
  // A duration in months ends the day before the same day that many months on.
  const months = fields.durationMonths;
  const n = wholeOf(months?.value);
  if (!start || !months || n === null || n <= 0) return { start, end: null };
  const worked = addDays(addMonthsClamped(start, n), -1);
  a.read('endDate', toIso(worked), lowest(months.confidence, 'medium'), true);
  return { start, end: worked };
}

function modality(a: Answers, fields: Fields) {
  const read = fieldReader(a, fields);
  if (!read.choice('modality', 'modality', MODALITIES))
    read.choice('modality', 'trainingType', MODALITIES);
  read.flag('replacedPersonNamed', 'replacedPersonNamed');
  read.flag('planAttached', 'planAttached');
  read.date('studiesEndedOn', 'studiesEndedOn');
  read.figure('effectiveYear1', 'effectiveWorkPercent');
}

// The salary and its period, once each: the annual figure, by the year, when it is the only one.
function salaryAndPeriod(a: Answers, fields: Fields): SalaryPeriod | null {
  const read = fieldReader(a, fields);
  const annual = fields.annualSalaryAmount;
  const annualAmount = amountOf(annual?.value);
  if (read.figure('salaryAmount', 'salaryAmount') !== null || !annual || annualAmount === null)
    return read.choice('salaryPeriod', 'salaryPeriod', SALARY_PERIODS);
  a.read('salaryAmount', amountText(annualAmount), annual.confidence);
  a.read('salaryPeriod', 'year', annual.confidence);
  return 'year';
}

// Whether the contract's twelve payments seem to hold the extra pays, which leaves their number
// to the person.
function salary(a: Answers, fields: Fields, parts: readonly ExtractedRow[]): boolean {
  const read = fieldReader(a, fields);
  const period = salaryAndPeriod(a, fields);
  // Twelve monthly payments and the extra ones: the form asks for the extra ones. Twelve payments
  // with the extras prorated hold them inside, in a number the contract does not give.
  const payments = fields.payments;
  const count = wholeOf(payments?.value);
  const inTwelve = count === 12 && fields.prorated?.value === true;
  const extras = payments && count !== null && count >= 12 && !inTwelve ? count - 12 : null;
  if (payments && extras !== null) a.read('extraPays', String(extras), payments.confidence, true);
  if (extras !== 0 && !inTwelve) read.flag('extraProrated', 'prorated');
  // The contract gives pay in kind a year; the form takes it for the salary's period.
  const inKind = fields.inKindAmount;
  const yearly = amountOf(inKind?.value);
  if (inKind && yearly !== null && period === 'year')
    a.read('inKind', amountText(yearly), inKind.confidence);
  else if (inKind && yearly !== null && period === 'month')
    a.read('inKind', amountText(Math.round((yearly / 12) * 100) / 100), inKind.confidence, true);
  read.figure('weeklyHours', 'weeklyHours');
  read.figure('annualHours', 'annualHours');
  const agreement = [fields.agreementName, fields.agreementCode].find(
    (f) => f?.source === 'employment_contract',
  );
  if (agreement) a.read('agreementNamed', 'yes', agreement.confidence);

  salaryParts(a, parts);
  return inTwelve;
}

function salaryParts(a: Answers, parts: readonly ExtractedRow[]) {
  const rows = a.rows(
    'parts',
    parts.filter(
      (r) => oneOf(r.values['kind'], PART_KINDS) && amountOf(r.values['amount']) !== null,
    ),
  );
  if (rows.length === 0) return;
  a.open('hasBreakdown', 'yes');
  rows.forEach((row, i) => {
    a.read(rowField('parts', i, 'kind'), String(row.values['kind']), row.confidence);
    a.read(
      rowField('parts', i, 'amount'),
      amountText(amountOf(row.values['amount']) ?? 0),
      row.confidence,
    );
  });
}

// What each earnings line counts as on the payslips sheet: salary in money, the prorated extra
// pays and pay in kind. Every other line is left out, and said.
const SALARY_LINES = ['salary', 'fixed_complement'] as const;
const LEFT_OUT_LINES = [
  'variable',
  'overtime',
  'complementary_hours',
  'extra_pay',
  'expenses',
  'one_off',
  'other',
] as const;
type LeftOutLine = (typeof LEFT_OUT_LINES)[number];

interface MonthSums {
  salary: number;
  prorated: number;
  inKind: number;
  confidence: Confidence;
}

// The lines of each payslip month, summed by what they count as, in cents.
function sumLines(lines: readonly ExtractedRow[]) {
  const months = new Map<string, MonthSums>();
  const leftOut = new Set<LeftOutLine>();
  for (const row of lines) {
    const month = monthOf(row.values['month']);
    const amount = amountOf(row.values['amount']);
    const category = row.values['category'];
    if (!month || amount === null || typeof category !== 'string') continue;
    const sums = months.get(month) ?? {
      salary: 0,
      prorated: 0,
      inKind: 0,
      confidence: 'high',
    };
    const cents = Math.round(amount * 100);
    if ((SALARY_LINES as readonly string[]).includes(category)) sums.salary += cents;
    else if (category === 'prorated_extra_pay') sums.prorated += cents;
    else if (category === 'in_kind') sums.inKind += cents;
    else {
      const left = oneOf(category, LEFT_OUT_LINES);
      if (left) leftOut.add(left);
      continue;
    }
    sums.confidence = lowest(sums.confidence, row.confidence);
    months.set(month, sums);
  }
  return { months, leftOut };
}

const isoOf = (month: string, day: number) => `${month}-${String(day).padStart(2, '0')}`;

// Whether a payslip pays the whole calendar month: by its period when it prints one, else by the
// days it pays, which says less.
function wholeMonth(
  row: ExtractedRow,
  month: string,
): { readonly value: 'yes' | 'no'; readonly derived: boolean } | null {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = daysInMonth(y, m);
  const start = dateOf(row.values['periodStart']);
  const end = dateOf(row.values['periodEnd']);
  if (start && end) {
    const whole = toIso(start) === isoOf(month, 1) && toIso(end) === isoOf(month, last);
    return { value: whole ? 'yes' : 'no', derived: false };
  }
  const days = wholeOf(row.values['daysWorked']);
  if (days === null) return null;
  // A whole month is paid as 30 days or as its calendar days; 28 or 29 in February, or 30 in a
  // 31-day month, may be either a whole month or not, and is left to the person.
  if (days >= Math.max(30, last)) return { value: 'yes', derived: true };
  if ((m === 2 && days >= 28) || (last === 31 && days === 30)) return null;
  return { value: 'no', derived: true };
}

function payslips(
  a: Answers,
  slips: readonly ExtractedRow[],
  lines: readonly ExtractedRow[],
  doubts: { readonly mismatch: boolean; readonly cut: boolean },
) {
  const { months: sums, leftOut } = sumLines(lines);
  // Lines that may be cut to their most recent rows may hold only part of their earliest month:
  // its sum could read short, so it is left to the person.
  const partial = doubts.cut ? [...sums.keys()].sort()[0] : undefined;
  const byMonth = new Map<string, ExtractedRow>();
  for (const row of slips) {
    const month = monthOf(row.values['month']);
    if (month && !byMonth.has(month)) byMonth.set(month, row);
  }
  const months = a.rows('payslips', [...new Set([...byMonth.keys(), ...sums.keys()])].sort());
  if (months.length === 0) return { leftOut, unsummed: false, partial: false };
  a.open('hasPayslips', 'yes');
  let unsummed = false;
  months.forEach((month, i) => {
    const field = (key: string) => rowField('payslips', i, key);
    const slip = byMonth.get(month);
    const sum = sums.get(month);
    const base = lowest(slip?.confidence ?? 'high', sum?.confidence ?? 'high');
    a.read(field('month'), month, slip?.confidence ?? sum?.confidence ?? 'high');
    if (month === partial) {
      // Its month is still listed; its sums are the person's.
    } else if (sum && sum.salary > 0) {
      // Lines that do not add up to the payslip's total leave every sum in doubt.
      const confidence = doubts.mismatch ? 'low' : base;
      a.read(field('salary'), amountText(sum.salary / 100), confidence, true);
      if (sum.prorated > 0)
        a.read(field('prorated'), amountText(sum.prorated / 100), confidence, true);
      if (sum.inKind > 0) a.read(field('inKind'), amountText(sum.inKind / 100), confidence, true);
    } else unsummed = true;
    if (!slip) return;
    const whole = wholeMonth(slip, month);
    if (whole) a.read(field('wholeMonth'), whole.value, slip.confidence, whole.derived);
    const incidents = yesNo(slip.values['incidents']);
    if (incidents) a.read(field('incidents'), incidents, slip.confidence);
  });
  return { leftOut, unsummed, partial: partial !== undefined && months.includes(partial) };
}

function time(a: Answers, fields: Fields) {
  const read = fieldReader(a, fields);
  read.flag('shifts', 'shifts');
  read.flag('nightWorker', 'night');
  const overtime = fields.overtimeAgreed;
  const agreed = oneOf(overtime?.value, ['none', 'hours', 'as_needed', 'included'] as const);
  if (overtime && agreed === 'none') a.read('hasOvertime', 'no', overtime.confidence);
  if (overtime && agreed === 'as_needed') {
    a.read('hasOvertime', 'yes', overtime.confidence);
    a.read('overtimeKind', 'as_needed', overtime.confidence);
  }
  const hours = fields.overtimeHoursPerYear;
  const perYear = wholeOf(hours?.value);
  if (overtime && agreed === 'hours') {
    a.read('hasOvertime', 'yes', overtime.confidence);
    a.read('overtimeKind', 'hours', overtime.confidence);
    if (hours && perYear !== null) a.read('overtimeHours', amountText(perYear), hours.confidence);
  }
  if (read.flag('isPartTime', 'partTime') === 'yes') {
    const percent = fields.complementaryPercent;
    if (percent && amountOf(percent.value) !== null) {
      a.read('hasComplementary', 'yes', percent.confidence);
      read.figure('complementaryPercent', 'complementaryPercent');
      const notice = fields.complementaryNoticeDays;
      const days = wholeOf(notice?.value);
      if (notice && days !== null) a.read('complementaryNotice', String(days), notice.confidence);
    }
  }
  read.figure('remoteShare', 'remoteShare');
}

// The trial period and the holidays the contract states; whether the holidays' days are
// calendar or working days is not always printed, and then it is said.
function trialAndHolidays(a: Answers, fields: Fields): boolean {
  const read = fieldReader(a, fields);
  const trial = fields.trialAmount;
  const unit = oneOf(fields.trialUnit?.value, TRIAL_UNITS);
  if (trial && amountOf(trial.value) !== null && unit) {
    a.read('hasTrial', 'yes', trial.confidence);
    read.figure('trialAmount', 'trialAmount');
    read.choice('trialUnit', 'trialUnit', TRIAL_UNITS);
  }
  const holidays = fields.holidayDays;
  if (!holidays || amountOf(holidays.value) === null) return false;
  a.read('hasHolidays', 'yes', holidays.confidence);
  read.figure('holidayDays', 'holidayDays');
  return read.choice('holidayUnit', 'holidayUnit', ['calendar', 'working'] as const) === null;
}

function clauses(a: Answers, rows: readonly ExtractedRow[]) {
  const read = a.rows(
    'clauses',
    rows.filter((r) => oneOf(r.values['label'], CLAUSE_LABELS)),
  );
  if (read.length === 0) return;
  a.open('hasClauses', 'yes');
  read.forEach((row, i) => {
    const field = (key: string) => rowField('clauses', i, key);
    const v = row.values;
    a.read(field('label'), String(v['label']), row.confidence);
    const months = wholeOf(v['months']);
    if (months !== null) a.read(field('months'), String(months), row.confidence);
    for (const [key, name] of [
      ['compensation', 'compensationStated'],
      ['training', 'trainingDescribed'],
      ['costs', 'costsOnWorker'],
    ] as const) {
      const answer = yesNo(v[name]);
      if (answer) a.read(field(key), answer, row.confidence);
    }
    const waived = oneOf(v['waivedRight'], WAIVED_RIGHTS);
    if (waived) a.read(field('waived'), waived, row.confidence);
    // The clause's own words, beside the label read for it, so the label can be checked.
    const literal = textOf(v['literal']);
    if (literal) a.read(field('text'), literal, row.confidence);
  });
}

function information(a: Answers, rows: readonly ExtractedRow[]) {
  for (const row of rows) {
    const element = oneOf(row.values['element'], INFO_ELEMENTS);
    const presence = oneOf(row.values['presence'], ['present', 'by_reference', 'absent'] as const);
    if (element && presence) a.read(infoField(element), presence, row.confidence);
  }
}

// The offer, beside the contract; the form takes its salary a year, so another period is said.
function offer(a: Answers, fields: Fields): boolean {
  const names: readonly FieldName[] = [
    'offerSalaryAmount',
    'offerNet',
    'offerWeeklyHours',
    'offerModality',
    'offerRemote',
  ];
  if (!names.some((n) => fields[n] !== undefined)) return false;
  const read = fieldReader(a, fields);
  a.open('hasOffer', 'yes');
  const period = oneOf(fields.offerSalaryPeriod?.value, SALARY_PERIODS);
  const salaryRead = fields.offerSalaryAmount !== undefined;
  if (period === 'year') read.figure('offerGross', 'offerSalaryAmount');
  read.flag('offerNet', 'offerNet');
  read.figure('offerHours', 'offerWeeklyHours');
  read.choice(
    'offerModality',
    'offerModality',
    MODALITIES.filter((m) => m !== 'unknown'),
  );
  read.choice('offerRemote', 'offerRemote', REMOTE_KINDS);
  return salaryRead && period !== 'year';
}

// A history row this close to the contract's start is the contract itself.
const SAME_CONTRACT_DAYS = 3;
const near = (a: CivilDate, b: CivilDate) =>
  compareDates(a, addDays(b, -SAME_CONTRACT_DAYS)) >= 0 &&
  compareDates(a, addDays(b, SAME_CONTRACT_DAYS)) <= 0;

// Names compared without case, accents, punctuation or the company's legal form.
const LEGAL_FORMS = /\b(s\s?l\s?u?|s\s?a\s?u?|s\s?c\s?o\s?o\s?p|s\s?l\s?l|s\s?c)\b\s*$/;
function nameKey(name: string): string {
  const plain = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
  return plain.replace(LEGAL_FORMS, '').trim();
}
const codeKey = (code: string) => code.replace(/\D/g, '');

type Employer = 'same' | 'other' | null;

// «La misma empresa» when the row's name or account code matches the contract's employer; «Otra
// empresa» when what both state differs; nothing when there is nothing to compare.
function employerOf(
  row: ExtractedRow,
  ours: { readonly name: string | null; readonly code: string | null },
): Employer {
  const name = textOf(row.values['employerName']);
  const code = textOf(row.values['accountCode']);
  const same = (a: string, b: string) => (a !== '' && b !== '' ? a === b : null);
  const compared = [
    name && ours.name ? same(nameKey(name), nameKey(ours.name)) : null,
    code && ours.code ? same(codeKey(code), codeKey(ours.code)) : null,
  ].filter((m): m is boolean => m !== null);
  if (compared.length === 0) return null;
  return compared.some(Boolean) ? 'same' : 'other';
}

// Every row of the work history, the contract's own included, as the sheet asks. The contract's
// row gives its employer's account code, and still running, the contract's end. The kind of each
// contract is the person's to say.
function history(
  a: Answers,
  rows: readonly ExtractedRow[],
  contract: { readonly start: CivilDate | null; readonly end: CivilDate | null },
  companyName: string | null,
  cut: boolean,
) {
  const isCurrent = (row: ExtractedRow) => {
    const start = dateOf(row.values['startDate']);
    return contract.start !== null && start !== null && near(start, contract.start);
  };
  const current = rows.find(isCurrent);
  const ours = {
    name: companyName,
    code: current ? textOf(current.values['accountCode']) : null,
  };
  const read = a.rows(
    'history',
    rows.filter((r) => dateOf(r.values['startDate']) !== null),
  );
  if (read.length === 0) return;
  a.open('hasHistory', 'yes');
  read.forEach((row, i) => {
    const field = (key: string) => rowField('history', i, key);
    const start = dateOf(row.values['startDate']);
    const end = dateOf(row.values['endDate']);
    if (start) a.read(field('startDate'), toIso(start), row.confidence);
    if (end) a.read(field('endDate'), toIso(end), row.confidence);
    else if (row === current && contract.end)
      a.read(field('endDate'), toIso(contract.end), row.confidence, true);
    const employer = row === current ? 'same' : employerOf(row, ours);
    // A name is matched less surely than the row of the contract itself.
    if (employer)
      a.read(
        field('employer'),
        employer,
        row === current ? row.confidence : lowest(row.confidence, 'medium'),
        true,
      );
  });
  if (cut) a.read('historyIncomplete', 'yes', 'high', true);
}

// The lists whose maximum means rows were left out; the information elements are all there is.
const CUT_LISTS = ['salaryParts', 'clauses', 'payslips', 'lines', 'contracts'] as const;
type CutList = (typeof CUT_LISTS)[number];

// Which lists reached their maximum when the API says one was cut; rows that failed its checks
// can leave a cut list short of it, so `unknown` says the cut may be anywhere. Any read work
// history is then taken as possibly cut: that only leaves the chaining count in doubt.
function cutLists(e: EmploymentExtraction) {
  if (!e.truncated) return { lists: [] as CutList[], history: false, unknown: false };
  const lists = CUT_LISTS.filter((l) => e[l].length >= EMPLOYMENT_LIST_MAXIMA[l]);
  return { lists, history: e.contracts.length > 0, unknown: lists.length === 0 };
}

// Category and agreement are not asked as such, so a disagreement is only said.
const CONFLICT_FIELDS = ['category', 'agreementName'] as const;

// What a reading puts into the review's sheets. Nothing here reviews anything: it only fills
// answers, each marked as read and how surely, and the person confirms every sheet before the
// review runs. `answers` are the form's current ones, by name.
export function employmentPrefill(
  e: EmploymentExtraction,
  answers: Readonly<Record<string, string>>,
  tr: Translate,
  checks: readonly FailedCheck[] = [],
): EmploymentPrefill {
  const a = new Answers();
  const contractRead = e.documents.some((d) => d.kind === 'employment_contract');
  relationship(a, e, contractRead);
  const contractDates = dates(a, e.fields);
  modality(a, e.fields);
  const cut = cutLists(e);
  history(
    a,
    e.contracts,
    {
      start: contractDates.start ?? dateOf(answers['startDate']),
      end: contractDates.end ?? dateOf(answers['endDate']),
    },
    textOf(e.fields.companyName?.value),
    cut.history,
  );
  const extrasInTwelve = salary(a, e.fields, e.salaryParts);
  const slips = payslips(a, e.payslips, e.lines, {
    mismatch: checks.includes('payslip_lines_do_not_sum'),
    cut: cut.lists.includes('lines') || cut.unknown,
  });
  time(a, e.fields);
  const holidayUnitMissing = trialAndHolidays(a, e.fields);
  clauses(a, e.clauses);
  information(a, e.information);
  const offerPeriod = offer(a, e.fields);

  const quotes: Partial<Record<Quoted, string>> = {};
  const quote = (q: Quoted, f: SourcedField | undefined) => {
    const text = textOf(f?.value);
    if (text) quotes[q] = text;
  };
  quote('modality', e.fields.modalityText);
  quote('causeStated', e.fields.causeText);
  quote('replacementCauseStated', e.fields.causeText);
  quote('hasSchedule', e.fields.scheduleText);
  quote('categorySalary', e.fields.category);
  const agreement = textOf(e.fields.agreementName?.value);
  const code = textOf(e.fields.agreementCode?.value);
  if (agreement || code)
    quotes.agreementNamed =
      agreement && code
        ? tr('client.employment.documents.agreement_with_code', { nombre: agreement, codigo: code })
        : (agreement ?? tr('client.employment.documents.agreement_code', { codigo: code ?? '' }));

  const conflicts = e.conflicts.flatMap((c) =>
    (CONFLICT_FIELDS as readonly string[]).includes(c.field)
      ? [tr(`client.employment.documents.conflict.${c.field as (typeof CONFLICT_FIELDS)[number]}`)]
      : [],
  );
  const leftOut = LEFT_OUT_LINES.filter((l) => slips.leftOut.has(l));
  const low = a.marks.some((m) => m.confidence === 'low');
  const listCut = (l: CutList): ClientKey => `client.employment.documents.cut.${l}`;
  return {
    entries: a.entries,
    marks: a.marks,
    count: a.marks.length,
    lowConfidence: low,
    notes: [
      ...conflicts,
      ...(low ? [tr('client.documents.done_low')] : []),
      ...(leftOut.length > 0
        ? [
            tr('client.employment.documents.lines_left_out', {
              lineas: leftOut.map((l) => tr(`client.employment.documents.line.${l}`)).join(', '),
            }),
          ]
        : []),
      ...(slips.unsummed ? [tr('client.employment.documents.payslip_no_lines')] : []),
      ...(slips.partial ? [tr('client.employment.documents.payslip_partial')] : []),
      ...(extrasInTwelve ? [tr('client.employment.documents.extras_in_twelve')] : []),
      ...(holidayUnitMissing ? [tr('client.documents.holiday_unit')] : []),
      ...(offerPeriod ? [tr('client.employment.documents.offer_period')] : []),
      ...cut.lists.map((l) => tr(listCut(l), { n: EMPLOYMENT_LIST_MAXIMA[l] })),
      ...(cut.unknown ? [tr('client.employment.documents.cut.unknown')] : []),
      ...(a.cut ? [tr('client.employment.documents.rows_cut')] : []),
      ...EMPLOYMENT_CHECKS.filter((c) => checks.includes(c)).map((c) =>
        tr(`client.employment.documents.check.${c}`),
      ),
    ],
    quotes,
  };
}
