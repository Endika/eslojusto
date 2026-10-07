import { between, exact, type Range } from './money';
import { calendarDays, max, ordinal, addDays, addMonthsClamped, type CivilDate } from './date';
import { SOURCES, type Source } from './sources';
import { annualSalary } from './settlement';
import type { FinalPayInput, OtherContracts, ContributionPeriod } from './types';

// 2026 figures. Review every 1 January and whenever new PGE are passed.
export const BENEFIT_2026 = {
  // Ley 31/2022 DA 90.ª (PGE 2023, extended); SEPE «Cuantías anuales».
  monthlyIprem: 600,
  // IPREM × 7/6; art. 270.3 LGSS, last paragraph.
  ipremForCaps: 700,
  // 80 % / 107 % × 700; art. 270.3 LGSS.
  minCap: { 0: 560, 1: 749 },
  // 175 % / 200 % / 225 % × 700; art. 270.3 LGSS.
  maxCap: { 0: 1225, 1: 1400, 2: 1575 },
  // Orden PJC/297/2026, art. 2.2.
  minBaseAtep: 1424.4,
  // Orden PJC/297/2026, art. 2.1; RDL 3/2026, art. 3.
  maxBase: 5101.2,
  // Art. 270.2 LGSS (wording in force since 2023-01-01).
  firstStretchRate: 0.7,
  // Art. 270.2 LGSS (wording in force since 2023-01-01).
  secondStretchRate: 0.6,
  // Art. 270.2 LGSS: «los ciento ochenta primeros días».
  firstStretchDays: 180,
  // 4.70 % common contingencies (Orden PJC/297/2026, art. 4.a) + 0.15 % MEI (art. 16).
  workerContributionRate: 0.0485,
  // Art. 269.1 LGSS, first row of the scale.
  qualifyingDays: 360,
  // Art. 270.1 LGSS: the base of the last 180 days; without them in this contract there is no figure.
  baseDays: 180,
  // [contributed days from, benefit days]; art. 269.1 LGSS.
  scale: [
    [2160, 720],
    [1980, 660],
    [1800, 600],
    [1620, 540],
    [1440, 480],
    [1260, 420],
    [1080, 360],
    [900, 300],
    [720, 240],
    [540, 180],
    [360, 120],
  ],
} as const;

const P = BENEFIT_2026;

// 2 = «2 o más» (two or more); null = no answer.
export type Children = 0 | 1 | 2 | null;

export interface BenefitFigures {
  readonly firstStretch: Range;
  readonly secondStretch: Range;
  readonly contribution: Range;
}

// at_least: only this contract is known. exact: other contracts given and no benefit drawn since.
// up_to: other contracts given and benefit maybe drawn since, so some of those days may be used up.
export type BenefitDuration =
  | { readonly kind: 'at_least'; readonly days: number }
  | { readonly kind: 'exact'; readonly days: number }
  | { readonly kind: 'up_to'; readonly days: number };

export type BenefitEstimate =
  | {
      readonly entitled: 'no';
      readonly sources: readonly Source[];
    }
  | {
      readonly entitled: 'yes';
      readonly qualifying:
        'met_by_this_contract' | 'met_with_other_contracts' | 'depends_on_work_history';
      // This contract alone, inside the 6-year window.
      readonly contractDays: number;
      readonly minimumDurationDays: number;
      // This contract plus the others, overlaps merged, inside the same window.
      readonly contributedDays: number;
      readonly duration: BenefitDuration;
      readonly secondStretch: boolean;
      readonly figures: BenefitFigures | null;
      // Why `figures` is null: under 180 days the base mixes in another job; a salary below the
      // full-time minimum base is almost surely part-time, whose base and caps we cannot know.
      readonly noFigures: NoFiguresReason | null;
      readonly sources: readonly Source[];
    };

export type NoFiguresReason = 'short_contract' | 'base_below_minimum';

// Whether the benefit sheet shows amounts; never the children, the dates or the amounts.
export const BENEFIT_STATES = ['not_applicable', 'with_figures', 'no_figures'] as const;
export type BenefitState = (typeof BENEFIT_STATES)[number];

export const benefitState = (p: BenefitEstimate): BenefitState =>
  p.entitled === 'no' ? 'not_applicable' : p.figures === null ? 'no_figures' : 'with_figures';

// Truncates to cents like the SEPE simulator; the epsilon absorbs float noise such as 1750 × 0.7.
export const trunc2 = (x: number): number => Math.floor(x * 100 + 1e-6) / 100;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

const windowStart = (endDate: CivilDate): CivilDate => addDays(addMonthsClamped(endDate, -72), 1);

export function contractContributedDays(startDate: CivilDate, endDate: CivilDate): number {
  return calendarDays(max(startDate, windowStart(endDate)), endDate);
}

// Union of the periods clipped to the 6-year window ending at `endDate`; a day worked in two jobs counts once.
export function contributedDays(
  endDate: CivilDate,
  periods: readonly ContributionPeriod[],
): number {
  const from = ordinal(windowStart(endDate));
  const to = ordinal(endDate);
  const bounds = periods
    .map((p): [number, number] => [
      Math.max(ordinal(p.startDate), from),
      Math.min(ordinal(p.endDate), to),
    ])
    .filter(([a, b]) => a <= b)
    .sort(([a], [b]) => a - b);
  let total = 0;
  let end = -Infinity;
  for (const [a, b] of bounds) {
    if (b <= end) continue;
    total += b - Math.max(a, end + 1) + 1;
    end = b;
  }
  return total;
}

export function durationForDays(days: number): number {
  return P.scale.find(([from]) => days >= from)?.[1] ?? 0;
}

export function monthlyBase(e: FinalPayInput): number {
  return clamp(trunc2(annualSalary(e) / 12), P.minBaseAtep, P.maxBase);
}

export function amounts(base: number, children: 0 | 1 | 2): { c1: number; c2: number; ss: number } {
  const lo = P.minCap[Math.min(children, 1) as 0 | 1];
  const hi = P.maxCap[children];
  return {
    c1: clamp(trunc2(base * P.firstStretchRate), lo, hi),
    c2: clamp(trunc2(base * P.secondStretchRate), lo, hi),
    ss: trunc2(base * P.workerContributionRate),
  };
}

// Approximate gross total over the minimum duration; secondary data, always «al menos» (at least).
export const approximateTotal = (c1: number, c2: number, duration: number): number =>
  (c1 * Math.min(duration, P.firstStretchDays)) / 30 +
  (c2 * Math.max(duration - P.firstStretchDays, 0)) / 30;

function figures(base: number, children: Children): BenefitFigures {
  if (children !== null) {
    const { c1, c2, ss } = amounts(base, children);
    return { firstStretch: exact(c1), secondStretch: exact(c2), contribution: exact(ss) };
  }
  const a = amounts(base, 0);
  const b = amounts(base, 2);
  return {
    firstStretch: between(a.c1, b.c1),
    secondStretch: between(a.c2, b.c2),
    contribution: exact(a.ss),
  };
}

// `others` absent or with no rows keeps the «al menos» (at least) reading of this contract alone.
export function estimateBenefit(
  e: FinalPayInput,
  children: Children,
  others?: OtherContracts,
): BenefitEstimate {
  if (e.cause === 'resignation') return { entitled: 'no', sources: [SOURCES.lgss267] };

  const d = contractContributedDays(e.startDate, e.endDate);
  const rows = others?.contracts ?? [];
  const total =
    rows.length === 0
      ? d
      : contributedDays(e.endDate, [{ startDate: e.startDate, endDate: e.endDate }, ...rows]);
  const noBenefitSince = rows.length > 0 && others?.benefitDrawnSince === false;
  const duration: BenefitDuration =
    rows.length === 0
      ? { kind: 'at_least', days: durationForDays(d) }
      : noBenefitSince
        ? { kind: 'exact', days: durationForDays(total) }
        : { kind: 'up_to', days: durationForDays(total) };
  const noFigures: NoFiguresReason | null =
    d < P.baseDays
      ? 'short_contract'
      : annualSalary(e) / 12 < P.minBaseAtep
        ? 'base_below_minimum'
        : null;
  return {
    entitled: 'yes',
    qualifying:
      d >= P.qualifyingDays
        ? 'met_by_this_contract'
        : noBenefitSince && total >= P.qualifyingDays
          ? 'met_with_other_contracts'
          : 'depends_on_work_history',
    contractDays: d,
    minimumDurationDays: durationForDays(d),
    contributedDays: total,
    duration,
    secondStretch: duration.days > P.firstStretchDays,
    figures: noFigures === null ? figures(monthlyBase(e), children) : null,
    noFigures,
    sources: [
      SOURCES.lgss267,
      // Art. 268: the disciplinary rule and, for every cause, the 15-day deadline.
      SOURCES.lgss268,
      SOURCES.lgss269,
      SOURCES.lgss270,
      SOURCES.contributionOrder2026,
      SOURCES.sepeAmounts,
    ],
  };
}
