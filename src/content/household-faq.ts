import { minimumWageFor, type MinimumWageTable } from '../engine/law/minimum-wage';
import { t, type Key } from '../i18n';
import type { Lang } from '../i18n/languages';
import type { Variables } from '../i18n/interpolate';
import { euros } from './format';
import { HOUSEHOLD_FAQ_TOPICS, type HouseholdFaqId } from './household-faq-topics';

// The same questions feed the visible FAQ and its FAQPage JSON-LD, so they can't drift apart. Each
// is `household.faq.<id>` and `household.faq.<id>_answer`; the minimum wage answer reads the table
// as it stood on `checkedOn`.
export function householdFaqEntries(
  lang: Lang,
  { checkedOn, minimumWage }: { checkedOn: string; minimumWage: MinimumWageTable },
): readonly { anchor: string; question: string; answer: string }[] {
  const tx = (key: Key, vars?: Variables) => t(lang, key, vars);
  const year = Number(checkedOn.slice(0, 4));
  const lookup = minimumWageFor(year, minimumWage);
  if (lookup.kind === 'not_loaded') throw new Error(`No minimum wage loaded for ${year}.`);
  // The year's row, or the latest one as a reference while the year's decree is not out.
  const row = lookup.kind === 'published' ? lookup.row : lookup.reference;
  const figures = {
    anio: String(year),
    anual: euros(row.annual),
    hora: euros(row.householdPerHour),
  };

  const answers: Record<HouseholdFaqId, string> = {
    minimum_wage:
      lookup.kind === 'published'
        ? tx('household.faq.minimum_wage_answer', { ...figures, mensual: euros(row.monthly) })
        : tx('household.faq.minimum_wage_not_published', {
            ...figures,
            mensual: euros(row.monthly),
            referencia: String(row.year),
          }),
    hourly: tx('household.faq.hourly_answer'),
    desistimiento: tx('household.faq.desistimiento_answer'),
    dismissal: tx('household.faq.dismissal_answer'),
    night: tx('household.faq.night_answer'),
    incomplete: tx('household.faq.incomplete_answer'),
    working_time: tx('household.faq.working_time_answer'),
    unemployment: tx('household.faq.unemployment_answer'),
    data: tx('household.faq.data_answer'),
  };

  return HOUSEHOLD_FAQ_TOPICS.map(([id, anchor]) => ({
    anchor,
    question: tx(`household.faq.${id}`),
    answer: answers[id],
  }));
}
