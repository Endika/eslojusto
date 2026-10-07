export type NormStatus = 'in_force' | 'pending_validation' | 'repealed';

// Each section names its own norms; `Id` is that section's closed set of ids.
export interface Norm<Id extends string> {
  readonly id: Id;
  readonly citation: string;
  readonly url: string;
  readonly inForceSince: string;
  // Last day with effects; null while no end is known. A repealed norm that never took effect has
  // it before `inForceSince`.
  readonly inForceUntil: string | null;
  // When the exact last day is in doubt, the doubtful window widens up to this day.
  readonly endUncertainUntil?: string;
  readonly status: NormStatus;
  // Date and BOE link of the validation or repeal agreement.
  readonly statusSince: string | null;
  readonly statusUrl: string | null;
}

export type NormTable<Id extends string> = Readonly<Record<Id, Norm<Id>>>;

// How a norm stands on a given day: a repealed norm's whole window, widened to its uncertain end,
// is doubtful, and so is anything resting on a norm still pending validation.
export type NormStanding = 'not_in_force' | 'in_force' | 'pending_validation' | 'repealed_window';

export function normStanding<Id extends string>(norm: Norm<Id>, day: string): NormStanding {
  if (day < norm.inForceSince) return 'not_in_force';
  const lastDay =
    norm.status === 'repealed' ? (norm.endUncertainUntil ?? norm.inForceUntil) : norm.inForceUntil;
  if (lastDay !== null && day > lastDay) return 'not_in_force';
  if (norm.status === 'repealed') return 'repealed_window';
  return norm.status;
}
