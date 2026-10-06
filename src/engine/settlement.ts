import { SOURCES } from './sources';
import { days, between, num } from './money';
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
import type { FinalPayInput, Item } from './types';

const NOTICE_DAYS = 15;

export function annualSalary(e: FinalPayInput): number {
  return e.extraPayProrated
    ? e.monthlySalary * 12
    : e.monthlySalary * 12 + e.extraPayAmount * e.extraPayCount;
}

const eur = (n: number) => `${num(n)} €`;

export function pendingSalaryItem(e: FinalPayInput): Item {
  const { y, m } = e.endDate;
  const from = max({ y, m, d: 1 }, e.startDate);
  const d = calendarDays(from, e.endDate);
  const monthDays = daysInMonth(y, m);
  const low = Math.min(e.monthlySalary, (e.monthlySalary * d) / 30);
  const high = (e.monthlySalary * d) / monthDays;
  return {
    id: 'pending_salary',
    title: 'Salario del mes de la baja',
    direction: 'credit',
    range: between(low, high),
    calculation: `${eur(e.monthlySalary)} × ${d} días trabajados del mes, entre ${num(30, 0)} días (mes comercial) y ${monthDays} días (mes natural): de ${eur(Math.min(low, high))} a ${eur(Math.max(low, high))}.`,
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

const methodsNote = (fromStart: boolean): string =>
  fromStart
    ? ' Las empresas lo calculan por días naturales o por meses (meses enteros más los días sueltos / 30), contando los meses por calendario o desde tu fecha de alta; se muestran las tres cuentas.'
    : ' Las empresas lo calculan por días naturales o por meses (meses enteros más los días del mes en curso / 30); se muestran las dos cuentas.';

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
  const base = {
    id: 'holiday_pay',
    title: 'Vacaciones devengadas y no disfrutadas',
    direction: 'credit',
    dependsOnAgreement: true,
    basedOnYourAnswer: e.annualHolidayDays > 30,
    sources: [SOURCES.et38],
  } as const;
  let accrual = `${days(e.annualHolidayDays)} días al año: por días, × ${d}/${yearLength} días trabajados en ${y} = ${days(byDays)} días devengados; por meses, × ${days(months)}/12 = ${days(byMonths)} días devengados`;
  if (fromStart) {
    accrual += `; por meses desde el alta, × ${days(monthsFromStart)}/12 = ${days(byMonthsFromStart)} días devengados`;
  }
  const taken = e.holidayDaysTaken;
  if (taken === null) {
    return {
      ...base,
      range: null,
      missingAnswer: 'days_taken',
      calculation: `${accrual}. Sin saber cuántos días has disfrutado este año no se puede comprobar.`,
    };
  }
  const pending = [byDays, byMonths, byMonthsFromStart].map((x) => x - taken);
  const high = Math.max(...pending);
  if (high < 0) {
    return {
      ...base,
      range: null,
      calculation: `${accrual}, menos ${days(taken)} disfrutados: has disfrutado más días de los devengados. Que proceda o no un descuento por los días disfrutados de más depende del convenio.`,
    };
  }
  const low = Math.max(0, Math.min(...pending));
  const monthly = e.monthlySalary / 30;
  const annual = annualSalary(e) / 365;
  return {
    ...base,
    range: between(low * Math.min(monthly, annual), high * Math.max(monthly, annual)),
    calculation: `${accrual}, menos ${days(taken)} disfrutados = entre ${days(low)} y ${days(high)} días pendientes × ${eur(monthly)} (salario mensual / 30) o ${eur(annual)} (salario anual / 365) al día.${methodsNote(fromStart)}`,
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
  readonly text: string;
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
    let text = `${eur(e.extraPayAmount)} × ${d}/${total} días = ${eur(amount.days)} o × ${days(months)}/${periodMonths} meses = ${eur(amount.months)}`;
    if (fromStart) {
      text += ` o × ${days(monthsFromStart)}/${periodMonths} meses desde el alta = ${eur(amount.anniversary)}`;
    }
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

// The accrual as the calculation text names it.
const ACCRUAL_WORD: Record<Scheme, string> = { annual: 'anual', semiannual: 'semestral' };

const ALREADY_PAID_NOTE: Record<ExtraPayment, string> = {
  summer:
    ' La paga de verano se suele cobrar en junio o julio: puede ir ya en la nómina de ese mes, así que el mínimo de esa paga parte de 0 €.',
  christmas:
    ' La paga de Navidad se suele cobrar en diciembre: puede ir ya en la nómina de ese mes, así que el mínimo de esa paga parte de 0 €.',
};

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
  const detail = accruals.map((r) => r.map((p) => p.text).join(' + ')).join('; o bien ');
  let calculation =
    e.extraPayAccrual === 'unknown'
      ? `Sin saber cómo se devengan las pagas, entre el devengo semestral y el anual (${detail}).`
      : `Devengo ${ACCRUAL_WORD[e.extraPayAccrual]}: ${detail}, suponiendo que no se ha cobrado nada del periodo abierto.`;
  calculation += methodsNote(shares.some((p) => p.fromStart));
  if (!single && accruals.some((r) => r.length > 1)) {
    calculation += ' Cada cuenta se aplica igual a las dos pagas.';
  }
  for (const payment of new Set(shares.filter((p) => p.alreadyPaid).map((p) => p.payment))) {
    calculation += ALREADY_PAID_NOTE[payment];
  }
  if (single) {
    calculation +=
      ' Con una sola paga extra no se sabe cuál es (verano o Navidad), por lo que se muestra el rango entre ambas.';
  }
  if (e.extraPayCount > 2) {
    calculation +=
      ' Solo se calculan las dos pagas habituales (verano y Navidad); las demás dependen del convenio.';
  }
  return {
    id: 'extra_pay',
    title: 'Pagas extra devengadas',
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
    title: 'Preaviso no dado por la empresa',
    direction: 'credit',
    range: between(missingDays * dayMin, missingDays * dayMax),
    calculation: `${NOTICE_DAYS} días de preaviso − ${received} recibidos = ${missingDays} días × entre ${eur(dayMin)} y ${eur(dayMax)} al día.`,
    dependsOnAgreement: false,
    basedOnYourAnswer: false,
    sources: [objective ? SOURCES.et53 : SOURCES.et49],
  };
}

export function noticeDeductionItem(e: FinalPayInput): Item | null {
  if (e.cause !== 'resignation') return null;
  const base = {
    id: 'notice_deduction',
    title: 'Descuento por preaviso no cumplido',
    direction: 'deduction',
    sources: [SOURCES.et49],
  } as const;
  if (e.agreementNoticeDays === undefined) {
    return {
      ...base,
      range: null,
      calculation:
        'El plazo de preaviso de una dimisión lo fija el convenio; sin ese dato no se puede comprobar el descuento.',
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
    calculation: `${e.agreementNoticeDays} días de preaviso del convenio − ${given} dados = ${missingDays} días × ${eur(daily)} al día como máximo.`,
    dependsOnAgreement: false,
    basedOnYourAnswer: true,
  };
}
