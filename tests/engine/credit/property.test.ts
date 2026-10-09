import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  compareDates,
  parseDate,
  toIso,
} from '../../../src/engine/date';
import { BE1904 } from '../../../src/engine/credit/data/be1904';
import { CREDIT_NORMS } from '../../../src/engine/credit/data/norms';
import { CREDIT_SOURCES } from '../../../src/engine/credit/data/sources';
import { findingsOf } from '../../../src/engine/credit/finding';
import {
  reviewCredit,
  type CreditDeps,
  type CreditReview,
} from '../../../src/engine/credit/review';
import type { CreditInput } from '../../../src/engine/credit/types';
import { loan, repayment, TODAY } from './input';

const CASES = 150;
// The generator is seeded, so each run is the same; the cases solve hundreds of APRs and take
// about 3 s alone, which a full parallel run can push past the default 5 s.
const SLOW = { timeout: 30_000 };
const DEPS: CreditDeps = { norms: CREDIT_NORMS, sources: CREDIT_SOURCES, rates: BE1904 };

// mulberry32: small, seeded and deterministic.
function prng(seed: number) {
  let a = seed;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)] as T;
  return { r, int, pick };
}

function randomInput(g: ReturnType<typeof prng>): CreditInput {
  const agreedOn = addDays(parseDate('2011-09-25'), g.int(0, 5_100));
  const count = g.int(6, 96);
  const principal = g.int(500, 40_000);
  const amount = Math.round((principal / count) * (1 + g.int(0, 40) / 100) * 100) / 100;
  const firstDueOn = addMonthsClamped(agreedOn, 1);
  const agreedEndOn = addMonthsClamped(firstDueOn, count - 1);
  const repaidOn = addDays(agreedOn, g.int(1, compareDates(agreedEndOn, agreedOn) - 1));
  return loan({
    product: g.pick(['personal_loan', 'car_loan'] as const),
    agreedOn,
    drawnOn: agreedOn,
    principal,
    netDisbursed: null,
    nominalRate: g.int(0, 2_500) / 100,
    rateType: g.pick(['fixed', 'fixed', 'variable'] as const),
    declaredApr: g.pick([null, g.int(0, 3_000) / 100]),
    confirmedApr: g.pick([true, false]),
    instalments: { kind: 'regular', count, amount, frequency: 'monthly', firstDueOn },
    charges: g.pick([
      [],
      [{ kind: 'opening', amount: g.int(10, 800), paidOn: agreedOn, how: 'deducted' }],
    ]),
    insurance: g.pick([
      null,
      {
        premium: g.int(50, 900),
        single: true,
        financed: true,
        required: g.pick([true, false, null]),
      },
    ]),
    earlyRepayment:
      compareDates(repaidOn, TODAY) > 0
        ? null
        : g.pick([
            null,
            repayment({
              on: repaidOn,
              principalRepaid: g.int(100, principal),
              interestSettled: g.pick([null, g.int(0, 300)]),
              compensationCharged: g.int(0, 600),
              paidByInsurance: g.pick([true, false, false]),
              agreedEndOn,
              remainingInterest: g.pick([null, g.int(0, 2_000)]),
            }),
          ]),
    infoReceived: g.pick([true, false, null]),
  });
}

const reviewOf = (input: CreditInput, deps: CreditDeps = DEPS): CreditReview => {
  const result = reviewCredit(input, TODAY, deps);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.review;
};

const outcome = (r: CreditReview) => ({
  items: r.items.map((item) => findingsOf(item).map((f) => [f.status, f.amount, f.lastDay])),
  indicator: r.indicator,
  totals: r.totals,
  offerPass: r.offerPass,
});

describe('credit review properties', () => {
  it('never counts more than the highest reading, nor the indicator in a total', SLOW, () => {
    const g = prng(16_2011);
    for (let n = 0; n < CASES; n++) {
      const input = randomInput(g);
      const r = reviewOf(input);
      const highest = r.items
        .map((item) => Math.max(...findingsOf(item).map((f) => f.amount ?? 0)))
        .reduce((a, b) => a + b, 0);
      expect(r.totals.overCharged.counted, JSON.stringify(input)).toBeLessThanOrEqual(
        r.totals.overCharged.upTo,
      );
      expect(r.totals.overCharged.upTo).toBeCloseTo(highest, 6);
      // The pass follows the APR and the compensation, never the indicator.
      const banded = reviewOf(input, {
        ...DEPS,
        sources: {
          ...CREDIT_SOURCES,
          sts366_2026: { ...CREDIT_SOURCES.sts366_2026, verified: true },
        },
      });
      expect(banded.offerPass).toBe(r.offerPass);
      expect(banded.totals).toEqual(r.totals);
    }
  });

  it('changes nothing for contracts concluded before the bill would take effect', SLOW, () => {
    const g = prng(2026);
    const since = '2020-01-01';
    const enacted = {
      ...CREDIT_NORMS,
      consumer_credit_bill: {
        ...CREDIT_NORMS.consumer_credit_bill,
        status: 'in_force' as const,
        inForceSince: since,
      },
    };
    for (let n = 0; n < CASES; n++) {
      const input = randomInput(g);
      if (toIso(input.agreedOn) >= since) continue;
      expect(outcome(reviewOf(input, { ...DEPS, norms: enacted }))).toEqual(
        outcome(reviewOf(input)),
      );
    }
  });
});
