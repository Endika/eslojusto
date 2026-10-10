import { describe, expect, it } from 'vitest';
import { parseReading } from '../src/domain/extraction';
import { telecomFailedChecks, telecomIncomplete } from '../src/domain/telecom-checks';
import { TELECOM_MERGE_RULES, telecomMerge } from '../src/domain/telecom-merge';
import { TELECOM_SECTIONS } from '../src/domain/telecom-schema';
import { f, page } from './support/fields';

// Made-up figures and companies.
const PAGES = [page(1, 'telecom_contract'), page(2, 'telecom_bill')];
const toolInput = (input: Record<string, unknown>) => ({ pages: PAGES, ...input });
const read = (input: Record<string, unknown>) =>
  parseReading(toolInput(input), PAGES.length, 'telecom');
const pack = (input: Record<string, unknown>) => telecomMerge(read(input), toolInput(input));
const checks = (input: Record<string, unknown>) => telecomFailedChecks(read(input));
const row = (values: Record<string, unknown>) => ({ ...values, confidence: 'high' });

const BILL = {
  bills: [row({ document: 2, periodFrom: '2026-08-01', periodTo: '2026-08-31', total: 147.97 })],
  lines: [
    row({ document: 2, kind: 'fixed_fee', amount: 20.66 }),
    row({ document: 2, kind: 'penalty', amount: 100 }),
    row({ document: 2, kind: 'discount', amount: 5 }),
  ],
};

describe('telecomMerge', () => {
  it('merges every contract field, and nothing else', () => {
    const fields = Object.values(TELECOM_SECTIONS).flatMap((s) => Object.keys(s.fields));
    expect(Object.keys(TELECOM_MERGE_RULES).sort()).toEqual([...new Set(fields)].sort());
  });

  it('takes the contract’s commitment and keeps each bill line with its source', () => {
    const m = pack({
      telecom_contract: {
        commitmentMonths: f(18),
        agreedPenalty: f(150),
        priceReviewIndex: f('ipc'),
      },
      telecom_bill: BILL,
    });
    expect(m.fields).toEqual({
      commitmentMonths: { ...f(18), source: 'telecom_contract' },
      agreedPenalty: { ...f(150), source: 'telecom_contract' },
      priceReviewIndex: { ...f('ipc'), source: 'telecom_contract' },
    });
    expect(m.lists.lines?.map((l) => [l.values['kind'], l.source])).toEqual([
      ['fixed_fee', 'telecom_bill'],
      ['penalty', 'telecom_bill'],
      ['discount', 'telecom_bill'],
    ]);
    expect(m.truncated).toBe(false);
  });

  it('drops a concept that names a number called, and keeps its amount', () => {
    const m = pack({
      telecom_bill: {
        bills: BILL.bills,
        lines: [
          row({ document: 2, concept: 'Llamadas a 600 123 456', kind: 'other', amount: 3.1 }),
        ],
      },
    });
    expect(m.lists.lines?.[0]?.values).toEqual({ document: 2, kind: 'other', amount: 3.1 });
    expect(m.discarded).toBe(1);
  });
});

describe('telecomFailedChecks', () => {
  it('passes a bill that hangs together', () => {
    expect(checks({ telecom_bill: BILL })).toEqual([]);
  });

  it('flags charges, less discounts, above the bill’s total', () => {
    const [bill] = BILL.bills;
    expect(checks({ telecom_bill: { ...BILL, bills: [{ ...bill, total: 110 }] } })).toEqual([
      'lines_above_total',
    ]);
  });

  it('flags a period that ends before it starts, the bill’s or a line’s', () => {
    const [bill] = BILL.bills;
    expect(
      checks({ telecom_bill: { ...BILL, bills: [{ ...bill, periodTo: '2026-07-31' }] } }),
    ).toEqual(['period_end_before_start']);
    expect(
      checks({
        telecom_bill: {
          ...BILL,
          lines: [
            row({ document: 2, kind: 'other', from: '2026-08-10', to: '2026-08-01', amount: 1 }),
          ],
        },
      }),
    ).toEqual(['period_end_before_start']);
  });
});

describe('telecomIncomplete', () => {
  it('doubts a legible contract with no commitment, penalty or price clause', () => {
    const incomplete = (input: Record<string, unknown>) => {
      const r = read(input);
      return telecomIncomplete(r, telecomMerge(r, toolInput(input)));
    };
    expect(incomplete({ telecom_contract: { commitmentMonths: f(18) }, telecom_bill: BILL })).toBe(
      false,
    );
    expect(
      incomplete({ telecom_contract: { signedOn: f('2025-03-01') }, telecom_bill: BILL }),
    ).toBe(true);
  });

  it('doubts a legible bill that yields no bill', () => {
    const input = { telecom_contract: { commitmentMonths: f(18) } };
    const r = read(input);
    expect(telecomIncomplete(r, telecomMerge(r, toolInput(input)))).toBe(true);
  });
});
