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

describe('offer against contract', () => {
  it('a net offer is not compared with a gross contract', () => {
    const result = compared(offer({ grossAnnual: 18000, net: true }));
    expect(result?.differences).toEqual([]);
    expect(result?.notCompared).toEqual([{ field: 'gross_annual', reason: 'net_against_gross' }]);
  });

  it.each<[string, Offer['remote'], number | null, string | null]>([
    ['fully remote', 'hybrid', 100, 'full'],
  ])('a contract %s reads as %s against an offer', (_name, offered, remoteShare, read) => {
    expect(compared(offer({ remote: offered }), { remoteShare })?.differences).toEqual([
      { field: 'remote', offer: offered, contract: read },
    ]);
  });

  it.each([
    ['gross pay of a net offer', { grossAnnual: null, net: true }, {}, 'gross_annual'],
    ['weekly hours of the offer', { weeklyHours: null }, {}, 'weekly_hours'],
    [
      'weekly hours of the contract',
      {},
      { contractHours: { weekly: null, annual: 1800 } },
      'weekly_hours',
    ],
    ['modality of the offer', { modality: null }, {}, 'modality'],
    ['unknown modality of the offer', { modality: 'unknown' }, {}, 'modality'],
    ['unknown modality of the contract', {}, { modality: 'unknown' }, 'modality'],
    ['remote work of the offer', { remote: null }, {}, 'remote'],
    ['remote work of the contract', {}, { remoteShare: null }, 'remote'],
  ] as const)('an unknown %s is the only thing not compared', (_name, theOffer, change, field) => {
    const result = compared(offer(theOffer), change);
    expect(result?.notCompared).toEqual([{ field, reason: 'not_known' }]);
    expect(result?.differences).toEqual([]);
  });

  it('a day rate with extra payments of unknown size gives no yearly pay to compare', () => {
    const salary = { ...contract().salary, amount: 60, period: 'day' as const, breakdown: [] };
    expect(compared(offer(), { salary })?.notCompared).toEqual([
      { field: 'gross_annual', reason: 'not_known' },
    ]);
  });
});

describe('contractAnnualPay', () => {
  const monthly = (change: Partial<EmploymentInput['salary']>) => ({
    ...contract().salary,
    ...change,
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

  it('payments and extra pays that contradict each other give no yearly figure', () => {
    expect(contractAnnualPay(contract({ extraPays: { count: 3, prorated: false } }))).toBeNull();
    expect(contractAnnualPay(contract({ extraPays: { count: 2, prorated: true } }))).toBeNull();
  });
});
