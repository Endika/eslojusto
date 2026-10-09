import { t } from '../i18n';
import type { Lang } from '../i18n/languages';
import { CREDIT_FAQ_TOPICS } from './credit-faq-topics';

// The same questions feed the visible FAQ and its FAQPage JSON-LD, so they can't drift apart. Each
// is `credit.faq.<id>` and `credit.faq.<id>_answer`.
export const creditFaqEntries = (
  lang: Lang,
): readonly { anchor: string; question: string; answer: string }[] =>
  CREDIT_FAQ_TOPICS.map(([id, anchor]) => ({
    anchor,
    question: t(lang, `credit.faq.${id}`),
    answer: t(lang, `credit.faq.${id}_answer`),
  }));
