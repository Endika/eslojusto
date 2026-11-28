import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_SOURCES } from '../../../src/engine/bills/data/sources';
import { countedAmount, findingsOf, type BillItem } from '../../../src/engine/bills/finding';
import { billsPhrase as say } from '../../../src/engine/bills/calculation';
import { changeExitDeadline, checkChangeExit } from '../../../src/engine/bills/telecom-change-exit';
import type { ChangeNotice, TelecomInput } from '../../../src/engine/bills/types';
import { parseDate, toIso } from '../../../src/engine/date';
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
    expect(only(item)).toMatchObject({ id: 'change_exit', direction: 'over' });
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
    expect(only(item).direction).toBeNull();
    expect(countedAmount(item)).toBe(0);
  });

  // Art. 67.10: the handset kept is still owed, its whole value (120) or the share of the
  // commitment left, 120 × 184 / 549 = 40,2186 → 40,22. Both readings, the lowest counts.
  describe('keeping a subsidised handset', () => {
    const handset = { value: 120, kept: true };

    it('gives two readings, and counts only what holds in both', () => {
      const item = check({ handset });
      expect(item.kind === 'readings' && item.question).toBe('handset_share');
      expect(item.kind === 'readings' && item.readings.map((r) => r.when)).toEqual([
        'whole_value',
        'prorated_value',
      ]);
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

    it('words each reading with the handset and the days of the commitment left', () => {
      const [whole, share] = findingsOf(check({ handset }));
      const noPenalty = say('change.no_penalty', { last: { date: '2026-03-10' } });
      expect(whole?.calculation).toEqual([
        noPenalty,
        say('change.handset_whole', { euros: { euros: 120 } }),
      ]);
      expect(share?.calculation).toEqual([
        noPenalty,
        say('change.handset_prorated', {
          value: { euros: 120 },
          left: { days: 184 },
          total: { days: 549 },
          euros: { euros: 40.22 },
        }),
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

    it('worth nothing owes nothing either', () => {
      const item = check({ handset: { value: 0, kept: true } });
      expect(only(item).calculation).toEqual([
        say('change.no_penalty', { last: { date: '2026-03-10' } }),
      ]);
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

  it('sends a rise under any other index clause to review, with no figure', () => {
    const cases = ['ipc_plus', 'fixed_amount', 'other'] as const;
    for (const index of cases) {
      const item = check({}, { index });
      expect(summary(item), String(index)).toEqual({
        status: 'review_it',
        amount: null,
        counted: 0,
      });
      expect(only(item).calculation, String(index)).toEqual([{ key: 'change.index_unsettled' }]);
    }
  });

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

  it('names the reason when it cannot say, and cites the rule it rests on', () => {
    const before = check(
      { commitment: null, exitRequestedOn: parseDate('2022-06-29') },
      { sentOn: parseDate('2022-06-01') },
    );
    expect(only(before).calculation).toEqual([say('change.before_rules')]);
    expect(only(check({}, { sentOn: null })).calculation).toEqual([say('change.no_notice')]);
    expect(only(check({ exitRequestedOn: parseDate('2026-02-09') })).calculation).toEqual([
      say('change.exit_before_notice'),
    ]);
    for (const item of [before, check({}, { sentOn: null }), check({}, { index: 'other' })])
      expect(only(item).sources.map((r) => r.id)).toEqual(['change_exit']);
  });

  it('applies from the day Ley 11/2022 took effect and from the day of the notice', () => {
    const first = check(
      { commitment: null, exitRequestedOn: parseDate('2022-06-30') },
      { sentOn: parseDate('2022-06-01'), appliesOn: null },
    );
    expect(only(first).status).toBe('paid_over');
    expect(summary(check({ exitRequestedOn: parseDate('2026-02-10') })).status).toBe('paid_over');
  });
});

describe('the last day to leave after a change of conditions', () => {
  const deadline = (change: Partial<ChangeNotice> = {}, exit = '2026-03-01') => {
    const d = changeExitDeadline(
      telecom({ changeNotice: notice(change), exitRequestedOn: parseDate(exit) }),
    );
    return d === null ? null : toIso(d);
  };

  it('is a month after the notice', () => {
    expect(deadline()).toBe('2026-03-10');
    expect(deadline({ change: 'service_worse', index: 'ipc' })).toBe('2026-03-10');
    expect(deadline({ appliesOn: null })).toBe('2026-03-10');
    expect(deadline({ appliesOn: parseDate('2026-03-10') })).toBe('2026-03-10');
  });

  it('is none for a notice that cannot settle it', () => {
    const cases = [
      ['a change that is no price rise or worse service', { change: 'other' }],
      ['a rise under an index clause', { index: 'ipc' }],
      ['a notice that applies the change sooner', { appliesOn: parseDate('2026-03-09') }],
    ] as const;
    for (const [label, change] of cases) {
      expect(deadline(change), label).toBeNull();
    }
  });

  it('is none with no notice, or for an exit before the law took effect, and from that day it is', () => {
    expect(changeExitDeadline(telecom({ changeNotice: null }))).toBeNull();
    const early = { sentOn: parseDate('2022-06-01'), appliesOn: null };
    expect(deadline(early, '2022-06-29')).toBeNull();
    expect(deadline(early, '2022-06-30')).toBe('2022-07-01');
  });
});
