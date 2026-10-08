import { addDays, parseDate, toIso } from '../engine/date';
import { normStanding, type Norm, type NormTable } from '../engine/rental/norms';
import { ruleSource, type RuleId } from '../engine/rental/rules';
import { t, type Key } from '../i18n';
import type { Lang } from '../i18n/languages';
import type { Variables } from '../i18n/interpolate';
import {
  DECREE_CAP,
  formatDay,
  formatEuros,
  formatLongDay,
  formatRate,
  type Example,
} from './rent-indices';

// The copy about the yearly cap that hangs on a norm's status, so a validation or a repeal in
// NORMS changes the page without touching it.

// The official reference-index system that RDL 29/2026, DF 6.ª.a points to.
export const REFERENCE_INDEX_URL = 'https://serpavi.mivau.gob.es/';

// Ley 12/2023, art. 3.k: who counts as a large landlord from 26-05-2023.
const LARGE_LANDLORD_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2023-12203#a3';

const DECREES = ['rdl8_2026', 'rdl26_2026', 'rdl29_2026'] as const;

const SHORT_NAME: Record<(typeof DECREES)[number], string> = {
  rdl8_2026: 'RDL 8/2026',
  rdl26_2026: 'RDL 26/2026',
  rdl29_2026: 'RDL 29/2026',
};

export interface Source {
  readonly citation: string;
  readonly url: string;
}

export interface CapRow {
  readonly id: string;
  readonly when: string;
  readonly rule: string;
  readonly sources: readonly Source[];
}

export interface CapsCopy {
  readonly rows: readonly CapRow[];
  readonly status: string;
  // Only while RDL 29/2026 has not been repealed.
  readonly now: string | null;
  readonly exampleLater: string | null;
  readonly repealed: string | null;
  readonly igcClamp: Source;
  readonly faqIravOrIpc: string;
  readonly faqNoClause: string;
}

// When a norm ruled, with the doubt about its last day when there is one: «del 22-03-2026 hasta
// el 29 o el 30-04-2026».
export const period = (lang: Lang, norm: Norm): string => {
  const tx = (key: Key, vars?: Variables) => t(lang, key, vars);
  const since = formatDay(norm.inForceSince);
  const until = norm.inForceUntil;
  if (until === null) return tx('rent_indices.span.since', { desde: since });
  const doubt = norm.endUncertainUntil;
  if (until === norm.inForceSince)
    return doubt
      ? tx('rent_indices.span.day_uncertain', { dia: since, dudoso: formatDay(doubt) })
      : tx('rent_indices.span.day', { dia: since });
  if (!doubt) return tx('rent_indices.span.range', { desde: since, hasta: formatDay(until) });
  const sameMonth = until.slice(0, 7) === doubt.slice(0, 7);
  return tx('rent_indices.span.range_uncertain', {
    desde: since,
    hasta: sameMonth ? until.slice(8) : formatDay(until),
    dudoso: formatDay(doubt),
  });
};

// Items that carry commas of their own, so they are set apart by semicolons.
const list = (items: readonly string[]): string => items.join('; ');

export function capsCopy(
  lang: Lang,
  norms: NormTable,
  { checkedOn, iravRate, example }: { checkedOn: string; iravRate: number; example: Example },
): CapsCopy {
  const tx = (key: Key, vars?: Variables) => t(lang, key, vars);
  const sources = (rules: readonly RuleId[]): Source[] =>
    rules.map((id) => {
      const { citation, url } = ruleSource(id, norms);
      return { citation, url };
    });

  const decree = norms.rdl29_2026;
  const name = SHORT_NAME.rdl29_2026;
  // Read on the day it was checked, or on its first day if that comes later.
  const day = checkedOn > decree.inForceSince ? checkedOn : decree.inForceSince;
  const standing = normStanding(decree, day);
  const live = standing === 'in_force' || standing === 'pending_validation';
  const statusShort = (norm: Norm) => tx(`rent_indices.status_short.${norm.status}`);

  const rows: CapRow[] = [
    {
      id: 'ipc',
      when: tx('rent_indices.cap.ipc.when'),
      rule: tx('rent_indices.cap.ipc.rule'),
      sources: sources(['cap_ipc']),
    },
    {
      id: 'igc',
      when: tx('rent_indices.cap.igc.when'),
      rule: tx('rent_indices.cap.igc.rule'),
      sources: sources(['cap_igc_2022', 'cap_igc_2022_extended', 'cap_igc_2023', 'igc_clamp']),
    },
    {
      id: 'three',
      when: tx('rent_indices.cap.three.when'),
      rule: tx('rent_indices.cap.three.rule'),
      sources: [
        ...sources(['cap_3_2024']),
        { citation: tx('rent_indices.large_landlord_source'), url: LARGE_LANDLORD_URL },
      ],
    },
    {
      id: 'irav',
      when: live
        ? tx('rent_indices.cap.irav.when_until', {
            hasta: formatDay(toIso(addDays(parseDate(decree.inForceSince), -1))),
          })
        : tx('rent_indices.cap.irav.when'),
      rule: tx('rent_indices.cap.irav.rule'),
      sources: sources(['cap_irav', 'cap_ipc']),
    },
    ...(live
      ? [
          {
            id: 'two',
            when: tx('rent_indices.cap.two.when', { desde: formatDay(decree.inForceSince) }),
            rule: tx('rent_indices.cap.two.rule'),
            sources: [
              ...sources(['cap_2_rdl29', 'irav_all_contracts', 'stressed_zone']),
              { citation: tx('rent_indices.reference_index'), url: REFERENCE_INDEX_URL },
            ],
          },
        ]
      : []),
  ];

  const status = tx(`rent_indices.status.${decree.status}`, {
    fecha: formatLongDay(checkedOn),
    norma: name,
    desde: formatLongDay(decree.inForceSince),
    estado: decree.statusSince ? formatDay(decree.statusSince) : '',
  });

  const repealedDecrees = DECREES.filter((id) => norms[id].status === 'repealed');
  const repealed =
    repealedDecrees.length === 0
      ? null
      : tx('rent_indices.repealed', {
          lista: list(
            repealedDecrees.map((id) =>
              tx('rent_indices.repealed_item', {
                norma: SHORT_NAME[id],
                periodo: period(lang, norms[id]),
              }),
            ),
          ),
        });

  const iravDecrees = (['rdl26_2026', 'rdl29_2026'] as const).map((id) =>
    tx('rent_indices.faq.no_clause_item', {
      norma: SHORT_NAME[id],
      periodo: period(lang, norms[id]),
      estado: statusShort(norms[id]),
    }),
  );

  const clamp = ruleSource('igc_clamp', norms);
  return {
    rows,
    status,
    now: live
      ? tx('rent_indices.now', {
          irav: formatRate(iravRate, 'irav'),
          norma: name,
          tope: iravRate > DECREE_CAP ? `${DECREE_CAP}\u00a0%` : formatRate(iravRate, 'irav'),
        })
      : null,
    exampleLater: live
      ? tx('rent_indices.example_later', {
          dia: formatLongDay(example.later),
          norma: name,
          renta: formatEuros(example.rent),
          maximo: formatEuros(example.maxRentLater),
        })
      : null,
    repealed,
    igcClamp: { citation: clamp.citation, url: clamp.url },
    faqIravOrIpc: live
      ? tx('rent_indices.faq.decree_live', {
          norma: name,
          desde: formatLongDay(decree.inForceSince),
          estado: statusShort(decree),
        })
      : tx('rent_indices.faq.decree_repealed', { norma: name, periodo: period(lang, decree) }),
    faqNoClause: list(iravDecrees),
  };
}
