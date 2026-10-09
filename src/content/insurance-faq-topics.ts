// The insurance page's frequently asked questions, by id, each with the id of its <details>. Kept
// apart from their text so the browser's analytics can name an opened question without shipping
// the dictionary. The anchors keep their Spanish names: they are URL fragments.
export const INSURANCE_FAQ_TOPICS = [
  ['non_renewal', 'faq-seguro-no-renovar'],
  ['change_notice', 'faq-seguro-aviso'],
  ['withdrawal', 'faq-seguro-desistir'],
  ['proportional_rule', 'faq-seguro-regla-proporcional'],
  ['questionnaire', 'faq-seguro-cuestionario'],
  ['data', 'faq-seguro-datos'],
] as const;

export type InsuranceFaqId = (typeof INSURANCE_FAQ_TOPICS)[number][0];
