import { describe, expect, it } from 'vitest';
import {
  telecomCharges,
  type ChargeLine,
  type TelecomLineKind,
} from '../../../src/engine/bills/telecom-charges';
import { parseDate, type CivilDate } from '../../../src/engine/date';

const TODAY = parseDate('2026-10-15');

const line = (
  kind: TelecomLineKind,
  amount: number,
  from: string | null = null,
  to: string | null = null,
): ChargeLine => ({
  kind,
  amount,
  from: from === null ? null : parseDate(from),
  to: to === null ? null : parseDate(to),
});

const bill = (...lines: ChargeLine[]) => ({ lines });
const day = (iso: string): CivilDate => parseDate(iso);

describe('the charges of telecom bills', () => {
  it('groups each bill’s lines by kind, fees first and discounts last', () => {
    const c = telecomCharges(
      [
        bill(
          line('discount', 4.13),
          line('third_party', 3.99),
          line('fixed_fee', 23.14),
          line('other', 0),
          line('premium_rate', 1.5),
          line('fixed_fee', 5),
        ),
      ],
      TODAY,
    );
    expect(c.bills[0]?.groups).toEqual([
      { kind: 'fixed_fee', lines: [2, 5] },
      { kind: 'premium_rate', lines: [4] },
      { kind: 'third_party', lines: [1] },
      { kind: 'other', lines: [3] },
      { kind: 'discount', lines: [0] },
    ]);
  });

  it('marks premium-rate and third-party lines as extras, never a monthly fee', () => {
    const c = telecomCharges(
      [
        bill(line('fixed_fee', 23.14), line('fixed_fee', 4.99), line('premium_rate', 1.5)),
        bill(line('third_party', 3.99), line('handset', 10), line('penalty', 50)),
      ],
      TODAY,
    );
    expect(c.bills.map((b) => b.extras)).toEqual([[2], [0]]);
    expect(c.extras).toBe(2);
    expect(c.premiumRate).toBe(true);
    expect(c.fixedFees).toBe(true);
  });

  it('has no extras, premium rate or fees when the bills have none', () => {
    const c = telecomCharges([bill(line('handset', 10), line('discount', 2))], TODAY);
    expect(c).toMatchObject({ extras: 0, premiumRate: false, fixedFees: false });
  });

  it('tells when a discount with an end day ends, or ended, and by how much', () => {
    const c = telecomCharges(
      [
        bill(
          line('discount', 4.13, '2025-09-30', '2026-09-30'),
          line('discount', 2, '2026-01-01', '2026-12-31'),
          line('discount', 1),
          line('fixed_fee', 23.14),
        ),
      ],
      TODAY,
    );
    expect(c.promotions).toEqual([
      { bill: 0, line: 0, endsOn: day('2026-09-30'), ended: true, amount: 4.13 },
      { bill: 0, line: 1, endsOn: day('2026-12-31'), ended: false, amount: 2 },
    ]);
  });

  it('ends on its last day: today is not over yet', () => {
    const [p] = telecomCharges([bill(line('discount', 3, null, '2026-10-15'))], TODAY).promotions;
    expect(p?.ended).toBe(false);
  });

  it('tells a discount repeated on several bills once, from the newest', () => {
    const repeated = line('discount', 4.13, '2025-09-30', '2026-09-30');
    const c = telecomCharges(
      [bill(line('fixed_fee', 23.14), repeated), bill(repeated), bill(line('discount', 4.13))],
      TODAY,
    );
    expect(c.promotions).toEqual([
      { bill: 0, line: 1, endsOn: day('2026-09-30'), ended: true, amount: 4.13 },
    ]);
  });

  it('leaves out a discount of nothing', () => {
    expect(
      telecomCharges([bill(line('discount', 0, null, '2026-12-31'))], TODAY).promotions,
    ).toEqual([]);
  });
});
