import { t } from '../i18n';
import type { Lang } from '../i18n/languages';
import { INSURANCE_FAQ_TOPICS } from './insurance-faq-topics';

// The same questions feed the visible FAQ and its FAQPage JSON-LD, so they can't drift apart. Each
// is `insurance.faq.<id>` and `insurance.faq.<id>_answer`.
export const insuranceFaqEntries = (
  lang: Lang,
): readonly { anchor: string; question: string; answer: string }[] =>
  INSURANCE_FAQ_TOPICS.map(([id, anchor]) => ({
    anchor,
    question: t(lang, `insurance.faq.${id}`),
    answer: t(lang, `insurance.faq.${id}_answer`),
  }));
