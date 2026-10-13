// The bills pages' frequently asked questions, by id, each with the id of its <details> and the
// review whose page asks it. Kept apart from their text so the browser's analytics can name an
// opened question without shipping the dictionary. The anchors keep their Spanish names: they are
// URL fragments.
export const BILLS_FAQ_TOPICS = [
  ['meter', 'faq-luz-contador', 'electricity'],
  ['vat', 'faq-luz-iva', 'electricity'],
  ['pvpc', 'faq-luz-pvpc', 'electricity'],
  ['social_bonus', 'faq-luz-bono-social', 'electricity'],
  ['leave', 'faq-luz-irte', 'electricity'],
  ['commitment', 'faq-permanencia-penalizacion', 'telecom'],
  ['leave', 'faq-permanencia-irte', 'telecom'],
  // Only in a build that reads documents.
  ['documents', 'faq-luz-documentos', 'electricity'],
  ['pass', 'faq-luz-pase', 'electricity'],
  ['documents', 'faq-permanencia-documentos', 'telecom'],
  ['pass', 'faq-permanencia-pase', 'telecom'],
] as const;

export type BillsFaqId = (typeof BILLS_FAQ_TOPICS)[number][0];
export type BillsFaqReview = (typeof BILLS_FAQ_TOPICS)[number][2];

export const BILLS_DOCUMENT_TOPICS: readonly BillsFaqId[] = ['documents', 'pass'];
