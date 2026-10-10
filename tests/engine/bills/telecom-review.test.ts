import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_SOURCES } from '../../../src/engine/bills/data/sources';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { findingsOf } from '../../../src/engine/bills/finding';
import {
  reviewTelecom,
  TELECOM_UNCHECKED,
  type TelecomReview,
} from '../../../src/engine/bills/telecom-review';
import type { TelecomInput } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { telecom, TODAY } from './input';

const deps = { norms: BILLS_NORMS, tables: BILLS_TABLES, sources: BILLS_SOURCES };

const review = (change: Partial<TelecomInput> = {}): TelecomReview => {
  const result = reviewTelecom(telecom(change), TODAY, deps);
  if (!result.ok) throw new Error(`invalid: ${JSON.stringify(result.errors)}`);
  return result.review;
};

const statuses = (r: TelecomReview) =>
  r.items.flatMap(findingsOf).map((f) => `${f.id}:${f.status}`);

const priceRise = {
  sentOn: parseDate('2026-02-10'),
  appliesOn: parseDate('2026-03-10'),
  change: 'price_up',
  index: 'none',
} as const;

describe('the telecom review', () => {
  it('checks the commitment penalty when no change of conditions is involved', () => {
    const r = review({ penaltyCharged: 90 });
    expect(statuses(r)).toEqual(['commitment_penalty:paid_over']);
    expect(r.totals).toEqual({ counted: 29.67, upTo: 29.67, under: 0 });
    expect(r.unchecked).toEqual(TELECOM_UNCHECKED);
  });

  it('counts the penalty once when leaving over a change of conditions settles it', () => {
    const r = review({ changeNotice: priceRise });
    expect(statuses(r)).toEqual(['change_exit:paid_over']);
    expect(r.totals.counted).toBe(60);
  });

  it('keeps the commitment cap while the change of conditions is in doubt', () => {
    const r = review({ changeNotice: { ...priceRise, index: 'ipc_plus' }, penaltyCharged: 90 });
    expect(statuses(r)).toEqual(['commitment_penalty:paid_over', 'change_exit:review_it']);
    expect(r.totals.counted).toBe(29.67);
  });

  it('with a handset kept, counts the lowest reading and shows the highest', () => {
    const r = review({
      changeNotice: priceRise,
      handset: { value: 120, kept: true },
      penaltyCharged: 150,
    });
    expect(statuses(r)).toEqual(['change_exit:paid_over', 'change_exit:paid_over']);
    expect(r.totals).toEqual({ counted: 30, upTo: 109.78, under: 0 });
  });

  it('adds what was billed after the exit to the penalty paid over', () => {
    const r = review({
      exitRequestedOn: parseDate('2026-04-02'),
      penaltyCharged: 0,
      lines: [{ from: parseDate('2026-04-01'), to: parseDate('2026-04-30'), amount: 30 }],
    });
    expect(statuses(r)).toEqual(['charge_after_exit:charged_after_exit']);
    expect(r.totals.counted).toBe(22);
  });

  it('stops at the door for an exit before 2022', () => {
    const r = review({
      commitment: null,
      exitRequestedOn: parseDate('2021-12-31'),
    });
    expect(r.scope).toEqual({ inScope: false, reason: 'exit_before_2022' });
    expect(r.items).toEqual([]);
  });

  it('turns away what cannot be read', () => {
    const result = reviewTelecom(
      telecom({ exitRequestedOn: parseDate('2026-12-31') }),
      TODAY,
      deps,
    );
    expect(result).toEqual({
      ok: false,
      errors: [{ field: 'exitRequestedOn', code: 'in_future' }],
    });
  });
});
