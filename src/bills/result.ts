import { formatCalculationEuros, formatDays, formatInteger } from '../calculator/number';
import { dayText, find, listOf, template, renderFieldErrors } from '../calculator/review-result';
import type { BillsFigure, BillsPhrase } from '../engine/bills/calculation';
import type {
  BillFinding,
  BillItem,
  BillTotals,
  BillsItemId,
  BillsStatus,
  HandsetReading,
  OfficialReading,
} from '../engine/bills/finding';
import type { NormStatus, NormTable } from '../engine/bills/norms';
import type { RowCitation } from '../engine/bills/period';
import { scopePhrases } from '../engine/bills/scope';
import type { ElectricityScope, TelecomScope } from '../engine/bills/types';
import type { ValidationCode } from '../engine/bills/validate';
import type { NormSource } from '../engine/law/sources';
import type { ClientKey, Translate } from '../i18n/client';

// What the electricity and the telecom results draw the same way: each line's verdict with its
// calculation, the rules and table rows it rests on, the totals and the gate.

const PRICE = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
  useGrouping: 'always',
});
const QUANTITY = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 3,
  useGrouping: 'always',
});
// A rate as the norm writes it: «21 %», «5,11269632 %».
const PERCENT = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 8, useGrouping: 'always' });

const PRICE_UNIT: Record<'per_kw_day' | 'per_kw_year' | 'per_kwh', ClientKey> = {
  per_kw_day: 'client.bills.unit.per_kw_day',
  per_kw_year: 'client.bills.unit.per_kw_year',
  per_kwh: 'client.bills.unit.per_kwh',
};

const daysText = (n: number, tr: Translate): string =>
  tr(n === 1 ? 'client.bills.unit.day_one' : 'client.bills.unit.day_many', { n: formatDays(n) });

const monthsText = (n: number, tr: Translate): string =>
  tr(n === 1 ? 'client.bills.unit.month_one' : 'client.bills.unit.month_many', {
    n: formatInteger(n),
  });

// Integers that name something other than a count: a meter's phases, a year, a commitment's months.
function integerText(name: string, n: number, tr: Translate): string {
  if (name === 'phase') return tr(n === 1 ? 'client.bills.unit.single' : 'client.bills.unit.three');
  if (name === 'year') return String(n);
  if (name === 'months' || name === 'maximum') return monthsText(n, tr);
  return formatInteger(n);
}

function figureText(name: string, f: BillsFigure, tr: Translate): string {
  if (typeof f === 'number') return String(f);
  if ('price' in f) return tr(PRICE_UNIT[f.unit], { n: PRICE.format(f.price) });
  if ('kw' in f) return tr('client.bills.unit.kw', { n: QUANTITY.format(f.kw) });
  if ('kwh' in f) return tr('client.bills.unit.kwh', { n: QUANTITY.format(f.kwh) });
  if ('percent' in f) return `${PERCENT.format(f.percent)} %`;
  if ('date' in f) return dayText(f.date);
  if ('days' in f) return daysText(f.days, tr);
  if ('euros' in f) return formatCalculationEuros(f.euros);
  return integerText(name, f.integer, tr);
}

// Phrases worded otherwise when one of their figures is missing.
function phraseKey(p: BillsPhrase): ClientKey {
  const has = (name: string) => p.vars?.[name] !== undefined;
  if (p.key === 'power.max_used' && !has('p2')) return 'client.bills.calculation.power.max_used_p1';
  if (p.key === 'power.max_used' && !has('p1')) return 'client.bills.calculation.power.max_used_p2';
  if (p.key === 'tax.wrong_rate' && !has('percent'))
    return 'client.bills.calculation.tax.wrong_rate_unprinted';
  return `client.bills.calculation.${p.key}`;
}

export function phraseText(p: BillsPhrase, tr: Translate): string {
  const vars = Object.fromEntries(
    Object.entries(p.vars ?? {}).map(([name, v]) => [name, figureText(name, v, tr)]),
  );
  return tr(phraseKey(p), vars);
}

export const calculationLines = (c: readonly BillsPhrase[], tr: Translate): string[] =>
  c.map((p) => phraseText(p, tr));

// ---------- Statuses ----------

// Statuses that say which way the bill is off.
const DIRECTED = [
  'does_not_add_up',
  'differs_from_official',
  'wrong_rate_for_date',
  'different_base',
] as const;
type Directed = (typeof DIRECTED)[number];
const isDirected = (status: BillsStatus): status is Directed =>
  (DIRECTED as readonly BillsStatus[]).includes(status);

// A line's verdict in words, with its euros when it has them: charged short reads as plainly as
// charged over.
export function statusText(f: BillFinding, tr: Translate): string {
  const importe = f.amount === null ? '' : formatCalculationEuros(f.amount);
  if (isDirected(f.status) && f.amount !== null && f.direction !== null)
    return tr(`client.bills.status.${f.status}_${f.direction}`, { importe });
  if (f.status === 'review_it' && f.amount !== null)
    return tr('client.bills.status.review_it_amount', { importe });
  return tr(`client.bills.status.${f.status}`, { importe });
}

const READING: Record<OfficialReading | HandsetReading, ClientKey> = {
  lower_value: 'client.bills.reading.lower_value',
  higher_value: 'client.bills.reading.higher_value',
  whole_value: 'client.bills.reading.whole_value',
  prorated_value: 'client.bills.reading.prorated_value',
};

// ---------- Sources ----------

const NORM_STATUS: Record<NormStatus, ClientKey> = {
  in_force: 'client.bills.norm.in_force',
  pending_validation: 'client.bills.norm.pending_validation',
  repealed: 'client.bills.norm.repealed',
  draft: 'client.bills.norm.draft',
  conditional: 'client.bills.norm.conditional',
};

// When the article took effect, until when, and how its norm stands today. A wording with an end
// date says when it applied: «en vigor» would speak of the whole norm.
export function sourceText(s: NormSource<NormStatus>, tr: Translate): string {
  const status = tr(NORM_STATUS[s.status], { fecha: s.statusSince ? dayText(s.statusSince) : '' });
  const since = dayText(s.inForceSince);
  const period =
    s.inForceUntil === null
      ? tr('client.bills.source.since', { desde: since })
      : tr('client.bills.source.between', { desde: since, hasta: dayText(s.inForceUntil) });
  return s.inForceUntil !== null && s.status === 'in_force' ? period : `${period} · ${status}`;
}

// A table row a figure rests on: the norm, the days it covers, and a condition still open or how
// it was settled.
export function rowText(row: RowCitation, norms: NormTable, tr: Translate): string {
  const since = dayText(row.from);
  const period =
    row.until === null
      ? tr('client.bills.source.since', { desde: since })
      : tr('client.bills.source.between', { desde: since, hasta: dayText(row.until) });
  const condition = norms[row.norm].condition;
  const standing =
    row.status !== 'conditional' || condition === undefined
      ? row.status === 'in_force'
        ? null
        : tr(NORM_STATUS[row.status], { fecha: '' })
      : condition.met === null
        ? tr('client.bills.row.condition_open', {
            condicion: condition.text,
            fecha: dayText(condition.decidesOn),
          })
        : tr(
            condition.met ? 'client.bills.row.condition_met' : 'client.bills.row.condition_not_met',
            {
              condicion: condition.text,
            },
          );
  const doubt = row.doubt === null ? null : tr(`client.bills.row.doubt.${row.doubt}`);
  return [period, standing, doubt].filter((part) => part !== null).join(' · ');
}

interface RuleLine {
  readonly id: string;
  readonly citation: string;
  readonly url: string;
  readonly status: string;
  readonly state: string;
}

const ruleLine = (s: NormSource<NormStatus>, tr: Translate): RuleLine => ({
  id: s.id,
  citation: s.citation,
  url: s.url,
  status: sourceText(s, tr),
  state: s.status,
});

const rowLine = (row: RowCitation, norms: NormTable, tr: Translate): RuleLine => ({
  id: `${row.norm}:${row.from}`,
  citation: norms[row.norm].citation,
  url: row.url,
  status: rowText(row, norms, tr),
  state: row.status,
});

function renderLinks(
  container: ParentNode,
  list: HTMLElement,
  title: HTMLElement,
  lines: readonly RuleLine[],
) {
  const unique = lines.filter((l, i) => lines.findIndex((o) => o.id === l.id) === i);
  list.hidden = unique.length === 0;
  title.hidden = unique.length === 0;
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

// ---------- Cards ----------

// Each card takes the colour and number of the tab that asks for its answers.
export interface Tone {
  readonly tone: string;
  readonly number: string;
}

export interface ItemLabels {
  // «Término de potencia · P1»: the item's name, with the line it is about when it has one.
  title(f: BillFinding): string;
  tone(id: BillsItemId): Tone;
}

interface Card {
  readonly finding: BillFinding;
  readonly state: string;
  readonly status: string;
  readonly calculation: readonly string[];
  readonly depends: string | null;
  readonly readings: readonly {
    readonly title: string;
    readonly status: string;
    readonly calculation: readonly string[];
  }[];
  readonly rules: readonly RuleLine[];
  readonly rows: readonly RuleLine[];
}

function itemCard(item: BillItem, norms: NormTable, tr: Translate): Card {
  if (item.kind === 'single') {
    const f = item.finding;
    return {
      finding: f,
      state: f.status,
      status: statusText(f, tr),
      calculation: calculationLines(f.calculation, tr),
      depends: null,
      readings: [],
      rules: f.sources.map((s) => ruleLine(s, tr)),
      rows: f.rows.map((r) => rowLine(r, norms, tr)),
    };
  }
  const findings = item.readings.map((r) => r.finding);
  const [first] = findings;
  if (first === undefined) throw new RangeError('A reading item with no reading');
  return {
    finding: first,
    state: 'depends',
    status: tr('client.bills.status.depends'),
    calculation: [],
    depends: tr(`client.bills.depends.${item.question}`),
    readings: item.readings.map((r) => ({
      title: tr(READING[r.when]),
      status: statusText(r.finding, tr),
      calculation: calculationLines(r.finding.calculation, tr),
    })),
    rules: findings.flatMap((f) => f.sources.map((s) => ruleLine(s, tr))),
    rows: findings.flatMap((f) => f.rows.map((r) => rowLine(r, norms, tr))),
  };
}

const markId = (state: string): string => `#bills-mark-${state.replace(/_/g, '-')}`;

function renderCard(
  container: ParentNode,
  c: Card,
  position: number,
  labels: ItemLabels,
): DocumentFragment {
  const frag = template(container, 'item');
  const card = find(frag, '[data-item]');
  const titleId = `bills-item-${position}`;
  const { tone, number } = labels.tone(c.finding.id);
  card.dataset['item'] = c.finding.id;
  card.dataset['state'] = c.state;
  card.dataset['tone'] = tone;
  find(card, '[data-tab-number]').textContent = number;
  card.setAttribute('aria-labelledby', titleId);
  const title = find(card, '[data-title]');
  title.id = titleId;
  title.textContent = labels.title(c.finding);
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
  renderLinks(container, find(card, '[data-rules]'), find(card, '[data-rules-title]'), c.rules);
  renderLinks(container, find(card, '[data-rows]'), find(card, '[data-rows-title]'), c.rows);
  return frag;
}

export function renderItems(
  root: HTMLElement,
  items: readonly BillItem[],
  norms: NormTable,
  labels: ItemLabels,
  tr: Translate,
): void {
  find(root, '[data-items]').replaceChildren(
    ...items.map((item, i) => renderCard(root, itemCard(item, norms, tr), i, labels)),
  );
}

// ---------- Summary ----------

// Statuses that leave a line still to look at: the summary never reads as all clear beside them.
const OPEN: ReadonlySet<BillsStatus> = new Set([
  'does_not_add_up',
  'differs_from_official',
  'not_on_bill',
  'tariff_not_allowed',
  'above_legal_maximum',
  'review_it',
  'not_checkable',
  'pending_official_data',
]);

export type SummaryKind = 'over' | 'open' | 'clear';

// What the lead says: euros over the norm, lines still to look at, or every line matching.
export function summaryKind(items: readonly BillItem[], totals: BillTotals): SummaryKind {
  if (totals.counted > 0) return 'over';
  const open = items.some(
    (item) =>
      item.kind === 'readings' ||
      OPEN.has(item.finding.status) ||
      item.finding.pendingOn.length > 0,
  );
  return open || totals.under > 0 || totals.upTo > 0 ? 'open' : 'clear';
}

// The totals: what is over the norm in every reading, the most any reading gives, and what is
// charged short, apart and never set against the rest.
export function renderTotals(root: HTMLElement, totals: BillTotals, tr: Translate): void {
  const box = find(root, '[data-totals]');
  find(box, '[data-total-counted]').textContent = formatCalculationEuros(totals.counted);
  const upTo = find(box, '[data-total-up-to]');
  upTo.hidden = totals.upTo <= totals.counted;
  upTo.textContent = tr('client.bills.total.up_to', {
    importe: formatCalculationEuros(totals.upTo),
  });
  const under = find(box, '[data-total-under]');
  under.hidden = totals.under <= 0;
  under.textContent = tr('client.bills.total.under', {
    importe: formatCalculationEuros(totals.under),
  });
}

export function renderUnchecked(root: HTMLElement, lines: readonly string[]): void {
  find(root, '[data-unchecked]').replaceChildren(...listOf(lines));
}

// ---------- Gate ----------

const inScopeParts = (root: ParentNode) => [
  ...root.querySelectorAll<HTMLElement>('[data-in-scope]'),
];

export function showInScope(root: HTMLElement): void {
  find(root, '[data-out-of-scope]').hidden = true;
  for (const el of inScopeParts(root)) el.hidden = false;
}

// What the review does not cover yet: why, and nothing worked out.
export function renderOutOfScope(
  root: HTMLElement,
  reach: ElectricityScope | TelecomScope,
  tr: Translate,
): void {
  for (const el of inScopeParts(root)) el.hidden = true;
  find(root, '[data-items]').replaceChildren();
  find(root, '[data-lead]').textContent = tr('client.bills.result.lead_out_of_scope');
  const box = find(root, '[data-out-of-scope]');
  box.hidden = false;
  find(box, '[data-out-of-scope-status]').textContent = tr('client.bills.status.out_of_scope');
  find(box, '[data-out-of-scope-reason]').textContent = scopePhrases(reach)
    .map((p) => phraseText(p, tr))
    .join(' ');
}

// The UI words `code` through `client.bills.error.<code>`.
export type FieldErrorCode = ValidationCode | 'missing_value' | 'missing_choice' | 'invalid_number';

export const renderErrors = (
  form: HTMLFormElement,
  errors: readonly { readonly field: string; readonly code: FieldErrorCode }[],
  tr: Translate,
): void => renderFieldErrors(form, errors, (code) => tr(`client.bills.error.${code}`));
