import { compareDates, toIso, type CivilDate } from '../date';
import { anniversaryIn } from './anniversary';
import { round2 } from '../money';
import { rentalPhrase, type RentalPhrase } from './calculation';
import { referenceMonth, type IndexId, type ReferenceMonth } from './indices';
import type { NormTable } from './norms';
import {
  outcomeFrom,
  uniqueById,
  worldsFor,
  type Doubt,
  type DoubtReason,
  type Measure,
  type Outcome,
  type World,
} from './outcome';
import { doubtNorm, normDoubtId, ruleHolds } from './rule-worlds';
import { activeRules, ruleSource, type ActiveRule, type RentalSource, type RuleId } from './rules';
import type { RentalDeps, RentalInput, RentUpdateInput } from './types';

export type RentUpdateUnchecked =
  | 'agreed_in_writing'
  | 'other_clause_within_cap'
  | 'index_not_loaded'
  | 'index_publication_unknown'
  | 'index_none_published'
  | 'flash_not_loaded'
  | 'too_many_readings';

export interface IndexFigure {
  readonly index: IndexId;
  readonly month: string;
  readonly rate: number;
  readonly publishedOn: string;
  // The CPI flash estimate rather than the definitive figure.
  readonly flash: boolean;
  // The published IGC rate when Ley 2/2015 brought it into [0, 2] %; null otherwise.
  readonly clampedFrom: number | null;
}

export type RateFigure =
  | { readonly kind: 'index'; readonly figure: IndexFigure }
  | { readonly kind: 'fixed'; readonly rate: number };

export interface RentUpdateReading {
  readonly status: 'paid_over' | 'within_limit' | 'not_checkable';
  readonly unchecked: RentUpdateUnchecked | null;
  readonly base: number;
  readonly agreed: RateFigure | null;
  // The lowest legal cap that applied, with its rule.
  readonly cap: { readonly rule: RuleId; readonly rate: RateFigure } | null;
  // The highest rent the update allows; with an `other` clause, only its upper bound.
  readonly maxRent: number | null;
  // Paid over each month once the new rent was due.
  readonly monthly: number;
  readonly accumulated: number;
  readonly months: number;
  // Months charged at the new rent before it was due: before the anniversary month or before the
  // month after written notice (LAU art. 18).
  readonly monthsBeforeDue: number;
  readonly calculation: readonly RentalPhrase[];
  readonly rules: readonly RuleId[];
}

export interface RentUpdateResult {
  // Position of the update in the input.
  readonly index: number;
  readonly anniversary: CivilDate;
  readonly effectiveOn: CivilDate;
  readonly outcome: Outcome<RentUpdateReading>;
  readonly sources: readonly RentalSource[];
  // The contract shows a company as landlord while the person does not know if it is a large one.
  readonly companyLandlordHint: boolean;
}

// The caps that apply only without a new agreement, and which of them bind a large landlord
// even with one. The days each covers come from RULES.
type ExtraCap = { readonly rate: IndexId | number; readonly largeLandlord: boolean };
const EXTRA_CAPS: Partial<Record<RuleId, ExtraCap>> = {
  cap_igc_2022: { rate: 'igc', largeLandlord: true },
  cap_igc_2022_extended: { rate: 'igc', largeLandlord: true },
  cap_igc_2023: { rate: 'igc', largeLandlord: true },
  cap_3_2024: { rate: 3, largeLandlord: true },
  cap_2_rdl8: { rate: 2, largeLandlord: true },
  cap_2_rdl26: { rate: 2, largeLandlord: false },
  cap_2_rdl29: { rate: 2, largeLandlord: false },
};

const UPDATE_RULES = new Set<RuleId>([
  'update_clause',
  'update_clause_rdl26',
  'update_clause_rdl29',
  'cap_ipc',
  'cap_irav',
  'irav_all_contracts_rdl26',
  'irav_all_contracts',
  ...(Object.keys(EXTRA_CAPS) as RuleId[]),
]);

const IGC_CEILING = 2;

const WRITTEN = new Set(['letter', 'burofax', 'receipt_note', 'annex']);
const ELECTRONIC = new Set(['email', 'messaging']);
// Below a cent a month the difference is rounding (no norm fixes how to round the updated rent).
const TOLERANCE = 0.01;
// LAU art. 17.2: unless agreed otherwise, rent is paid within the first seven days of the month.
const PAYMENT_DAY = 7;

const monthIndex = (d: CivilDate): number => d.y * 12 + d.m - 1;
const monthIso = (i: number): string =>
  `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

const LARGE_LANDLORD = 'large_landlord';

// Everything about one update that does not depend on the reading.
interface Frame {
  readonly index: number;
  readonly update: RentUpdateInput;
  readonly day: string;
  // A second rise in the same contract year allows nothing.
  readonly rise: 'valid' | 'second';
  readonly active: ReadonlyMap<RuleId, ActiveRule>;
  readonly refs: ReadonlyMap<IndexId, ReferenceMonth>;
  readonly doubts: readonly Doubt[];
  readonly ids: { readonly agreement: string; readonly notice: string };
  readonly firstYear: boolean;
  readonly endMonth: number;
}

const indexDoubtId = (index: IndexId, day: string) => `index:${index}:${day}`;

function frameOf(
  input: RentalInput,
  sorted: readonly { readonly index: number; readonly update: RentUpdateInput }[],
  k: number,
  today: CivilDate,
  { norms, indices }: RentalDeps,
): Frame {
  const entry = sorted[k];
  if (entry === undefined) throw new RangeError(`No update ${k}`);
  const { index, update } = entry;
  const start = input.startDate;
  const day = toIso(update.anniversary);
  const previousEntry = sorted[k - 1]?.update;
  const rise =
    previousEntry && compareDates(previousEntry.anniversary, update.anniversary) === 0
      ? 'second'
      : 'valid';
  const ids = { agreement: `agreement:${day}`, notice: `notice:${day}` };
  const firstYear = update.anniversary.y === start.y + 1;

  // Months charged at this rent: up to the next anniversary or the next update, while the
  // contract lasts, and only those already due.
  const next = sorted[k + 1]?.update;
  const due = monthIndex(today) - (today.d > PAYMENT_DAY ? 0 : 1);
  const nextAnniversary = anniversaryIn(start, update.anniversary.y + 1);
  let endMonth = Math.min(monthIndex(nextAnniversary) - 1, due);
  if (next && monthIndex(next.chargedFrom) > monthIndex(update.chargedFrom))
    endMonth = Math.min(endMonth, monthIndex(next.chargedFrom) - 1);
  if (input.moveOut) endMonth = Math.min(endMonth, monthIndex(input.moveOut.keysReturnedOn) - 1);

  const active = new Map<RuleId, ActiveRule>();
  const refs = new Map<IndexId, ReferenceMonth>();
  const doubts: Doubt[] = [];
  const checked = rise === 'valid' && input.updateClause !== 'none';
  if (checked) {
    for (const a of activeRules(update.anniversary, norms)) {
      if (!UPDATE_RULES.has(a.rule.id)) continue;
      active.set(a.rule.id, a);
      const norm = doubtNorm(a, day, norms);
      if (norm !== null && a.doubt !== null)
        doubts.push({ id: normDoubtId(norm), reason: a.doubt });
    }
    const needed = new Set<IndexId>();
    const clause = input.updateClause;
    if (clause === 'ipc' || clause === 'irav' || clause === 'igc') needed.add(clause);
    if (clause === 'unspecified_index') {
      if (active.has('update_clause')) needed.add('igc');
      if (active.has('update_clause_rdl26') || active.has('update_clause_rdl29'))
        needed.add('irav');
    }
    const signedAfterLaw12 = toIso(input.signedOn) >= norms.law12_2023.inForceSince;
    const iravForAll = active.has('irav_all_contracts') || active.has('irav_all_contracts_rdl26');
    if (active.has('cap_irav') && (signedAfterLaw12 || iravForAll)) needed.add('irav');
    if (active.has('cap_ipc')) needed.add('ipc');
    for (const id of active.keys()) if (EXTRA_CAPS[id]?.rate === 'igc') needed.add('igc');
    for (const id of needed) {
      const ref = referenceMonth(indices[id], update.anniversary);
      refs.set(id, ref);
      if (ref.kind === 'same_day' || ref.kind === 'flash_window')
        doubts.push({ id: indexDoubtId(id, day), reason: 'index_month_doubtful' });
    }
    const largeLandlordCap = [...active.keys()].some((id) => EXTRA_CAPS[id]?.largeLandlord);
    if (input.largeLandlord === null && update.agreedInWriting !== false && largeLandlordCap)
      doubts.push({ id: LARGE_LANDLORD, reason: 'large_landlord_unknown' });
    if (update.agreedInWriting === null)
      doubts.push({ id: ids.agreement, reason: 'agreement_unknown' });
    if (ELECTRONIC.has(update.notice))
      doubts.push({ id: ids.notice, reason: 'notice_form_doubtful' });
  }
  return { index, update, day, rise, active, refs, doubts, ids, firstYear, endMonth };
}

type Looked =
  | { readonly ok: true; readonly figure: IndexFigure }
  | { readonly ok: false; readonly unchecked: RentUpdateUnchecked };

function lookUp(
  index: IndexId,
  ref: ReferenceMonth | undefined,
  world: World,
  day: string,
): Looked {
  const latest = world[indexDoubtId(index, day)] === true;
  const fig = (month: string, rate: number, publishedOn: string, flash: boolean): Looked => {
    // Ley 2/2015, annex: a negative IGC counts as 0 and anything above 2 % as 2 %.
    const used = index === 'igc' ? Math.min(Math.max(rate, 0), IGC_CEILING) : rate;
    return {
      ok: true,
      figure: {
        index,
        month,
        rate: used,
        publishedOn,
        flash,
        clampedFrom: used === rate ? null : rate,
      },
    };
  };
  const definitive = (v: { month: string; rate: number; publishedOn: string | null }) =>
    v.publishedOn === null
      ? ({ ok: false, unchecked: 'index_publication_unknown' } as const)
      : fig(v.month, v.rate, v.publishedOn, false);
  switch (ref?.kind) {
    case 'ok':
      return definitive(ref.value);
    case 'same_day': {
      if (latest) return definitive(ref.value);
      const { earlier } = ref;
      if (earlier === null) return { ok: false, unchecked: 'index_none_published' };
      if (earlier.source === 'flash') {
        const { month, rate, publishedOn } = earlier.flash;
        return fig(month, rate, publishedOn, true);
      }
      return definitive(earlier.value);
    }
    case 'flash_window': {
      if (!latest) return definitive(ref.definitive);
      const { month, rate, publishedOn } = ref.flash;
      return fig(month, rate, publishedOn, true);
    }
    case 'flash_not_loaded':
      return { ok: false, unchecked: 'flash_not_loaded' };
    case 'none_published':
      return { ok: false, unchecked: 'index_none_published' };
    case 'publication_unknown':
      return { ok: false, unchecked: 'index_publication_unknown' };
    case 'not_loaded':
    case undefined:
      return { ok: false, unchecked: 'index_not_loaded' };
  }
}

const rateOf = (r: RateFigure): number => (r.kind === 'fixed' ? r.rate : r.figure.rate);
const ratePhrase = (r: RateFigure): RentalPhrase =>
  r.kind === 'fixed'
    ? rentalPhrase('rent_update.figure.fixed', { rate: { percent: r.rate } })
    : rentalPhrase(r.figure.flash ? 'rent_update.figure.flash' : 'rent_update.figure.index', {
        index: { index: r.figure.index },
        month: { month: r.figure.month },
        rate: { percent: r.figure.rate },
        published: { date: r.figure.publishedOn },
      });

const UNCHECKED_PHRASE: Record<RentUpdateUnchecked, RentalPhrase['key']> = {
  agreed_in_writing: 'rent_update.agreed_in_writing',
  other_clause_within_cap: 'rent_update.other_clause_within_cap',
  index_not_loaded: 'rent_update.index_not_loaded',
  index_publication_unknown: 'rent_update.index_publication_unknown',
  index_none_published: 'rent_update.index_none_published',
  flash_not_loaded: 'rent_update.flash_not_loaded',
  too_many_readings: 'rent_update.too_many_readings',
};

interface Base {
  readonly rent: number;
  readonly from: 'initial' | 'previous_max' | 'answer';
}

const BASE_PHRASE = {
  initial: 'rent_update.base_initial',
  previous_max: 'rent_update.base_previous_max',
  answer: 'rent_update.base_from_answer',
} as const;

// The rent the update allows in one reading, and the rules behind it.
interface Allowed {
  readonly maxRent: number;
  // The rent from which the next anniversary updates; null when only an upper bound is known.
  readonly carried: number | null;
  readonly agreed: RateFigure | null;
  readonly cap: { readonly rule: RuleId; readonly rate: RateFigure } | null;
  readonly phrases: readonly RentalPhrase[];
  readonly rules: readonly RuleId[];
  // An `other` clause: within the cap the agreed index decides, and it is unknown.
  readonly upperBoundOnly: boolean;
}

type Allowance =
  | { readonly ok: true; readonly allowed: Allowed }
  | {
      readonly ok: false;
      readonly unchecked: RentUpdateUnchecked;
      readonly rules: readonly RuleId[];
    };

function allowance(
  input: RentalInput,
  frame: Frame,
  base: number,
  world: World,
  norms: NormTable,
): Allowance {
  const { update, day, active, refs } = frame;
  const unchanged = (phrase: RentalPhrase, rules: readonly RuleId[]): Allowance => ({
    ok: true,
    allowed: {
      maxRent: base,
      carried: base,
      agreed: null,
      cap: null,
      phrases: [phrase],
      rules,
      upperBoundOnly: false,
    },
  });
  // LAU art. 18.1: the rent is updated once a year, from the anniversary, and only as agreed.
  const when = { anniversary: { date: day }, date: { date: toIso(update.effectiveOn) } };
  if (frame.rise === 'second')
    return unchanged(rentalPhrase('rent_update.second_rise', when), ['update_clause']);
  if (input.updateClause === 'none')
    return unchanged(rentalPhrase('rent_update.no_clause'), ['update_clause']);

  const holds = (id: RuleId): boolean => ruleHolds(active, id, world, day, norms);
  const rules: RuleId[] = [];
  const look = (index: IndexId) => {
    if (index === 'igc') rules.push('igc_clamp');
    return lookUp(index, refs.get(index), world, day);
  };
  const rate = (r: IndexId | number): Looked | { ok: true; fixed: number } =>
    typeof r === 'number' ? { ok: true, fixed: r } : look(r);
  const toFigure = (
    l: { ok: true; figure: IndexFigure } | { ok: true; fixed: number },
  ): RateFigure =>
    'fixed' in l ? { kind: 'fixed', rate: l.fixed } : { kind: 'index', figure: l.figure };

  const agreedInWriting = update.agreedInWriting ?? world[frame.ids.agreement] === true;
  const largeLandlord = input.largeLandlord ?? world[LARGE_LANDLORD] === true;
  const extra = [...active.keys()].filter((id) => EXTRA_CAPS[id] !== undefined && holds(id));

  // The caps that bind: with a new agreement, only those that bind a large landlord anyway.
  const caps: { rule: RuleId; rate: IndexId | number }[] = [];
  let agreed: RateFigure | null = null;
  const phrases: RentalPhrase[] = [];
  if (agreedInWriting) {
    const binding = largeLandlord ? extra.filter((id) => EXTRA_CAPS[id]?.largeLandlord) : [];
    if (binding.length === 0)
      return { ok: false, unchecked: 'agreed_in_writing', rules: ['update_clause'] };
    for (const id of binding) caps.push({ rule: id, rate: EXTRA_CAPS[id]?.rate ?? 0 });
    phrases.push(rentalPhrase('rent_update.agreed_in_writing'));
    phrases.push(rentalPhrase('rent_update.large_landlord_cap'));
  } else {
    const clause = input.updateClause;
    // The RDL 26 and 29/2026 wording of art. 18.1: the IRAV for a clause naming no index and as
    // the cap, in place of the IGC and the CPI.
    const rewording = (['update_clause_rdl29', 'update_clause_rdl26'] as const).find(holds);
    if (clause === 'unspecified_index') {
      rules.push(rewording ?? 'update_clause');
      const r = look(rewording ? 'irav' : 'igc');
      if (!r.ok) return { ok: false, unchecked: r.unchecked, rules };
      agreed = toFigure(r);
    } else {
      rules.push('update_clause');
      if (clause === 'fixed_percent') agreed = { kind: 'fixed', rate: input.fixedPercent ?? 0 };
      else if (clause !== 'other') {
        const r = look(clause);
        if (!r.ok) return { ok: false, unchecked: r.unchecked, rules };
        agreed = toFigure(r);
      }
    }
    const signedAfterLaw12 = toIso(input.signedOn) >= norms.law12_2023.inForceSince;
    const iravForAll = (['irav_all_contracts', 'irav_all_contracts_rdl26'] as const).find(holds);
    // LAU DA 11.ª: the IRAV caps contracts signed from 26-05-2023, and every contract where the
    // RDL 26 or 29/2026 wording of DT 4.ª holds. Art. 18.1 keeps the CPI cap «en todo caso»
    // until reworded, so the lower of both binds.
    if (holds('cap_irav') && (signedAfterLaw12 || iravForAll)) {
      caps.push({ rule: 'cap_irav', rate: 'irav' });
      if (!signedAfterLaw12 && iravForAll) rules.push(iravForAll);
    }
    if (holds('cap_ipc') && !rewording) caps.push({ rule: 'cap_ipc', rate: 'ipc' });
    for (const id of extra) caps.push({ rule: id, rate: EXTRA_CAPS[id]?.rate ?? 0 });
  }

  let cap: { rule: RuleId; rate: RateFigure } | null = null;
  for (const c of caps) {
    const r = rate(c.rate);
    rules.push(c.rule);
    if (!r.ok) return { ok: false, unchecked: r.unchecked, rules };
    const figure = toFigure(r);
    if (cap === null || rateOf(figure) < rateOf(cap.rate)) cap = { rule: c.rule, rate: figure };
  }
  if (agreed !== null)
    phrases.push(rentalPhrase('rent_update.agreed', { rate: ratePhrase(agreed) }));
  else if (!agreedInWriting) phrases.push(rentalPhrase('rent_update.agreed_other'));
  if (cap !== null) phrases.push(rentalPhrase('rent_update.cap', { rate: ratePhrase(cap.rate) }));

  const candidates = [agreed, cap?.rate ?? null].filter((r): r is RateFigure => r !== null);
  if (candidates.length === 0) return { ok: false, unchecked: 'other_clause_within_cap', rules };
  const applied = Math.min(...candidates.map(rateOf));
  // A negative variation allows no rise; whether it should lower the rent is not checked.
  const effective = Math.max(0, applied);
  if (applied < 0)
    phrases.push(rentalPhrase('rent_update.negative_rate', { rate: { percent: applied } }));
  const maxRent = round2(base * (1 + effective / 100));
  phrases.push(
    rentalPhrase('rent_update.max_rent', {
      base: { euros: base },
      rate: { percent: effective },
      max: { euros: maxRent },
    }),
  );
  // With an agreement or an `other` clause the rate is only a ceiling: what was charged within
  // it is the rent that carries on.
  const upperBoundOnly = agreed === null;
  return {
    ok: true,
    allowed: {
      maxRent,
      carried: upperBoundOnly
        ? agreedInWriting
          ? Math.min(update.newRent, maxRent)
          : null
        : maxRent,
      agreed,
      cap,
      phrases,
      rules,
      upperBoundOnly: upperBoundOnly && !agreedInWriting,
    },
  };
}

interface Step {
  readonly reading: RentUpdateReading;
  readonly carried: number | null;
}

function readUpdate(
  input: RentalInput,
  frame: Frame,
  base: Base,
  world: World,
  norms: NormTable,
): Step {
  const { update } = frame;
  const basePhrase = rentalPhrase(BASE_PHRASE[base.from], { rent: { euros: base.rent } });
  const a = allowance(input, frame, base.rent, world, norms);
  const empty = {
    base: base.rent,
    monthly: 0,
    accumulated: 0,
    months: 0,
    monthsBeforeDue: 0,
  };
  if (!a.ok)
    return {
      reading: {
        ...empty,
        status: 'not_checkable',
        unchecked: a.unchecked,
        agreed: null,
        cap: null,
        maxRent: null,
        calculation: [basePhrase, rentalPhrase(UNCHECKED_PHRASE[a.unchecked])],
        rules: a.rules,
      },
      carried: null,
    };
  const { allowed } = a;

  // LAU art. 18.1 and 18.2: the updated rent is due from the anniversary and the month after
  // written notice; until then each month charged above the base is paid over in full. A rise
  // applied early is still that anniversary's update: only the months before the anniversary
  // month are paid over (rent is checked by the month, so the anniversary month counts whole).
  const annMonth = monthIndex(update.anniversary);
  const effectiveMonth = Math.max(monthIndex(update.effectiveOn), annMonth);
  const written =
    WRITTEN.has(update.notice) ||
    (ELECTRONIC.has(update.notice) && world[frame.ids.notice] === true);
  const dueFrom =
    written && update.noticeOn !== null
      ? Math.max(effectiveMonth, monthIndex(update.noticeOn) + 1)
      : Number.POSITIVE_INFINITY;
  const first = monthIndex(update.chargedFrom);
  let accumulated = 0;
  let months = 0;
  let monthsBeforeDue = 0;
  let monthsEarly = 0;
  const rose = allowed.maxRent > base.rent && update.newRent > base.rent;
  for (let m = first; m <= frame.endMonth; m++) {
    months++;
    const allowedRent = m >= dueFrom ? allowed.maxRent : base.rent;
    if (rose && m < annMonth) monthsEarly++;
    else if (rose && m < dueFrom) monthsBeforeDue++;
    const over = round2(update.newRent - allowedRent);
    if (over > TOLERANCE) accumulated += over;
  }
  accumulated = round2(accumulated);
  const over = round2(update.newRent - allowed.maxRent);
  const monthly = over > TOLERANCE ? over : 0;

  const withinBound = allowed.upperBoundOnly && monthly === 0 && accumulated === 0;
  const phrases = [basePhrase, ...allowed.phrases];
  if (monthsEarly > 0)
    phrases.push(
      rentalPhrase('rent_update.before_anniversary', {
        months: { integer: monthsEarly },
        anniversary: { date: frame.day },
        base: { euros: base.rent },
      }),
    );
  if (monthsBeforeDue > 0)
    phrases.push(
      rentalPhrase(
        written ? 'rent_update.charged_before_notice' : 'rent_update.notice_not_written',
        { months: { integer: monthsBeforeDue }, base: { euros: base.rent } },
      ),
    );
  if (months > 0)
    phrases.push(
      rentalPhrase('rent_update.months', {
        months: { integer: months },
        from: { month: monthIso(first) },
        to: { month: monthIso(frame.endMonth) },
      }),
    );
  const status = withinBound
    ? 'not_checkable'
    : monthly > 0 || accumulated > 0
      ? 'paid_over'
      : 'within_limit';
  if (status === 'paid_over')
    phrases.push(rentalPhrase('rent_update.monthly_over', { monthly: { euros: monthly } }));
  else
    phrases.push(
      rentalPhrase(
        withinBound ? 'rent_update.other_clause_within_cap' : 'rent_update.within_limit',
      ),
    );
  return {
    reading: {
      status,
      unchecked: withinBound ? 'other_clause_within_cap' : null,
      base: base.rent,
      agreed: allowed.agreed,
      cap: allowed.cap,
      maxRent: allowed.maxRent,
      monthly,
      accumulated,
      months,
      monthsBeforeDue: monthsEarly + monthsBeforeDue,
      calculation: phrases,
      rules: [...allowed.rules, 'update_notice'],
    },
    carried: allowed.carried,
  };
}

const measure: Measure<RentUpdateReading> = {
  amount: (r) => (r.status === 'paid_over' ? r.accumulated : 0),
  same: (a, b) =>
    a.status === b.status &&
    a.unchecked === b.unchecked &&
    a.base === b.base &&
    a.maxRent === b.maxRent &&
    a.monthly === b.monthly &&
    a.accumulated === b.accumulated &&
    a.months === b.months &&
    a.monthsBeforeDue === b.monthsBeforeDue,
};

export const rentUpdateAmount = measure.amount;

// Each reading of an update is worked out once per open doubt combination and carried base;
// past this many, the update says it cannot be checked rather than run on.
const MAX_READINGS = 4096;
// Distinct carried bases kept per combination of the doubts still ahead. Past this, only the
// lowest and highest stay: a higher base never allows a lower rent, so the extremes give the
// lowest and highest amount.
const MAX_BASES = 4;

// What one year hands to the next: the side taken on doubts that come back later, and the rent
// the next anniversary updates from.
interface Branch {
  readonly assign: World;
  readonly carried: number | null;
}

interface Output {
  readonly branch: number;
  readonly world: World;
  readonly reading: RentUpdateReading;
  readonly carried: number | null;
}

const keyOf = (w: World): string =>
  Object.keys(w)
    .sort()
    .map((id) => `${id}=${w[id] === true ? 1 : 0}`)
    .join(',');

// The reasons that move `value` across outputs: a doubt opened here when flipping it alone, in the
// same branch, changes it; a doubt taken from an earlier year when flipping it changes it in any
// branch; and whatever moved the carried bases, when outputs alike in every doubt here differ.
function movingReasons<V>(
  outputs: readonly Output[],
  doubts: readonly Doubt[],
  fresh: (o: Output, id: string) => boolean,
  inherited: ReadonlySet<DoubtReason>,
  value: (o: Output) => V,
  same: (a: V, b: V) => boolean,
): Set<DoubtReason> {
  const moving = new Set<DoubtReason>();
  const local = (w: World) =>
    keyOf(Object.fromEntries(doubts.map((d) => [d.id, w[d.id] === true])));
  const exact = new Map(outputs.map((o) => [`${o.branch}|${keyOf(o.world)}`, o]));
  const byLocal = new Map<string, Output[]>();
  for (const o of outputs) byLocal.set(local(o.world), [...(byLocal.get(local(o.world)) ?? []), o]);
  for (const d of doubts)
    for (const o of outputs) {
      if (o.world[d.id] === true || moving.has(d.reason)) continue;
      const flipped = { ...o.world, [d.id]: true };
      const others = fresh(o, d.id)
        ? [exact.get(`${o.branch}|${keyOf(flipped)}`)]
        : (byLocal.get(local(flipped)) ?? []);
      if (others.some((x) => x !== undefined && !same(value(o), value(x)))) moving.add(d.reason);
    }
  for (const group of byLocal.values())
    if (group.some((o) => !same(value(o), value(group[0] as Output))))
      for (const r of inherited) moving.add(r);
  return moving;
}

function nextBranches(outputs: readonly Output[], ahead: ReadonlySet<string>): Branch[] {
  const byAssign = new Map<string, { assign: World; carried: Set<number | null> }>();
  for (const o of outputs) {
    const assign = Object.fromEntries(Object.entries(o.world).filter(([id]) => ahead.has(id)));
    const key = keyOf(assign);
    const entry = byAssign.get(key) ?? { assign, carried: new Set<number | null>() };
    entry.carried.add(o.carried);
    byAssign.set(key, entry);
  }
  return [...byAssign.values()].flatMap(({ assign, carried }) => {
    const numbers = [...carried].filter((c): c is number => c !== null);
    const kept =
      numbers.length > MAX_BASES ? [Math.min(...numbers), Math.max(...numbers)] : numbers;
    return [...kept, ...(carried.has(null) ? [null] : [])].map((c) => ({ assign, carried: c }));
  });
}

const tooMany = (base: Base): RentUpdateReading => ({
  status: 'not_checkable',
  unchecked: 'too_many_readings',
  base: base.rent,
  agreed: null,
  cap: null,
  maxRent: null,
  monthly: 0,
  accumulated: 0,
  months: 0,
  monthsBeforeDue: 0,
  calculation: [rentalPhrase('rent_update.too_many_readings')],
  rules: ['update_clause'],
});

// Checks each update against the clause and the cap in force on its anniversary (LAU art. 18 and
// the extraordinary caps), carrying the allowed rent, not the charged one, to the next year. Year
// by year, each update is worked out in every reading of its own doubts and of the bases the
// readings of earlier years left.
export function checkRentUpdates(
  input: RentalInput,
  today: CivilDate,
  deps: RentalDeps,
  { maxReadings }: { readonly maxReadings: number } = { maxReadings: MAX_READINGS },
): readonly RentUpdateResult[] {
  const sorted = input.updates
    .map((update, index) => ({ index, update }))
    .sort(
      (a, b) =>
        compareDates(a.update.anniversary, b.update.anniversary) ||
        compareDates(a.update.effectiveOn, b.update.effectiveOn),
    );
  const frames = sorted.map((_, k) => frameOf(input, sorted, k, today, deps));
  const lastSeen = new Map<string, number>();
  frames.forEach((f, k) => f.doubts.forEach((d) => lastSeen.set(d.id, k)));

  let branches: Branch[] = [{ assign: {}, carried: null }];
  let inherited = new Set<DoubtReason>();
  return frames.map((frame, k) => {
    const previous = frames[k - 1];
    const consecutive =
      previous !== undefined && previous.update.anniversary.y >= frame.update.anniversary.y - 1;
    const baseOf = (carried: number | null): Base =>
      consecutive && carried !== null
        ? { rent: carried, from: 'previous_max' }
        : previous === undefined && frame.firstYear
          ? { rent: input.initialRent, from: 'initial' }
          : { rent: frame.update.previousRent, from: 'answer' };
    // A base not taken from the year before makes the carried rents irrelevant.
    if (!consecutive)
      branches = [...new Map(branches.map((b) => [keyOf(b.assign), b])).values()].map((b) => ({
        assign: b.assign,
        carried: null,
      }));
    const doubts = uniqueById(frame.doubts);
    const openIn = (b: Branch) => doubts.filter((d) => !(d.id in b.assign));
    const work = branches.reduce((n, b) => n + 2 ** openIn(b).length, 0);
    const ahead = new Set([...lastSeen].filter(([, last]) => last > k).map(([id]) => id));

    if (work > maxReadings) {
      branches = [{ assign: {}, carried: null }];
      inherited = new Set();
      return result(input, frame, { kind: 'single', value: tooMany(baseOf(null)) }, deps.norms);
    }
    const outputs: Output[] = branches.flatMap((b, i) =>
      worldsFor(openIn(b)).map((w) => {
        const world = { ...b.assign, ...w };
        const step = readUpdate(input, frame, baseOf(b.carried), world, deps.norms);
        return { branch: i, world, reading: step.reading, carried: step.carried };
      }),
    );
    const fresh = (o: Output, id: string) => !(id in (branches[o.branch]?.assign ?? {}));
    const carriedIn = consecutive ? inherited : new Set<DoubtReason>();
    const reasons = movingReasons(
      outputs,
      doubts,
      fresh,
      carriedIn,
      (o) => o.reading,
      measure.same,
    );
    inherited = movingReasons(outputs, doubts, fresh, carriedIn, (o) => o.carried, Object.is);
    branches = nextBranches(outputs, ahead);
    const results = outputs.map((o) => ({ world: o.world, value: o.reading }));
    return result(input, frame, outcomeFrom(results, reasons, measure), deps.norms);
  });
}

function result(
  input: RentalInput,
  frame: Frame,
  outcome: Outcome<RentUpdateReading>,
  norms: NormTable,
): RentUpdateResult {
  const values = outcome.kind === 'single' ? [outcome.value] : outcome.readings.map((r) => r.value);
  const ruleIds = [...new Set(values.flatMap((v) => v.rules))];
  return {
    index: frame.index,
    anniversary: frame.update.anniversary,
    effectiveOn: frame.update.effectiveOn,
    outcome,
    sources: ruleIds.map((id) => ruleSource(id, norms)),
    companyLandlordHint:
      input.landlordType === 'company' &&
      outcome.kind === 'depends' &&
      outcome.reasons.includes('large_landlord_unknown'),
  };
}
