import { describe, expect, it } from 'vitest';
import { parseDate, type CivilDate } from '../../../src/engine/date';
import { INSURANCE_NORMS } from '../../../src/engine/insurance/data/norms';
import { reviewInsurance } from '../../../src/engine/insurance/review';
import { scope } from '../../../src/engine/insurance/scope';
import type { InsuranceInput, InsuranceLine } from '../../../src/engine/insurance/types';
import { validate } from '../../../src/engine/insurance/validate';
import { notice, policy, TODAY } from './input';

const deps = { norms: INSURANCE_NORMS };

const review = (input: InsuranceInput, today: CivilDate = TODAY) => {
  const result = reviewInsurance(input, today, deps);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.review;
};

describe('scope', () => {
  it.each<InsuranceLine>(['home', 'car'])('reviews a %s policy', (line) => {
    expect(scope(policy({ line }))).toEqual({ inScope: true });
  });

  it.each([
    ['life', 'life'],
    ['health', 'health'],
    ['funeral', 'funeral'],
    ['other', 'other_line'],
  ] as const)('leaves out a %s policy', (line, reason) => {
    expect(scope(policy({ line }))).toEqual({ inScope: false, reason });
  });

  it.each([
    ['2015-12-31', { inScope: false, reason: 'before_2016' }],
    ['2016-01-01', { inScope: true }],
  ])('a period ending on %s', (day, expected) => {
    expect(scope(policy({ expiresOn: parseDate(day) }))).toEqual(expected);
  });
});

describe('validation', () => {
  const errors = (change: Partial<InsuranceInput>) => validate(policy(change), TODAY);

  it('accepts the synthetic policy', () => {
    expect(errors({})).toEqual([]);
  });

  it.each<[Partial<InsuranceInput>, string, string]>([
    [{ expiresOn: { y: 2027, m: 2, d: 30 } }, 'expiresOn', 'invalid_date'],
    [{ expiresOn: parseDate('2028-10-10') }, 'expiresOn', 'too_far_ahead'],
    [{ concludedOn: parseDate('2026-10-10') }, 'concludedOn', 'in_future'],
    [
      { concludedOn: parseDate('2026-10-01'), expiresOn: parseDate('2026-09-30') },
      'concludedOn',
      'after_expiry',
    ],
    [{ policyReceivedOn: parseDate('2024-02-28') }, 'policyReceivedOn', 'before_concluded'],
    [{ policyReceivedOn: parseDate('2026-10-10') }, 'policyReceivedOn', 'in_future'],
    [{ notice: notice({ receivedOn: parseDate('2026-10-10') }) }, 'notice.receivedOn', 'in_future'],
    [
      {
        expiresOn: parseDate('2026-10-01'),
        notice: notice({ receivedOn: parseDate('2026-10-02') }),
      },
      'notice.receivedOn',
      'after_expiry',
    ],
    [{ notice: notice({ previousPremium: 0 }) }, 'notice.previousPremium', 'amount_range'],
    [{ notice: notice({ newPremium: Number.NaN }) }, 'notice.newPremium', 'amount_range'],
  ])('rejects %o', (change, field, code) => {
    expect(errors(change)).toContainEqual({ field, code });
  });

  it('a review with errors carries no findings', () => {
    expect(reviewInsurance(policy({ expiresOn: { y: 2027, m: 13, d: 1 } }), TODAY, deps)).toEqual({
      ok: false,
      errors: [{ field: 'expiresOn', code: 'invalid_date' }],
    });
  });
});

describe('insurance review', () => {
  it('a home policy with a renewal notice', () => {
    const r = review(
      policy({ notice: notice({ receivedOn: parseDate('2027-01-20') }) }),
      parseDate('2027-01-25'),
    );
    expect(r.findings.map((f) => [f.id, f.status])).toEqual([
      ['non_renewal', 'open'],
      ['change_notice', 'late'],
      ['premium', 'up'],
      ['distance_withdrawal', 'not_applicable'],
    ]);
    expect(r.information.map((b) => b.id)).toEqual([
      'policy_correction',
      'questionnaire',
      'proportional_rule',
      'overinsurance',
    ]);
    expect(r.unchecked).toEqual([
      'clause_transparency',
      'premium_price',
      'insured_value',
      'claims',
    ]);
  });

  it('a motor policy contracted online', () => {
    const r = review(
      policy({
        line: 'car',
        carCover: 'with_voluntary',
        distance: true,
        concludedOn: parseDate('2026-10-01'),
        expiresOn: parseDate('2027-10-01'),
      }),
    );
    expect(r.findings.map((f) => [f.id, f.status])).toEqual([
      ['non_renewal', 'open'],
      ['change_notice', 'not_entered'],
      ['premium', 'not_entered'],
      ['distance_withdrawal_compulsory', 'not_applicable'],
      ['distance_withdrawal_voluntary', 'review_it'],
    ]);
  });

  it('outside the review only the reason is shown', () => {
    const r = review(policy({ line: 'life' }));
    expect(r.findings).toEqual([]);
    expect(r.information.map((b) => [b.id, b.calculation[0]?.key])).toEqual([
      ['out_of_scope', 'information.out_of_scope.life'],
    ]);
  });

  it('never offers the pass and never carries euros owed', () => {
    for (const input of [
      policy(),
      policy({ notice: notice({ receivedOn: parseDate('2027-01-20') }) }),
      policy({ line: 'car', distance: true, concludedOn: parseDate('2026-10-01') }),
      policy({ line: 'health' }),
    ]) {
      const r = review(input, parseDate('2027-01-25'));
      expect(r.offerPass).toBe(false);
      expect(r.findings.filter((f) => 'amount' in f)).toEqual([]);
    }
  });

  it('every finding and block cites only rules of its own table', () => {
    const r = review(
      policy({ distance: true, concludedOn: parseDate('2026-10-01'), notice: notice() }),
    );
    const cited = [...r.findings, ...r.information].flatMap((x) => x.sources.map((s) => s.url));
    for (const url of cited) expect(url.startsWith('https://www.boe.es/')).toBe(true);
  });
});

describe('information blocks', () => {
  it('gives the month to ask for a correction of the policy, from its delivery', () => {
    const block = review(
      policy({ policyReceivedOn: parseDate('2024-01-31'), concludedOn: parseDate('2024-01-15') }),
    ).information[0];
    expect(block?.calculation[1]).toEqual({
      key: 'information.policy_correction.until',
      vars: { day: { date: '2024-02-29' } },
    });
  });

  it('has no date while the policy has not arrived', () => {
    const block = review(policy({ policyReceived: false })).information[0];
    expect(block?.calculation[1]?.key).toBe('information.policy_correction.no_policy');
  });

  it('works the proportional rule through an example', () => {
    const block = review(policy()).information.find((b) => b.id === 'proportional_rule');
    expect(block?.calculation[1]?.vars).toEqual({
      value: { euros: 150_000 },
      insured: { euros: 100_000 },
      damage: { euros: 30_000 },
      paid: { euros: 20_000 },
    });
  });
});
