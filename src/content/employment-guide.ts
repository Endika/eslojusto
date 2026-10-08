import { addDays, parseDate, toIso } from '../engine/date';
import type { NormSource } from '../engine/law/sources';
import { round2 } from '../engine/money';
import {
  minimumWageFor,
  type MinimumWageRow,
  type MinimumWageTable,
} from '../engine/employment/minimum-wage';
import type { EmploymentNormId, Norm, NormTable } from '../engine/employment/norms';
import { LAW_QUOTES } from '../engine/employment/quotes';
import { RULES, ruleSource, type EmploymentRuleId } from '../engine/employment/rules';
import { REGCON } from '../engine/employment/information';
import { INFO_ELEMENTS } from '../engine/employment/types';
import { t, type Key } from '../i18n';
import type { Lang } from '../i18n/languages';
import type { Variables } from '../i18n/interpolate';
import { euros } from './format';
import { formatDay, formatLongDay } from './rent-indices';

// The guide on /contrato/: each block's text, the norms it rests on and how each stands, read from
// the norm and minimum wage tables so a new decree, a repeal or a new year changes the page
// without touching it.

export type NormStatusCode =
  'in_force' | 'upcoming' | 'ended' | 'pending_validation' | 'repealed' | 'never_applied';

export interface GuideSource {
  readonly citation: string;
  readonly url: string;
  readonly status: string;
  readonly statusCode: NormStatusCode;
}

// The words of the law, quoted after the sentence that names the article.
export interface GuideQuote {
  // What the case is, before the sentence that names the article.
  readonly lead: string | null;
  readonly intro: string;
  readonly text: string;
  readonly citation: string;
  readonly url: string;
}

export interface GuideLink {
  readonly label: string;
  readonly url: string;
}

export type GuideBlockId =
  | 'minimum_wage'
  | 'what_counts'
  | 'modalities'
  | 'permanent'
  | 'trial'
  | 'working_time'
  | 'part_time'
  | 'holidays_pay'
  | 'clauses'
  | 'information'
  | 'agreement';

export interface GuideBlock {
  readonly id: GuideBlockId;
  // The block's id on the page, a URL fragment that keeps its Spanish name.
  readonly anchor: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  // Shown as a list after the first paragraph, when the block has one.
  readonly list: readonly string[];
  readonly quotes: readonly GuideQuote[];
  readonly sources: readonly GuideSource[];
  readonly links: readonly GuideLink[];
}

// «Real Decreto 723/2026, de 9 de septiembre» → «Real Decreto 723/2026».
export const shortName = (norm: Pick<Norm, 'citation'>): string =>
  norm.citation.split(', de ')[0] ?? norm.citation;

// «el Real Decreto 723/2026», «la Ley 1/2025».
const withArticle = (name: string): string => `${name.startsWith('Ley') ? 'la' : 'el'} ${name}`;

const lastDayOf = (norm: Norm): string | null =>
  norm.status === 'repealed' ? (norm.endUncertainUntil ?? norm.inForceUntil) : norm.inForceUntil;

// A norm the law repealed before the day it was to take effect, even at its doubtful end.
export const neverApplied = (norm: Norm): boolean => {
  const last = lastDayOf(norm);
  return norm.status === 'repealed' && last !== null && last < norm.inForceSince;
};

// How a norm stands on the day the page was checked.
export function statusCode(norm: Norm, checkedOn: string): NormStatusCode {
  if (neverApplied(norm)) return 'never_applied';
  if (norm.status !== 'in_force') return norm.status;
  if (checkedOn < norm.inForceSince) return 'upcoming';
  const last = norm.inForceUntil;
  return last !== null && last < checkedOn ? 'ended' : 'in_force';
}

const STATUS_KEY: Record<NormStatusCode, Key> = {
  in_force: 'client.employment.norm.in_force',
  upcoming: 'employment.guide.norm.upcoming',
  ended: 'employment.guide.norm.ended',
  pending_validation: 'client.employment.norm.pending_validation',
  repealed: 'client.employment.norm.repealed',
  never_applied: 'employment.guide.norm.never_applied',
};

export function guideSource(
  lang: Lang,
  source: Pick<NormSource, 'citation' | 'url'>,
  norm: Norm,
  checkedOn: string,
): GuideSource {
  const code = statusCode(norm, checkedOn);
  const day =
    code === 'repealed'
      ? norm.statusSince
      : code === 'ended'
        ? norm.inForceUntil
        : code === 'upcoming'
          ? norm.inForceSince
          : null;
  return {
    citation: source.citation,
    url: source.url,
    statusCode: code,
    status: t(lang, STATUS_KEY[code], { fecha: day === null ? '' : formatDay(day) }),
  };
}

// A sentence that rests on a decree or a law: with the norm and how it stands while it stands, the
// plain fact of its repeal once repealed, or that it never applied.
export function normSentence(
  lang: Lang,
  norms: NormTable,
  id: EmploymentNormId,
  key: Key,
  checkedOn: string,
  vars: Variables = {},
): string {
  const norm = norms[id];
  const name = shortName(norm);
  const code = statusCode(norm, checkedOn);
  if (code === 'never_applied') return t(lang, 'employment.guide.norm_never', { norma: name });
  if (code === 'repealed') {
    const last = lastDayOf(norm);
    return t(lang, 'employment.guide.norm_repealed', {
      norma: name,
      desde: formatDay(norm.inForceSince),
      hasta: last === null ? '' : formatDay(last),
    });
  }
  // A norm in force is named alone; one not yet in force or awaiting validation says so.
  const clause =
    code === 'upcoming' || code === 'pending_validation'
      ? t(lang, `employment.guide.norm_clause_${code}`, {
          norma: withArticle(name),
          desde: formatLongDay(norm.inForceSince),
        })
      : withArticle(name);
  return t(lang, key, { ...vars, norma: clause, desde: formatLongDay(norm.inForceSince) });
}

// Whether a sentence resting on the norm still describes the law.
export const normStands = (norm: Norm): boolean => norm.status !== 'repealed';

// One year of the minimum wage as the guide's table shows it. The twelve-payment figure is the
// yearly one divided by twelve: the decrees give the fourteen-payment one only.
export interface MinimumWageLine {
  readonly year: number;
  readonly monthly: string;
  readonly twelve: string;
  readonly annual: string;
  readonly daily: string;
  readonly temporaryPerDay: string;
  readonly norm: string;
  readonly url: string;
  readonly status: GuideSource;
}

const MONTHS_IN_YEAR = 12;

export const twelvePayments = (row: Pick<MinimumWageRow, 'annual'>): number =>
  round2(row.annual / MONTHS_IN_YEAR);

export interface MinimumWageSummary {
  readonly lines: readonly MinimumWageLine[];
  // The year the page was checked in, and whether its decree is out.
  readonly current: string;
}

export function minimumWageSummary(
  lang: Lang,
  table: MinimumWageTable,
  norms: NormTable,
  checkedOn: string,
): MinimumWageSummary {
  const lines = [...table]
    .sort((a, b) => b.year - a.year)
    .map((row) => {
      const norm = norms[row.norm];
      return {
        year: row.year,
        monthly: euros(row.monthly),
        twelve: euros(twelvePayments(row)),
        annual: euros(row.annual),
        daily: euros(row.daily),
        temporaryPerDay: euros(row.temporaryPerDay),
        norm: shortName(norm),
        url: row.url,
        status: guideSource(lang, { citation: norm.citation, url: row.url }, norm, checkedOn),
      };
    });
  return { lines, current: currentYearSentence(lang, table, norms, checkedOn) };
}

const yearOf = (iso: string): number => Number(iso.slice(0, 4));

// The year the page was checked in: its figures and decree, or that its decree is not out yet and
// which year stands as a reference meanwhile.
function currentYearSentence(
  lang: Lang,
  table: MinimumWageTable,
  norms: NormTable,
  checkedOn: string,
): string {
  const year = yearOf(checkedOn);
  const lookup = minimumWageFor(year, table);
  if (lookup.kind === 'not_loaded') throw new Error(`No minimum wage loaded for ${year}.`);
  if (lookup.kind === 'not_published')
    return t(lang, 'employment.guide.minimum_wage.not_published', {
      anio: String(year),
      referencia: String(lookup.reference.year),
    });
  const { row } = lookup;
  return t(lang, 'employment.guide.minimum_wage.current', {
    anio: String(year),
    mensual: euros(row.monthly),
    anual: euros(row.annual),
    doce: euros(twelvePayments(row)),
    norma: withArticle(shortName(norms[row.norm])),
    publicado: formatLongDay(row.publishedOn),
    efectos: formatLongDay(row.effectsFrom),
  });
}

// The day before a norm took effect, as the last day of the wording it replaced.
const eveOf = (iso: string): string => formatLongDay(toIso(addDays(parseDate(iso), -1)));

export function employmentGuide(
  lang: Lang,
  norms: NormTable,
  { checkedOn, minimumWage }: { checkedOn: string; minimumWage: MinimumWageTable },
): readonly GuideBlock[] {
  const tx = (key: Key, vars?: Variables) => t(lang, key, vars);
  const source = (id: EmploymentRuleId): GuideSource =>
    guideSource(lang, ruleSource(id, norms), norms[RULES[id].norm], checkedOn);
  const withNorm = (id: EmploymentNormId, key: Key, vars?: Variables) =>
    normSentence(lang, norms, id, key, checkedOn, vars);
  const quote = (
    id: 'permanent_on_breach' | 'chaining_18_in_24' | 'written_form',
    intro: Key,
    lead: Key | null = null,
  ): GuideQuote => {
    const s = ruleSource(id, norms);
    return {
      lead: lead === null ? null : tx(lead),
      intro: tx(intro),
      text: LAW_QUOTES[id].text,
      citation: s.citation,
      url: s.url,
    };
  };
  const reform = formatLongDay(RULES.fixed_term_presumption.from);
  const rd723Stands = normStands(norms.rd723_2026);
  const reformEve = eveOf(RULES.fixed_term_presumption.from);
  const latest = [...minimumWage].sort((a, b) => b.year - a.year)[0];
  if (latest === undefined) throw new Error('The employment guide needs the minimum wage table.');

  const block = (
    id: GuideBlockId,
    anchor: string,
    parts: {
      paragraphs: readonly string[];
      list?: readonly string[];
      quotes?: readonly GuideQuote[];
      rules: readonly EmploymentRuleId[];
      links?: readonly GuideLink[];
    },
  ): GuideBlock => ({
    id,
    anchor,
    title: tx(`employment.guide.${id}.title`),
    paragraphs: parts.paragraphs,
    list: parts.list ?? [],
    quotes: parts.quotes ?? [],
    // Several rules can rest on the same article: each is listed once.
    sources: parts.rules
      .map(source)
      .filter((x, i, all) => all.findIndex((o) => o.citation === x.citation) === i),
    links: parts.links ?? [],
  });

  return [
    // Its table of years comes from the minimum wage table; the view places it.
    block('minimum_wage', 'g-salario-minimo', {
      paragraphs: [
        tx('employment.guide.minimum_wage.lead'),
        tx('employment.guide.minimum_wage.prorata'),
        tx('employment.guide.minimum_wage.temporary', {
          diario: euros(latest.temporaryPerDay),
          anio: String(latest.year),
        }),
      ],
      rules: ['smi_annual', 'smi_prorata', 'smi_temporary_120'],
    }),
    block('what_counts', 'g-que-cuenta', {
      paragraphs: [
        tx('employment.guide.what_counts.lead'),
        tx('employment.guide.what_counts.in_kind'),
        tx('employment.guide.what_counts.absorption'),
        tx('employment.guide.what_counts.review'),
      ],
      rules: ['smi_annual', 'smi_in_kind_cap', 'smi_absorption'],
    }),
    block('modalities', 'g-tipos-de-contrato', {
      paragraphs: [
        tx('employment.guide.modalities.lead', { desde: reform }),
        tx('employment.guide.modalities.written'),
        tx('employment.guide.modalities.before_reform', { hasta: reformEve }),
      ],
      list: [
        tx('employment.guide.modalities.production'),
        `${tx('employment.guide.modalities.occasional')} ${withNorm('law1_2025', 'employment.guide.modalities.agrifood')}`,
        tx('employment.guide.modalities.replacement'),
        tx('employment.guide.modalities.discontinuous'),
        tx('employment.guide.modalities.training'),
        tx('employment.guide.modalities.abolished', { desde: reform }),
      ],
      rules: [
        'fixed_term_presumption',
        'production_6_months',
        'production_occasional_90',
        'production_occasional_agrifood_120',
        'replacement_name_cause',
        'discontinuous_essentials',
        'training_alternance_duration',
        'training_practice_duration',
        'abolished_modalities',
        'written_form',
      ],
    }),
    block('permanent', 'g-paso-a-fijo', {
      // The quotes follow the first paragraph, each after the article it quotes.
      paragraphs: [
        tx('employment.guide.permanent.lead'),
        tx('employment.guide.permanent.certificate'),
        tx('employment.guide.permanent.review'),
      ],
      quotes: [
        quote('permanent_on_breach', 'employment.guide.permanent.quote_15_4'),
        quote(
          'chaining_18_in_24',
          'employment.guide.permanent.quote_15_5',
          'employment.guide.permanent.chaining',
        ),
        quote(
          'written_form',
          'employment.guide.permanent.quote_8_2',
          'employment.guide.permanent.not_written',
        ),
      ],
      rules: ['permanent_on_breach', 'chaining_18_in_24', 'written_form', 'temporary_certificate'],
    }),
    block('trial', 'g-periodo-de-prueba', {
      paragraphs: [
        tx('employment.guide.trial.lead'),
        tx('employment.guide.trial.void'),
        tx('employment.guide.trial.training'),
      ],
      list: [
        tx('employment.guide.trial.technicians'),
        tx('employment.guide.trial.others'),
        tx('employment.guide.trial.small_company'),
        tx('employment.guide.trial.temporary'),
      ],
      rules: [
        'trial_limits',
        'trial_temporary_1_month',
        'trial_void_same_duties',
        'training_practice_trial',
        'training_alternance_no_trial',
        'training_no_new_trial',
      ],
    }),
    block('working_time', 'g-jornada', {
      paragraphs: [
        tx('employment.guide.working_time.lead'),
        tx('employment.guide.working_time.record'),
      ],
      list: [
        tx('employment.guide.working_time.daily'),
        tx('employment.guide.working_time.rest'),
        tx('employment.guide.working_time.weekly_rest'),
        tx('employment.guide.working_time.break'),
        tx('employment.guide.working_time.night'),
        tx('employment.guide.working_time.overtime'),
      ],
      rules: [
        'weekly_40',
        'daily_9',
        'rest_12',
        'weekly_rest_36',
        'break_15',
        'night_limits',
        'overtime_cap_80',
        'overtime_value',
        'overtime_voluntary',
        'time_record',
        'special_working_time',
      ],
    }),
    block('part_time', 'g-tiempo-parcial', {
      paragraphs: [
        tx('employment.guide.part_time.lead'),
        tx('employment.guide.part_time.overtime'),
        tx('employment.guide.part_time.complementary'),
        tx('employment.guide.part_time.voluntary'),
      ],
      rules: [
        'part_time_contents',
        'part_time_no_overtime',
        'part_time_record',
        'complementary_hours',
        'voluntary_complementary',
      ],
    }),
    block('holidays_pay', 'g-vacaciones-y-pagas', {
      paragraphs: [
        tx('employment.guide.holidays_pay.holidays'),
        tx('employment.guide.holidays_pay.money'),
        tx('employment.guide.holidays_pay.extra_pays'),
        tx('employment.guide.holidays_pay.public_holidays'),
      ],
      rules: ['holidays_30', 'holidays_not_paid_out', 'extra_pays', 'public_holidays'],
    }),
    block('clauses', 'g-clausulas', {
      paragraphs: [tx('employment.guide.clauses.lead'), tx('employment.guide.clauses.review')],
      list: [
        tx('employment.guide.clauses.non_compete'),
        tx('employment.guide.clauses.exclusivity'),
        tx('employment.guide.clauses.retention'),
        tx('employment.guide.clauses.waiver'),
        withNorm('law10_2021', 'employment.guide.clauses.remote'),
      ],
      rules: [
        'non_compete',
        'exclusivity',
        'retention',
        'waiver',
        'partial_nullity',
        'remote_costs',
      ],
    }),
    block('information', 'g-informacion-por-escrito', {
      // Once repealed, the decree's sentence says so and nothing else of it is listed.
      paragraphs: [
        withNorm('rd723_2026', 'employment.guide.information.lead'),
        ...(rd723Stands
          ? [tx('employment.guide.information.when'), tx('employment.guide.information.review')]
          : []),
      ],
      list: rd723Stands ? INFO_ELEMENTS.map((e) => tx(`client.employment.info.${e}`)) : [],
      rules: ['info_elements', 'info_before_start', 'info_on_request', 'info_short_relations'],
    }),
    block('agreement', 'g-convenio', {
      paragraphs: [
        tx('employment.guide.agreement.lead'),
        tx('employment.guide.agreement.where'),
        tx('employment.guide.agreement.review'),
      ],
      rules: ['agreement_salary'],
      links: [{ label: tx('client.employment.link.regcon'), url: REGCON.url }],
    }),
  ];
}
