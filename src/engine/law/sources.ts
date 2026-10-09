import type { Source } from '../sources';
import type { EnactedStatus, NormStatus } from './norms';

// A source that carries the validity and status of the norm it rests on.
export interface NormSource<Status extends NormStatus = EnactedStatus> extends Source {
  readonly inForceUntil: string | null;
  readonly endUncertainUntil: string | null;
  readonly status: Status;
  readonly statusSince: string | null;
  readonly statusUrl: string | null;
}

interface LawSourceBase extends Source {
  readonly article: string;
  // Day the text was last read at the source.
  readonly lastVerified: string;
  // Whether what the engine takes from it was read in the primary text; an amount never rests on
  // an unverified source.
  readonly verified: boolean;
  // Passages copied verbatim from the primary text, the only ones a page may quote.
  readonly quotes: readonly string[];
}

export interface StatuteSource extends LawSourceBase {
  readonly basis: 'statute';
}

// Figures an official body publishes, such as a rate series.
export interface OfficialDataSource extends LawSourceBase {
  readonly basis: 'official_data';
}

// A court's criterion, never shown as law.
export interface CaseLawSource extends LawSourceBase {
  readonly basis: 'case_law';
  readonly court: string;
  readonly number: string;
  readonly decidedOn: string;
  // Null until read in the court's own database.
  readonly ecli: string | null;
}

export type LawSource = StatuteSource | OfficialDataSource | CaseLawSource;

export type SourceTable<Id extends string> = Readonly<Record<Id, LawSource & { readonly id: Id }>>;
