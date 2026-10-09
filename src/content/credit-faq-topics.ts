// The credit page's frequently asked questions, by id, each with the id of its <details>. Kept
// apart from their text so the browser's analytics can name an opened question without shipping
// the dictionary. The anchors keep their Spanish names: they are URL fragments.
export const CREDIT_FAQ_TOPICS = [
  ['apr', 'faq-credito-tae'],
  ['revolving', 'faq-credito-revolving'],
  ['average_rate', 'faq-credito-tipo-medio'],
  ['early_repayment', 'faq-credito-amortizar'],
  ['withdrawal', 'faq-credito-desistir'],
  ['before_2011', 'faq-credito-antes-2011'],
  ['new_law', 'faq-credito-ley-nueva'],
  ['data', 'faq-credito-datos'],
] as const;

export type CreditFaqId = (typeof CREDIT_FAQ_TOPICS)[number][0];
