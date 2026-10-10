import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_SOURCES } from '../../../src/engine/bills/data/sources';
import { countedAmount, findingsOf, type BillItem } from '../../../src/engine/bills/finding';
import { checkChangeExit } from '../../../src/engine/bills/telecom-change-exit';
import type { ChangeNotice, TelecomInput } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { only, telecom } from './input';

const deps = { norms: BILLS_NORMS, sources: BILLS_SOURCES };

const notice = (change: Partial<ChangeNotice> = {}): ChangeNotice => ({
  sentOn: parseDate('2026-02-10'),
  appliesOn: parseDate('2026-03-10'),
  change: 'price_up',
  index: 'none',
  ...change,
});

const check = (change: Partial<TelecomInput> = {}, noticeChange: Partial<ChangeNotice> = {}) => {
  const item = checkChangeExit(telecom({ changeNotice: notice(noticeChange), ...change }), deps);
  if (item === null) throw new Error('no item');
  return item;
};

const summary = (item: BillItem) => {
  const f = only(item);
  return { status: f.status, amount: f.amount, counted: countedAmount(item) };
};

// The price goes up with a notice sent on 10-02-2026; the exit is requested on 01-03-2026, within
// the month that ends on 10-03-2026, with 184 of the 549 days of the commitment left.
describe('leaving after a change of conditions', () => {
  it('without a handset costs nothing: the whole penalty is paid over', () => {
    const item = check();
    expect(summary(item)).toEqual({ status: 'paid_over', amount: 60, counted: 60 });
    expect(only(item).calculation).toEqual([
      { key: 'change.no_penalty', vars: { last: { date: '2026-03-10' } } },
    ]);
    expect(only(item).sources.map((s) => s.id)).toEqual(['change_exit']);
  });

  it('on the last day of the month still counts', () => {
    expect(summary(check({ exitRequestedOn: parseDate('2026-03-10') })).status).toBe('paid_over');
  });

  it('applies to a worse service whatever the clause', () => {
    expect(summary(check({}, { change: 'service_worse', index: 'ipc' })).status).toBe('paid_over');
  });

  // Art. 67.8 leaves out beneficial, administrative and imposed changes, and «other» may be one.
  it('leaves an unnamed change to review, with no figure', () => {
    const item = check({}, { change: 'other', index: 'none' });
    expect(summary(item).status).toBe('review_it');
    expect(only(item).calculation).toEqual([{ key: 'change.other_unsettled' }]);
    expect(countedAmount(item)).toBe(0);
  });

  // Art. 67.10: the handset kept is still owed, its whole value (120) or the share of the
  // commitment left, 120 × 184 / 549 = 40,2186 → 40,22. Both readings, the lowest counts.
  describe('keeping a subsidised handset', () => {
    const handset = { value: 120, kept: true };

    it('gives two readings, and counts only what holds in both', () => {
      const item = check({ handset });
      expect(item.kind === 'readings' && item.question).toBe('handset_share');
      expect(findingsOf(item).map((f) => [f.status, f.amount])).toEqual([
        ['within_limit', null],
        ['paid_over', 19.78],
      ]);
      expect(countedAmount(item)).toBe(0);
      expect(findingsOf(item)[1]?.sources.map((s) => s.id)).toEqual([
        'change_exit',
        'handset_after_change',
      ]);
    });

    it('counts what is over its whole value', () => {
      const item = check({ handset, penaltyCharged: 150 });
      expect(findingsOf(item).map((f) => f.amount)).toEqual([30, 109.78]);
      expect(countedAmount(item)).toBe(30);
    });

    it('without a commitment, its whole value only', () => {
      const item = check({ handset, commitment: null, penaltyCharged: 150 });
      expect(summary(item)).toEqual({ status: 'paid_over', amount: 30, counted: 30 });
    });

    it('given back owes nothing', () => {
      expect(summary(check({ handset: { value: 120, kept: false } })).amount).toBe(60);
    });
  });

  it('a rise under an index clause is the court criterion, with no figure', () => {
    const item = check({}, { index: 'ipc' });
    expect(summary(item)).toEqual({ status: 'information', amount: null, counted: 0 });
    expect(only(item).calculation).toEqual([
      { key: 'change.index_cpi', vars: { judgment: { date: '2015-11-26' } } },
    ]);
    expect(only(item).sources.map((s) => s.id)).toEqual(['indexed_price_rise']);
  });

  it.each(['ipc_plus', 'fixed_amount', 'other'] as const)(
    'a rise under a %s clause is sent to review, with no figure',
    (index) => {
      const item = check({}, { index });
      expect(summary(item)).toEqual({ status: 'review_it', amount: null, counted: 0 });
      expect(only(item).calculation).toEqual([{ key: 'change.index_unsettled' }]);
    },
  );

  it('notified less than a month ahead, the right is explained with no figure', () => {
    const item = check({}, { appliesOn: parseDate('2026-03-09') });
    expect(summary(item)).toEqual({ status: 'review_it', amount: null, counted: 0 });
    expect(only(item).calculation).toEqual([
      {
        key: 'change.short_notice',
        vars: { sent: { date: '2026-02-10' }, applies: { date: '2026-03-09' } },
      },
    ]);
  });

  it('without the day the change applies, the month runs from the notice', () => {
    expect(summary(check({}, { appliesOn: null })).status).toBe('paid_over');
  });

  it('with no notice, the right is explained with no figure', () => {
    const item = check({}, { sentOn: null });
    expect(summary(item)).toEqual({ status: 'review_it', amount: null, counted: 0 });
  });

  it('after the month does not apply', () => {
    const item = check({ exitRequestedOn: parseDate('2026-03-11') });
    expect(summary(item)).toEqual({ status: 'not_applicable', amount: null, counted: 0 });
    expect(only(item).calculation).toEqual([
      { key: 'change.exit_after_month', vars: { last: { date: '2026-03-10' } } },
    ]);
  });

  it('before the notice does not apply', () => {
    expect(summary(check({ exitRequestedOn: parseDate('2026-02-09') })).status).toBe(
      'not_applicable',
    );
  });

  it('before Ley 11/2022 took effect cannot be checked', () => {
    const item = check(
      {
        commitment: null,
        exitRequestedOn: parseDate('2022-06-29'),
      },
      { sentOn: parseDate('2022-06-01') },
    );
    expect(summary(item)).toEqual({ status: 'not_checkable', amount: null, counted: 0 });
  });

  it.each([
    ['no notice', { changeNotice: null }],
    ['nothing charged', { changeNotice: notice(), penaltyCharged: null }],
  ])('gives nothing with %s', (_, change) => {
    expect(checkChangeExit(telecom(change), deps)).toBeNull();
  });
});
