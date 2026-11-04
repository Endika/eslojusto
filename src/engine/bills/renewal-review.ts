import type { CivilDate } from '../date';
import type { OfficialDeps } from './electricity-official';
import { reviewRenewalCore } from './renewal';
import {
  compareWithPvpc,
  renewalTaxes,
  type PvpcComparison,
  type RenewalTaxes,
} from './renewal-official';
import type { RenewalCore, RenewalDeps, RenewalInput } from './renewal-types';
import { validateRenewal, type RenewalField, type ValidationError } from './validate';

export interface RenewalReviewDeps extends RenewalDeps {
  // Null when the PVPC prices could not be loaded: the comparison then says there is no data.
  readonly official: OfficialDeps | null;
}

export interface RenewalReview {
  readonly input: RenewalInput;
  readonly core: RenewalCore;
  readonly pvpc: PvpcComparison;
  // Null while the letter's cost cannot be recalculated, so there is nothing to put taxes on.
  readonly taxes: RenewalTaxes | null;
}

type RenewalResult =
  | { readonly ok: false; readonly errors: readonly ValidationError<RenewalField>[] }
  | { readonly ok: true; readonly review: RenewalReview };

// The review of a renewal letter: the recalculation, what is regulated and what is the
// retailer's, how the new prices stand against the PVPC, the taxes, the notice and the exit.
export function reviewRenewal(
  input: RenewalInput,
  today: CivilDate,
  deps: RenewalReviewDeps,
): RenewalResult {
  const errors = validateRenewal(input, today);
  if (errors.length > 0) return { ok: false, errors };
  const core = reviewRenewalCore(input, deps);
  return {
    ok: true,
    review: {
      input,
      core,
      pvpc:
        deps.official === null
          ? { kind: 'no_data' }
          : compareWithPvpc(input, { ...deps, ...deps.official }),
      taxes: core.recalc.kind === 'ok' ? renewalTaxes(input, core.recalc.next, deps) : null,
    },
  };
}
