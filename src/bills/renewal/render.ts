import { formatCalculationEuros, formatInteger } from '../../calculator/number';
import { dayText, find } from '../../calculator/review-result';
import type { BillsNormId, NormTable } from '../../engine/bills/norms';
import type { Outcome, PvpcComparison, RenewalTaxes } from '../../engine/bills/renewal-official';
import type { RenewalReview } from '../../engine/bills/renewal-review';
import type { Notice, Split, TermSplit } from '../../engine/bills/renewal-types';
import { ruleSource, type BillsRuleId } from '../../engine/bills/rules';
import type { ClientKey, Translate } from '../../i18n/client';
import { sourceText } from '../result';

const PRICE = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
  useGrouping: 'always',
});
const SIGNED_EUROS = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
  signDisplay: 'exceptZero',
});
const SIGNED_PERCENT = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 1,
  useGrouping: 'always',
  signDisplay: 'exceptZero',
});
const PERCENT = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 8, useGrouping: 'always' });

const euros = formatCalculationEuros;
const signedEuros = (n: number): string => `${SIGNED_EUROS.format(n)} €`;
const percent = (n: number): string => `${PERCENT.format(n)} %`;

const daysText = (n: number, tr: Translate): string =>
  tr(n === 1 ? 'client.bills.unit.day_one' : 'client.bills.unit.day_many', {
    n: formatInteger(n),
  });

const perYear = (n: number, tr: Translate): string =>
  tr('client.bills.renewal.unit.per_kw_year', { n: PRICE.format(n) });
const perKwh = (n: number, tr: Translate): string =>
  tr('client.bills.renewal.unit.per_kwh', { n: PRICE.format(n) });

type Child = Node | string;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== null) node.className = className;
  node.append(...children);
  return node;
}

const list = (lines: readonly Child[]): HTMLUListElement =>
  el('ul', 'list', ...lines.map((line) => el('li', null, line)));

function card(title: string, ...body: Child[]): HTMLElement {
  return el('section', 'item', el('div', 'sheet', el('h3', 'item__title', title), ...body));
}

const note = (text: string): HTMLElement => el('p', 'item__note', text);

function link(url: string, text: string): HTMLAnchorElement {
  const a = el('a', null, text);
  a.href = url;
  a.rel = 'noopener';
  a.target = '_blank';
  return a;
}

const citations = (ids: readonly BillsNormId[], norms: NormTable): string =>
  ids.map((id) => norms[id].citation).join('; ');

// ---------- Cost and taxes ----------

function taxLines(taxes: RenewalTaxes, review: RenewalReview, norms: NormTable, tr: Translate) {
  const day = dayText(review.input.renewalDate);
  if (taxes.kind === 'missing')
    return [note(tr('client.bills.renewal.taxes.missing', { fecha: day }))];
  if (taxes.kind === 'ok') {
    const lines: Child[] = [
      tr('client.bills.renewal.taxes.ok', {
        importe: euros(taxes.withTax),
        impuesto: percent(taxes.electricityTaxPercent),
        iva: percent(taxes.vatPercent),
        fecha: day,
      }),
    ];
    const declared = review.input.declared.withTax;
    if (declared !== null && taxes.declaredMatches !== null)
      lines.push(
        tr(
          taxes.declaredMatches
            ? 'client.bills.renewal.taxes.declared_matches'
            : 'client.bills.renewal.taxes.declared_differs',
          { importe: euros(declared) },
        ),
      );
    return [list(lines)];
  }
  const deciding = [
    ...new Set(
      [...taxes.options.flatMap((o) => o.when), ...taxes.unknown].flatMap((w) => [
        ...w.met,
        ...w.notMet,
      ]),
    ),
  ];
  // What each norm has to do for the outcome to hold, in the words of its status. A norm already
  // spelled out in the block is only referred back to.
  const spelled = new Set<BillsNormId>();
  const normPhrase = (id: BillsNormId, holds: boolean): { text: string; plain: boolean } => {
    const norm = norms[id];
    const again = spelled.has(id);
    spelled.add(id);
    if (norm.status === 'pending_validation') {
      const key = holds
        ? 'client.bills.renewal.taxes.convalidated'
        : again
          ? 'client.bills.renewal.taxes.not_convalidated_again'
          : 'client.bills.renewal.taxes.not_convalidated';
      return { text: tr(key, { norma: norm.citation }), plain: true };
    }
    const { condition } = norm;
    if (norm.status === 'conditional' && condition !== undefined && condition.met === null) {
      const key = holds
        ? 'client.bills.renewal.taxes.cond_met'
        : again
          ? 'client.bills.renewal.taxes.cond_again'
          : 'client.bills.renewal.taxes.cond_not_met';
      return {
        text: tr(key, {
          norma: norm.citation,
          condicion: condition.text.charAt(0).toLowerCase() + condition.text.slice(1),
          fecha: dayText(condition.decidesOn),
        }),
        plain: true,
      };
    }
    return {
      text: tr('client.bills.renewal.taxes.decided_by', { norma: norm.citation }),
      plain: false,
    };
  };
  const outcomeText = ({ met, notMet }: Outcome): string => {
    const phrases = [
      ...met.map((id) => normPhrase(id, true)),
      ...notMet.map((id) => normPhrase(id, false)),
    ];
    const conditions = phrases.filter((p) => p.plain).map((p) => p.text);
    return [
      ...(conditions.length > 0
        ? [
            tr('client.bills.renewal.taxes.if', {
              condiciones: conditions.join(tr('client.bills.renewal.taxes.and')),
            }),
          ]
        : []),
      ...phrases.filter((p) => !p.plain).map((p) => p.text),
    ].join(', ');
  };
  // The option reached by most outcomes is not listed: it is what happens in all the others.
  const widest = taxes.options.reduce(
    (best, o) => (o.when.length > best.when.length ? o : best),
    taxes.options[0] ?? { when: [] },
  );
  const declared = review.input.declared.withTax;
  const matching =
    declared === null ? [] : taxes.options.filter((o) => Math.abs(declared - o.withTax) <= 1);
  return [
    note(
      tr('client.bills.renewal.taxes.conditional', {
        fecha: day,
        normas: citations(deciding, norms),
      }),
    ),
    ...taxes.options.map((option) => {
      const rest = taxes.options.length > 1 && taxes.unknown.length === 0 && option === widest;
      const figures = {
        importe: euros(option.withTax),
        impuesto: percent(option.electricityTaxPercent),
        iva: percent(option.vatPercent),
      };
      return el(
        'div',
        null,
        el(
          'p',
          null,
          tr(
            rest ? 'client.bills.renewal.taxes.option_rest' : 'client.bills.renewal.taxes.option',
            figures,
          ),
        ),
        ...(rest ? [] : [list(option.when.map(outcomeText))]),
      );
    }),
    ...(taxes.unknown.length > 0
      ? [
          note(tr('client.bills.renewal.taxes.unknown', { fecha: day })),
          list(taxes.unknown.map(outcomeText)),
        ]
      : []),
    ...(declared === null
      ? []
      : [
          note(
            matching.length === 0
              ? tr('client.bills.renewal.taxes.declared_none', { importe: euros(declared) })
              : tr('client.bills.renewal.taxes.declared_option', {
                  importe: euros(declared),
                  opciones: matching
                    .map((o) =>
                      tr('client.bills.renewal.taxes.rates', {
                        impuesto: percent(o.electricityTaxPercent),
                        iva: percent(o.vatPercent),
                      }),
                    )
                    .join(tr('client.bills.renewal.taxes.or')),
                }),
          ),
        ]),
  ];
}

function costCard(review: RenewalReview, norms: NormTable, tr: Translate): HTMLElement {
  const { recalc } = review.core;
  const title = tr('client.bills.renewal.title.cost');
  if (recalc.kind === 'no_consumption')
    return card(title, note(tr('client.bills.renewal.cost.no_consumption')));
  if (recalc.kind === 'needs_period_use')
    return card(title, note(tr('client.bills.renewal.cost.needs_period_use')));
  const lines: Child[] = [
    tr('client.bills.renewal.cost.current', { importe: euros(recalc.current) }),
    tr('client.bills.renewal.cost.next', { importe: euros(recalc.next) }),
    tr('client.bills.renewal.cost.rise', {
      porcentaje: `${SIGNED_PERCENT.format(recalc.risePercent)} %`,
    }),
  ];
  const declared = review.input.declared.withoutTax;
  if (recalc.mismatch !== null)
    lines.push(
      tr('client.bills.renewal.cost.mismatch', {
        declarado: euros(recalc.mismatch.declared),
        calculado: euros(recalc.mismatch.computed),
      }),
    );
  else if (declared !== null)
    lines.push(tr('client.bills.renewal.cost.matches', { declarado: euros(declared) }));
  return card(
    title,
    list(lines),
    ...(review.taxes === null ? [] : taxLines(review.taxes, review, norms, tr)),
  );
}

// ---------- Split ----------

const POWER_PERIODS = [
  ['p1', 'client.bills.renewal.split.power_p1'],
  ['p2', 'client.bills.renewal.split.power_p2'],
] as const;
const ENERGY_PERIODS = [
  ['p1', 'client.bills.renewal.split.energy_p1'],
  ['p2', 'client.bills.renewal.split.energy_p2'],
  ['p3', 'client.bills.renewal.split.energy_p3'],
] as const;

const splitLine = (
  label: ClientKey,
  term: TermSplit,
  unit: (n: number, tr: Translate) => string,
  tr: Translate,
): string =>
  tr('client.bills.renewal.split.row', {
    termino: tr(label),
    regulado: unit(term.regulated, tr),
    antes: unit(term.retailerCurrent, tr),
    despues: unit(term.retailerNext, tr),
  });

function splitCard(review: RenewalReview, norms: NormTable, tr: Translate): HTMLElement {
  const { split } = review.core;
  const title = tr('client.bills.renewal.title.split');
  const day = dayText(review.input.renewalDate);
  if (split.kind === 'missing_table')
    return card(
      title,
      note(tr('client.bills.renewal.split.missing_table', { fecha: dayText(split.day) })),
    );
  if (split.kind === 'conditional')
    return card(
      title,
      note(
        tr(
          split.norms.length === 1
            ? 'client.bills.renewal.split.conditional_one'
            : 'client.bills.renewal.split.conditional_many',
          { normas: citations(split.norms, norms) },
        ),
      ),
    );
  const single = 'all' in review.input.next.energy;
  return card(
    title,
    note(tr('client.bills.renewal.split.intro', { fecha: day })),
    list([
      ...POWER_PERIODS.map(([p, label]) => splitLine(label, split.power[p], perYear, tr)),
      ...ENERGY_PERIODS.map(([p, label]) => splitLine(label, split.energy[p], perKwh, tr)),
    ]),
    ...(single ? [note(tr('client.bills.renewal.split.single_price'))] : []),
    note(regulatedChangeText(split, review, tr)),
  );
}

function regulatedChangeText(
  split: Extract<Split, { kind: 'ok' }>,
  review: RenewalReview,
  tr: Translate,
): string {
  if (split.regulatedChange === null)
    return tr('client.bills.renewal.split.regulated_unknown', {
      fecha: dayText(review.input.letterDate),
    });
  return tr(
    split.regulatedChange
      ? 'client.bills.renewal.split.regulated_changed'
      : 'client.bills.renewal.split.regulated_same',
  );
}

// ---------- PVPC ----------

function pvpcCard(pvpc: PvpcComparison, tr: Translate): HTMLElement {
  const title = tr('client.bills.renewal.title.pvpc');
  if (pvpc.kind !== 'ok') return card(title, note(tr(`client.bills.renewal.pvpc.${pvpc.kind}`)));
  return card(
    title,
    list([
      tr('client.bills.renewal.pvpc.annual', {
        desde: dayText(pvpc.from),
        hasta: dayText(pvpc.to),
        importe: euros(pvpc.annual),
      }),
      tr('client.bills.renewal.pvpc.next', { importe: euros(pvpc.next) }),
      tr('client.bills.renewal.pvpc.difference', { diferencia: signedEuros(pvpc.difference) }),
    ]),
    note(tr('client.bills.renewal.pvpc.average')),
    ...(pvpc.doubt === null
      ? []
      : [
          note(
            tr('client.bills.renewal.pvpc.doubt', {
              motivo: tr(`client.bills.row.doubt.${pvpc.doubt}`),
            }),
          ),
        ]),
    note(tr('client.bills.renewal.pvpc.informative')),
  );
}

// ---------- Notice and exit ----------

// «Real Decreto 88/2026, art. 6.1.m (Real Decreto 88/2026, por el que…)» names its decree twice:
// the article alone says it.
export const citedOnce = (citation: string): string =>
  citation.replace(/^([^,]+), ([^(]+?) \(\1, .*\)$/, '$1, $2');

const ruleOrigin = (id: BillsRuleId, norms: NormTable, tr: Translate): HTMLElement => {
  const source = ruleSource(id, norms);
  return el(
    'p',
    'literal__link',
    link(source.url, citedOnce(source.citation)),
    ' · ',
    sourceText(source, tr),
  );
};

function noticeText(notice: Notice, review: RenewalReview, tr: Translate): string {
  const vars = {
    carta: dayText(review.input.letterDate),
    renovacion: dayText(review.input.renewalDate),
  };
  switch (notice.kind) {
    case 'meets':
    case 'short':
    case 'separate_unknown':
      return tr(`client.bills.renewal.notice.${notice.kind}`, {
        ...vars,
        dias: daysText(notice.days, tr),
      });
    case 'not_checked_before':
      return tr('client.bills.renewal.notice.not_checked_before', {
        ...vars,
        desde: dayText(notice.since),
      });
    case 'not_separate':
      return tr('client.bills.renewal.notice.not_separate', vars);
  }
}

// The rule's own words (art. 6.1.m) are quoted by the page, through <LegalQuote>, beside this
// card; here the source is linked with how it stands.
function noticeCard(review: RenewalReview, norms: NormTable, tr: Translate): HTMLElement {
  return card(
    tr('client.bills.renewal.title.notice'),
    el('p', null, noticeText(review.core.notice, review, tr)),
    ruleOrigin('change_notice', norms, tr),
  );
}

function exitCard(review: RenewalReview, norms: NormTable, tr: Translate): HTMLElement {
  const { exit } = review.core;
  return card(
    tr('client.bills.renewal.title.exit'),
    el(
      'p',
      null,
      tr(
        `client.bills.renewal.exit.${exit.kind}`,
        exit.kind === 'penalty_possible' ? { porcentaje: percent(exit.capPercent) } : undefined,
      ),
    ),
    ruleOrigin('exit_penalty', norms, tr),
  );
}

const UNCHECKED = [
  'client.bills.renewal.unchecked.content',
  'client.bills.renewal.unchecked.deadlines',
  'client.bills.renewal.unchecked.other',
] as const;

// ---------- Lead and page ----------

function leadText(review: RenewalReview, tr: Translate): string {
  const { recalc } = review.core;
  if (recalc.kind !== 'ok') return tr(`client.bills.renewal.lead.${recalc.kind}`);
  return tr('client.bills.renewal.lead.ok', {
    antes: euros(recalc.current),
    despues: euros(recalc.next),
    porcentaje: `${SIGNED_PERCENT.format(recalc.risePercent)} %`,
  });
}

// The review of a renewal letter, in the order the questions came: the letter's sums, where the
// rise comes from, the PVPC, the notice and the way out, and what is not checked. Nothing here
// advises: every card states figures and rules.
export function renderRenewalResult(
  root: HTMLElement,
  review: RenewalReview,
  norms: NormTable,
  tr: Translate,
): void {
  find(root, '[data-lead]').textContent = leadText(review, tr);
  find(root, '[data-renewal]').replaceChildren(
    costCard(review, norms, tr),
    splitCard(review, norms, tr),
    pvpcCard(review.pvpc, tr),
    noticeCard(review, norms, tr),
    exitCard(review, norms, tr),
    card(tr('client.bills.renewal.title.unchecked'), list(UNCHECKED.map((key) => tr(key)))),
  );
}
