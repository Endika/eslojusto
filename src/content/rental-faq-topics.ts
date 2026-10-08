// The rental page's frequently asked questions, by id, each with the id of its <details>. Kept apart
// from their text so the browser's analytics can name an opened question without shipping the
// dictionary. The anchors keep their Spanish names: they are URL fragments.
export const RENTAL_FAQ_TOPICS = [
  ['agency_fees', 'faq-alquiler-honorarios'],
  ['rent_rise', 'faq-alquiler-subida'],
  ['irav', 'faq-alquiler-irav'],
  ['deposit', 'faq-alquiler-fianza'],
  ['deposit_return', 'faq-alquiler-devolucion'],
  ['pending_norms', 'faq-alquiler-normas-pendientes'],
  // Only in a build that reads documents.
  ['documents', 'faq-alquiler-documentos'],
  ['pass', 'faq-alquiler-pase'],
] as const;

export type RentalFaqId = (typeof RENTAL_FAQ_TOPICS)[number][0];

export const RENTAL_DOCUMENT_TOPICS: readonly RentalFaqId[] = ['documents', 'pass'];
