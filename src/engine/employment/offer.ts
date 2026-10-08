import { contractAnnualPay } from './minimum-wage';
import type { EmploymentInput, Modality, Offer } from './types';

// What a job offer is worth against the signed contract is not settled in the law, so the offer is
// only set beside the contract: no verdict, no difference in anyone's favour.

export type RemoteWork = NonNullable<Offer['remote']>;

export type OfferField = 'gross_annual' | 'weekly_hours' | 'modality' | 'remote';

export type OfferDifference =
  | { readonly field: 'gross_annual'; readonly offer: number; readonly contract: number }
  | { readonly field: 'weekly_hours'; readonly offer: number; readonly contract: number }
  | { readonly field: 'modality'; readonly offer: Modality; readonly contract: Modality }
  | { readonly field: 'remote'; readonly offer: RemoteWork; readonly contract: RemoteWork };

// `net_against_gross`: the offer gives a net figure and the contract a gross one.
export type NotComparedReason = 'net_against_gross' | 'not_known';

export interface OfferComparison {
  readonly differences: readonly OfferDifference[];
  readonly notCompared: readonly {
    readonly field: OfferField;
    readonly reason: NotComparedReason;
  }[];
}

// The contract's remote work as a percentage of the working time.
const FULL_SHARE = 100;
const remoteOf = (share: number | null): RemoteWork | null => {
  if (share === null) return null;
  if (share === 0) return 'none';
  return share >= FULL_SHARE ? 'full' : 'hybrid';
};

export function compareOffer(input: EmploymentInput): OfferComparison | null {
  const { offer } = input;
  if (offer === null) return null;
  const differences: OfferDifference[] = [];
  const notCompared: { field: OfferField; reason: NotComparedReason }[] = [];

  const contractAnnual = contractAnnualPay(input);
  if (offer.grossAnnual !== null && offer.net)
    notCompared.push({ field: 'gross_annual', reason: 'net_against_gross' });
  else if (offer.grossAnnual === null || contractAnnual === null)
    notCompared.push({ field: 'gross_annual', reason: 'not_known' });
  // Offers state whole euros; cents from carrying a monthly pay to a year are no difference.
  else if (Math.round(offer.grossAnnual) !== Math.round(contractAnnual))
    differences.push({ field: 'gross_annual', offer: offer.grossAnnual, contract: contractAnnual });

  const contractWeekly = input.contractHours.weekly;
  if (offer.weeklyHours === null || contractWeekly === null)
    notCompared.push({ field: 'weekly_hours', reason: 'not_known' });
  else if (offer.weeklyHours !== contractWeekly)
    differences.push({ field: 'weekly_hours', offer: offer.weeklyHours, contract: contractWeekly });

  if (offer.modality === null || offer.modality === 'unknown' || input.modality === 'unknown')
    notCompared.push({ field: 'modality', reason: 'not_known' });
  else if (offer.modality !== input.modality)
    differences.push({ field: 'modality', offer: offer.modality, contract: input.modality });

  const contractRemote = remoteOf(input.remoteShare);
  if (offer.remote === null || contractRemote === null)
    notCompared.push({ field: 'remote', reason: 'not_known' });
  else if (offer.remote !== contractRemote)
    differences.push({ field: 'remote', offer: offer.remote, contract: contractRemote });

  return { differences, notCompared };
}
