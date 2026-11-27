import { describe, expect, it } from 'vitest';
import { assessMinimumWage } from '../../../src/engine/household/minimum-wage';
import { parseDate } from '../../../src/engine/date';
import type { HouseholdInput } from '../../../src/engine/household/types';
import { DEPS, household } from './input';

const apart = (count: number, amount: number | null) => ({
  count,
  amount,
  prorated: false,
  accrual: 'semiannual' as const,
});
const MIN = {
  key: 'minimum_wage.minimum',
  vars: {
    year: 2026,
    monthly: { euros: 1221 },
    annual: { euros: 17094 },
    hours: 40,
    coefficient: 1,
    requiredMonthly: { euros: 1221 },
    requiredAnnual: { euros: 17094 },
  },
};

const PAID = (monthly: number, extras: number, annual: number, apartPaid: boolean) => ({
  key: apartPaid ? 'minimum_wage.paid_apart' : 'minimum_wage.paid_prorated',
  vars: { monthly: { euros: monthly }, extras: { euros: extras }, annual: { euros: annual } },
});
const SHORT_MONTH = (required: number, paid: number) => ({
  key: 'minimum_wage.monthly_cash',
  vars: { required: { euros: required }, paid: { euros: paid } },
});
const SHORTFALL = (annual: number, monthly: number) => ({
  key: 'minimum_wage.shortfall',
  vars: { annual: { euros: annual }, monthly: { euros: monthly } },
});
const SHARE = (inKind: number, total: number, share: number) => ({
  key: 'in_kind.share',
  vars: { inKind: { euros: inKind }, total: { euros: total }, share, cap: 30 },
});
const CASH_ONLY = { key: 'in_kind.cash_only' };

describe('what the minimum wage review shows for each case', () => {
  it.each<[string, Partial<HouseholdInput>, string | null, string | null, Record<string, unknown>]>(
    [
      [
        'a shortfall in part of the year',
        { monthlyCash: 1000, extraPays: null },
        '2026-07-31',
        '2026-01-01',
        {
          smi_monthly: {
            status: 'below_minimum',
            calculation: [
              MIN,
              {
                key: 'minimum_wage.paid_prorated',
                vars: { monthly: { euros: 1000 }, extras: { euros: 0 }, annual: { euros: 12000 } },
              },
              {
                key: 'minimum_wage.shortfall',
                vars: { annual: { euros: 5094 }, monthly: { euros: 424.5 } },
              },
              {
                key: 'minimum_wage.shortfall_accrued',
                vars: { year: 2026, days: 212, accrued: { euros: 2958.71 } },
              },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'not_entered',
            calculation: [],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
        },
      ],
      [
        'a month short with pay in kind and extra payments apart',
        { monthlyCash: 1150, inKindMonthly: 300, extraPays: apart(2, 1700) },
        null,
        null,
        {
          smi_monthly: {
            status: 'below_minimum',
            calculation: [
              MIN,
              {
                key: 'minimum_wage.paid_apart',
                vars: {
                  monthly: { euros: 1150 },
                  extras: { euros: 3400 },
                  annual: { euros: 17200 },
                },
              },
              {
                key: 'minimum_wage.monthly_cash',
                vars: { required: { euros: 1221 }, paid: { euros: 1150 } },
              },
              {
                key: 'minimum_wage.shortfall',
                vars: { annual: { euros: 852 }, monthly: { euros: 71 } },
              },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          smi_in_kind_cap: {
            status: 'within_limit',
            calculation: [
              {
                key: 'in_kind.share',
                vars: { inKind: { euros: 300 }, total: { euros: 1450 }, share: 20.69, cap: 30 },
              },
              {
                key: 'in_kind.share_annual',
                vars: { inKind: { euros: 3600 }, total: { euros: 20800 }, share: 17.31, cap: 30 },
              },
              { key: 'in_kind.cash_only' },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'within_limit',
            calculation: [{ key: 'extra_pays.two_or_more', vars: { count: 2 } }],
            basedOnYourAnswer: false,
            agreementMaySetOther: true,
          },
        },
      ],
      [
        'a month short with pay in kind and extra payments of an unknown amount',
        { monthlyCash: 1150, inKindMonthly: 300, extraPays: apart(2, null) },
        null,
        null,
        {
          smi_monthly: {
            status: 'below_minimum',
            calculation: [
              MIN,
              {
                key: 'minimum_wage.monthly_cash',
                vars: { required: { euros: 1221 }, paid: { euros: 1150 } },
              },
              {
                key: 'minimum_wage.shortfall',
                vars: { annual: { euros: 852 }, monthly: { euros: 71 } },
              },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          smi_in_kind_cap: {
            status: 'within_limit',
            calculation: [
              {
                key: 'in_kind.share',
                vars: { inKind: { euros: 300 }, total: { euros: 1450 }, share: 20.69, cap: 30 },
              },
              { key: 'in_kind.cash_only' },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'within_limit',
            calculation: [{ key: 'extra_pays.two_or_more', vars: { count: 2 } }],
            basedOnYourAnswer: false,
            agreementMaySetOther: true,
          },
        },
      ],
      [
        'an hourly rate over the minimum',
        { regime: 'hourly_external', hourlyRate: 10 },
        null,
        null,
        {
          smi_hourly_external: {
            status: 'within_limit',
            calculation: [
              {
                key: 'minimum_wage.hourly',
                vars: { year: 2026, minimum: { euros: 9.55 }, paid: { euros: 10 } },
              },
              { key: 'minimum_wage.hourly_includes_everything' },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
        },
      ],
      [
        'an hourly rate below the minimum',
        { regime: 'hourly_external', hourlyRate: 9 },
        null,
        null,
        {
          smi_hourly_external: {
            status: 'below_minimum',
            calculation: [
              {
                key: 'minimum_wage.hourly',
                vars: { year: 2026, minimum: { euros: 9.55 }, paid: { euros: 9 } },
              },
              { key: 'minimum_wage.hourly_includes_everything' },
              { key: 'minimum_wage.hourly_shortfall', vars: { difference: { euros: 0.55 } } },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
        },
      ],
      [
        'an hourly rate of a year with no decree',
        { regime: 'hourly_external', hourlyRate: 9, payYear: 2027 },
        null,
        null,
        {
          smi_hourly_external: {
            status: 'not_published',
            calculation: [
              {
                key: 'minimum_wage.not_published',
                vars: { year: 2027, referenceYear: 2026, reference: { euros: 9.55 } },
              },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
        },
      ],
      [
        'a year with no decree',
        { payYear: 2027 },
        null,
        null,
        {
          smi_monthly: {
            status: 'not_published',
            calculation: [
              {
                key: 'minimum_wage.not_published',
                vars: { year: 2027, referenceYear: 2026, reference: { euros: 1221 } },
              },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'within_limit',
            calculation: [{ key: 'extra_pays.two_or_more', vars: { count: 2 } }],
            basedOnYourAnswer: false,
            agreementMaySetOther: true,
          },
        },
      ],
      [
        'a year before the decrees loaded',
        { payYear: 2022 },
        null,
        null,
        {
          smi_monthly: {
            status: 'not_reviewed_in_this_version',
            calculation: [{ key: 'minimum_wage.not_loaded' }],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'within_limit',
            calculation: [{ key: 'extra_pays.two_or_more', vars: { count: 2 } }],
            basedOnYourAnswer: false,
            agreementMaySetOther: true,
          },
        },
      ],
      [
        'a month over 30 % with extra payments of an unknown amount',
        { monthlyCash: 1300, inKindMonthly: 560, extraPays: apart(2, null) },
        null,
        null,
        {
          smi_monthly: {
            status: 'review_it',
            calculation: [
              MIN,
              { key: 'minimum_wage.extra_pays_unknown', vars: { paid: { euros: 15600 } } },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          smi_in_kind_cap: {
            status: 'review_it',
            calculation: [
              {
                key: 'in_kind.share',
                vars: { inKind: { euros: 560 }, total: { euros: 1860 }, share: 30.11, cap: 30 },
              },
              { key: 'in_kind.cash_only' },
              { key: 'in_kind.extra_pays_unknown' },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'within_limit',
            calculation: [{ key: 'extra_pays.two_or_more', vars: { count: 2 } }],
            basedOnYourAnswer: false,
            agreementMaySetOther: true,
          },
        },
      ],
      [
        'extra payments once a year',
        { extraPays: { ...apart(2, 1500), accrual: 'annual' } },
        null,
        null,
        {
          smi_monthly: {
            status: 'within_limit',
            calculation: [
              MIN,
              {
                key: 'minimum_wage.paid_apart',
                vars: {
                  monthly: { euros: 1500 },
                  extras: { euros: 3000 },
                  annual: { euros: 21000 },
                },
              },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'review_it',
            calculation: [{ key: 'extra_pays.once_a_year' }],
            basedOnYourAnswer: true,
            agreementMaySetOther: true,
          },
        },
      ],
      [
        'pay in kind over 30 % on the month, extra payments prorated',
        {
          monthlyCash: 700,
          inKindMonthly: 400,
          extraPays: { count: 2, amount: null, prorated: true, accrual: 'semiannual' },
        },
        null,
        null,
        {
          smi_monthly: {
            status: 'below_minimum',
            calculation: [
              MIN,
              PAID(700, 0, 8400, false),
              SHORT_MONTH(1424.5, 700),
              SHORTFALL(8694, 724.5),
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          smi_in_kind_cap: {
            status: 'over_legal_limit',
            calculation: [SHARE(400, 1100, 36.36), CASH_ONLY],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'review_it',
            calculation: [{ key: 'extra_pays.prorated' }],
            basedOnYourAnswer: true,
            agreementMaySetOther: true,
          },
        },
      ],
      [
        'pay in kind over 30 % on the month, no extra payments counted',
        { monthlyCash: 1300, inKindMonthly: 560, extraPays: apart(0, null) },
        null,
        null,
        {
          smi_monthly: {
            status: 'below_minimum',
            calculation: [MIN, PAID(1300, 0, 15600, true), SHORTFALL(1494, 124.5)],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          smi_in_kind_cap: {
            status: 'over_legal_limit',
            calculation: [SHARE(560, 1860, 30.11), CASH_ONLY],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'missing_requirement',
            calculation: [{ key: 'extra_pays.fewer_than_two', vars: { count: 0 } }],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
        },
      ],
      [
        'extra payments of an unknown amount, twelve payments exactly the minimum',
        { monthlyCash: 1424.5, extraPays: apart(2, null) },
        null,
        null,
        {
          smi_monthly: {
            status: 'within_limit',
            calculation: [
              MIN,
              { key: 'minimum_wage.twelve_payments_enough', vars: { paid: { euros: 17094 } } },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'within_limit',
            calculation: [{ key: 'extra_pays.two_or_more', vars: { count: 2 } }],
            basedOnYourAnswer: false,
            agreementMaySetOther: true,
          },
        },
      ],
      [
        'pay in kind, the money a fraction of a cent under the monthly minimum',
        { monthlyCash: 1424.4999, inKindMonthly: 100, extraPays: null },
        null,
        null,
        {
          smi_monthly: {
            status: 'within_limit',
            calculation: [MIN, PAID(1424.5, 0, 17094, false)],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          smi_in_kind_cap: {
            status: 'within_limit',
            calculation: [SHARE(100, 1524.5, 6.56), CASH_ONLY],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'not_entered',
            calculation: [],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
        },
      ],
      [
        'pay in kind with no monthly pay',
        { monthlyCash: null, inKindMonthly: 300 },
        null,
        null,
        {
          smi_monthly: {
            status: 'not_entered',
            calculation: [],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'within_limit',
            calculation: [{ key: 'extra_pays.two_or_more', vars: { count: 2 } }],
            basedOnYourAnswer: false,
            agreementMaySetOther: true,
          },
        },
      ],
      [
        'half a week, with pay in kind',
        { weeklyHours: 20, monthlyCash: 600, inKindMonthly: 100, extraPays: null },
        null,
        null,
        {
          smi_monthly: {
            status: 'below_minimum',
            calculation: [
              {
                key: 'minimum_wage.minimum',
                vars: {
                  year: 2026,
                  monthly: { euros: 1221 },
                  annual: { euros: 17094 },
                  hours: 20,
                  coefficient: 0.5,
                  requiredMonthly: { euros: 610.5 },
                  requiredAnnual: { euros: 8547 },
                },
              },
              PAID(600, 0, 7200, false),
              SHORT_MONTH(712.25, 600),
              SHORTFALL(1347, 112.25),
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          smi_in_kind_cap: {
            status: 'within_limit',
            calculation: [SHARE(100, 700, 14.29), CASH_ONLY],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'not_entered',
            calculation: [],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
        },
      ],
      [
        'a relationship that began on the day counted',
        { monthlyCash: 1000, extraPays: null },
        '2026-06-15',
        '2026-06-15',
        {
          smi_monthly: {
            status: 'below_minimum',
            calculation: [
              MIN,
              PAID(1000, 0, 12000, false),
              SHORTFALL(5094, 424.5),
              {
                key: 'minimum_wage.shortfall_accrued',
                vars: { year: 2026, days: 1, accrued: { euros: 13.96 } },
              },
            ],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
          extra_pays: {
            status: 'not_entered',
            calculation: [],
            basedOnYourAnswer: false,
            agreementMaySetOther: false,
          },
        },
      ],
    ],
  )('%s', (_name, change, today, start, expected) => {
    const items = assessMinimumWage(
      household({ startDate: parseDate(start ?? '2020-01-01'), ...change }),
      DEPS,
      parseDate(today ?? '2026-12-31'),
    );
    const shown = Object.fromEntries(
      items.flatMap((a) =>
        a.kind === 'single'
          ? [
              [
                a.finding.id,
                {
                  status: a.finding.status,
                  calculation: a.finding.calculation,
                  basedOnYourAnswer: a.finding.basedOnYourAnswer,
                  agreementMaySetOther: a.finding.agreementMaySetOther,
                },
              ],
            ]
          : [],
      ),
    );
    expect(shown).toEqual(expected);
    expect(items.flatMap((a) => (a.kind === 'single' ? [a.finding.item] : []))).toEqual(
      items.flatMap((a) => (a.kind === 'single' ? ['minimum_wage'] : [])),
    );
  });
});
