import { round2 } from '../engine/money';
import { minimumWageFor, type MinimumWageTable } from '../engine/employment/minimum-wage';
import type { NormTable } from '../engine/employment/norms';
import { t, type Key } from '../i18n';
import type { Lang } from '../i18n/languages';
import type { Variables } from '../i18n/interpolate';
import { normSentence, shortName, twelvePayments } from './employment-guide';
import {
  EMPLOYMENT_DOCUMENT_TOPICS,
  EMPLOYMENT_FAQ_TOPICS,
  type EmploymentFaqId,
} from './employment-faq-topics';
import { euros } from './format';
import { formatLongDay } from './rent-indices';

// Half the legal week, for the part-time example.
const HALF = 0.5;

// The same questions feed the visible FAQ and its FAQPage JSON-LD, so they can't drift apart. Each
// is `employment.faq.<id>` and `employment.faq.<id>_answer`; the minimum wage answers read the
// table and the information duty reads its decree, as they stood on `checkedOn`.
export function employmentFaqEntries(
  lang: Lang,
  norms: NormTable,
  {
    documents = false,
    checkedOn,
    minimumWage,
  }: { documents?: boolean; checkedOn: string; minimumWage: MinimumWageTable },
): readonly { anchor: string; question: string; answer: string }[] {
  const tx = (key: Key, vars?: Variables) => t(lang, key, vars);
  const year = Number(checkedOn.slice(0, 4));
  const lookup = minimumWageFor(year, minimumWage);
  if (lookup.kind === 'not_loaded') throw new Error(`No minimum wage loaded for ${year}.`);
  // The year's row, or the latest one as a reference while the year's decree is not out.
  const row = lookup.kind === 'published' ? lookup.row : lookup.reference;
  const anio = String(year);

  const answers: Record<EmploymentFaqId, string> = {
    minimum_wage:
      lookup.kind === 'published'
        ? tx('employment.faq.minimum_wage_answer', {
            anio,
            mensual: euros(row.monthly),
            anual: euros(row.annual),
            doce: euros(twelvePayments(row)),
            diario: euros(row.daily),
            norma: shortName(norms[row.norm]),
            efectos: formatLongDay(row.effectsFrom),
          })
        : tx('employment.faq.minimum_wage_not_published', {
            anio,
            referencia: String(row.year),
            mensual: euros(row.monthly),
            anual: euros(row.annual),
          }),
    part_time: tx('employment.faq.part_time_answer', {
      anio: String(row.year),
      mitad: euros(round2(row.annual * HALF)),
    }),
    temporary: tx('employment.faq.temporary_answer'),
    trial: tx('employment.faq.trial_answer'),
    holidays: tx('employment.faq.holidays_answer'),
    // Once the decree is repealed, the answer is that fact alone.
    information: normSentence(
      lang,
      norms,
      'rd723_2026',
      'employment.faq.information_answer',
      checkedOn,
    ),
    january: tx('employment.faq.january_answer', {
      anio: String(row.year),
      publicado: formatLongDay(row.publishedOn),
      efectos: formatLongDay(row.effectsFrom),
    }),
    documents: tx('employment.faq.documents_answer'),
    pass: tx('employment.faq.pass_answer'),
  };

  return EMPLOYMENT_FAQ_TOPICS.filter(
    ([id]) => documents || !EMPLOYMENT_DOCUMENT_TOPICS.includes(id),
  ).map(([id, anchor]) => ({
    anchor,
    question: tx(`employment.faq.${id}`, { anio }),
    answer: answers[id],
  }));
}
