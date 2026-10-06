import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../src/engine/date';
import type { FinalPayInput } from '../../src/engine/types';
import {
  noticeDeductionItem,
  extraPayItem,
  employerNoticeItem,
  pendingSalaryItem,
  holidayPayItem,
  annualSalary,
} from '../../src/engine/settlement';
import { compareItem } from '../../src/engine/compare';

const base: FinalPayInput = {
  cause: 'resignation',
  startDate: f('2020-03-01'),
  endDate: f('2026-10-15'),
  monthlySalary: 1500,
  extraPayProrated: false,
  extraPayCount: 2,
  extraPayAmount: 1500,
  extraPayAccrual: 'annual',
  annualHolidayDays: 30,
  holidayDaysTaken: 0,
};
const withInput = (o: Partial<FinalPayInput>): FinalPayInput => ({ ...base, ...o });
const extraPay = (e: FinalPayInput) => {
  const p = extraPayItem(e);
  if (p === null) throw new Error('no extra pay item');
  return p;
};

describe('annual salary', () => {
  it('14 payments', () => expect(annualSalary(base)).toBe(21000));
  it('prorated', () =>
    expect(annualSalary(withInput({ extraPayProrated: true, monthlySalary: 1750 }))).toBe(21000));
});

describe('pending salary', () => {
  it('15 days of October: between 1500×15/31 and 1500×15/30', () => {
    expect(pendingSalaryItem(base).range).toEqual({ min: 725.81, max: 750 });
  });
  it('the text gives the margin from low to high', () => {
    expect(pendingSalaryItem(base).calculation).toContain('de 725,81 € a 750,00 €');
  });
  it('a whole month = the monthly salary', () => {
    expect(pendingSalaryItem(withInput({ endDate: f('2026-10-31') })).range).toEqual({
      min: 1500,
      max: 1500,
    });
  });
  it('a start in the same month counts from the start', () => {
    const r = pendingSalaryItem(
      withInput({ startDate: f('2026-10-11'), endDate: f('2026-10-15') }),
    ).range;
    expect(r).toEqual({ min: 241.94, max: 250 });
  });
});

describe('holiday pay', () => {
  it('30 days/year, 288 days worked in 2026, none taken', () => {
    // by days 30 × 288/365 = 23.671; by months 30 × 9.5/12 = 23.75; daily between 50 and 21000/365 = 57.534
    // minimum 23.671 × 50 = 1183.56; maximum 23.75 × 57.534 = 1366.44
    const p = holidayPayItem(base);
    expect(p.range).toEqual({ min: 1183.56, max: 1366.44 });
    expect(p.dependsOnAgreement).toBe(true);
    expect(p.basedOnYourAnswer).toBe(false);
  });
  it('more taken than accrued → not checkable, never negative', () => {
    const p = holidayPayItem(withInput({ endDate: f('2026-02-01'), holidayDaysTaken: 15 }));
    expect(p.range).toBeNull();
  });
  it('an agreement with 31 days → based on your answer', () => {
    expect(holidayPayItem(withInput({ annualHolidayDays: 31 })).basedOnYourAnswer).toBe(true);
  });
});

describe('extra pay', () => {
  it('prorated or no payments → no item', () => {
    expect(extraPayItem(withInput({ extraPayProrated: true }))).toBeNull();
    expect(extraPayItem(withInput({ extraPayCount: 0 }))).toBeNull();
  });
  it('annual accrual at 2026-10-15', () => {
    // summer: by days 107/365 × 1500 = 439.73, by months 3.5/12 × 1500 = 437.50
    // Christmas: by days 288/365 × 1500 = 1183.56, by months 9.5/12 × 1500 = 1187.50
    // by days 439.73 + 1183.56 = 1623.29; by months 437.50 + 1187.50 = 1625.00
    expect(extraPayItem(base)?.range).toEqual({ min: 1623.29, max: 1625 });
  });
  it('semiannual accrual at 2026-10-15', () => {
    // summer already paid: 0; Christmas 07-01→12-31: by days 107/184 × 1500 = 872.28, by months 3.5/6 × 1500 = 875
    expect(extraPayItem(withInput({ extraPayAccrual: 'semiannual' }))?.range).toEqual({
      min: 872.28,
      max: 875,
    });
  });
  it('unknown → range between both', () => {
    expect(extraPayItem(withInput({ extraPayAccrual: 'unknown' }))?.range).toEqual({
      min: 872.28, // semiannual by days
      max: 1625, // annual by months
    });
  });
});

describe('extra pay: edges', () => {
  it('a single payment: range between summer and Christmas', () => {
    expect(extraPayItem(withInput({ extraPayCount: 1 }))?.range).toEqual({
      min: 437.5,
      max: 1187.5,
    });
  });
  it('a single payment, unknown accrual: covers the four options', () => {
    expect(
      extraPayItem(withInput({ extraPayCount: 1, extraPayAccrual: 'unknown' }))?.range,
    ).toEqual({
      min: 0,
      max: 1187.5,
    });
  });
  it('semiannual in March: summer 01-01→06-30', () => {
    expect(
      extraPayItem(withInput({ extraPayAccrual: 'semiannual', endDate: f('2026-03-15') }))?.range,
    ).toEqual({ min: 613.26, max: 625 }); // 74/181 × 1500 and 2.5/6 × 1500
  });
  it('annual in March', () => {
    expect(extraPayItem(withInput({ endDate: f('2026-03-15') }))?.range).toEqual({
      // summer 258/365 or 8.5/12; Christmas 74/365 or 2.5/12 (× 1500)
      min: 1364.38,
      max: 1375,
    });
  });
});

describe('holiday pay: leap year', () => {
  it('289 days out of 366', () => {
    expect(holidayPayItem(withInput({ endDate: f('2024-10-15') })).range).toEqual({
      min: 1184.43, // 30 × 289/366 × 50
      max: 1366.44, // 30 × 9.5/12 × 57.534
    });
  });
});

describe('accrual by months: never a made-up finding', () => {
  const twoThousand = withInput({
    monthlySalary: 2000,
    extraPayAmount: 2000,
    endDate: f('2026-01-31'),
  });
  it('annual payments at 01-31 by months (7/12 + 1/12 of 2000) fall within the minimum', () => {
    // by days 215/365 + 31/365 = 1347.95; by months 2000 × 8/12 = 1333.33
    const r = extraPayItem(twoThousand)?.range;
    expect(r).toEqual({ min: 1333.33, max: 1347.95 });
    expect(compareItem(extraPay(twoThousand), 1333.33).status).toBe('matches');
  });
  it('annual payments at 08-31 by months fall within the minimum', () => {
    // summer 2/12 × 2000 = 333.33; Christmas 8/12 × 2000 = 1333.33
    const p = extraPay(withInput({ ...twoThousand, endDate: f('2026-08-31') }));
    expect(compareItem(p, 1666.67).status).toBe('matches');
  });
  it('holiday pay at 01-31 at 2.5 days a month falls within the minimum', () => {
    // 2.5 days × 2000/30 = 166.67; by days 30 × 31/365 × 2000/30 = 169.86
    const p = holidayPayItem(twoThousand);
    expect(p.range?.min).toBe(166.67);
    expect(compareItem(p, 166.67).status).toBe('matches');
    expect(p.calculation).toContain('por días naturales o por meses');
  });
});

describe('months counted from the start date', () => {
  const fromStart = withInput({ startDate: f('2026-03-15'), endDate: f('2026-10-14') });
  it('holiday pay: 7 anniversary months fall within the minimum', () => {
    // by days 30 × 214/365 = 17.589; by calendar months 30 × (17/30 + 6 + 14/30)/12 = 17.583;
    // from the start 03-15 → 10-14 = exactly 7 months, 30 × 7/12 = 17.5
    // minimum 17.5 × 50 = 875.00; maximum 17.589 × 21000/365 = 1011.97
    const p = holidayPayItem(fromStart);
    expect(p.range).toEqual({ min: 875, max: 1011.97 });
    expect(compareItem(p, 875).status).toBe('matches');
    expect(p.calculation).toContain('por meses desde el alta, × 7/12 = 17,5 días devengados');
  });
  it('annual payments: Christmas from the start date, summer unchanged', () => {
    // summer 07-01→10-14 (the start falls outside): by days 106/365 × 1500 = 435.62, by months 3.467/12 × 1500 = 433.33
    // Christmas 03-15→10-14: by days 214/365 × 1500 = 879.45, by months 7.033/12 × 1500 = 879.17, from the start 7/12 × 1500 = 875
    // by days 1315.07; by months 1312.50; from the start 433.33 + 875 = 1308.33
    const p = extraPay(fromStart);
    expect(p.range).toEqual({ min: 1308.33, max: 1315.07 });
    expect(compareItem(p, 1308.33).status).toBe('matches');
    expect(p.calculation).toContain('7/12 meses desde el alta = 875,00 €');
  });
  it('with the start outside the period there is no third method', () => {
    expect(holidayPayItem(base).calculation).not.toContain('desde el alta');
    expect(extraPay(base).calculation).toContain('se muestran las dos cuentas');
  });
});

describe('one method for both payments', () => {
  it('annual at 10-15: the range never mixes days for one payment and months for the other', () => {
    // before, per payment: 437.50 + 1183.56 = 1621.06 to 439.73 + 1187.50 = 1627.23
    // now: by days 1623.29, by months 1625.00
    const p = extraPay(base);
    expect(p.range).toEqual({ min: 1623.29, max: 1625 });
    expect(compareItem(p, 1622.28).status).toBe('below_minimum');
    expect(p.calculation).toContain('Cada cuenta se aplica igual a las dos pagas');
  });
});

describe('unknown holiday days taken', () => {
  it('null → not checkable, and it says so', () => {
    const p = holidayPayItem(withInput({ holidayDaysTaken: null }));
    expect(p.range).toBeNull();
    expect(p.missingAnswer).toBe('days_taken');
    expect(p.calculation).toContain(
      'Sin saber cuántos días has disfrutado este año no se puede comprobar',
    );
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
    expect(p.calculation).toContain('La paga de Navidad se suele cobrar en diciembre');
  });
  it('annual, end 06-30: summer starts from 0, Christmas does not', () => {
    // Christmas: 181/365 × 1500 = 743.84 or 6/12 × 1500 = 750; summer up to 1500
    const p = extraPay(withInput({ endDate: f('2026-06-30') }));
    expect(p.range).toEqual({ min: 743.84, max: 2250 });
    expect(p.calculation).toContain('La paga de verano se suele cobrar en junio o julio');
  });
  it('outside June, July and December nothing is lowered', () => {
    expect(extraPayItem(base)?.calculation).not.toContain('se suele cobrar');
  });
});

describe('notice', () => {
  it('more notice than required → 0, never negative', () => {
    expect(
      employerNoticeItem(withInput({ cause: 'objective_dismissal', noticeDaysReceived: 20 }))
        ?.range,
    ).toEqual({ min: 0, max: 0 });
  });
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
  it('a fixed-term contract under a year has no notice', () => {
    expect(
      employerNoticeItem(withInput({ cause: 'fixed_term_end', startDate: f('2026-01-01') })),
    ).toBeNull();
  });
  it('resignation without the agreement figure → deduction not checkable', () => {
    const p = noticeDeductionItem(base);
    expect(p?.direction).toBe('deduction');
    expect(p?.range).toBeNull();
  });
  it('resignation with 15 agreement days and 5 given → maximum deduction of 10 days', () => {
    expect(
      noticeDeductionItem(withInput({ agreementNoticeDays: 15, noticeDaysGiven: 5 }))?.range,
    ).toEqual({ min: 0, max: 575.34 });
  });
});
