import { toIso, type CivilDate } from '../engine/date';
import { formatCalculationEuros, formatDays, formatInteger } from '../calculator/number';
import type {
  CreditCalculation,
  CreditFigure,
  CreditPhrase,
  CreditPhraseKey,
} from '../engine/credit/calculation';
import type { CreditFinding, CreditItem, DoubtReading, FindingId } from '../engine/credit/finding';
import type { Indicator } from '../engine/credit/indicator';
import type { InformationBlock } from '../engine/credit/information';
import type { NormStatus } from '../engine/credit/norms';
import type { CreditReview } from '../engine/credit/review';
import { scopePhrases } from '../engine/credit/scope';
import type { Scope } from '../engine/credit/types';
import type { LawSource, NormSource } from '../engine/law/sources';
import type { ClientKey, Translate } from '../i18n/client';
import type { FieldError } from './form';

// «2027-02-01» → «01-02-2027».
export const dayText = (iso: string): string => iso.split('-').reverse().join('-');
export const civilDayText = (d: CivilDate): string => dayText(toIso(d));

// An APR to two decimals, «16,61 %»; a Bank of Spain average with the four it is published with.
const PERCENT = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
  useGrouping: 'always',
});
// A legal percentage as the law writes it: «1 %», «0,5 %».
const PLAIN_PERCENT = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 2,
  useGrouping: 'always',
});
const POINTS = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
});
const MONTH = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export const percentText = (n: number): string => `${PERCENT.format(n)} %`;
export const pointsText = (n: number): string => POINTS.format(n);

// «2019-02» → «febrero de 2019».
export function monthText(month: string): string {
  const [y = 0, m = 1] = month.split('-').map(Number);
  return MONTH.format(new Date(Date.UTC(y, m - 1, 1)));
}

const daysText = (n: number, tr: Translate): string =>
  tr(n === 1 ? 'client.credit.unit.day_one' : 'client.credit.unit.day_many', {
    n: formatDays(n),
  });

const monthsText = (n: number, tr: Translate): string =>
  tr(n === 1 ? 'client.credit.unit.month_one' : 'client.credit.unit.month_many', {
    n: formatInteger(n),
  });

// Phrases whose percentage is the law's own rate rather than a worked-out one.
const PLAIN_PERCENT_KEYS: ReadonlySet<CreditPhraseKey> = new Set([
  'early_repayment.base_with_interest',
  'early_repayment.base_principal',
]);
// Variables that count months.
const MONTH_VARS: ReadonlySet<string> = new Set(['months', 'term']);

function figureText(key: CreditPhraseKey, name: string, f: CreditFigure, tr: Translate): string {
  if (typeof f === 'number') return String(f);
  if ('percent' in f)
    return PLAIN_PERCENT_KEYS.has(key)
      ? `${PLAIN_PERCENT.format(f.percent)} %`
      : percentText(f.percent);
  if ('points' in f) return pointsText(f.points);
  if ('date' in f) return dayText(f.date);
  if ('month' in f) return monthText(f.month);
  if ('days' in f) return daysText(f.days, tr);
  if ('euros' in f) return formatCalculationEuros(f.euros);
  return MONTH_VARS.has(name) ? monthsText(f.integer, tr) : formatInteger(f.integer);
}

function phraseKey(p: CreditPhrase): ClientKey {
  const days = p.vars?.['days'];
  // A deadline open today reads as such, rather than as «0 días».
  if (
    p.key === 'withdrawal.days_left' &&
    typeof days === 'object' &&
    'days' in days &&
    days.days === 0
  )
    return 'client.credit.calculation.withdrawal.days_left_today';
  // A variable rate is read by its fixation period, not by its term.
  if (p.key === 'indicator.reference_loan' && p.vars?.['term'] === undefined)
    return 'client.credit.calculation.indicator.reference_loan_fixation';
  return `client.credit.calculation.${p.key}`;
}

export function phraseText(p: CreditPhrase, tr: Translate): string {
  const vars = Object.fromEntries(
    Object.entries(p.vars ?? {}).map(([name, v]) => [name, figureText(p.key, name, v, tr)]),
  );
  return tr(phraseKey(p), vars);
}

export const calculationLines = (c: CreditCalculation, tr: Translate): string[] =>
  c.map((p) => phraseText(p, tr));

function template(container: ParentNode, name: string): DocumentFragment {
  const t = container.querySelector<HTMLTemplateElement>(`template[data-template="${name}"]`);
  if (!t) throw new Error(`Missing template ${name}`);
  return t.content.cloneNode(true) as DocumentFragment;
}

function find<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

const listOf = (lines: readonly string[]): HTMLLIElement[] =>
  lines.map((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    return li;
  });

// ---------- Findings ----------

// What a finding comes to, in words: whether the APR matches, the euros over a cap, the days left.
export function statusText(f: CreditFinding, tr: Translate): string {
  const fecha = f.lastDay === null ? '' : dayText(f.lastDay);
  const importe = formatCalculationEuros(f.amount ?? 0);
  switch (f.status) {
    case 'contract_lower':
    case 'contract_higher':
      return tr(`client.credit.status.${f.status}`, {
        declarada: f.detail?.declared === null || !f.detail ? '' : percentText(f.detail.declared),
        calculada: f.detail ? percentText(f.detail.apr) : '',
      });
    case 'above_general_cap':
    case 'charged_without_basis':
      return tr(`client.credit.status.${f.status}`, { importe });
    case 'open':
      return f.daysLeft === 0
        ? tr('client.credit.status.open_today', { fecha })
        : tr('client.credit.status.open', { dias: daysText(f.daysLeft ?? 0, tr), fecha });
    case 'ended':
      return tr('client.credit.status.ended', { fecha });
    default:
      return tr(`client.credit.status.${f.status}`);
  }
}

export function indicatorStatusText(indicator: Indicator, tr: Translate): string {
  const puntos =
    indicator.points === null
      ? ''
      : tr('client.credit.unit.points', { n: pointsText(indicator.points) });
  return tr(`client.credit.indicator.status.${indicator.status}`, { puntos });
}

const NORM_STATUS: Record<NormStatus, ClientKey> = {
  in_force: 'client.credit.norm.in_force',
  pending_validation: 'client.credit.norm.pending_validation',
  repealed: 'client.credit.norm.repealed',
  draft: 'client.credit.norm.draft',
  conditional: 'client.credit.norm.conditional',
};

// How a norm stands today; a draft has no day it took effect, since it never has.
export function normStatusText(s: NormSource<NormStatus>, tr: Translate): string {
  const status = tr(NORM_STATUS[s.status], {
    fecha: s.statusSince ? dayText(s.statusSince) : '',
  });
  if (s.status === 'draft') return status;
  return `${tr('client.credit.source.since', { desde: dayText(s.inForceSince) })} · ${status}`;
}

// A court's criterion is shown as such, never as law, with the day it was last read and whether
// what is taken from it was read in the ruling itself.
export function lawSourceText(s: LawSource, tr: Translate): string {
  const basis = tr(`client.credit.source.${s.basis}`);
  if (s.basis !== 'case_law') return basis;
  const checked = tr('client.credit.source.checked', { fecha: dayText(s.lastVerified) });
  return s.verified
    ? `${basis} · ${checked}`
    : `${basis} · ${checked} · ${tr('client.credit.source.case_law_unverified')}`;
}

interface RuleLine {
  readonly id: string;
  readonly citation: string;
  readonly url: string;
  readonly status: string;
  readonly state: string;
}

const normLine = (s: NormSource<NormStatus>, tr: Translate): RuleLine => ({
  id: s.id,
  citation: s.citation,
  url: s.url,
  status: normStatusText(s, tr),
  state: s.status,
});

const lawLine = (s: LawSource, tr: Translate): RuleLine => ({
  id: s.id,
  citation: s.citation,
  url: s.url,
  status: lawSourceText(s, tr),
  state: s.basis,
});

// Each rule an item rests on: the norm or ruling and article, a link to it and how it stands.
function renderRules(container: ParentNode, card: HTMLElement, lines: readonly RuleLine[]) {
  const unique = lines.filter((l, i) => lines.findIndex((o) => o.id === l.id) === i);
  const list = find(card, '[data-rules]');
  list.hidden = unique.length === 0;
  find(card, '[data-rules-title]').hidden = unique.length === 0;
  list.replaceChildren(
    ...unique.map((l) => {
      const li = template(container, 'rule');
      const a = find<HTMLAnchorElement>(li, 'a');
      a.href = l.url;
      a.textContent = l.citation;
      const status = find(li, '[data-rule-status]');
      status.dataset['status'] = l.state;
      status.textContent = l.status;
      return li;
    }),
  );
}

// Each card takes the colour and number of the tab that asks for its answers.
type Tone = 'salary' | 'settlement' | 'dates';
const TONE: Record<FindingId | 'indicator', Tone> = {
  apr: 'salary',
  indicator: 'salary',
  early_repayment: 'settlement',
  dealer_discount: 'settlement',
  withdrawal: 'dates',
};
const TAB_NUMBER: Record<Tone, string> = { salary: '02', settlement: '03', dates: '04' };

const markId = (state: string): string => `#credit-mark-${state.replace(/_/g, '-')}`;

interface Card {
  readonly id: FindingId | 'indicator';
  readonly state: string;
  readonly status: string;
  readonly calculation: readonly string[];
  readonly rules: readonly RuleLine[];
  // A point the person did not know, and the result in each of its readings.
  readonly depends: string | null;
  readonly readings: readonly {
    readonly title: string;
    readonly status: string;
    readonly calculation: readonly string[];
  }[];
}

function renderCard(container: ParentNode, c: Card, position: number, tr: Translate) {
  const frag = template(container, 'item');
  const card = find(frag, '[data-item]');
  const titleId = `credit-item-${position}`;
  card.dataset['item'] = c.id;
  card.dataset['state'] = c.state;
  card.dataset['tone'] = TONE[c.id];
  find(card, '[data-tab-number]').textContent = TAB_NUMBER[TONE[c.id]];
  card.setAttribute('aria-labelledby', titleId);
  const title = find(card, '[data-title]');
  title.id = titleId;
  title.textContent = tr(`client.credit.item.${c.id}`);
  find(card, '[data-mark] use').setAttributeNS(null, 'href', markId(c.state));
  find(card, '[data-status-text]').textContent = c.status;
  const depends = find(card, '[data-depends]');
  depends.hidden = c.depends === null;
  depends.textContent = c.depends ?? '';
  const calculation = find(card, '[data-calculation]');
  calculation.hidden = c.calculation.length === 0;
  calculation.replaceChildren(...listOf(c.calculation));
  find(card, '[data-readings]').replaceChildren(
    ...c.readings.map((r) => {
      const reading = template(container, 'reading');
      find(reading, '[data-reading-title]').textContent = r.title;
      find(reading, '[data-reading-status]').textContent = r.status;
      find(reading, '[data-calculation]').replaceChildren(...listOf(r.calculation));
      return reading;
    }),
  );
  renderRules(container, card, c.rules);
  return frag;
}

// «Si el seguro era obligatorio · Si va un mes después» for a reading across two points.
export const readingTitle = (when: DoubtReading, tr: Translate): string =>
  when
    .split('.')
    .map((part) =>
      tr(`client.credit.reading.${part as Exclude<DoubtReading, `${string}.${string}`>}`),
    )
    .join(' · ');

function itemCard(item: CreditItem, tr: Translate): Card {
  if (item.kind === 'single') {
    const f = item.finding;
    return {
      id: f.id,
      state: f.status,
      status: statusText(f, tr),
      calculation: calculationLines(f.calculation, tr),
      rules: f.sources.map((s) => normLine(s, tr)),
      depends: null,
      readings: [],
    };
  }
  const [first] = item.readings;
  return {
    id: first?.finding.id ?? 'apr',
    state: 'depends',
    status: tr('client.credit.status.depends'),
    calculation: [],
    rules: item.readings.flatMap((r) => r.finding.sources.map((s) => normLine(s, tr))),
    depends: tr(`client.credit.depends.${item.question}`),
    readings: item.readings.map((r) => ({
      title: readingTitle(r.when, tr),
      status: statusText(r.finding, tr),
      calculation: calculationLines(r.finding.calculation, tr),
    })),
  };
}

const indicatorCard = (indicator: Indicator, tr: Translate): Card => ({
  id: 'indicator',
  state: indicator.status,
  status: indicatorStatusText(indicator, tr),
  calculation: calculationLines(indicator.calculation, tr),
  rules: indicator.sources.map((s) => lawLine(s, tr)),
  depends: null,
  readings: [],
});

// ---------- Information ----------

function renderInformation(
  container: ParentNode,
  blocks: readonly InformationBlock[],
  tr: Translate,
) {
  find(container, '[data-information]').replaceChildren(
    ...blocks.map((b) => {
      const frag = template(container, 'information');
      find(frag, '[data-info-title]').textContent = tr(`client.credit.info.${b.id}`);
      find(frag, '[data-info-text]').textContent = calculationLines(b.calculation, tr).join(' ');
      const links = find(frag, '[data-info-links]');
      links.replaceChildren(
        ...b.sources.map((s) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = s.url;
          a.rel = 'noopener';
          a.target = '_blank';
          a.textContent = s.citation;
          li.append(a);
          return li;
        }),
      );
      links.hidden = b.sources.length === 0;
      return frag;
    }),
  );
}

function renderUnchecked(container: ParentNode, review: CreditReview, tr: Translate) {
  find(container, '[data-unchecked]').replaceChildren(
    ...listOf(review.unchecked.map((code) => tr(`client.credit.unchecked.${code}`))),
  );
}

// ---------- Result ----------

const inScopeParts = (root: ParentNode) => [
  ...root.querySelectorAll<HTMLElement>('[data-in-scope]'),
];

// The APR first, then where it stands against the average rate, the early repayment and the
// withdrawal period; each with its calculation and its rules. The indicator is free and whole, and
// nothing here is locked.
export function renderCreditResult(root: HTMLElement, review: CreditReview, tr: Translate): void {
  find(root, '[data-out-of-scope]').hidden = true;
  for (const el of inScopeParts(root)) el.hidden = false;
  const scopeNote = scopePhrases(review.scope).map((p) => phraseText(p, tr));
  find(root, '[data-lead]').textContent =
    scopeNote.length > 0 ? scopeNote.join(' ') : tr('client.credit.result.lead');
  const [first, ...rest] = review.items.map((item) => itemCard(item, tr));
  const indicator = review.indicator === null ? [] : [indicatorCard(review.indicator, tr)];
  const cards = [...(first ? [first] : []), ...indicator, ...rest];
  find(root, '[data-items]').replaceChildren(...cards.map((c, i) => renderCard(root, c, i, tr)));
  renderInformation(root, review.information, tr);
  renderUnchecked(root, review, tr);
}

// A credit the review does not cover: why, and nothing worked out.
export function renderOutOfScope(root: HTMLElement, reach: Scope, tr: Translate): void {
  for (const el of inScopeParts(root)) el.hidden = true;
  find(root, '[data-items]').replaceChildren();
  find(root, '[data-information]').replaceChildren();
  find(root, '[data-lead]').textContent = tr('client.credit.result.lead_out_of_scope');
  const box = find(root, '[data-out-of-scope]');
  box.hidden = false;
  find(box, '[data-out-of-scope-status]').textContent = tr('client.credit.status.out_of_scope');
  find(box, '[data-out-of-scope-reason]').textContent = scopePhrases(reach)
    .map((p) => phraseText(p, tr))
    .join(' ');
}

export function renderErrors(
  form: HTMLFormElement,
  errors: readonly FieldError[],
  tr: Translate,
): void {
  for (const p of form.querySelectorAll<HTMLElement>('[data-error-for]')) {
    p.textContent = '';
    p.hidden = true;
  }
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  for (const el of form.querySelectorAll<HTMLElement>('[data-has-error]'))
    delete el.dataset['hasError'];
  for (const { field, code } of errors) {
    const p = form.querySelector<HTMLElement>(`[data-error-for="${field}"]`);
    if (p) {
      p.textContent = tr(`client.credit.error.${code}`);
      p.hidden = false;
      p.closest<HTMLElement>('[data-field]')?.setAttribute('data-has-error', '');
    }
    for (const el of form.querySelectorAll(`[name="${field}"]`))
      el.setAttribute('aria-invalid', 'true');
  }
}
