import { between, type Range } from './money';
import { BENEFIT_2026, trunc2, type Children } from './unemployment';

const P = BENEFIT_2026;

// ETOP (art. 47.1–4 ET) follows the general rules; force majeure (art. 47.5 and 47.6 ET) is
// LGSS DA 46.ª; the RED mechanism (art. 47 bis ET) is LGSS DA 41.ª.
export type ErteRegime = 'etop' | 'force_majeure' | 'red';
export const ERTE_REGIMES: readonly ErteRegime[] = ['etop', 'force_majeure', 'red'];

// A suspension is total unemployment (arts. 262.2 and 267.1.b.1.º LGSS); a reduction of working
// time, partial unemployment (arts. 262.3 and 267.1.c), by `percent` of the working time.
export type ErteMeasure =
  { readonly kind: 'suspension' } | { readonly kind: 'reduction'; readonly percent: number };

export interface ErteInput {
  readonly regime: ErteRegime;
  readonly measure: ErteMeasure;
  // Monthly regulatory base: for RED, the average of the AT/EP contribution bases in that company
  // over the 180 days before the measure (DA 41.ª.3), or over the days there are.
  readonly base: number;
  // Only the general caps (art. 270.3) depend on it; RED has none of its own.
  readonly children: Children;
}

export type ContributionRequirement =
  // Art. 269.1 LGSS: 360 days contributed in the last 6 years.
  | { readonly kind: 'minimum'; readonly days: number }
  // Force majeure (DA 46.ª) and RED (DA 41.ª.1) ask for no minimum period.
  | { readonly kind: 'waived' };

export interface ErteConsumption {
  readonly consumes: boolean;
  // How much of one day of entitlement each ERTE day uses: all of it in a suspension, the share
  // of the reduction in a reduction (consumed by hours, art. 269.5 LGSS).
  readonly share: number;
}

export interface ErteEstimate {
  readonly unemployment: 'total' | 'partial';
  readonly firstStretch: Range;
  // Only the general rules pay less after the first 180 days.
  readonly secondStretch: Range | null;
  readonly consumption: ErteConsumption;
  readonly contribution: ContributionRequirement;
  // DA 41.ª.2.c: the RED benefit asks to be registered as a job seeker.
  readonly jobSeekerRegistration: boolean;
}

// 225 % of the IPREM increased by one sixth, per month (DA 41.ª.4).
export const RED_MONTHLY_CAP = trunc2(2.25 * P.ipremForCaps);

const MAX_BASE_INPUT = 1_000_000;

// A reduction of working time runs from 10 to 70 % (arts. 262.3 LGSS and 47.7.a ET).
export const MIN_REDUCTION_PERCENT = 10;
export const MAX_REDUCTION_PERCENT = 70;
export const isReductionPercent = (percent: number): boolean =>
  Number.isFinite(percent) && percent >= MIN_REDUCTION_PERCENT && percent <= MAX_REDUCTION_PERCENT;

export function erteInputError(input: ErteInput): string | null {
  if (!Number.isFinite(input.base) || input.base <= 0 || input.base > MAX_BASE_INPUT) return 'base';
  const m = input.measure;
  if (m.kind === 'reduction' && !isReductionPercent(m.percent)) return 'percent';
  return null;
}

const shareOf = (m: ErteMeasure): number => (m.kind === 'reduction' ? m.percent / 100 : 1);

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

// The limits on one month of benefit: RED has only a maximum; the rest, art. 270.3 by children.
function limited(amount: number, regime: ErteRegime, children: 0 | 1 | 2): number {
  if (regime === 'red') return Math.min(amount, RED_MONTHLY_CAP);
  return clamp(amount, P.minCap[Math.min(children, 1) as 0 | 1], P.maxCap[children]);
}

// The limits are those of a full month: they cut the full-time benefit, and a reduction then takes
// its proportion of that (art. 270.5). Without an answer on children it spans the three.
function monthly(rate: number, input: ErteInput): Range {
  const share = shareOf(input.measure);
  const options: readonly (0 | 1 | 2)[] =
    input.regime === 'red' ? [0] : input.children === null ? [0, 1, 2] : [input.children];
  const full = trunc2(input.base * rate);
  const figures = options.map((children) => trunc2(limited(full, input.regime, children) * share));
  return between(Math.min(...figures), Math.max(...figures));
}

export function consumption({ regime, measure }: Pick<ErteInput, 'regime' | 'measure'>) {
  return regime === 'etop'
    ? { consumes: true, share: shareOf(measure) }
    : { consumes: false, share: 0 };
}

const contributionFor = (regime: ErteRegime): ContributionRequirement =>
  regime === 'etop' ? { kind: 'minimum', days: P.qualifyingDays } : { kind: 'waived' };

export function estimateErte(input: ErteInput): ErteEstimate {
  if (erteInputError(input) !== null) throw new RangeError('Invalid ERTE input');
  return {
    unemployment: input.measure.kind === 'suspension' ? 'total' : 'partial',
    firstStretch: monthly(P.firstStretchRate, input),
    secondStretch: input.regime === 'etop' ? monthly(P.secondStretchRate, input) : null,
    consumption: consumption(input),
    contribution: contributionFor(input.regime),
    jobSeekerRegistration: input.regime === 'red',
  };
}
