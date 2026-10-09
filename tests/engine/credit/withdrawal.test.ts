import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { CREDIT_NORMS } from '../../../src/engine/credit/data/norms';
import type { CreditFinding } from '../../../src/engine/credit/finding';
import type { CreditInput } from '../../../src/engine/credit/types';
import { checkWithdrawal } from '../../../src/engine/credit/withdrawal';
import { loan } from './input';

const withdraw = (change: Partial<CreditInput>, today: string): CreditFinding => {
  const item = checkWithdrawal(loan(change), parseDate(today), CREDIT_NORMS);
  if (item.kind !== 'single') throw new Error('expected a single reading');
  return item.finding;
};

const oct1 = { agreedOn: parseDate('2026-10-01'), drawnOn: parseDate('2026-10-01') };

describe('item 4: the withdrawal period', () => {
  it('ends 14 calendar days after the contract: 01-10 → 15-10', () => {
    expect(withdraw(oct1, '2026-10-09')).toMatchObject({
      status: 'open',
      lastDay: '2026-10-15',
      daysLeft: 6,
    });
    expect(withdraw(oct1, '2026-10-15')).toMatchObject({ status: 'open', daysLeft: 0 });
  });

  it('has ended the day after', () => {
    const f = withdraw(oct1, '2026-10-16');
    expect(f).toMatchObject({ status: 'ended', lastDay: '2026-10-15', daysLeft: null });
    expect(f.calculation[1]).toEqual({
      key: 'withdrawal.ended',
      vars: { day: { date: '2026-10-15' } },
    });
  });

  it('runs from the later arrival of the terms: 05-10 → 19-10', () => {
    const f = withdraw({ ...oct1, infoReceivedOn: parseDate('2026-10-05') }, '2026-10-09');
    expect(f).toMatchObject({ status: 'open', lastDay: '2026-10-19', daysLeft: 10 });
    expect(f.calculation[0]?.key).toBe('withdrawal.start_on_terms');
  });

  it('has not started while the terms have not arrived', () => {
    expect(withdraw({ ...oct1, infoReceived: false }, '2026-10-09')).toMatchObject({
      status: 'not_started',
      lastDay: null,
    });
  });

  it('counts from the contract when the day of receipt is unknown, and says so', () => {
    const f = withdraw({ ...oct1, infoReceived: null }, '2026-10-09');
    expect(f.lastDay).toBe('2026-10-15');
    expect(f.calculation.map((p) => p.key)).toContain('withdrawal.receipt_unknown');
  });

  it('reads terms received with no day as received with the contract', () => {
    expect(withdraw(oct1, '2026-10-09').calculation.map((p) => p.key)).not.toContain(
      'withdrawal.receipt_unknown',
    );
  });

  it('crosses a 29 February like any other day', () => {
    const leap = { agreedOn: parseDate('2028-02-20'), drawnOn: parseDate('2028-02-20') };
    expect(withdraw(leap, '2028-02-21').lastDay).toBe('2028-03-05');
  });

  it('says sending is enough and what follows, citing art. 28 and the counting of days', () => {
    const f = withdraw(oct1, '2026-10-09');
    expect(f.calculation.map((p) => p.key)).toEqual(
      expect.arrayContaining(['withdrawal.send_by', 'withdrawal.effects']),
    );
    expect(f.sources.map((s) => s.id)).toEqual(['withdrawal', 'period_count']);
  });
});
