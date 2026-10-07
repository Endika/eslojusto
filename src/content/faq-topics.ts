// The frequently asked questions, by id, each with the id of its <details>. Kept apart from their
// text so the browser's analytics can name an opened question without shipping the dictionary.
// The anchors keep their Spanish names: they are URL fragments that links may already point to.
export const FAQ_TOPICS = [
  ['resignation', 'faq-dimision'],
  ['unfair_dismissal', 'faq-improcedente'],
  ['objective_dismissal', 'faq-objetivo'],
  ['daily_salary', 'faq-salario_diario'],
  ['fixed_term', 'faq-temporal'],
  ['deadlines', 'faq-plazos'],
  ['benefit', 'faq-paro'],
  ['benefit_amount', 'faq-paro_cuanto'],
  ['not_agreed', 'faq-no_conforme'],
  ['not_checkable', 'faq-no_comprobable'],
  ['data', 'faq-datos'],
  // Only in a build that reads documents.
  ['documents', 'faq-documentos'],
] as const;

export const DOCUMENT_TOPICS: readonly string[] = ['documents'];
