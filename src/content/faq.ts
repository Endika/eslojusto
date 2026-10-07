import { t } from '../i18n';
import type { Lang } from '../i18n/languages';
import { DOCUMENT_TOPICS, FAQ_TOPICS } from './faq-topics';

// The same questions feed the visible FAQ and its FAQPage JSON-LD, so they can't drift apart.
// Each one is `faq.<id>` (question) and `faq.<id>_answer` (answer) in the dictionary.
export const faqEntries = (
  lang: Lang,
  { documents = false }: { documents?: boolean } = {},
): readonly { anchor: string; question: string; answer: string }[] =>
  FAQ_TOPICS.filter(([id]) => documents || !DOCUMENT_TOPICS.includes(id)).map(([id, anchor]) => ({
    anchor,
    question: t(lang, `faq.${id}`),
    answer: t(lang, `faq.${id}_answer`),
  }));

// A node for the page's @graph; Base adds the @context.
export const faqNode = (entries: readonly { question: string; answer: string }[]) => ({
  '@type': 'FAQPage',
  mainEntity: entries.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer },
  })),
});

export const faqPage = (lang: Lang, options: { documents?: boolean } = {}) =>
  faqNode(faqEntries(lang, options));
