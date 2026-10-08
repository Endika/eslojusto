// Words that tell something about a worker's health, family leave, union membership or debts:
// data the employment review never needs. The prompt asks the model to leave them out; this
// catches the texts that still carry them. Matched without case or accents, in Spanish, Catalan
// and Galician as whole words with their plurals and abbreviations, and in Basque as stems, since
// Basque adds its endings to the word.
const WORDS: readonly string[] = [
  // Health and leave.
  'incapacidad(?:es)?',
  'incapacitat(?:s)?',
  'incapacidade(?:s)?',
  'inc\\.? temporal',
  'enfermedad(?:es)?',
  'enfermidade(?:s)?',
  'enferm[oa]s?',
  'malaltia(?:es)?',
  'accidentes?',
  'baja medica',
  'salud',
  'saude',
  'salut',
  // Family leave.
  'maternidad(?:es)?',
  'maternidade(?:s)?',
  'maternitat(?:s)?',
  'paternidad(?:es)?',
  'paternidade(?:s)?',
  'paternitat(?:s)?',
  'nacimiento y cuidado',
  'cuidado del menor',
  'permiso (?:por |de |del )?nacimiento',
  'lactancia',
  'embarazos?',
  'embarazadas?',
  'riesgo durante',
  // Disability.
  'discapacidad(?:es)?',
  'discapacidade(?:s)?',
  'discapacitat(?:s)?',
  'discapacitad[oa]s?',
  'minusvalias?',
  'diversidad funcional',
  // Union membership, but not being registered with Social Security.
  'sindical(?:es)?',
  'sindicatos?',
  'sindicats?',
  'afiliad[oa]s?(?! (?:a|en) la seguridad social)',
  'afiliat(?:s|da|des)?(?! (?:a|en) la seguretat social)',
  'ccoo',
  'cc\\.? ?oo\\.?',
  'ugt',
  'cgt',
  // Debts, but not «sin embargo».
  '(?<!sin )embargos?',
  'embargaments?',
  'emb\\.? judicial',
  'retencion(?:es)? judicial(?:es)?',
  'pension(?:es)? alimenticias?',
];
// Prefixes: a word that starts like this, whatever follows.
const STEMS: readonly string[] = [
  'cuota sind',
  'ezintasun',
  'gaixotasun',
  'amatasun',
  'aitatasun',
  'sindikatu',
  'desgaitasun',
  'bahiketa',
];

const BEFORE = '(?<![\\p{L}\\p{N}])';
const AFTER = '(?![\\p{L}\\p{N}])';
const KEYWORDS = new RegExp(`${BEFORE}(?:(?:${WORDS.join('|')})${AFTER}|${STEMS.join('|')})`, 'u');

// AT (accidente de trabajo) as a word of its own, in capitals.
const WORK_ACCIDENT = new RegExp(`${BEFORE}A\\.?T\\.?${AFTER}`, 'u');
// IT (incapacidad temporal) only in capitals, and only where it is leave: alone, or beside the
// words a payslip puts around it. «Técnico IT» is about computers.
const IT = new RegExp(`${BEFORE}I\\.?T\\.?${AFTER}`, 'u');
const IT_TOKEN = 'I\\.?T\\.?';
const IT_AS_LEAVE = new RegExp(
  [
    `^${IT_TOKEN}$`,
    `${BEFORE}(?:COMPL(?:EMENTO)?|PREST(?:ACION)?|DIF(?:ERENCIAS?)?|ABONO|BAJA|SUBSIDIO|PAGO)\\.? (?:POR |DE |DEL )?${IT_TOKEN}${AFTER}`,
    `${BEFORE}${IT_TOKEN} (?:E\\.?C\\.?|C\\.?C\\.?|A\\.?T\\.?|E\\.?P\\.?|CONTINGENCIAS|EMPRESA|EMP\\.?|DELEGAD[OA]|PAGO DELEGADO)${AFTER}`,
  ].join('|'),
  'u',
);

const folded = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '');

export function hasSpecialCategory(text: string): boolean {
  const plain = folded(text).replace(/\s+/g, ' ').trim();
  if (KEYWORDS.test(plain.toLowerCase())) return true;
  if (WORK_ACCIDENT.test(plain)) return true;
  return IT.test(plain) && IT_AS_LEAVE.test(plain.toUpperCase());
}
