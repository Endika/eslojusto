// The statuses of a norm published in the BOE.
export type EnactedStatus = 'in_force' | 'pending_validation' | 'repealed';

// `draft`: a bill or a directive not yet transposed. The engine never applies it; it only feeds
// notices of what may change.
export type NormStatus = EnactedStatus | 'draft';

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
  // Date and BOE link of the validation or repeal agreement.
  readonly statusSince: string | null;
  readonly statusUrl: string | null;
}

export type NormTable<Id extends string, Status extends NormStatus = NormStatus> = Readonly<
  Record<Id, Norm<Id, Status>>
>;

// Day each norm was last read in the BOE during the monthly review; kept apart from `Norm` so the
// shared model stays the same for every section.
export type NormReview<Id extends string> = Readonly<Record<Id, string>>;

// How a norm stands on a given day: a repealed norm's whole window, widened to its uncertain end,
// is doubtful, and so is anything resting on a norm still pending validation. A draft never stands.
export type NormStanding = 'not_in_force' | 'in_force' | 'pending_validation' | 'repealed_window';

export function normStanding<Id extends string>(norm: Norm<Id>, day: string): NormStanding {
  const status: NormStatus = norm.status;
  if (status === 'draft' || day < norm.inForceSince) return 'not_in_force';
  const lastDay =
    status === 'repealed' ? (norm.endUncertainUntil ?? norm.inForceUntil) : norm.inForceUntil;
  if (lastDay !== null && day > lastDay) return 'not_in_force';
  if (status === 'repealed') return 'repealed_window';
  return status;
}
