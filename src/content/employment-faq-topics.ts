// The contract page's frequently asked questions, by id, each with the id of its <details>. Kept
// apart from their text so the browser's analytics can name an opened question without shipping
// the dictionary. The anchors keep their Spanish names: they are URL fragments.
export const EMPLOYMENT_FAQ_TOPICS = [
  ['minimum_wage', 'faq-contrato-smi'],
  ['part_time', 'faq-contrato-tiempo-parcial'],
  ['temporary', 'faq-contrato-temporal'],
  ['trial', 'faq-contrato-prueba'],
  ['holidays', 'faq-contrato-vacaciones'],
  ['information', 'faq-contrato-informacion'],
  ['january', 'faq-contrato-enero'],
  // Only in a build that reads documents.
  ['documents', 'faq-contrato-documentos'],
  ['pass', 'faq-contrato-pase'],
] as const;

export type EmploymentFaqId = (typeof EMPLOYMENT_FAQ_TOPICS)[number][0];

export const EMPLOYMENT_DOCUMENT_TOPICS: readonly EmploymentFaqId[] = ['documents', 'pass'];
