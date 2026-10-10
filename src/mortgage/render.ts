import { formatCalculationEuros, formatInteger, formatWholeEuros } from '../calculator/number';
import { dayText, find, listOf, renderFieldErrors, template } from '../calculator/review-result';
import type { LawSource } from '../engine/law/sources';
import type {
  MortgageCalculation,
  MortgageFigure,
  MortgagePhrase,
  MortgagePhraseKey,
} from '../engine/mortgage/calculation';
import type { ExpenseItem, MortgageSource } from '../engine/mortgage/expenses';
import type {
  FeeFinding,
  FeeItem,
  FeeQuestion,
  FeeReading,
  OptionReading,
  RateReading,
  ReachReading,
  RevisionReading,
} from '../engine/mortgage/fees';
import type { ClauseFlag, FlagPart } from '../engine/mortgage/flags';
import type { InformationBlock } from '../engine/mortgage/information';
import type { NormStatus } from '../engine/mortgage/norms';
import type { MortgageReview } from '../engine/mortgage/review';
import { scopePhrases } from '../engine/mortgage/scope';
import type { Scope } from '../engine/mortgage/types';
import type { ClientKey, Translate } from '../i18n/client';
import type { FieldError } from './form';

// A legal percentage as the law or the deed writes it: «0,15 %», «3 %».
const PERCENT = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' });

export const percentText = (n: number): string => `${PERCENT.format(n)} %`;

// What the free summary shows of a total: whole euros, never cents.
const about = (euros: number, tr: Translate): string =>
  tr('client.mortgage.about', { importe: formatWholeEuros(euros) });

// A calendar year reads as it is written, «2027», never with a thousands dot.
const YEAR_VARS: ReadonlySet<string> = new Set(['year']);

function figureText(f: MortgageFigure, name: string): string {
  if (typeof f === 'number') return String(f);
  if (YEAR_VARS.has(name) && 'integer' in f) return String(f.integer);
  if ('percent' in f) return percentText(f.percent);
  if ('date' in f) return dayText(f.date);
  if ('euros' in f) return formatCalculationEuros(f.euros);
  if ('days' in f) return formatInteger(f.days);
  return formatInteger(f.integer);
}

// A floor clause whose percentage the person did not give reads without it.
const FLOOR_KEYS: Partial<Record<MortgagePhraseKey, ClientKey>> = {
  'flags.floor_statute': 'client.mortgage.calculation.flags.floor_statute_no_figure',
  'flags.floor_statute_mixed': 'client.mortgage.calculation.flags.floor_statute_mixed_no_figure',
  'flags.floor_case_law': 'client.mortgage.calculation.flags.floor_case_law_no_figure',
};

function phraseKey(p: MortgagePhrase): ClientKey {
  const noFigure = FLOOR_KEYS[p.key];
  if (noFigure && p.vars?.['floor'] === undefined) return noFigure;
  return `client.mortgage.calculation.${p.key}`;
}

export function phraseText(p: MortgagePhrase, tr: Translate): string {
  const vars = Object.fromEntries(
    Object.entries(p.vars ?? {}).map(([name, v]) => [name, figureText(v, name)]),
  );
  return tr(phraseKey(p), vars);
}

export const calculationLines = (c: MortgageCalculation, tr: Translate): string[] =>
  c.map((p) => phraseText(p, tr));

// ---------- Sources ----------

const NORM_STATUS: Record<NormStatus, ClientKey> = {
  in_force: 'client.mortgage.norm.in_force',
  pending_validation: 'client.mortgage.norm.pending_validation',
  repealed: 'client.mortgage.norm.repealed',
  draft: 'client.mortgage.norm.draft',
  conditional: 'client.mortgage.norm.conditional',
};

const isRuling = (s: MortgageSource): s is LawSource => 'basis' in s;

// A norm with the day it took effect and how it stands today; a court's criterion as such, never
// as law, with the day it was last read and whether it was read in the ruling itself.
export function sourceText(s: MortgageSource, tr: Translate): string {
  if (!isRuling(s)) {
    const status = tr(NORM_STATUS[s.status], {
      fecha: s.statusSince ? dayText(s.statusSince) : '',
    });
    if (s.status === 'draft') return status;
    return `${tr('client.mortgage.source.since', { desde: dayText(s.inForceSince) })} · ${status}`;
  }
  if (s.basis !== 'case_law') return tr(`client.mortgage.source.${s.basis}`);
  const checked = tr('client.mortgage.source.checked', { fecha: dayText(s.lastVerified) });
  const court = `${s.court} · ${checked}`;
  return s.verified ? court : `${court} · ${tr('client.mortgage.source.case_law_unverified')}`;
}

interface RuleLine {
  readonly id: string;
  readonly citation: string;
  readonly url: string;
  readonly status: string;
  readonly state: string;
}

const ruleLine = (s: MortgageSource, tr: Translate): RuleLine => ({
  id: s.id,
  citation: s.citation,
  url: s.url,
  status: sourceText(s, tr),
  state: isRuling(s) ? s.basis : s.status,
});

// Each rule an item rests on: the norm or ruling, a link to it and how it stands.
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

// ---------- Totals ----------

// What the law puts on the lender and what the Supreme Court's split gives, each on its own, and
// the fees over their caps: three figures that are never added together.
function renderTotals(root: ParentNode, review: MortgageReview, tr: Translate) {
  const { totals } = review;
  const items = review.expenses.items;
  const statute = find(root, '[data-total="statute"]');
  find(statute, '[data-total-amount]').textContent =
    totals.statute.principal > 0
      ? about(totals.statute.principal, tr)
      : tr('client.mortgage.total.nothing');
  const notChargeable = items
    .filter((i) => i.status === 'not_chargeable')
    .reduce((s, i) => s + (i.amount ?? 0), 0);
  const free = find(statute, '[data-total-free]');
  free.hidden = notChargeable === 0;
  free.textContent = tr('client.mortgage.total.transparency_free', {
    importe: formatWholeEuros(notChargeable),
  });

  const caseLaw = find(root, '[data-total="case_law"]');
  const explained = items.some((i) => i.status === 'split_explained');
  find(caseLaw, '[data-total-amount]').textContent =
    totals.caseLaw.principal > 0
      ? about(totals.caseLaw.principal, tr)
      : explained
        ? tr('client.mortgage.total.no_figure_yet')
        : tr('client.mortgage.total.nothing');
  find(caseLaw, '[data-total-explained]').hidden = !explained || totals.caseLaw.principal > 0;
  const interest = find(caseLaw, '[data-total-interest]');
  const i = totals.caseLaw.interest;
  interest.hidden = i === null || totals.caseLaw.principal === 0;
  interest.textContent =
    i === null
      ? ''
      : tr(
          i.estimated
            ? 'client.mortgage.total.interest_estimated'
            : 'client.mortgage.total.interest',
          {
            importe: formatWholeEuros(i.amount),
            fecha: dayText(i.until),
          },
        );

  const fees = find(root, '[data-total="fees"]');
  fees.hidden = review.fees.length === 0;
  find(fees, '[data-total-amount]').textContent =
    totals.fees.counted > 0
      ? about(totals.fees.counted, tr)
      : totals.fees.upTo > 0
        ? tr('client.mortgage.total.nothing_lowest')
        : tr('client.mortgage.total.nothing');
  find(fees, '[data-total-more]').hidden = totals.fees.upTo <= totals.fees.counted;
}

// ---------- Cards ----------

// Each card takes the colour and number of the tab that asks for its answers.
type Tone = 'salary' | 'settlement' | 'dates';
const TAB_NUMBER: Record<Tone, string> = { salary: '02', settlement: '03', dates: '04' };

const markId = (state: string): string => `#mortgage-mark-${state.replace(/_/g, '-')}`;

interface Part {
  readonly title: string;
  readonly status: string | null;
  readonly calculation: readonly string[];
}

interface Card {
  readonly key: string;
  readonly tone: Tone;
  readonly title: string;
  readonly state: string;
  readonly status: string;
  readonly calculation: readonly string[];
  readonly depends: string | null;
  readonly parts: readonly Part[];
  readonly rules: readonly RuleLine[];
}

function renderCard(container: ParentNode, c: Card, position: number) {
  const frag = template(container, 'item');
  const card = find(frag, '[data-item]');
  const titleId = `mortgage-item-${position}`;
  card.dataset['item'] = c.key;
  card.dataset['state'] = c.state;
  card.dataset['tone'] = c.tone;
  find(card, '[data-tab-number]').textContent = TAB_NUMBER[c.tone];
  card.setAttribute('aria-labelledby', titleId);
  const title = find(card, '[data-title]');
  title.id = titleId;
  title.textContent = c.title;
  find(card, '[data-mark] use').setAttributeNS(null, 'href', markId(c.state));
  find(card, '[data-status-text]').textContent = c.status;
  const depends = find(card, '[data-depends]');
  depends.hidden = c.depends === null;
  depends.textContent = c.depends ?? '';
  const calculation = find(card, '[data-calculation]');
  calculation.hidden = c.calculation.length === 0;
  find(card, '[data-how]').hidden = c.calculation.length === 0;
  calculation.replaceChildren(...listOf(c.calculation));
  find(card, '[data-readings]').replaceChildren(
    ...c.parts.map((r) => {
      const reading = template(container, 'reading');
      find(reading, '[data-reading-title]').textContent = r.title;
      const status = find(reading, '[data-reading-status]');
      status.hidden = r.status === null;
      status.textContent = r.status ?? '';
      find(reading, '[data-calculation]').replaceChildren(...listOf(r.calculation));
      return reading;
    }),
  );
  renderRules(container, card, c.rules);
  return frag;
}

// What an invoice comes to, in words.
export function expenseStatusText(item: ExpenseItem, tr: Translate): string {
  const importe = formatCalculationEuros(item.amount ?? 0);
  switch (item.status) {
    case 'lender_bears':
      return tr(`client.mortgage.status.lender_bears.${item.basis ?? 'statute'}`, { importe });
    case 'not_chargeable':
      return tr('client.mortgage.status.not_chargeable', { importe });
    case 'split_explained':
      return tr('client.mortgage.status.split_explained', {
        parte: percentText(item.share ?? 0),
      });
    default:
      return tr(`client.mortgage.status.${item.status}`);
  }
}

const expenseCard = (item: ExpenseItem, tr: Translate): Card => ({
  key: item.kind,
  tone: 'settlement',
  title: tr(`client.mortgage.invoice.${item.kind}`),
  state: item.status === 'lender_bears' ? `lender_bears_${item.basis ?? 'statute'}` : item.status,
  status: expenseStatusText(item, tr),
  calculation: calculationLines(item.calculation, tr),
  depends: null,
  parts: [],
  rules: item.sources.map((s) => ruleLine(s, tr)),
});

export function feeStatusText(f: FeeFinding, tr: Translate): string {
  return f.status === 'above_cap'
    ? tr('client.mortgage.status.above_cap', { importe: formatCalculationEuros(f.amount ?? 0) })
    : tr(`client.mortgage.status.${f.status}`);
}

type ReadingPart = RateReading | OptionReading | ReachReading | RevisionReading;

// The point each part of a reading answers; a reading names only the points its item is open on.
const POINT_OF: Record<ReadingPart, string> = {
  fixed: 'rate_type',
  variable: 'rate_type',
  option_a: 'prepayment_option',
  option_b: 'prepayment_option',
  deed_regime: 'earlier_deed',
  lcci_reach: 'earlier_deed',
  revised_yearly: 'rate_revision',
  revised_less_often: 'rate_revision',
};

// «Con la norma de la fecha de tu escritura · Si se revisa cada 12 meses o menos».
const readingTitle = (when: FeeReading, question: FeeQuestion, tr: Translate): string => {
  const open = question.split('_and_');
  return (when.split('.') as ReadingPart[])
    .filter((part) => open.includes(POINT_OF[part]))
    .map((part) => tr(`client.mortgage.reading.${part}`))
    .join(' · ');
};

function feeCard(item: FeeItem, tr: Translate): Card {
  if (item.kind === 'single') {
    const f = item.finding;
    return {
      key: f.kind,
      tone: 'dates',
      title: tr(`client.mortgage.operation.${f.kind}`),
      state: f.status,
      status: feeStatusText(f, tr),
      calculation: calculationLines(f.calculation, tr),
      depends: null,
      parts: [],
      rules: f.sources.map((s) => ruleLine(s, tr)),
    };
  }
  const first = item.readings[0]?.finding;
  return {
    key: first?.kind ?? 'partial_prepayment',
    tone: 'dates',
    title: tr(`client.mortgage.operation.${first?.kind ?? 'partial_prepayment'}`),
    state: 'depends',
    status: tr('client.mortgage.status.depends'),
    calculation: [],
    depends: tr(`client.mortgage.depends.${item.question}`),
    parts: item.readings.map((r) => ({
      title: readingTitle(r.when, item.question, tr),
      status: feeStatusText(r.finding, tr),
      calculation: calculationLines(r.finding.calculation, tr),
    })),
    rules: item.readings.flatMap((r) => r.finding.sources.map((s) => ruleLine(s, tr))),
  };
}

// What a law says is told as such; a court's criterion carries the court and the day its state
// is given as of.
const partTitle = (part: FlagPart, tr: Translate): string =>
  part.basis === 'statute'
    ? tr('client.mortgage.basis.statute')
    : tr('client.mortgage.basis.case_law', { fecha: dayText(part.statusAsOf ?? '') });

const flagCard = (flag: ClauseFlag, tr: Translate): Card => ({
  key: flag.label,
  tone: 'salary',
  title: tr(`client.mortgage.clause.${flag.label}`),
  state: flag.state,
  status: tr(`client.mortgage.flag.${flag.state}`),
  calculation: calculationLines(flag.calculation, tr),
  depends: null,
  parts: flag.parts.map((part) => ({
    title: partTitle(part, tr),
    status: null,
    calculation: calculationLines(part.calculation, tr),
  })),
  rules: flag.parts.flatMap((part) => part.sources.map((s) => ruleLine(s, tr))),
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
      find(frag, '[data-info-title]').textContent = tr(`client.mortgage.info.${b.id}`);
      const text = calculationLines(b.calculation, tr).join(' ');
      find(frag, '[data-info-text]').textContent =
        b.statusAsOf === null
          ? text
          : `${text} ${tr('client.mortgage.info.as_of', { fecha: dayText(b.statusAsOf) })}`;
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

// ---------- Result ----------

const inScopeParts = (root: ParentNode) => [
  ...root.querySelectorAll<HTMLElement>('[data-in-scope]'),
];

function renderList(root: ParentNode, selector: string, cards: readonly Card[], from: number) {
  const list = find(root, selector);
  list.replaceChildren(...cards.map((c, i) => renderCard(root, c, from + i)));
  const section = list.closest<HTMLElement>('[data-in-scope]');
  if (section) section.hidden = cards.length === 0;
}

// The totals by basis first, then each cost, each fee and each clause with its calculation and
// its rules, what the review explains without applying, and what it never looks at.
export function renderMortgageResult(
  root: HTMLElement,
  review: MortgageReview,
  tr: Translate,
): void {
  find(root, '[data-out-of-scope]').hidden = true;
  for (const el of inScopeParts(root)) el.hidden = false;
  find(root, '[data-lead]').textContent = tr('client.mortgage.result.lead');
  renderTotals(root, review, tr);
  const expenses = review.expenses.items.map((item) => expenseCard(item, tr));
  const fees = review.fees.map((item) => feeCard(item, tr));
  const flags = review.flags.map((flag) => flagCard(flag, tr));
  find(root, '[data-expenses-note]').replaceChildren(
    ...listOf(calculationLines(review.expenses.calculation, tr)),
  );
  renderList(root, '[data-expenses]', expenses, 0);
  renderList(root, '[data-fees]', fees, expenses.length);
  renderList(root, '[data-flags]', flags, expenses.length + fees.length);
  renderInformation(root, review.information, tr);
  find(root, '[data-unchecked]').replaceChildren(
    ...listOf(review.unchecked.map((code) => tr(`client.mortgage.unchecked.${code}`))),
  );
}

// A loan the review does not cover: why, and nothing worked out.
export function renderOutOfScope(root: HTMLElement, reach: Scope, tr: Translate): void {
  for (const el of inScopeParts(root)) el.hidden = true;
  for (const selector of ['[data-expenses]', '[data-fees]', '[data-flags]', '[data-information]'])
    find(root, selector).replaceChildren();
  find(root, '[data-lead]').textContent = tr('client.mortgage.result.lead_out_of_scope');
  const box = find(root, '[data-out-of-scope]');
  box.hidden = false;
  find(box, '[data-out-of-scope-status]').textContent = tr('client.mortgage.status.out_of_scope');
  find(box, '[data-out-of-scope-reason]').textContent = scopePhrases(reach)
    .map((p) => phraseText(p, tr))
    .join(' ');
}

export const renderErrors = (
  form: HTMLFormElement,
  errors: readonly FieldError[],
  tr: Translate,
): void => renderFieldErrors(form, errors, (code) => tr(`client.mortgage.error.${code}`));
