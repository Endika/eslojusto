import { t } from '../i18n';
import type { Lang } from '../i18n/languages';
import { MORTGAGE_DOCUMENT_TOPICS, MORTGAGE_FAQ_TOPICS } from './mortgage-faq-topics';

// The same questions feed the visible FAQ and its FAQPage JSON-LD, so they can't drift apart. Each
// is `mortgage.faq.<id>` and `mortgage.faq.<id>_answer`; the documents and the pass are asked only
// in a build that reads documents.
export const mortgageFaqEntries = (
  lang: Lang,
  { documents = false }: { documents?: boolean } = {},
): readonly { anchor: string; question: string; answer: string }[] =>
  MORTGAGE_FAQ_TOPICS.filter(([id]) => documents || !MORTGAGE_DOCUMENT_TOPICS.includes(id)).map(
    ([id, anchor]) => ({
      anchor,
      question: t(lang, `mortgage.faq.${id}`),
      answer: t(lang, `mortgage.faq.${id}_answer`),
    }),
  );
