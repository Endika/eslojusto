import type { CivilDate } from '../date';
import type { LawSource } from '../law/sources';
import { round2 } from '../money';
import { creditPhrase, type CreditCalculation } from './calculation';
import type { CreditSourceId, SourceTable } from './norms';
import { rateFor, type DataSeries } from './rates';
import type { CreditInput } from './types';

// The Bank of Spain series the indicator reads: 4.7 for revolving cards, 4.9, 4.10 and 4.11 for
// consumer loans whose rate is first fixed for up to one year, from one to five years and over five
// years.
export type IndicatorSeriesId = 'BE_19_4.7' | 'BE_19_4.9' | 'BE_19_4.10' | 'BE_19_4.11';

export type RateTable = Readonly<Record<IndicatorSeriesId, DataSeries>>;

// Where the APR stands against the average rate of its month. `above`, `edge` and `below` follow
// the revolving criterion; a loan gets only the `distance` in points while the loan criterion has
// not been read in its text. Never a verdict, never an amount.
export type IndicatorStatus =
  'above' | 'edge' | 'below' | 'distance_only' | 'not_published' | 'no_data' | 'not_entered';

export type IndicatorReference =
  | {
      readonly kind: 'series';
      readonly series: IndicatorSeriesId;
      readonly month: string;
      readonly value: number;
    }
  // Before the revolving series starts (June 2010), the 19,32 % STS 258/2023 takes for 2010.
  | { readonly kind: 'ruling_2010'; readonly value: number };

export interface Indicator {
  readonly status: IndicatorStatus;
  // The APR compared, in %, and where it comes from.
  readonly apr: number | null;
  readonly aprOrigin: 'recalculated' | 'declared' | null;
  readonly reference: IndicatorReference | null;
  // APR less the reference, in percentage points, to two decimals.
  readonly points: number | null;
  readonly calculation: CreditCalculation;
  readonly sources: readonly LawSource[];
}

export interface IndicatorDeps {
  readonly sources: SourceTable;
  readonly rates: RateTable;
}

export interface ComparedApr {
  readonly value: number;
  readonly origin: 'recalculated' | 'declared';
}

const REVOLVING_SERIES_FROM = '2010-06';
const RULING_2010_RATE = 19.32;
// STS 258/2023: «superior a 6 puntos porcentuales». The series is a rate without charges (TEDR)
// and the court adjusts it by some 0,20 to 0,30 points, so up to 6,30 the result is on the edge.
const THRESHOLD = 6;
const EDGE_TOP = 6.3;
const ONE_YEAR = 12;
const FIVE_YEARS = 60;

const monthOf = (date: CivilDate): string => `${date.y}-${String(date.m).padStart(2, '0')}`;

// The BdE breaks consumer loans down by the initial period the rate is fixed for, not by the term:
// «Los plazos van referidos al período inicial de fijación del tipo. Por ejemplo, un préstamo a 15
// años a tipo variable revisable anualmente se clasifica en el plazo 'hasta un año'» (note to table
// 19.4). A fixed rate is fixed for the whole term. A variable one is taken as revised within the
// year, as in the note's example: the input does not say when it is first revised.
export function loanSeries(termMonths: number, rateType: 'fixed' | 'variable'): IndicatorSeriesId {
  if (rateType === 'variable' || termMonths <= ONE_YEAR) return 'BE_19_4.9';
  if (termMonths <= FIVE_YEARS) return 'BE_19_4.10';
  return 'BE_19_4.11';
}

export function band(points: number): 'above' | 'edge' | 'below' {
  if (points > EDGE_TOP) return 'above';
  if (points > THRESHOLD) return 'edge';
  return 'below';
}

// The APR to compare: the one worked out from the contract when the person takes it, otherwise
// the one the contract states.
export function comparedApr(
  input: Pick<CreditInput, 'confirmedApr' | 'declaredApr'>,
  recalculated: number | null,
): ComparedApr | null {
  if (input.confirmedApr && recalculated !== null)
    return { value: recalculated, origin: 'recalculated' };
  if (input.declaredApr !== null) return { value: input.declaredApr, origin: 'declared' };
  return null;
}

const CLOSING: CreditCalculation = [
  creditPhrase('indicator.judge'),
  creditPhrase('indicator.channels'),
];

// Item 2: the APR against the BdE average of the contract's month and category. A month the
// series does not hold yet is «not published», never the month before.
export function averageRateIndicator(
  input: Pick<CreditInput, 'product' | 'agreedOn' | 'rateType'>,
  termMonths: number | null,
  apr: ComparedApr | null,
  deps: IndicatorDeps,
): Indicator {
  const revolving = input.product === 'revolving';
  const month = monthOf(input.agreedOn);
  const criterion: CreditSourceId = revolving ? 'sts258_2023' : 'sts366_2026';
  const beforeSeries = revolving && month < REVOLVING_SERIES_FROM;
  const sourceIds: readonly CreditSourceId[] = beforeSeries
    ? [criterion]
    : [criterion, 'bde_be1904'];
  const sources = sourceIds.map((id) => deps.sources[id]);
  const result = (
    status: IndicatorStatus,
    calculation: CreditCalculation,
    reference: IndicatorReference | null = null,
    points: number | null = null,
  ): Indicator => ({
    status,
    apr: apr === null ? null : round2(apr.value),
    aprOrigin: apr?.origin ?? null,
    reference,
    points,
    calculation: [...calculation, ...CLOSING],
    sources,
  });

  if (apr === null) return result('not_entered', [creditPhrase('indicator.not_entered')]);
  const variable = !revolving && input.rateType === 'variable';
  const series: IndicatorSeriesId | null = revolving
    ? 'BE_19_4.7'
    : variable
      ? loanSeries(0, 'variable')
      : termMonths === null
        ? null
        : loanSeries(termMonths, 'fixed');
  if (series === null) return result('not_entered', [creditPhrase('indicator.term_unknown')]);

  let reference: IndicatorReference;
  if (beforeSeries) reference = { kind: 'ruling_2010', value: RULING_2010_RATE };
  else {
    const rate = rateFor(deps.rates[series], month);
    if (rate.kind === 'not_published')
      return result('not_published', [
        creditPhrase('indicator.not_published', { month: { month } }),
      ]);
    if (rate.kind === 'no_data')
      return result('no_data', [creditPhrase('indicator.no_data', { month: { month } })]);
    reference = { kind: 'series', series, month, value: rate.value };
  }

  const shown = round2(apr.value);
  const points = round2(shown - reference.value);
  const compared = creditPhrase(
    apr.origin === 'recalculated' ? 'indicator.apr_recalculated' : 'indicator.apr_declared',
    { apr: { percent: shown } },
  );
  const against =
    reference.kind === 'series'
      ? creditPhrase(revolving ? 'indicator.reference_revolving' : 'indicator.reference_loan', {
          month: { month },
          rate: { percent: reference.value },
          ...(revolving || variable || termMonths === null
            ? {}
            : { term: { integer: termMonths } }),
        })
      : creditPhrase('indicator.reference_2010', { rate: { percent: reference.value } });
  const fixation = variable ? [creditPhrase('indicator.variable_rate_series')] : [];
  const criterionRead = deps.sources[criterion].verified;
  if (!criterionRead)
    return result(
      'distance_only',
      [
        compared,
        against,
        ...fixation,
        creditPhrase('indicator.distance', { points: { points } }),
        creditPhrase('indicator.loan_criterion_unread'),
      ],
      reference,
      points,
    );
  const status = band(points);
  return result(
    status,
    [
      compared,
      against,
      ...fixation,
      creditPhrase(`indicator.${status}`, { points: { points } }),
      ...(revolving ? [creditPhrase('indicator.revolving_criterion')] : []),
      ...(status === 'edge' ? [creditPhrase('indicator.edge_reason')] : []),
    ],
    reference,
    points,
  );
}

export type CardPayoff =
  | { readonly kind: 'never'; readonly monthlyInterest: number }
  | {
      readonly kind: 'pays_off';
      readonly months: number;
      readonly interest: number;
      readonly totalPaid: number;
    };

const PERCENT_A_MONTH = 1_200;

// How long a card balance takes to clear with a fixed monthly payment and no new purchases, and
// the interest it costs. A payment that does not cover the month's interest never clears it.
export function cardPayoff(balance: number, nominalRate: number, payment: number): CardPayoff {
  const i = nominalRate / PERCENT_A_MONTH;
  const monthlyInterest = balance * i;
  if (payment <= monthlyInterest)
    return { kind: 'never', monthlyInterest: round2(monthlyInterest) };
  const exactMonths =
    i === 0 ? balance / payment : -Math.log(1 - monthlyInterest / payment) / Math.log(1 + i);
  const months = Math.ceil(exactMonths - 1e-9);
  // What is left after all but the last payment, which clears it with that month's interest.
  const growth = (1 + i) ** (months - 1);
  const leftBeforeLast =
    i === 0 ? balance - payment * (months - 1) : balance * growth - (payment * (growth - 1)) / i;
  const totalPaid = payment * (months - 1) + leftBeforeLast * (1 + i);
  return {
    kind: 'pays_off',
    months,
    interest: round2(totalPaid - balance),
    totalPaid: round2(totalPaid),
  };
}
