export type NormId =
  | 'lau'
  | 'rdl7_2019'
  | 'rdl6_2022'
  | 'rdl11_2022'
  | 'rdl20_2022'
  | 'law12_2023'
  | 'ineIravResolution'
  | 'pge2023'
  | 'rdl8_2026'
  | 'rdl26_2026'
  | 'rdl29_2026'
  | 'rdl28_2026';

export type NormStatus = 'in_force' | 'pending_validation' | 'repealed';

export interface Norm {
  readonly id: NormId;
  readonly citation: string;
  readonly url: string;
  readonly inForceSince: string;
  // Last day with effects; null while no end is known.
  readonly inForceUntil: string | null;
  // When the exact last day is in doubt, the doubtful window widens up to this day.
  readonly endUncertainUntil?: string;
  readonly status: NormStatus;
  // Date and BOE link of the validation or repeal agreement.
  readonly statusSince: string | null;
  readonly statusUrl: string | null;
}

export type NormTable = Readonly<Record<NormId, Norm>>;

// How a norm stands on a given day: a repealed norm's whole window, widened to its uncertain end,
// is doubtful, and so is anything resting on a norm still pending validation.
export type NormStanding = 'not_in_force' | 'in_force' | 'pending_validation' | 'repealed_window';

export function normStanding(norm: Norm, day: string): NormStanding {
  if (day < norm.inForceSince) return 'not_in_force';
  const lastDay =
    norm.status === 'repealed' ? (norm.endUncertainUntil ?? norm.inForceUntil) : norm.inForceUntil;
  if (lastDay !== null && day > lastDay) return 'not_in_force';
  if (norm.status === 'repealed') return 'repealed_window';
  return norm.status;
}
