import { describe, expect, it } from 'vitest';
import { creditFailedChecks, creditIncomplete } from '../src/domain/credit-checks';
import { creditMerge } from '../src/domain/credit-merge';
import { parseReading } from '../src/domain/extraction';
import { f, page } from './support/fields';

const PAGES = [
  page(1, 'credit_agreement'),
  page(2, 'amortization_schedule'),
  page(3, 'early_repayment_statement'),
  page(4, 'card_statement'),
];
const checks = (input: Record<string, unknown>) =>
  creditFailedChecks(parseReading({ pages: PAGES, ...input }, PAGES.length, 'credit'));
const row = (values: Record<string, unknown>) => ({ ...values, confidence: 'high' });

describe('creditFailedChecks', () => {
  it('passes a coherent pack', () => {
    expect(
      checks({
        credit_agreement: {
          principal: f(10500),
          netDisbursed: f(9738.75),
          instalmentCount: f(48),
          instalmentAmount: f(273.35),
          declaredTotalPayable: f(13120.8),
          agreedEndOn: f('2023-02-05'),
        },
        amortization_schedule: {
          schedule: [
            row({
              dueOn: '2019-03-05',
              amount: 273.35,
              interest: 105,
              principal: 168.35,
              balance: 10331.65,
            }),
            row({
              dueOn: '2019-04-05',
              amount: 273.35,
              interest: 103.32,
              principal: 170.03,
              balance: 10161.62,
            }),
          ],
        },
        early_repayment_statement: { repaidOn: f('2021-06-05') },
        card_statement: {
          statements: [row({ statementOn: '2026-08-01', balance: 1500, totalToPay: 2100 })],
        },
      }),
    ).toEqual([]);
  });

  it.each([
    ['net_above_principal', { credit_agreement: { principal: f(10000), netDisbursed: f(10200) } }],
    [
      'declared_total_mismatch',
      {
        credit_agreement: {
          instalmentCount: f(48),
          instalmentAmount: f(273.35),
          balloonAmount: f(1000),
          declaredTotalPayable: f(13120.8),
        },
      },
    ],
    [
      'schedule_rows_do_not_sum',
      {
        amortization_schedule: {
          schedule: [row({ dueOn: '2019-03-05', amount: 273.35, interest: 105, principal: 150 })],
        },
      },
    ],
    [
      'schedule_balance_jump',
      {
        amortization_schedule: {
          schedule: [
            row({ dueOn: '2019-03-05', amount: 273.35, balance: 10331.65 }),
            row({ dueOn: '2019-04-05', amount: 273.35, principal: 170.03, balance: 9000 }),
          ],
        },
      },
    ],
    [
      'repayment_after_end',
      {
        credit_agreement: { agreedEndOn: f('2023-02-05') },
        early_repayment_statement: { repaidOn: f('2023-06-05') },
      },
    ],
    [
      'statement_total_below_balance',
      {
        card_statement: {
          statements: [row({ statementOn: '2026-08-01', balance: 1500, totalToPay: 900 })],
        },
      },
    ],
  ])('flags %s', (check, input) => {
    expect(checks(input)).toEqual([check]);
  });

  it('takes a total above the instalments for charges paid apart, not a mismatch', () => {
    expect(
      checks({
        credit_agreement: {
          instalmentCount: f(60),
          instalmentAmount: f(405.53),
          declaredTotalPayable: f(25121.8),
        },
      }),
    ).toEqual([]);
  });
});

describe('creditIncomplete', () => {
  const incomplete = (input: Record<string, unknown>, pages = [page(1, 'credit_agreement')]) => {
    const reading = parseReading({ pages, ...input }, pages.length, 'credit');
    return creditIncomplete(reading, creditMerge(reading, input));
  };

  it('doubts a legible contract with neither its amount nor its instalments', () => {
    expect(incomplete({ credit_agreement: { agreedOn: f('2024-01-15') } })).toBe(true);
    expect(incomplete({ credit_agreement: { instalmentAmount: f(421.45) } })).toBe(false);
  });

  it('doubts a legible card contract with neither its limit nor its rate', () => {
    const pages = [page(1, 'revolving_agreement')];
    expect(incomplete({ revolving_agreement: { annualFee: f(0) } }, pages)).toBe(true);
    expect(incomplete({ revolving_agreement: { nominalRate: f(21.94) } }, pages)).toBe(false);
  });

  it('does not doubt a pack with no contract in it', () => {
    expect(incomplete({}, [page(1, 'card_statement')])).toBe(false);
  });
});
