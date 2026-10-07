import { SOURCES } from './sources';
import { between } from './money';
import { phrase, type Phrase, type PhraseKey } from './calculation';
import {
  compareDates,
  daysInYear,
  daysInMonth,
  calendarDays,
  max,
  anniversaryMonths,
  accrualMonths,
  type CivilDate,
} from './date';
import type { Accrual, FinalPayInput, HolidayUnit, Item } from './types';

const NOTICE_DAYS = 15;

// The legal minimum is 30 calendar days a year (art. 38 ET), which case law reads as 22 working
// days. Accrual and days taken stay in the person's unit; only the days left are turned into
// calendar days, the unit the daily pay is for, at that same 30 to 22.
export const MINIMUM_HOLIDAYS: Record<HolidayUnit, number> = { working: 22, calendar: 30 };
export const calendarDaysPer = (unit: HolidayUnit): number =>
  MINIMUM_HOLIDAYS.calendar / MINIMUM_HOLIDAYS[unit];

export function annualSalary(e: FinalPayInput): number {
  return e.extraPayProrated
    ? e.monthlySalary * 12
    : e.monthlySalary * 12 + e.extraPayAmount * e.extraPayCount;
}

export function pendingSalaryItem(e: FinalPayInput): Item {
  const { y, m } = e.endDate;
  const from = max({ y, m, d: 1 }, e.startDate);
  const d = calendarDays(from, e.endDate);
  const monthDays = daysInMonth(y, m);
  const low = Math.min(e.monthlySalary, (e.monthlySalary * d) / 30);
  const high = (e.monthlySalary * d) / monthDays;
  return {
    id: 'pending_salary',
    direction: 'credit',
    range: between(low, high),
    calculation: [
      phrase('pending_salary', {
        salario: { euros: e.monthlySalary },
        dias: d,
        dias_mes: monthDays,
        desde: { euros: Math.min(low, high) },
        hasta: { euros: Math.max(low, high) },
      }),
    ],
    dependsOnAgreement: false,
    basedOnYourAnswer: false,
    sources: [SOURCES.et26],
  };
}

type Method = 'days' | 'months' | 'anniversary';
const METHODS: readonly Method[] = ['days', 'months', 'anniversary'];

// Counting months from the start date only differs from calendar months when the start falls mid-month inside the period.
const countsFromStart = (start: CivilDate, startDate: CivilDate): boolean =>
  compareDates(startDate, start) > 0 && startDate.d !== 1;

const methodsNote = (fromStart: boolean): Phrase =>
  phrase(fromStart ? 'methods.three_counts' : 'methods.two_counts');

export function holidayPayItem(e: FinalPayInput): Item {
  const { y } = e.endDate;
  const start = { y, m: 1, d: 1 };
  const from = max(start, e.startDate);
  const d = calendarDays(from, e.endDate);
  const yearLength = daysInYear(y);
  const months = accrualMonths(from, e.endDate);
  const fromStart = countsFromStart(start, e.startDate);
  const monthsFromStart = fromStart ? anniversaryMonths(from, e.endDate) : months;
  const byDays = (e.annualHolidayDays * d) / yearLength;
  const byMonths = (e.annualHolidayDays * months) / 12;
  const byMonthsFromStart = (e.annualHolidayDays * monthsFromStart) / 12;
  const unit = e.holidayUnit;
  const unitWord = phrase(`holiday_pay.unit.${unit}`);
  const taken = e.holidayDaysTaken;
  const base = {
    id: 'holiday_pay',
    direction: 'credit',
    dependsOnAgreement: true,
    basedOnYourAnswer: e.annualHolidayDays > MINIMUM_HOLIDAYS[unit],
    sources: [SOURCES.et38],
    ...(taken === null
      ? {}
      : {
          counted: phrase('holiday_pay.counted', {
            disfrutados: { days: taken },
            unidad: unitWord,
            anuales: { days: e.annualHolidayDays },
          }),
        }),
  } as const;
  const accrualVars = {
    anuales: { days: e.annualHolidayDays },
    unidad: unitWord,
    dias: d,
    dias_ejercicio: yearLength,
    ejercicio: y,
    por_dias: { days: byDays },
    meses: { days: months },
    por_meses: { days: byMonths },
  };
  const accrual = fromStart
    ? phrase('holiday_pay.accrual_from_start', {
        ...accrualVars,
        meses_alta: { days: monthsFromStart },
        por_meses_alta: { days: byMonthsFromStart },
      })
    : phrase('holiday_pay.accrual', accrualVars);
  if (taken === null) {
    return {
      ...base,
      range: null,
      missingAnswer: 'days_taken',
      calculation: [phrase('holiday_pay.days_unknown', { devengo: accrual })],
    };
  }
  const pending = [byDays, byMonths, byMonthsFromStart].map((x) => x - taken);
  const high = Math.max(...pending);
  if (high < 0) {
    return {
      ...base,
      range: null,
      calculation: [
        phrase('holiday_pay.over_taken', { devengo: accrual, disfrutados: { days: taken } }),
      ],
    };
  }
  const low = Math.max(0, Math.min(...pending));
  const monthly = e.monthlySalary / 30;
  const annual = annualSalary(e) / 365;
  const toCalendar = calendarDaysPer(unit);
  const vars = {
    devengo: accrual,
    disfrutados: { days: taken },
    minimo: { days: low },
    maximo: { days: high },
    diario_mensual: { euros: monthly },
    diario_anual: { euros: annual },
  };
  return {
    ...base,
    range: between(
      low * toCalendar * Math.min(monthly, annual),
      high * toCalendar * Math.max(monthly, annual),
    ),
    calculation: [
      unit === 'calendar'
        ? phrase('holiday_pay.pending', vars)
        : phrase('holiday_pay.pending_working', {
            ...vars,
            minimo_naturales: { days: low * toCalendar },
            maximo_naturales: { days: high * toCalendar },
          }),
      methodsNote(fromStart),
    ],
  };
}

type Scheme = 'annual' | 'semiannual';
type ExtraPayment = 'summer' | 'christmas';

interface Period {
  readonly payment: ExtraPayment;
  readonly start: CivilDate;
  readonly end: CivilDate;
}

// Usual payment month(s): summer in June or July, Christmas in December.
const PAYMENT_MONTHS: Record<ExtraPayment, readonly number[]> = { summer: [6, 7], christmas: [12] };

function periods(e: FinalPayInput, accrual: Scheme): Period[] {
  const { y, m } = e.endDate;
  const firstHalf = m <= 6;
  if (accrual === 'annual') {
    const startYear = firstHalf ? y - 1 : y;
    return [
      {
        payment: 'summer',
        start: { y: startYear, m: 7, d: 1 },
        end: { y: startYear + 1, m: 6, d: 30 },
      },
      { payment: 'christmas', start: { y, m: 1, d: 1 }, end: { y, m: 12, d: 31 } },
    ];
  }
  return firstHalf
    ? [{ payment: 'summer', start: { y, m: 1, d: 1 }, end: { y, m: 6, d: 30 } }]
    : [{ payment: 'christmas', start: { y, m: 7, d: 1 }, end: { y, m: 12, d: 31 } }];
}

interface Bounds {
  readonly low: number;
  readonly high: number;
}

interface Share {
  readonly payment: ExtraPayment;
  readonly alreadyPaid: boolean;
  readonly fromStart: boolean;
  readonly amount: Record<Method, number>;
  readonly text: Phrase;
}

function accrued(e: FinalPayInput, accrual: Scheme): Share[] {
  const periodMonths = accrual === 'annual' ? 12 : 6;
  return periods(e, accrual).map((p) => {
    const from = max(p.start, e.startDate);
    const to = compareDates(e.endDate, p.end) < 0 ? e.endDate : p.end;
    const d = calendarDays(from, to);
    const total = calendarDays(p.start, p.end);
    const months = accrualMonths(from, to);
    const fromStart = countsFromStart(p.start, e.startDate);
    const monthsFromStart = fromStart ? anniversaryMonths(from, to) : months;
    const amount = {
      days: (e.extraPayAmount * d) / total,
      months: (e.extraPayAmount * months) / periodMonths,
      anniversary: (e.extraPayAmount * monthsFromStart) / periodMonths,
    };
    const vars = {
      importe: { euros: e.extraPayAmount },
      dias: d,
      total,
      por_dias: { euros: amount.days },
      meses: { days: months },
      meses_periodo: periodMonths,
      por_meses: { euros: amount.months },
    };
    const text = fromStart
      ? phrase('extra_pay.share_from_start', {
          ...vars,
          meses_alta: { days: monthsFromStart },
          por_meses_alta: { euros: amount.anniversary },
        })
      : phrase('extra_pay.share', vars);
    return {
      payment: p.payment,
      alreadyPaid: PAYMENT_MONTHS[p.payment].includes(e.endDate.m),
      fromStart,
      amount,
      text,
    };
  });
}

// One method applies to every extra payment; the payment already in the last payroll (A4) and, with a
// single payment, which one it is are independent unknowns.
function scenarios(shares: readonly Share[], single: boolean): Bounds[] {
  return METHODS.flatMap((method) => {
    const bounds = shares.map((p) => ({
      low: p.alreadyPaid ? 0 : p.amount[method],
      high: p.amount[method],
    }));
    if (single) return shares.length < 2 ? [...bounds, { low: 0, high: 0 }] : bounds;
    return [
      {
        low: bounds.reduce((s, t) => s + t.low, 0),
        high: bounds.reduce((s, t) => s + t.high, 0),
      },
    ];
  });
}

const ALREADY_PAID_NOTE: Record<ExtraPayment, PhraseKey> = {
  summer: 'extra_pay.summer_in_last_payslip',
  christmas: 'extra_pay.christmas_in_last_payslip',
};

// The annual accrual has a summer and a Christmas share, in that order; the semiannual one, a single share.
function accrualPhrase(accrual: Accrual, accruals: readonly (readonly Share[])[]): Phrase {
  const [first = [], second = []] = accruals.map((shares) => shares.map((p) => p.text));
  const [a, b] = first;
  const [c] = second;
  if (accrual === 'unknown' && a && b && c)
    return phrase('extra_pay.unknown', { verano: a, navidad: b, paga: c });
  if (accrual === 'annual' && a && b) return phrase('extra_pay.annual', { verano: a, navidad: b });
  if (accrual === 'semiannual' && a) return phrase('extra_pay.semiannual', { paga: a });
  throw new Error(`No shares for the ${accrual} accrual`);
}

export function extraPayItem(e: FinalPayInput): Item | null {
  if (e.extraPayProrated || e.extraPayCount <= 0) return null;
  const single = e.extraPayCount === 1;
  const schemes: readonly Scheme[] =
    e.extraPayAccrual === 'unknown' ? ['annual', 'semiannual'] : [e.extraPayAccrual];
  const accruals = schemes.map((x) => accrued(e, x));
  const options = accruals.flatMap((shares) => scenarios(shares, single));
  const range = between(
    Math.min(...options.map((o) => o.low)),
    Math.max(...options.map((o) => o.high)),
  );
  const shares = accruals.flat();
  const calculation: Phrase[] = [
    accrualPhrase(e.extraPayAccrual, accruals),
    methodsNote(shares.some((p) => p.fromStart)),
  ];
  if (!single && accruals.some((r) => r.length > 1)) {
    calculation.push(phrase('extra_pay.same_count_for_both'));
  }
  for (const payment of new Set(shares.filter((p) => p.alreadyPaid).map((p) => p.payment))) {
    calculation.push(phrase(ALREADY_PAID_NOTE[payment]));
  }
  if (single) calculation.push(phrase('extra_pay.single'));
  if (e.extraPayCount > 2) calculation.push(phrase('extra_pay.over_two'));
  return {
    id: 'extra_pay',
    direction: 'credit',
    range,
    calculation,
    dependsOnAgreement: true,
    basedOnYourAnswer: e.extraPayAccrual !== 'unknown',
    sources: [SOURCES.et31],
  };
}

export function employerNoticeItem(e: FinalPayInput): Item | null {
  const objective = e.cause === 'objective_dismissal';
  const longFixedTerm = e.cause === 'fixed_term_end' && calendarDays(e.startDate, e.endDate) > 365;
  if (!objective && !longFixedTerm) return null;
  const received = e.noticeDaysReceived ?? 0;
  const missingDays = Math.max(0, NOTICE_DAYS - received);
  const dayMin = e.monthlySalary / 30;
  const dayMax = annualSalary(e) / 365;
  return {
    id: 'employer_notice',
    direction: 'credit',
    range: between(missingDays * dayMin, missingDays * dayMax),
    calculation: [
      phrase('employer_notice', {
        preaviso: NOTICE_DAYS,
        recibidos: received,
        faltan: missingDays,
        minimo: { euros: dayMin },
        maximo: { euros: dayMax },
      }),
    ],
    dependsOnAgreement: false,
    basedOnYourAnswer: false,
    sources: [objective ? SOURCES.et53 : SOURCES.et49],
  };
}

export function noticeDeductionItem(e: FinalPayInput): Item | null {
  if (e.cause !== 'resignation') return null;
  const base = {
    id: 'notice_deduction',
    direction: 'deduction',
    sources: [SOURCES.et49],
  } as const;
  if (e.agreementNoticeDays === undefined) {
    return {
      ...base,
      range: null,
      calculation: [phrase('notice_deduction.agreement_unknown')],
      dependsOnAgreement: true,
      basedOnYourAnswer: false,
    };
  }
  const given = e.noticeDaysGiven ?? 0;
  const missingDays = Math.max(0, e.agreementNoticeDays - given);
  const daily = Math.max(e.monthlySalary / 30, annualSalary(e) / 365);
  return {
    ...base,
    range: between(0, missingDays * daily),
    calculation: [
      phrase('notice_deduction', {
        convenio: e.agreementNoticeDays,
        dados: given,
        faltan: missingDays,
        diario: { euros: daily },
      }),
    ],
    dependsOnAgreement: false,
    basedOnYourAnswer: true,
  };
}
