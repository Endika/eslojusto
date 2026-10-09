import { describe, expect, it } from 'vitest';
import { addDays, addMonthsClamped, parseDate } from '../../../src/engine/date';
import { aprFlows, solveApr } from '../../../src/engine/credit/tae';
import type { ChargePayment, CreditInput } from '../../../src/engine/credit/types';
import { loan } from './input';

const CASES = 200;

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

const rate = (input: CreditInput): number => {
  const flows = aprFlows(input, {
    insurance: true,
    leaveOut: null,
    balloon: 'balloon_month_after',
  });
  const solution = solveApr(flows?.flows ?? []);
  if (solution.kind !== 'solved') throw new Error('unsolvable');
  return solution.rate;
};

// A level instalment repaying `principal` at a monthly rate `i` over `count` months.
const instalment = (principal: number, i: number, count: number): number =>
  i === 0 ? principal / count : (principal * i) / (1 - (1 + i) ** -count);

// A loan drawn on a day every month has, its first instalment exactly a month later.
function randomLoan(g: ReturnType<typeof prng>): CreditInput {
  const drawn = addDays(parseDate('2012-01-01'), g.int(0, 5_000));
  const drawnOn = { ...drawn, d: Math.min(drawn.d, 28) };
  const principal = g.int(200, 60_000);
  const nominalRate = g.int(0, 3_000) / 100;
  const count = g.int(3, 120);
  return loan({
    agreedOn: drawnOn,
    drawnOn,
    principal,
    netDisbursed: null,
    nominalRate,
    charges: [],
    instalments: {
      kind: 'regular',
      count,
      amount: instalment(principal, nominalRate / 1_200, count),
      frequency: 'monthly',
      firstDueOn: addMonthsClamped(drawnOn, 1),
    },
  });
}

describe('APR properties', () => {
  it('without charges and with a level instalment, is the nominal rate compounded monthly', () => {
    const g = prng(20_261_009);
    for (let n = 0; n < CASES; n++) {
      const input = randomLoan(g);
      const expected = (1 + input.nominalRate / 1_200) ** 12 - 1;
      expect(Math.abs(rate(input) - expected), JSON.stringify(input)).toBeLessThan(1e-6);
    }
  });

  it('never goes down when a charge is added, however it is paid', () => {
    const g = prng(7);
    const ways: readonly ChargePayment[] = ['deducted', 'financed', 'paid'];
    for (let n = 0; n < CASES; n++) {
      const input = randomLoan(g);
      const amount = g.int(1, Math.floor(input.principal / 4));
      const how = g.pick(ways);
      // A financed charge is repaid within instalments worked out on the larger capital.
      const plan = input.instalments;
      const charged = {
        ...input,
        charges: [{ kind: 'opening' as const, amount, paidOn: input.drawnOn, how }],
        instalments:
          how === 'financed' && plan?.kind === 'regular'
            ? {
                ...plan,
                amount: instalment(input.principal + amount, input.nominalRate / 1_200, plan.count),
              }
            : plan,
      };
      expect(rate(charged), JSON.stringify(charged)).toBeGreaterThan(rate(input));
    }
  });
});
