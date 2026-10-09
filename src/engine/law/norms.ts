// The statuses of a norm published in the BOE.
export type EnactedStatus = 'in_force' | 'pending_validation' | 'repealed';

// `draft`: a bill or a directive not yet transposed. The engine never applies it; it only feeds
// notices of what may change.
// `conditional`: a measure that applies only if a figure says so. While `condition.met` is null
// the engine works out both worlds and counts only what holds in both; once the figure is out,
// `met` settles it and the norm keeps its status as the record of how it was decided.
export type NormStatus = EnactedStatus | 'draft' | 'conditional';

export interface NormCondition {
  // What has to happen for the measure to apply, as shown to the person.
  readonly text: string;
  // Day by which the deciding figure is out; a condition still open a week later stops the build.
  readonly decidesOn: string;
  // Id, in the section's source table, of the figure that decides it.
  readonly source: string;
  // Null until the figure is out; then whether the measure applies. `statusSince` and `statusUrl`
  // of the norm give the day and the notice that settled it.
  readonly met: boolean | null;
}

// Each section names its own norms; `Id` is that section's closed set of ids, and `Status` the
// statuses its table may hold.
export interface Norm<Id extends string, Status extends NormStatus = NormStatus> {
  readonly id: Id;
  readonly citation: string;
  readonly url: string;
  readonly inForceSince: string;
  // Last day with effects; null while no end is known. A repealed norm that never took effect has
  // it before `inForceSince`.
  readonly inForceUntil: string | null;
  // When the exact last day is in doubt, the doubtful window widens up to this day.
  readonly endUncertainUntil?: string;
  readonly status: Status;
  // Date and BOE link of the validation or repeal agreement, or of the notice that settled a
  // condition.
  readonly statusSince: string | null;
  readonly statusUrl: string | null;
  // Always set on a `conditional` norm.
  readonly condition?: NormCondition;
}

export type NormTable<Id extends string, Status extends NormStatus = NormStatus> = Readonly<
  Record<Id, Norm<Id, Status>>
>;

// Day each norm was last read in the BOE during the monthly review; kept apart from `Norm` so the
// shared model stays the same for every section.
export type NormReview<Id extends string> = Readonly<Record<Id, string>>;

// How a norm stands on a given day: a repealed norm's whole window, widened to its uncertain end,
// is doubtful, and so is anything resting on a norm still pending validation or on a condition
// still open. A draft never stands.
export type NormStanding =
  'not_in_force' | 'in_force' | 'pending_validation' | 'repealed_window' | 'conditional';

export function normStanding<Id extends string>(norm: Norm<Id>, day: string): NormStanding {
  const status: NormStatus = norm.status;
  if (status === 'draft' || day < norm.inForceSince) return 'not_in_force';
  const lastDay =
    status === 'repealed' ? (norm.endUncertainUntil ?? norm.inForceUntil) : norm.inForceUntil;
  if (lastDay !== null && day > lastDay) return 'not_in_force';
  if (status === 'repealed') return 'repealed_window';
  if (status === 'conditional') {
    const met = norm.condition?.met ?? null;
    if (met === null) return 'conditional';
    return met ? 'in_force' : 'not_in_force';
  }
  return status;
}
