import { NORMS } from '../../../src/engine/rental/data/norms';

// The norms as they stood from 08-10-2026 to 11-11-2026: RDL 28/2026 and RDL 29/2026 in force
// but not yet voted by the Congress, so the readings that depend on them stay open.
const awaitingVote = (id: 'rdl28_2026' | 'rdl29_2026') => ({
  ...NORMS[id],
  inForceUntil: null,
  status: 'pending_validation' as const,
  statusSince: null,
  statusUrl: null,
});

export const NORMS_BEFORE_VOTE: typeof NORMS = {
  ...NORMS,
  rdl28_2026: awaitingVote('rdl28_2026'),
  rdl29_2026: awaitingVote('rdl29_2026'),
};
