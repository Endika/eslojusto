// Words that tell something about a worker's health, family leave, union membership or debts:
// data the employment review never needs. The prompt asks the model to leave them out; this
// catches the texts that still carry them. Matched as whole words, without case or accents, in
// Spanish and in the co-official languages' commonest forms.
const WORDS: readonly string[] = [
  'incapacidad',
  'enfermedad',
  'enfermo',
  'enferma',
  'accidente',
  'baja medica',
  'salud',
  'maternidad',
  'paternidad',
  'nacimiento y cuidado',
  'cuidado del menor',
  'lactancia',
  'embarazo',
  'embarazada',
  'riesgo durante',
  'sindical',
  'sindicato',
  'afiliado',
  'afiliada',
  'afiliacion',
  'ccoo',
  'cc\\.? ?oo\\.?',
  'ugt',
  'cgt',
  'discapacidad',
  'discapacitado',
  'minusvalia',
  'diversidad funcional',
  'embargo',
  'pension alimenticia',
  'malaltia',
  'maternitat',
  'paternitat',
  'sindicat',
  'gaixotasun',
  'ezintasun',
];

const NOT_A_LETTER_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_A_LETTER_AFTER = '(?![\\p{L}\\p{N}])';
const KEYWORDS = new RegExp(
  `${NOT_A_LETTER_BEFORE}(?:${WORDS.join('|')})${NOT_A_LETTER_AFTER}`,
  'u',
);
// IT and I.T., incapacidad temporal, only in capitals: «it» is an English word.
const TEMPORARY_INCAPACITY = new RegExp(
  `${NOT_A_LETTER_BEFORE}I\\.?T\\.?${NOT_A_LETTER_AFTER}`,
  'u',
);

const folded = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export const hasSpecialCategory = (text: string): boolean =>
  TEMPORARY_INCAPACITY.test(text) || KEYWORDS.test(folded(text));
