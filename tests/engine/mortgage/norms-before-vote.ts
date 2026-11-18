import { MORTGAGE_NORMS } from '../../../src/engine/mortgage/data/norms';

// The norms as they stood from 08-10-2026 to 11-11-2026: art. 25 bis LCCI, added by RDL 29/2026,
// in force but not yet voted by the Congress.
export const MORTGAGE_NORMS_BEFORE_VOTE: typeof MORTGAGE_NORMS = {
  ...MORTGAGE_NORMS,
  lcci_25bis: {
    ...MORTGAGE_NORMS.lcci_25bis,
    status: 'pending_validation',
    statusSince: null,
    statusUrl: null,
  },
};
