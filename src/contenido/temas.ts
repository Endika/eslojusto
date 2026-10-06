// The frequently asked questions, by id. Kept apart from their text so the browser's analytics
// can name an opened question without shipping the dictionary.
export const PREGUNTAS = [
  'dimision',
  'improcedente',
  'objetivo',
  'salario_diario',
  'temporal',
  'plazos',
  'paro',
  'paro_cuanto',
  'no_conforme',
  'no_comprobable',
  'datos',
] as const;
export type PreguntaId = (typeof PREGUNTAS)[number];

export const temaAyuda = (id: PreguntaId) => `faq-${id}` as const;
