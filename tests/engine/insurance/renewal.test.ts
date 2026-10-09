import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  compareDates,
  fromOrdinal,
  ordinal,
  parseDate,
} from '../../../src/engine/date';
import { INSURANCE_NORMS } from '../../../src/engine/insurance/data/norms';
import { monthsBefore } from '../../../src/engine/insurance/deadline';
import { changeNotice, nonRenewal, premiumChange } from '../../../src/engine/insurance/renewal';
import { notice, policy, TODAY } from './input';

const keys = (f: { calculation: readonly { key: string }[] }) => f.calculation.map((p) => p.key);

describe('last day to give notice of not renewing (art. 22.2 LCS)', () => {
  it.each([
    ['2027-03-01', '2027-02-01', false],
    ['2027-01-15', '2026-12-15', false],
    ['2027-03-31', '2027-02-28', true],
    ['2028-03-31', '2028-02-29', true],
    ['2028-03-29', '2028-02-29', false],
    ['2027-05-31', '2027-04-30', true],
  ])('a period ending on %s', (expiry, lastDay, monthEnd) => {
    const f = nonRenewal(policy({ expiresOn: parseDate(expiry) }), TODAY, INSURANCE_NORMS);
    expect(f.lastDay).toBe(lastDay);
    expect(keys(f).includes('non_renewal.month_end')).toBe(monthEnd);
  });

  it('is open with the days left, and asks for the notice to arrive by then', () => {
    const f = nonRenewal(policy(), TODAY, INSURANCE_NORMS);
    expect(f.status).toBe('open');
    expect(f.daysLeft).toBe(115);
    expect(keys(f)).toEqual([
      'non_renewal.last_day',
      'non_renewal.days_left',
      'non_renewal.arrive_by',
      'non_renewal.midnight',
    ]);
    expect(f.calculation[1]?.vars).toEqual({ days: { days: 115 }, day: { date: '2027-02-01' } });
    expect(f.sources.map((s) => s.id)).toEqual(['non_renewal']);
  });

  it('on the last day itself it is still open, with no days left', () => {
    const f = nonRenewal(policy(), parseDate('2027-02-01'), INSURANCE_NORMS);
    expect([f.status, f.daysLeft]).toEqual(['open', 0]);
  });

  it('the day after, it has ended', () => {
    const f = nonRenewal(policy(), parseDate('2027-02-02'), INSURANCE_NORMS);
    expect([f.status, f.daysLeft]).toEqual(['ended', null]);
    expect(keys(f)).toContain('non_renewal.ended');
  });

  it.each([
    ['2027-03-31', '2027-02-28', 'open'],
    ['2027-03-31', '2027-03-01', 'ended'],
    ['2028-03-31', '2028-02-29', 'open'],
    ['2028-03-31', '2028-03-01', 'ended'],
  ])(
    'with no equivalent day a month back, a period ending on %s, on %s',
    (expiry, today, status) => {
      const f = nonRenewal(
        policy({ expiresOn: parseDate(expiry) }),
        parseDate(today),
        INSURANCE_NORMS,
      );
      expect(f.status).toBe(status);
    },
  );

  it('a policy that does not extend itself has nothing to oppose', () => {
    const f = nonRenewal(policy({ renews: false }), TODAY, INSURANCE_NORMS);
    expect([f.status, f.lastDay]).toEqual(['not_applicable', null]);
  });

  it('«No lo sé» on the extension still gives the date, saying it assumes one', () => {
    const f = nonRenewal(policy({ renews: null }), TODAY, INSURANCE_NORMS);
    expect(f.status).toBe('open');
    expect(keys(f)).toContain('non_renewal.extension_assumed');
  });

  it('never gives less than the months the law asks for, on any day of two years', () => {
    for (let n = ordinal(parseDate('2027-01-01')); n < ordinal(parseDate('2029-01-01')); n++) {
      const expiry = fromOrdinal(n);
      for (const months of [1, 2]) {
        const { day, monthEnd } = monthsBefore(expiry, months);
        expect(compareDates(addMonthsClamped(day, months), expiry)).toBeLessThanOrEqual(0);
        expect(compareDates(day, expiry)).toBeLessThan(0);
        // With no equivalent day, a notice a day later falls short counting forwards too.
        if (monthEnd)
          expect(compareDates(addMonthsClamped(addDays(day, 1), months), expiry)).toBeGreaterThan(
            0,
          );
      }
    }
  });
});

describe('notice of changes (art. 22.3 LCS)', () => {
  it.each([
    ['2027-01-01', 'on_time', 59],
    ['2026-12-15', 'on_time', 76],
    ['2027-01-02', 'late', 58],
    ['2027-01-20', 'late', 40],
  ])('received on %s for a period ending on 01-03-2027', (received, status, days) => {
    const f = changeNotice(
      policy({ notice: notice({ receivedOn: parseDate(received) }) }),
      TODAY,
      INSURANCE_NORMS,
    );
    expect(f.status).toBe(status);
    expect(f.lastDay).toBe('2027-01-01');
    expect(f.calculation[1]?.vars?.days).toEqual({ days });
    expect(keys(f)).toContain('change_notice.any_change');
  });

  it.each([
    ['2027-02-28', 'on_time'],
    ['2027-03-01', 'late'],
    ['2027-03-02', 'late'],
    ['2027-03-03', 'late'],
  ])(
    'with no equivalent day two months back, received on %s, late in every reading',
    (received, status) => {
      const f = changeNotice(
        policy({
          expiresOn: parseDate('2027-04-30'),
          notice: notice({ receivedOn: parseDate(received) }),
        }),
        TODAY,
        INSURANCE_NORMS,
      );
      expect(f.status).toBe(status);
      expect(f.lastDay).toBe('2027-02-28');
      expect(keys(f)).toContain('change_notice.month_end');
    },
  );

  it('in a leap year the last day is 29-02', () => {
    const f = (received: string) =>
      changeNotice(
        policy({
          expiresOn: parseDate('2028-04-30'),
          notice: notice({ receivedOn: parseDate(received) }),
        }),
        TODAY,
        INSURANCE_NORMS,
      );
    expect([f('2028-02-29').status, f('2028-02-29').lastDay]).toEqual(['on_time', '2028-02-29']);
    expect(f('2028-03-01').status).toBe('late');
  });

  it('says nothing about what a late notice leads to', () => {
    const f = changeNotice(
      policy({ notice: notice({ receivedOn: parseDate('2027-01-20') }) }),
      TODAY,
      INSURANCE_NORMS,
    );
    expect(keys(f)).toEqual([
      'change_notice.deadline',
      'change_notice.late',
      'change_notice.any_change',
      'change_notice.premium_only',
    ]);
  });

  it('a notice that changes covers or excesses needs no note on the premium', () => {
    const f = changeNotice(
      policy({ notice: notice({ receivedOn: parseDate('2027-01-20'), changes: true }) }),
      TODAY,
      INSURANCE_NORMS,
    );
    expect(keys(f)).not.toContain('change_notice.premium_only');
  });

  it('without a notice there is nothing to check', () => {
    expect(changeNotice(policy(), TODAY, INSURANCE_NORMS).status).toBe('not_entered');
  });
});

describe('premium change', () => {
  it('a rise is given in euros and per cent, as a fact', () => {
    const f = premiumChange(policy({ notice: notice() }), INSURANCE_NORMS);
    expect(f.status).toBe('up');
    expect(f.calculation[0]?.vars).toEqual({
      previous: { euros: 300 },
      next: { euros: 345 },
      difference: { euros: 45 },
      percent: { percent: 15 },
    });
    expect(f.sources).toEqual([]);
  });

  it.each([
    [300, 280.5, 'down', 19.5, 6.5],
    [300, 300, 'same', 0, 0],
    [412.37, 455.1, 'up', 42.73, 10.36],
  ])('%d € to %d €', (previous, next, status, difference, percent) => {
    const f = premiumChange(
      policy({ notice: notice({ previousPremium: previous, newPremium: next }) }),
      INSURANCE_NORMS,
    );
    expect(f.status).toBe(status);
    expect(f.calculation[0]?.vars?.difference).toEqual({ euros: difference });
    expect(f.calculation[0]?.vars?.percent).toEqual({ percent });
  });

  it('without both premiums there is nothing to compare', () => {
    expect(
      premiumChange(policy({ notice: notice({ previousPremium: null }) }), INSURANCE_NORMS).status,
    ).toBe('not_entered');
    expect(premiumChange(policy(), INSURANCE_NORMS).status).toBe('not_entered');
  });
});
