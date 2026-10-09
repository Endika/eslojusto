// The household page's frequently asked questions, by id, each with the id of its <details>. Kept
// apart from their text so the browser's analytics can name an opened question without shipping
// the dictionary. The anchors keep their Spanish names: they are URL fragments.
export const HOUSEHOLD_FAQ_TOPICS = [
  ['minimum_wage', 'faq-hogar-smi'],
  ['hourly', 'faq-hogar-horas'],
  ['desistimiento', 'faq-hogar-desistimiento'],
  ['dismissal', 'faq-hogar-despido'],
  ['night', 'faq-hogar-noche'],
  ['incomplete', 'faq-hogar-anio-incompleto'],
  ['working_time', 'faq-hogar-jornada'],
  ['unemployment', 'faq-hogar-paro'],
  ['data', 'faq-hogar-datos'],
] as const;

export type HouseholdFaqId = (typeof HOUSEHOLD_FAQ_TOPICS)[number][0];
