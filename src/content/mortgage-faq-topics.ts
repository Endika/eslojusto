// The mortgage page's frequently asked questions, by id, each with the id of its <details>. Kept
// apart from their text so the browser's analytics can name an opened question without shipping
// the dictionary. The anchors keep their Spanish names: they are URL fragments.
export const MORTGAGE_FAQ_TOPICS = [
  ['expenses', 'faq-hipoteca-gastos'],
  ['before_2019', 'faq-hipoteca-antes-2019'],
  ['tax', 'faq-hipoteca-impuesto'],
  ['prepayment', 'faq-hipoteca-amortizar'],
  ['floor', 'faq-hipoteca-suelo'],
  ['irph', 'faq-hipoteca-irph'],
  // Only in a build that reads documents.
  ['documents', 'faq-hipoteca-documentos'],
  ['pass', 'faq-hipoteca-pase'],
] as const;

export type MortgageFaqId = (typeof MORTGAGE_FAQ_TOPICS)[number][0];

export const MORTGAGE_DOCUMENT_TOPICS: readonly MortgageFaqId[] = ['documents', 'pass'];
