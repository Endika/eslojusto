import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../src/engine/date';
import type { FinalPayInput, Item } from '../../src/engine/types';
import {
  noticeDeductionItem,
  extraPayItem,
  employerNoticeItem,
  holidayPayItem,
  minimumHolidays,
} from '../../src/engine/settlement';
import { SOURCES } from '../../src/engine/sources';
import { compareItem } from '../../src/engine/compare';
import { calculationText } from '../../src/calculator/calculation';
import type { Calculation } from '../../src/engine/calculation';
import { t } from '../../src/i18n';

const base: FinalPayInput = {
  cause: 'resignation',
  startDate: f('2020-03-01'),
  endDate: f('2026-10-15'),
  monthlySalary: 1500,
  extraPayProrated: false,
  extraPayCount: 2,
  extraPayAmount: 1500,
  extraPayAccrual: 'annual',
  holidayUnit: 'calendar',
  annualHolidayDays: 30,
  holidayDaysTaken: 0,
};
const text = (c: Calculation) => calculationText(c, (key, vars) => t('es', key, vars));
const withInput = (o: Partial<FinalPayInput>): FinalPayInput => ({ ...base, ...o });
const extraPay = (e: FinalPayInput) => {
  const p = extraPayItem(e);
  if (p === null) throw new Error('no extra pay item');
  return p;
};

describe('months counted from the start date', () => {
  const fromStart = withInput({ startDate: f('2026-03-15'), endDate: f('2026-10-14') });
  it('holiday pay: 7 anniversary months fall within the minimum', () => {
    // by days 30 × 214/365 = 17.589; by calendar months 30 × (17/30 + 6 + 14/30)/12 = 17.583;
    // from the start 03-15 → 10-14 = exactly 7 months, 30 × 7/12 = 17.5
    // minimum 17.5 × 50 = 875.00; maximum 17.589 × 21000/365 = 1011.97
    const p = holidayPayItem(fromStart);
    expect(p.range).toEqual({ min: 875, max: 1011.97 });
    expect(compareItem(p, 875).status).toBe('matches');
    expect(text(p.calculation)).toContain('por meses desde el alta, × 7/12 = 17,5 días devengados');
  });
});

describe('payment paid in the month of the end date', () => {
  it('semiannual, end 12-31: Christmas may be in the December payslip', () => {
    const e = withInput({
      cause: 'fixed_term_end',
      startDate: f('2026-01-01'),
      endDate: f('2026-12-31'),
      extraPayAccrual: 'semiannual',
      extraPayAmount: 2000,
    });
    const p = extraPay(e);
    expect(p.range).toEqual({ min: 0, max: 2000 });
    expect(compareItem(p, 0).status).toBe('matches');
    expect(text(p.calculation)).toContain('La paga de Navidad se suele cobrar en diciembre');
  });
});

describe('notice', () => {
  it('objective dismissal without notice: 15 days', () => {
    const p = employerNoticeItem(
      withInput({ cause: 'objective_dismissal', noticeDaysReceived: 0 }),
    );
    expect(p?.range).toEqual({ min: 750, max: 863.01 });
  });
  it('objective dismissal with 15 days of notice → 0', () => {
    expect(
      employerNoticeItem(withInput({ cause: 'objective_dismissal', noticeDaysReceived: 15 }))
        ?.range,
    ).toEqual({ min: 0, max: 0 });
  });
  it('«más de un año» counts date to date: a year with 29 February is not more', () => {
    const term = (start: string, end: string) =>
      employerNoticeItem(
        withInput({ cause: 'fixed_term_end', startDate: f(start), endDate: f(end) }),
      );
    expect(term('2023-03-01', '2024-02-29')).toBeNull();
    const longer = term('2023-03-01', '2024-03-01');
    expect(longer).not.toBeNull();
    expect(longer?.calculation.map((p) => p.key)).toContain('employer_notice_fixed_term_criterion');
  });
  it('resignation with 15 agreement days and 5 given → maximum deduction of 10 days', () => {
    expect(
      noticeDeductionItem(withInput({ agreementNoticeDays: 15, noticeDaysGiven: 5 }))?.range,
    ).toEqual({ min: 0, max: 575.34 });
  });
});

describe('minimum holidays', () => {
  it.each([
    ['calendar', undefined, 30],
    ['working', undefined, 22],
  ] as const)('%s, %s days a week: %i days', (unit, week, days) => {
    expect(minimumHolidays(unit, week)).toBe(days);
  });
});

describe('what each item says about itself', () => {
  const fromStart = { startDate: f('2026-03-15'), endDate: f('2026-10-14') };
  const only = (...sources: { id: string }[]) => sources.map((x) => x.id);
  const apart = (o: Partial<FinalPayInput>) => extraPay(withInput(o));
  const notice = (o: Partial<FinalPayInput>) => {
    const p = employerNoticeItem(withInput(o));
    if (p === null) throw new Error('no notice item');
    return p;
  };
  const deduction = (o: Partial<FinalPayInput>) => {
    const p = noticeDeductionItem(withInput(o));
    if (p === null) throw new Error('no deduction item');
    return p;
  };
  const cases: [string, () => Item, string[], boolean, boolean, string[]][] = [
    [
      'holiday pay with the start on the 1st inside the year',
      () => holidayPayItem(withInput({ startDate: f('2026-03-01') })),
      ['holiday_pay.pending', 'methods.two_counts'],
      true,
      false,
      only(SOURCES.et38),
    ],
    [
      'holiday pay with more taken than accrued',
      () => holidayPayItem(withInput({ endDate: f('2026-02-01'), holidayDaysTaken: 15 })),
      ['holiday_pay.over_taken'],
      true,
      false,
      only(SOURCES.et38),
    ],
    [
      'extra pay, accrual unknown',
      () => apart({ extraPayAccrual: 'unknown' }),
      ['extra_pay.unknown', 'methods.two_counts', 'extra_pay.same_count_for_both'],
      true,
      false,
      only(SOURCES.et31),
    ],
    [
      'extra pay, one a year',
      () => apart({ extraPayCount: 1 }),
      ['extra_pay.annual', 'methods.two_counts', 'extra_pay.single'],
      true,
      true,
      only(SOURCES.et31),
    ],
    [
      'extra pay, three a year',
      () => apart({ extraPayCount: 3 }),
      [
        'extra_pay.annual',
        'methods.two_counts',
        'extra_pay.same_count_for_both',
        'extra_pay.over_two',
      ],
      true,
      true,
      only(SOURCES.et31),
    ],
    [
      'extra pay with the start mid-month',
      () => apart(fromStart),
      ['extra_pay.annual', 'methods.three_counts', 'extra_pay.same_count_for_both'],
      true,
      true,
      only(SOURCES.et31),
    ],
    [
      'notice of an objective dismissal',
      () => notice({ cause: 'objective_dismissal' }),
      ['employer_notice'],
      false,
      false,
      only(SOURCES.et53),
    ],
    [
      'notice of a collective dismissal',
      () => notice({ cause: 'collective_dismissal' }),
      ['employer_notice'],
      false,
      false,
      only(SOURCES.et53, SOURCES.et51),
    ],
    [
      'notice of a long fixed-term contract',
      () => notice({ cause: 'fixed_term_end' }),
      ['employer_notice', 'employer_notice_fixed_term_criterion'],
      false,
      false,
      only(SOURCES.et49),
    ],
    [
      'notice deduction without the agreement',
      () => deduction({}),
      ['notice_deduction.agreement_unknown'],
      true,
      false,
      only(SOURCES.et49),
    ],
  ];

  it.each(cases)('%s', (_, build, keys, dependsOnAgreement, basedOnYourAnswer, sources) => {
    const item = build();
    expect(item.calculation.map((x) => x.key)).toEqual(keys);
    expect(item.dependsOnAgreement).toBe(dependsOnAgreement);
    expect(item.basedOnYourAnswer).toBe(basedOnYourAnswer);
    expect(item.sources.map((x) => x.id)).toEqual(sources);
    expect(text(item.calculation)).not.toMatch(/\{\w+\}|NaN|undefined/);
  });
});
