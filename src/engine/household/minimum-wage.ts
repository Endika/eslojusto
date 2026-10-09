import type { NormSource } from '../law/sources';
import {
  minimumWageFor,
  type MinimumWageLookup,
  type MinimumWageRow,
  type MinimumWageTable,
} from '../law/minimum-wage';
import { assessAcross } from '../law/readings';
import { exact, round2 } from '../money';
import { phrase, type HouseholdPhrase } from './calculation';
import { findingsFor, single, type FindingMaker, type Verdict } from './finding';
import type { NormTable } from './norms';
import type { HouseholdRuleId } from './rules';
import type { Assessed, Finding, HouseholdInput } from './types';

export interface MinimumWageDeps {
  readonly norms: NormTable;
  readonly minimumWage: MinimumWageTable;
}

// Art. 9: forty hours of effective work make a full week; shorter hours get the minimum in
// proportion, longer ones never more.
const FULL_WEEK = 40;
const MONTHS_IN_YEAR = 12;
// Art. 8.2: board and lodging, thirty per cent of the total salary at most.
const IN_KIND_PERCENT = 30;
const PERCENT = 100;

const euros = (n: number) => ({ euros: round2(n) });
const cents = (n: number): number => Math.round(n * PERCENT);

// The decree's own article, as a source: the amount comes from it and the household rule makes it
// binding.
function decreeSource(row: MinimumWageRow, article: string, norms: NormTable): NormSource {
  const norm = Object.values(norms).find((n) => n.id === row.norm);
  if (norm === undefined)
    throw new RangeError(`The minimum wage of ${row.year} rests on ${row.norm}, not in the norms`);
  return {
    id: norm.id,
    citation: `${norm.citation}, ${article}`,
    url: row.url,
    inForceSince: norm.inForceSince,
    inForceUntil: norm.inForceUntil,
    endUncertainUntil: norm.endUncertainUntil ?? null,
    status: norm.status,
    statusSince: norm.statusSince,
    statusUrl: norm.statusUrl,
  };
}

// A finding that also cites the article of the decree its figure comes from.
const withDecree = (
  finding: Finding,
  row: MinimumWageRow,
  article: string,
  norms: NormTable,
): Finding => ({ ...finding, sources: [...finding.sources, decreeSource(row, article, norms)] });

// The amount of a year is only compared once its decree is loaded: a later year has none yet.
function unavailable(
  id: HouseholdRuleId,
  year: number,
  lookup: Exclude<MinimumWageLookup, { kind: 'published' }>,
  make: FindingMaker,
  norms: NormTable,
): Assessed {
  const verdict: Verdict =
    lookup.kind === 'not_published'
      ? {
          status: 'not_published',
          calculation: [
            phrase('minimum_wage.not_published', {
              year,
              referenceYear: lookup.reference.year,
              reference: euros(
                id === 'smi_hourly_external'
                  ? lookup.reference.householdPerHour
                  : lookup.reference.monthly,
              ),
            }),
          ],
        }
      : {
          status: 'not_reviewed_in_this_version',
          calculation: [phrase('minimum_wage.not_loaded')],
        };
  return single(make(id, verdict, norms));
}

// Art. 8.1 and 8.4: the pay in money, extra payments included, against the minimum wage of the
// year in proportion to the hours. The yearly comparison is the one the decree states.
function monthlyPay(input: HouseholdInput, deps: MinimumWageDeps, make: FindingMaker): Assessed {
  const { norms } = deps;
  const lookup = minimumWageFor(input.payYear, deps.minimumWage);
  if (lookup.kind !== 'published')
    return unavailable('smi_monthly', input.payYear, lookup, make, norms);
  const { row } = lookup;
  const { monthlyCash, weeklyHours, extraPays } = input;
  if (monthlyCash === null || weeklyHours === null)
    return single(make('smi_monthly', { status: 'not_entered' }, norms));

  const coefficient = Math.min(weeklyHours, FULL_WEEK) / FULL_WEEK;
  const requiredAnnual = row.annual * coefficient;
  const apart = extraPays !== null && !extraPays.prorated ? extraPays : null;
  const twelve = monthlyCash * MONTHS_IN_YEAR;
  const done = (verdict: Verdict): Assessed =>
    single(
      withDecree(
        make('smi_monthly', { alsoCites: ['extra_pays'], ...verdict }, norms),
        row,
        'art. 1',
        norms,
      ),
    );
  const minimum = phrase('minimum_wage.minimum', {
    year: input.payYear,
    monthly: euros(row.monthly),
    annual: euros(row.annual),
    hours: weeklyHours,
    coefficient: round2(coefficient),
    requiredMonthly: euros(row.monthly * coefficient),
    requiredAnnual: euros(requiredAnnual),
  });

  // Extra payments apart whose amount is not known cannot be added to the year.
  if (apart !== null && apart.count > 0 && apart.amount === null) {
    const enough = cents(twelve) >= cents(requiredAnnual);
    return done({
      status: enough ? 'within_limit' : 'review_it',
      calculation: [
        minimum,
        phrase(enough ? 'minimum_wage.twelve_payments_enough' : 'minimum_wage.extra_pays_unknown', {
          paid: euros(twelve),
        }),
      ],
    });
  }

  const extras = apart === null ? 0 : apart.count * (apart.amount ?? 0);
  const paidAnnual = twelve + extras;
  const paid: HouseholdPhrase = phrase(
    apart === null ? 'minimum_wage.paid_prorated' : 'minimum_wage.paid_apart',
    { monthly: euros(monthlyCash), extras: euros(extras), annual: euros(paidAnnual) },
  );
  if (cents(paidAnnual) >= cents(requiredAnnual))
    return done({ status: 'within_limit', calculation: [minimum, paid] });
  const shortfall = requiredAnnual - paidAnnual;
  return done({
    status: 'below_minimum',
    amount: exact(shortfall),
    calculation: [
      minimum,
      paid,
      phrase('minimum_wage.shortfall', {
        annual: euros(shortfall),
        monthly: euros(shortfall / MONTHS_IN_YEAR),
      }),
    ],
  });
}

// Art. 8.5: an external worker's hourly price includes every pay concept.
function hourlyPay(input: HouseholdInput, deps: MinimumWageDeps, make: FindingMaker): Assessed {
  const { norms } = deps;
  const lookup = minimumWageFor(input.payYear, deps.minimumWage);
  if (lookup.kind !== 'published')
    return unavailable('smi_hourly_external', input.payYear, lookup, make, norms);
  const { row } = lookup;
  const rate = input.hourlyRate;
  if (rate === null) return single(make('smi_hourly_external', { status: 'not_entered' }, norms));
  const minimum = row.householdPerHour;
  const below = cents(rate) < cents(minimum);
  const calculation: HouseholdPhrase[] = [
    phrase('minimum_wage.hourly', {
      year: input.payYear,
      minimum: euros(minimum),
      paid: euros(rate),
    }),
    phrase('minimum_wage.hourly_includes_everything'),
    ...(below
      ? [phrase('minimum_wage.hourly_shortfall', { difference: euros(minimum - rate) })]
      : []),
  ];
  return single(
    withDecree(
      make(
        'smi_hourly_external',
        { status: below ? 'below_minimum' : 'within_limit', calculation },
        norms,
      ),
      row,
      'art. 4.2',
      norms,
    ),
  );
}

// Art. 8.2: the share of the total salary paid in kind, never over thirty per cent. The article
// says «salario total» without saying a month's or a year's, so the share is read on the month
// without the extra payments paid apart and on the year with them; it is over the limit only when
// it is in both.
function inKind(input: HouseholdInput, norms: NormTable, make: FindingMaker): Assessed | null {
  const kind = input.inKindMonthly;
  const cash = input.monthlyCash;
  if (kind === null || kind <= 0 || cash === null) return null;
  const { extraPays } = input;
  const apart = extraPays !== null && !extraPays.prorated && extraPays.count > 0 ? extraPays : null;
  const verdictOf = (
    key: 'in_kind.share' | 'in_kind.share_annual',
    inKind: number,
    total: number,
  ): Verdict => ({
    status:
      cents(inKind) * PERCENT > cents(total) * IN_KIND_PERCENT
        ? 'over_legal_limit'
        : 'within_limit',
    calculation: [
      phrase(key, {
        inKind: euros(inKind),
        total: euros(total),
        share: round2((inKind / total) * PERCENT),
        cap: IN_KIND_PERCENT,
      }),
      phrase('in_kind.cash_only'),
    ],
  });
  const month = verdictOf('in_kind.share', kind, cash + kind);
  if (apart === null) return single(make('smi_in_kind_cap', month, norms));
  if (apart.amount === null)
    return single(
      make(
        'smi_in_kind_cap',
        month.status === 'over_legal_limit'
          ? {
              status: 'review_it',
              calculation: [...(month.calculation ?? []), phrase('in_kind.extra_pays_unknown')],
            }
          : month,
        norms,
      ),
    );
  const year = verdictOf(
    'in_kind.share_annual',
    kind * MONTHS_IN_YEAR,
    (cash + kind) * MONTHS_IN_YEAR + apart.count * apart.amount,
  );
  // The same answer on both bases: one finding that shows both shares.
  if (month.status === year.status)
    return single(
      make(
        'smi_in_kind_cap',
        {
          status: month.status,
          calculation: [...(month.calculation ?? []).slice(0, 1), ...(year.calculation ?? [])],
        },
        norms,
      ),
    );
  return assessAcross(
    'in_kind_base',
    ['month_without_extra_pays', 'year_with_extra_pays'],
    (world) => make('smi_in_kind_cap', world === 'month_without_extra_pays' ? month : year, norms),
  );
}

// Art. 8.4: two extra payments a year.
function extraPayments(
  input: HouseholdInput,
  norms: NormTable,
  make: FindingMaker,
): Assessed | null {
  if (input.regime !== 'monthly') return null;
  const e = input.extraPays;
  const done = (verdict: Verdict) => single(make('extra_pays', verdict, norms));
  if (e === null) return done({ status: 'not_entered' });
  if (e.prorated)
    return done({
      status: 'review_it',
      calculation: [phrase('extra_pays.prorated')],
      basedOnYourAnswer: true,
      agreementMaySetOther: true,
    });
  if (e.count < 2)
    return done({
      status: 'missing_requirement',
      calculation: [phrase('extra_pays.fewer_than_two', { count: e.count })],
    });
  if (e.accrual === 'annual')
    return done({
      status: 'review_it',
      calculation: [phrase('extra_pays.once_a_year')],
      basedOnYourAnswer: true,
      agreementMaySetOther: true,
    });
  return done({
    status: 'within_limit',
    calculation: [phrase('extra_pays.two_or_more', { count: e.count })],
    agreementMaySetOther: true,
  });
}

// The pay of the contract: the minimum wage, the pay in kind and the extra payments.
export function assessMinimumWage(
  input: HouseholdInput,
  deps: MinimumWageDeps,
): readonly Assessed[] {
  const make = findingsFor('minimum_wage');
  const { norms } = deps;
  if (input.regime === 'hourly_external') return [hourlyPay(input, deps, make)];
  return [
    monthlyPay(input, deps, make),
    inKind(input, norms, make),
    extraPayments(input, norms, make),
  ].filter((a): a is Assessed => a !== null);
}
