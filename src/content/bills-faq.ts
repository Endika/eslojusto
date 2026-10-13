import { t, type Key } from '../i18n';
import type { Lang } from '../i18n/languages';
import { BILLS_DOCUMENT_TOPICS, BILLS_FAQ_TOPICS, type BillsFaqReview } from './bills-faq-topics';

// The same questions feed the visible FAQ and its FAQPage JSON-LD, so they can't drift apart. Each
// is `bills.faq.<review>.<id>` and `bills.faq.<review>.<id>_answer`; the documents and the pass are
// asked only in a build that reads documents.
export const billsFaqEntries = (
  lang: Lang,
  review: BillsFaqReview,
  { documents = false }: { documents?: boolean } = {},
): readonly { anchor: string; question: string; answer: string }[] =>
  BILLS_FAQ_TOPICS.filter(
    ([id, , page]) => page === review && (documents || !BILLS_DOCUMENT_TOPICS.includes(id)),
  ).map(([id, anchor]) => ({
    anchor,
    question: t(lang, `bills.faq.${review}.${id}` as Key),
    answer: t(lang, `bills.faq.${review}.${id}_answer` as Key),
  }));
