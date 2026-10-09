import type { Finding } from '../engine/insurance/types';
import type { InsuranceReview } from '../engine/insurance/review';
import { detailLine, placeAndDate, type LetterDetails, type LetterKind } from '../documents/letter';
import type { DocumentModel } from '../documents/ports';
import type { Translate } from '../i18n/client';
import type { CompletedInsuranceReview } from './ports';
import { civilDayText as day } from './render';

// The deadline to say the policy is not to be extended, while it is still open.
export const openNonRenewal = (review: InsuranceReview): Finding | null =>
  review.findings.find(
    (f) => f.id === 'non_renewal' && f.status === 'open' && f.lastDay !== null,
  ) ?? null;

// The letter that says the policy is not to be extended only tells the insurer so: it is free, and
// offered while there is still time to send it.
export const insuranceLetterKinds = ({
  review,
}: CompletedInsuranceReview): readonly LetterKind[] =>
  review.scope.inScope && openNonRenewal(review) !== null ? ['insurance_non_renewal'] : [];

// Tells the insurer the policy is not to be extended at the end of the current period, in writing
// as art. 22.2 LCS asks. The last day stays in the result, with its notes: which day a period
// ending at 00:00 h closes on, and the month-end reading, are not the insurer's to be told as fact.
export function nonRenewalLetter(
  { input, review }: CompletedInsuranceReview,
  details: LetterDetails,
  tr: Translate,
): DocumentModel {
  const title = tr('client.insurance.letter.title');
  const source = openNonRenewal(review)?.sources[0];
  return {
    title,
    footer: null,
    blocks: [
      { type: 'title', text: title },
      detailLine(tr('client.documents.letter.name'), details.name),
      detailLine(tr('client.documents.letter.id'), details.id),
      detailLine(tr('client.insurance.letter.insurer'), details.company),
      detailLine(tr('client.insurance.letter.reference'), details.reference),
      {
        type: 'text',
        text: tr(
          input.line === 'car'
            ? 'client.insurance.letter.body_car'
            : 'client.insurance.letter.body_home',
          { vencimiento: day(input.expiresOn) },
        ),
      },
      ...(source
        ? [
            {
              type: 'text',
              text: tr('client.insurance.letter.rule', { cita: source.citation }),
            } as const,
          ]
        : []),
      ...(source ? [{ type: 'source', text: source.citation, url: source.url } as const] : []),
      { type: 'text', text: tr('client.insurance.letter.confirm') },
      { type: 'text', text: tr('client.insurance.letter.regards') },
      placeAndDate(details, tr),
      detailLine(tr('client.documents.letter.name'), details.name),
    ],
  };
}
