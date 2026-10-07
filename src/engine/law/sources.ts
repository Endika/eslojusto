import type { Source } from '../sources';
import type { NormStatus } from './norms';

// A source that carries the validity and status of the norm it rests on.
export interface NormSource extends Source {
  readonly inForceUntil: string | null;
  readonly endUncertainUntil: string | null;
  readonly status: NormStatus;
  readonly statusSince: string | null;
  readonly statusUrl: string | null;
}
