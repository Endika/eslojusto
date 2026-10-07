import { describe, expect, it } from 'vitest';
import { addDays, parseDate as f, toIso } from '../../../src/engine/date';
import { NORMS } from '../../../src/engine/rental/data/norms';
import { checkFees } from '../../../src/engine/rental/fees';
import { itemAmount, type ItemResult } from '../../../src/engine/rental/item';
import type { Norm, NormTable } from '../../../src/engine/rental/norms';
import { countedAmount } from '../../../src/engine/rental/outcome';
import type { Fee, FeeKind, LandlordType } from '../../../src/engine/rental/types';
import { contract } from './fixtures';

const fee = (kind: FeeKind, change: Partial<Fee> = {}): Fee => ({
  kind,
  amount: 726,
  deductedLater: false,
  requestedInWriting: false,
  ...change,
});

const check = (
  signedOn: string,
  landlordType: LandlordType,
  fees: readonly Fee[],
  norms: NormTable = NORMS,
) =>
  checkFees(contract({ signedOn: f(signedOn), startDate: f(signedOn), landlordType, fees }), norms);

const only = (results: readonly ItemResult[]): ItemResult => {
  const [r] = results;
  if (r === undefined || results.length !== 1) throw new Error('expected one result');
  return r;
};

const singleOf = (r: ItemResult) => {
  if (r.outcome.kind !== 'single') throw new Error(`expected single, got ${r.outcome.kind}`);
  return { status: r.outcome.value.status, amount: r.outcome.value.amount };
};

const withNorm = (id: keyof NormTable, change: Partial<Norm>): NormTable => ({
  ...NORMS,
  [id]: { ...NORMS[id], ...change },
});

const OTHER_NAMES: readonly FeeKind[] = ['solvency_check', 'reservation', 'management', 'other'];

describe('agency fees by the day the contract was signed', () => {
  it.each([
    // signed, landlord, kind → status, amount
    ['2019-03-06', 'company', 'agency_fee', 'paid_over', 726],
    ['2019-03-06', 'company', 'formalisation', 'paid_over', 726],
    ['2019-03-06', 'person', 'agency_fee', 'not_applicable_to_date', null],
    ['2019-03-06', 'company', 'solvency_check', 'review_it', null],
    ['2019-03-06', 'person', 'reservation', 'not_applicable_to_date', null],
    ['2023-05-25', 'company', 'agency_fee', 'paid_over', 726],
    ['2023-05-25', 'person', 'formalisation', 'not_applicable_to_date', null],
    ['2023-05-25', 'company', 'management', 'review_it', null],
    ['2023-05-26', 'person', 'agency_fee', 'paid_over', 726],
    ['2023-05-26', 'person', 'formalisation', 'paid_over', 726],
    ['2023-05-26', 'person', 'solvency_check', 'review_it', null],
    ['2023-05-26', 'company', 'other', 'review_it', null],
    ['2026-10-07', 'person', 'agency_fee', 'paid_over', 726],
    ['2026-10-07', 'person', 'reservation', 'review_it', null],
    // Under the Ley 12/2023 wording as much as under RDL 29/2026: one reading.
    ['2026-10-08', 'person', 'agency_fee', 'paid_over', 726],
    ['2026-10-08', 'company', 'formalisation', 'paid_over', 726],
  ] as const)('signed %s, %s landlord, %s → %s', (signed, landlord, kind, status, amount) => {
    expect(singleOf(only(check(signed, landlord, [fee(kind)])))).toEqual({ status, amount });
  });

  it('cites the wording in force on the signing day', () => {
    const cited = (signed: string, landlord: LandlordType) =>
      only(check(signed, landlord, [fee('agency_fee')])).sources.map((s) => s.id);
    expect(cited('2019-03-06', 'company')).toEqual(['fees_2019']);
    expect(cited('2023-05-26', 'person')).toEqual(['fees_2023']);
  });

  it('leaves out what was paid in advance and taken off later', () => {
    const results = check('2024-01-10', 'person', [
      fee('agency_fee', { deductedLater: true }),
      fee('formalisation', { amount: 300 }),
    ]);
    expect(results.map((r) => r.index)).toEqual([1]);
    expect(singleOf(only(results))).toEqual({ status: 'paid_over', amount: 300 });
  });
});

describe('a charge under another name', () => {
  it('never carries a figure nor reaches a total when signed before 08-10-2026', () => {
    let day = f('2019-03-06');
    while (toIso(day) <= '2026-10-07') {
      for (const landlord of ['person', 'company'] as const)
        for (const kind of OTHER_NAMES) {
          const r = only(check(toIso(day), landlord, [fee(kind)]));
          expect(r.outcome.kind).toBe('single');
          if (r.outcome.kind === 'single') expect(r.outcome.value.amount).toBeNull();
          expect(countedAmount(r.outcome, itemAmount)).toBe(0);
        }
      day = addDays(day, 23);
    }
  });

  it('from 08-10-2026 is paid over only where RDL 29/2026 holds, so it counts nothing yet', () => {
    const r = only(check('2026-10-20', 'person', [fee('solvency_check')]));
    if (r.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(r.outcome.reasons).toEqual(['pending_validation']);
    expect(r.outcome.low).toMatchObject({ status: 'review_it', amount: null });
    expect(r.outcome.high).toMatchObject({ status: 'paid_over', amount: 726 });
    expect(countedAmount(r.outcome, itemAmount)).toBe(0);
    expect(r.sources.map((s) => s.id).sort()).toEqual(['fees_2023', 'fees_2026']);
    expect(r.sources.find((s) => s.id === 'fees_2026')?.status).toBe('pending_validation');
  });

  it('asked for in writing as an optional service is not checked under RDL 29/2026', () => {
    const r = only(check('2026-10-20', 'person', [fee('other', { requestedInWriting: true })]));
    if (r.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(r.outcome.readings.map((x) => x.value.status).sort()).toEqual([
      'not_checkable',
      'review_it',
    ]);
    expect(countedAmount(r.outcome, itemAmount)).toBe(0);
  });

  it('with «No lo sé» on the written request, gives both and counts nothing', () => {
    const r = only(
      check('2026-10-20', 'person', [fee('management', { requestedInWriting: null })]),
    );
    if (r.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(r.outcome.reasons).toEqual(['pending_validation', 'agreement_unknown']);
    expect(r.outcome.high).toMatchObject({ status: 'paid_over', amount: 726 });
    expect(countedAmount(r.outcome, itemAmount)).toBe(0);
  });

  it('follows the status of RDL 29/2026 with no change to the rule', () => {
    const validated = withNorm('rdl29_2026', { status: 'in_force', statusSince: '2026-11-05' });
    expect(singleOf(only(check('2026-10-20', 'person', [fee('reservation')], validated)))).toEqual({
      status: 'paid_over',
      amount: 726,
    });
    const repealed = withNorm('rdl29_2026', {
      status: 'repealed',
      inForceUntil: '2026-11-05',
      statusSince: '2026-11-06',
    });
    const r = only(check('2026-10-20', 'person', [fee('reservation')], repealed));
    if (r.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(r.outcome.reasons).toEqual(['repealed_window']);
    expect(countedAmount(r.outcome, itemAmount)).toBe(0);
    // Signed after the repeal: the Ley 12/2023 wording again.
    expect(singleOf(only(check('2026-11-10', 'person', [fee('reservation')], repealed)))).toEqual({
      status: 'review_it',
      amount: null,
    });
  });
});
