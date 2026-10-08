import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contractAnnualPay } from '../../../src/engine/employment/minimum-wage';
import { compareOffer } from '../../../src/engine/employment/offer';
import type { EmploymentInput, Offer } from '../../../src/engine/employment/types';
import { contract } from './input';

const offer = (change: Partial<Offer> = {}): Offer => ({
  grossAnnual: 21000,
  net: false,
  weeklyHours: 40,
  modality: 'permanent',
  remote: 'none',
  ...change,
});

// 1.500 € × 14 = 21.000 € a year, 40 hours, permanent, on site.
const compared = (o: Offer, change: Partial<EmploymentInput> = {}) =>
  compareOffer(contract({ remoteShare: 0, ...change, offer: o }));

const keysDeep = (value: unknown): string[] =>
  typeof value !== 'object' || value === null
    ? []
    : Object.entries(value).flatMap(([k, v]) => [k, ...keysDeep(v)]);

describe('offer against contract', () => {
  it('without an offer there is nothing to compare', () => {
    expect(compareOffer(contract())).toBeNull();
  });

  it('an offer matching the contract shows no difference', () => {
    expect(compared(offer())).toEqual({ differences: [], notCompared: [] });
  });

  it('sets each differing field side by side', () => {
    const result = compared(
      offer({ grossAnnual: 24000, weeklyHours: 35, modality: 'production', remote: 'hybrid' }),
    );
    expect(result?.differences).toEqual([
      { field: 'gross_annual', offer: 24000, contract: 21000 },
      { field: 'weekly_hours', offer: 35, contract: 40 },
      { field: 'modality', offer: 'production', contract: 'permanent' },
      { field: 'remote', offer: 'hybrid', contract: 'none' },
    ]);
  });

  it('a net offer is not compared with a gross contract', () => {
    const result = compared(offer({ grossAnnual: 18000, net: true }));
    expect(result?.differences).toEqual([]);
    expect(result?.notCompared).toEqual([{ field: 'gross_annual', reason: 'net_against_gross' }]);
  });

  it('cents from carrying a monthly pay to a year are no difference', () => {
    const salary = { ...contract().salary, amount: 1714.29, breakdown: [] };
    expect(compared(offer({ grossAnnual: 24000 }), { salary })?.differences).toEqual([]);
  });

  it('what either side leaves unknown is listed as not compared', () => {
    const result = compared(offer({ weeklyHours: null, modality: 'unknown', remote: null }), {
      remoteShare: null,
    });
    expect(result?.notCompared.map((n) => n.field)).toEqual(['weekly_hours', 'modality', 'remote']);
  });

  it('a day rate with extra payments of unknown size gives no yearly pay to compare', () => {
    const salary = { ...contract().salary, amount: 60, period: 'day' as const, breakdown: [] };
    expect(compared(offer(), { salary })?.notCompared).toEqual([
      { field: 'gross_annual', reason: 'not_known' },
    ]);
  });

  it("carries no verdict, no amount and no difference in anyone's favour", () => {
    const result = compared(offer({ grossAnnual: 30000, weeklyHours: 30 }));
    const keys = keysDeep(result);
    for (const forbidden of ['status', 'amount', 'difference', 'calculation'])
      expect(keys).not.toContain(forbidden);
  });

  it('never says anything is owed', () => {
    const source = readFileSync('src/engine/employment/offer.ts', 'utf8');
    expect(source).not.toMatch(/te deben/i);
    expect(JSON.stringify(compared(offer({ grossAnnual: 30000 })))).not.toMatch(/te deben|owed/i);
  });
});

describe('contractAnnualPay', () => {
  const monthly = (change: Partial<EmploymentInput['salary']>) => ({
    ...contract().salary,
    ...change,
  });

  it('a base-only monthly salary with two extra pays: fourteen whole months', () => {
    expect(contractAnnualPay(contract())).toBe(21000);
  });

  it('without a breakdown nothing suggests smaller extra pays', () => {
    expect(contractAnnualPay(contract({ salary: monthly({ breakdown: [] }) }))).toBe(21000);
  });

  it('extra pays of unstated size beside complements: no yearly figure', () => {
    // 1.500 × 14 = 21.000 €, but extra pays on base alone give 20.200 €.
    const salary = monthly({
      breakdown: [
        { kind: 'base', amount: 1100 },
        { kind: 'fixed_complement', amount: 400 },
      ],
    });
    expect(contractAnnualPay(contract({ salary }))).toBeNull();
    expect(compared(offer({ grossAnnual: 20200 }), { salary })?.notCompared).toEqual([
      { field: 'gross_annual', reason: 'not_known' },
    ]);
  });

  it('a breakdown short of the total leaves the extra pays in doubt', () => {
    const salary = monthly({ breakdown: [{ kind: 'base', amount: 1100 }] });
    expect(contractAnnualPay(contract({ salary }))).toBeNull();
  });

  it('prorated extra pays are already in the monthly figure', () => {
    const salary = monthly({
      prorated: true,
      breakdown: [
        { kind: 'base', amount: 1100 },
        { kind: 'fixed_complement', amount: 400 },
      ],
    });
    expect(contractAnnualPay(contract({ salary, extraPays: { count: 2, prorated: true } }))).toBe(
      18000,
    );
  });

  it('payments and extra pays that contradict each other give no yearly figure', () => {
    expect(contractAnnualPay(contract({ extraPays: { count: 3, prorated: false } }))).toBeNull();
    expect(contractAnnualPay(contract({ extraPays: { count: 2, prorated: true } }))).toBeNull();
  });
});
