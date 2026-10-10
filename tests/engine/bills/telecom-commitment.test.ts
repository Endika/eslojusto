import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { countedAmount, type BillItem } from '../../../src/engine/bills/finding';
import {
  checkCommitment,
  checkCommitmentPenalty,
  commitmentDays,
} from '../../../src/engine/bills/telecom-commitment';
import type { Commitment, TelecomInput } from '../../../src/engine/bills/types';
import { parseDate, toIso } from '../../../src/engine/date';
import { only, telecom } from './input';

const present = (item: BillItem | null): BillItem => {
  if (item === null) throw new Error('no item');
  return item;
};

const summary = (item: BillItem) => {
  const f = only(item);
  return { status: f.status, amount: f.amount, counted: countedAmount(item) };
};

const penalty = (change: Partial<TelecomInput> = {}) =>
  present(checkCommitmentPenalty(telecom(change), BILLS_NORMS));

const commitment = (change: Partial<Commitment>): Commitment => ({
  startedOn: parseDate('2025-03-01'),
  months: 18,
  agreedPenalty: 180,
  ...change,
});

// 18 months from 01-03-2025 end on 01-09-2026: 549 days, of which 184 are left on 01-03-2026,
// after 12 months. Art. 62.5 TRLGDCU: 180 × 184 / 549 = 60,3279 → 60,33 at most.
describe('a commitment penalty', () => {
  it('counts the days of the commitment and those left on the request day', () => {
    const days = commitmentDays(commitment({}), parseDate('2026-03-01'));
    expect({ ...days, endsOn: toIso(days.endsOn) }).toEqual({
      endsOn: '2026-09-01',
      total: 549,
      left: 184,
    });
  });

  it('within the proportional cap is within the limit', () => {
    const item = penalty();
    expect(summary(item)).toEqual({ status: 'within_limit', amount: null, counted: 0 });
    expect(only(item).calculation).toEqual([
      {
        key: 'commitment.proportional',
        vars: {
          agreed: { euros: 180 },
          left: { days: 184 },
          total: { days: 549 },
          euros: { euros: 60.33 },
        },
      },
    ]);
    expect(only(item).sources.map((s) => s.id)).toEqual(['commitment_proportional']);
  });

  it('a cent over the cap still matches', () => {
    expect(summary(penalty({ penaltyCharged: 60.34 })).status).toBe('within_limit');
  });

  it('above the cap is paid over, and counted', () => {
    expect(summary(penalty({ penaltyCharged: 90 }))).toEqual({
      status: 'paid_over',
      amount: 29.67,
      counted: 29.67,
    });
  });

  it('once the commitment is over, any penalty is paid over', () => {
    const item = penalty({ exitRequestedOn: parseDate('2026-09-05') });
    expect(summary(item)).toEqual({ status: 'paid_over', amount: 60, counted: 60 });
    expect(only(item).calculation).toEqual([
      { key: 'commitment.ended', vars: { end: { date: '2026-09-01' } } },
    ]);
  });

  it('cannot be checked without the agreed penalty', () => {
    const item = penalty({ commitment: commitment({ agreedPenalty: null }) });
    expect(summary(item)).toEqual({ status: 'not_checkable', amount: null, counted: 0 });
  });

  it.each([[null], [0]])('gives nothing when %s was charged', (charged) => {
    expect(checkCommitmentPenalty(telecom({ penaltyCharged: charged }), BILLS_NORMS)).toBeNull();
  });
});

describe('the length of a commitment', () => {
  const ids = (input: TelecomInput) =>
    checkCommitment(input, BILLS_NORMS).map((item) => `${only(item).id}:${only(item).status}`);

  it('of 24 months is within the law', () => {
    expect(ids(telecom({ commitment: commitment({ months: 24 }) }))).toEqual([
      'commitment_penalty:within_limit',
    ]);
  });

  it('over 24 months is above the legal maximum, with no figure', () => {
    const items = checkCommitment(
      telecom({ commitment: commitment({ months: 30 }), penaltyCharged: null }),
      BILLS_NORMS,
    );
    expect(items.map(summary)).toEqual([
      { status: 'above_legal_maximum', amount: null, counted: 0 },
    ]);
    expect(only(items[0] as BillItem).sources.map((s) => s.citation)).toEqual([
      `Ley 11/2022, art. 67.7 (${BILLS_NORMS.lgtel.citation})`,
    ]);
  });

  // 30 months from 01-03-2025 end on 01-09-2027: 914 days, 549 left on 01-03-2026. The cap on the
  // agreed length, 180 × 549 / 914 = 108,1182 → 108,12, is the highest that may hold.
  it('over 24 months never takes a penalty under its cap as within the limit', () => {
    const items = checkCommitment(telecom({ commitment: commitment({ months: 30 }) }), BILLS_NORMS);
    expect(items.map(summary)).toEqual([
      { status: 'above_legal_maximum', amount: null, counted: 0 },
      { status: 'review_it', amount: null, counted: 0 },
    ]);
    expect(only(items[1] as BillItem).calculation.map((p) => p.key)).toEqual([
      'commitment.proportional',
      'commitment.over_maximum_penalty',
    ]);
  });

  it('over 24 months still counts what is over the cap on its agreed length', () => {
    const items = checkCommitment(
      telecom({ commitment: commitment({ months: 30 }), penaltyCharged: 150 }),
      BILLS_NORMS,
    );
    expect(items.map(summary)[1]).toEqual({ status: 'paid_over', amount: 41.88, counted: 41.88 });
  });

  it('gives nothing without a commitment', () => {
    expect(ids(telecom({ commitment: null }))).toEqual([]);
  });
});
