import type { NormTable } from '../engine/rental/norms';
import { t, type Key } from '../i18n';
import type { Lang } from '../i18n/languages';
import type { Variables } from '../i18n/interpolate';
import { period } from './rent-caps';
import { formatLongDay } from './rent-indices';
import { decreeSentence, neverInForce, type Decree } from './rental-guide';
import { RENTAL_DOCUMENT_TOPICS, RENTAL_FAQ_TOPICS, type RentalFaqId } from './rental-faq-topics';

// The decrees a doubt can rest on, in the order the answer names them.
const PENDING_CANDIDATES: readonly Decree[] = ['rdl29_2026', 'rdl28_2026'];
const REPEALED_CANDIDATES = ['rdl8_2026', 'rdl26_2026', 'rdl29_2026', 'rdl28_2026'] as const;
const NAME = {
  rdl8_2026: 'Real Decreto-ley 8/2026',
  rdl26_2026: 'Real Decreto-ley 26/2026',
  rdl29_2026: 'Real Decreto-ley 29/2026',
  rdl28_2026: 'Real Decreto-ley 28/2026',
} as const;

// The same questions feed the visible FAQ and its FAQPage JSON-LD, so they can't drift apart. Each
// is `rental.faq.<id>` and `rental.faq.<id>_answer`; those that name a decree read its status from
// the norm table as it stood on `checkedOn`.
export function rentalFaqEntries(
  lang: Lang,
  norms: NormTable,
  { documents = false, checkedOn }: { documents?: boolean; checkedOn: string },
): readonly { anchor: string; question: string; answer: string }[] {
  const tx = (key: Key, vars?: Variables) => t(lang, key, vars);
  const decree = (key: Key) => decreeSentence(lang, norms, key, 'rdl29_2026', checkedOn);

  const pending = PENDING_CANDIDATES.filter((id) => norms[id].status === 'pending_validation').map(
    (id) =>
      tx(
        checkedOn < norms[id].inForceSince
          ? 'rental.faq.pending_norms_item_upcoming'
          : 'rental.faq.pending_norms_item_live',
        { norma: NAME[id], desde: formatLongDay(norms[id].inForceSince) },
      ),
  );
  const repealedIds = REPEALED_CANDIDATES.filter((id) => norms[id].status === 'repealed');
  // A decree repealed before it took effect never had days of its own to fall in.
  const repealed = repealedIds
    .filter((id) => !neverInForce(norms[id]))
    .map((id) => `${NAME[id]}, ${period(lang, norms[id])}`);
  const never = repealedIds.filter((id) => neverInForce(norms[id])).map((id) => NAME[id]);
  const fecha = formatLongDay(checkedOn);

  const answers: Record<RentalFaqId, string> = {
    agency_fees: tx('rental.faq.agency_fees_answer', {
      decreto: decree('rental.faq.agency_fees_decree'),
    }),
    rent_rise: tx('rental.faq.rent_rise_answer', {
      decreto: decree('rental.faq.rent_rise_decree'),
    }),
    irav: tx('rent_indices.faq.what_is_irav_answer'),
    deposit: tx('rental.faq.deposit_answer'),
    deposit_return: tx('rental.faq.deposit_return_answer'),
    pending_norms: tx('rental.faq.pending_norms_answer', {
      pendientes:
        pending.length > 0
          ? tx('rental.faq.pending_norms_list', { fecha, lista: pending.join(', y ') })
          : tx('rental.faq.pending_norms_none', { fecha }),
      derogados: [
        repealed.length > 0
          ? tx('rental.faq.pending_norms_repealed', { lista: repealed.join('; ') })
          : '',
        never.length > 0
          ? tx('rental.faq.pending_norms_never', { lista: never.join(' y el ') })
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    }).trim(),
    documents: tx('rental.faq.documents_answer'),
    pass: tx('rental.faq.pass_answer'),
  };

  return RENTAL_FAQ_TOPICS.filter(([id]) => documents || !RENTAL_DOCUMENT_TOPICS.includes(id)).map(
    ([id, anchor]) => ({ anchor, question: tx(`rental.faq.${id}`), answer: answers[id] }),
  );
}
