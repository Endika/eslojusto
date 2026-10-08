import { addDays, parseDate, toIso } from '../engine/date';
import type { Norm, NormTable } from '../engine/rental/norms';
import { ruleSource, type RuleId } from '../engine/rental/rules';
import { t, type Key } from '../i18n';
import type { Lang } from '../i18n/languages';
import type { Variables } from '../i18n/interpolate';
import { REFERENCE_INDEX_URL, period } from './rent-caps';
import { formatDay, formatLongDay } from './rent-indices';

// The guide on /alquiler/: each block's text, the norms it rests on and how each stands, read from
// the norm table so a validation or a repeal changes the page without touching it.

export interface GuideSource {
  readonly citation: string;
  readonly url: string;
  readonly status: string;
  readonly statusCode: string;
}

export interface GuideLink {
  readonly label: string;
  readonly url: string;
}

export type GuideBlockId =
  'fees' | 'guarantees' | 'update' | 'charges' | 'return' | 'zones' | 'term' | 'regional';

export interface GuideBlock {
  readonly id: GuideBlockId;
  // The block's id on the page, a URL fragment that keeps its Spanish name.
  readonly anchor: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  // Shown as a list after the first paragraph, when the block has one.
  readonly list: readonly string[];
  readonly sources: readonly GuideSource[];
  readonly links: readonly GuideLink[];
}

export type Decree = 'rdl29_2026' | 'rdl28_2026';

const DECREE_NAME: Record<Decree, string> = {
  rdl29_2026: 'Real Decreto-ley 29/2026',
  rdl28_2026: 'Real Decreto-ley 28/2026',
};

const NORM_STATUS = {
  in_force: 'client.rental.norm.in_force',
  pending_validation: 'client.rental.norm.pending_validation',
  repealed: 'client.rental.norm.repealed',
} as const;

export function rentalGuide(
  lang: Lang,
  norms: NormTable,
  { checkedOn, legalInterest }: { checkedOn: string; legalInterest: LegalInterestSummary },
): readonly GuideBlock[] {
  const tx = (key: Key, vars?: Variables) => t(lang, key, vars);
  const sources = (rules: readonly RuleId[]): GuideSource[] =>
    rules.map((id) => {
      const s = ruleSource(id, norms);
      return {
        citation: s.citation,
        url: s.url,
        statusCode: s.status,
        status: tx(NORM_STATUS[s.status], { fecha: s.statusSince ? formatDay(s.statusSince) : '' }),
      };
    });
  const withDecree = (key: Key, id: Decree, vars?: Variables): string =>
    decreeSentence(lang, norms, key, id, checkedOn, vars);
  // The day RDL 29/2026 took effect and the one before, while it stands; once repealed, the 2023
  // wording runs on with no end.
  const rdl29 = norms.rdl29_2026;
  const rdl29Stands = rdl29.status !== 'repealed';
  const rdl29Since = formatLongDay(rdl29.inForceSince);
  const rdl29Eve = formatLongDay(toIso(addDays(parseDate(rdl29.inForceSince), -1)));

  const block = (
    id: GuideBlockId,
    anchor: string,
    parts: {
      paragraphs: readonly string[];
      list?: readonly string[];
      rules: readonly RuleId[];
      links?: readonly GuideLink[];
    },
  ): GuideBlock => ({
    id,
    anchor,
    title: tx(`rental.guide.${id}.title`),
    paragraphs: parts.paragraphs,
    list: parts.list ?? [],
    sources: sources(parts.rules),
    links: parts.links ?? [],
  });

  return [
    block('fees', 'g-honorarios', {
      paragraphs: [
        tx('rental.guide.fees.lead'),
        rdl29Stands
          ? tx('rental.guide.fees.other_names', { desde: rdl29Since })
          : tx('rental.guide.fees.other_names_open'),
      ],
      list: [
        tx('rental.guide.fees.2019'),
        rdl29Stands
          ? tx('rental.guide.fees.2023', { hasta: rdl29Eve })
          : tx('rental.guide.fees.2023_open'),
        withDecree('rental.guide.fees.2026', 'rdl29_2026', { desde: rdl29Since }),
      ],
      rules: ['fees_2019', 'fees_2023', 'fees_2026'],
    }),
    block('guarantees', 'g-fianza', {
      paragraphs: [
        tx('rental.guide.guarantees.deposit'),
        tx('rental.guide.guarantees.extra'),
        tx('rental.guide.guarantees.advance'),
        withDecree('rental.guide.guarantees.insurance', 'rdl29_2026'),
        tx('rental.guide.guarantees.money'),
      ],
      rules: ['deposit_one_month', 'guarantee_cap', 'advance_cap', 'insurance_ban'],
    }),
    // Its table of caps comes from the same copy as the indices page; the view places it.
    block('update', 'g-subidas', {
      paragraphs: [tx('rental.guide.update.clause'), tx('rental.guide.update.notice')],
      rules: ['update_clause', 'update_clause_rdl29', 'update_notice'],
    }),
    block('charges', 'g-gastos', {
      paragraphs: [
        tx('rental.guide.charges.pact'),
        tx('rental.guide.charges.increase'),
        tx('rental.guide.charges.meters'),
        withDecree('rental.guide.charges.taxes', 'rdl29_2026'),
      ],
      rules: ['charges_pact', 'charges_increase', 'charges_meters', 'taxes_ban'],
    }),
    block('return', 'g-devolucion', {
      paragraphs: [
        tx('rental.guide.return.month'),
        tx('rental.guide.return.rate', {
          tipo: `${legalInterest.rate.toLocaleString('es-ES')}\u00a0%`,
          desde: String(legalInterest.since),
        }),
        tx('rental.guide.return.deductions'),
        withDecree('rental.guide.return.closing', 'rdl29_2026'),
      ],
      rules: ['deposit_interest', 'legal_interest_rate', 'closing_document'],
      links: [{ label: tx('rental.guide.source_bde'), url: legalInterest.url }],
    }),
    block('zones', 'g-zonas', {
      paragraphs: [
        tx('rental.guide.zones.declared'),
        withDecree('rental.guide.zones.rise', 'rdl29_2026'),
        tx('rental.guide.zones.unchecked'),
      ],
      rules: ['stressed_zone', 'cap_2_rdl29'],
      links: [{ label: tx('rental.guide.zones.link'), url: REFERENCE_INDEX_URL }],
    }),
    block('term', 'g-prorrogas', {
      paragraphs: [
        tx('rental.guide.term.minimum'),
        tx('rental.guide.term.tacit'),
        withDecree('rental.guide.term.extension', 'rdl29_2026', { desde: rdl29Since }),
        withDecree('rental.guide.term.rdl28', 'rdl28_2026'),
        tx('rental.guide.term.unchecked'),
      ],
      rules: ['term_minimum', 'term_tacit', 'extension_rdl29', 'term_rdl28'],
    }),
    block('regional', 'g-comunidades', {
      paragraphs: [tx('rental.guide.regional.state'), tx('rental.guide.regional.lodging')],
      rules: ['deposit_lodging'],
    }),
  ];
}

// «el Real Decreto-ley 29/2026, en vigor desde el 8 de octubre de 2026 y pendiente de que el
// Congreso lo convalide,»: the decree with how it stands on the day the page was checked.
function decreeClause(lang: Lang, norms: NormTable, id: Decree, checkedOn: string): string {
  const norm = norms[id];
  return t(
    lang,
    checkedOn < norm.inForceSince ? 'rental.guide.decree_upcoming' : 'rental.guide.decree_live',
    {
      norma: DECREE_NAME[id],
      desde: formatLongDay(norm.inForceSince),
      estado: t(lang, `rent_indices.status_short.${norm.status}`),
    },
  );
}

// A sentence that rests on a decree: with its status while it stands, or the plain fact of its
// repeal once the Congress voted it down.
export function decreeSentence(
  lang: Lang,
  norms: NormTable,
  key: Key,
  id: Decree,
  checkedOn: string,
  vars: Variables = {},
): string {
  const norm = norms[id];
  if (neverInForce(norm)) return t(lang, 'rental.guide.decree_never', { norma: DECREE_NAME[id] });
  return norm.status === 'repealed'
    ? t(lang, 'rental.guide.decree_repealed', {
        norma: DECREE_NAME[id],
        periodo: period(lang, norm),
      })
    : t(lang, key, { ...vars, decreto: decreeClause(lang, norms, id, checkedOn) });
}

// A decree the Congress voted down before the day it was to take effect, even at its doubtful end:
// it never applied, as normStanding reads it too.
export const neverInForce = (norm: Norm): boolean => {
  const lastDay = norm.endUncertainUntil ?? norm.inForceUntil;
  return norm.status === 'repealed' && lastDay !== null && lastDay < norm.inForceSince;
};

// The legal interest the guide names: the latest year's rate and the first year it has held.
export interface LegalInterestSummary {
  readonly rate: number;
  readonly since: number;
  readonly url: string;
}

export function legalInterestSummary(
  years: readonly { readonly year: number; readonly rate: number; readonly url: string }[],
): LegalInterestSummary {
  const latest = years.at(-1);
  if (!latest) throw new Error('The rental guide needs the legal interest table.');
  let since = latest.year;
  for (let i = years.length - 2; i >= 0 && years[i]?.rate === latest.rate; i -= 1)
    since = years[i]?.year ?? since;
  return { rate: latest.rate, since, url: latest.url };
}
