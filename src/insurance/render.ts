import { toIso, type CivilDate } from '../engine/date';
import { formatCalculationEuros, formatDays, formatInteger } from '../calculator/number';
import type {
  InsuranceCalculation,
  InsuranceFigure,
  InsurancePhrase,
  InsurancePhraseKey,
} from '../engine/insurance/calculation';
import type { InformationBlock } from '../engine/insurance/information';
import type { InsuranceReview } from '../engine/insurance/review';
import type { Finding, OutOfScopeReason } from '../engine/insurance/types';
import type { NormSource } from '../engine/law/sources';
import type { ClientKey, Translate } from '../i18n/client';
import type { FieldError } from './form';

// «2027-02-01» → «01-02-2027».
export const dayText = (iso: string): string => iso.split('-').reverse().join('-');
export const civilDayText = (d: CivilDate): string => dayText(toIso(d));

const PERCENT = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' });

export const percentText = (n: number): string => `${PERCENT.format(n)} %`;

// «1 día», «115 días».
const daysText = (n: number, tr: Translate): string =>
  tr(n === 1 ? 'client.insurance.unit.day_one' : 'client.insurance.unit.day_many', {
    n: formatDays(n),
  });

function figureText(f: InsuranceFigure, tr: Translate): string {
  if (typeof f === 'number') return String(f);
  if ('percent' in f) return percentText(f.percent);
  if ('date' in f) return dayText(f.date);
  if ('days' in f) return daysText(f.days, tr);
  if ('euros' in f) return formatCalculationEuros(f.euros);
  return formatInteger(f.integer);
}

// A deadline open today reads as such, rather than as «0 días».
const TODAY_KEYS: Partial<Record<InsurancePhraseKey, ClientKey>> = {
  'non_renewal.days_left': 'client.insurance.calculation.non_renewal.days_left_today',
  'withdrawal.days_left': 'client.insurance.calculation.withdrawal.days_left_today',
};

function phraseKey(p: InsurancePhrase): ClientKey {
  const days = p.vars?.['days'];
  const today = TODAY_KEYS[p.key];
  if (today && typeof days === 'object' && 'days' in days && days.days === 0) return today;
  return `client.insurance.calculation.${p.key}`;
}

export function phraseText(p: InsurancePhrase, tr: Translate): string {
  const vars = Object.fromEntries(
    Object.entries(p.vars ?? {}).map(([name, v]) => [name, figureText(v, tr)]),
  );
  return tr(phraseKey(p), vars);
}

export const calculationLines = (c: InsuranceCalculation, tr: Translate): string[] =>
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

// ---------- Findings ----------

const varOf = (f: Finding, name: string): InsuranceFigure | undefined =>
  f.calculation.find((p) => p.vars?.[name] !== undefined)?.vars?.[name];

// What a finding comes to, in words: the days left, the day it ended, how the notice arrived or
// how the premium moves.
export function statusText(f: Finding, tr: Translate): string {
  const vars = (...names: string[]) =>
    Object.fromEntries(
      names.flatMap((n) => {
        const v = varOf(f, n);
        return v === undefined ? [] : [[n, figureText(v, tr)]];
      }),
    );
  const fecha = f.lastDay === null ? '' : dayText(f.lastDay);
  switch (f.status) {
    case 'open':
      return f.daysLeft === 0
        ? tr('client.insurance.status.open_today', { fecha })
        : tr('client.insurance.status.open', { dias: daysText(f.daysLeft ?? 0, tr), fecha });
    case 'ended':
      return tr('client.insurance.status.ended', { fecha });
    case 'late':
      return tr('client.insurance.status.late', vars('days'));
    case 'up':
    case 'down':
      return tr(`client.insurance.status.${f.status}`, vars('percent', 'difference'));
    default:
      return tr(`client.insurance.status.${f.status}`);
  }
}

const NORM_STATUS: Record<NormSource['status'], ClientKey> = {
  in_force: 'client.insurance.norm.in_force',
  pending_validation: 'client.insurance.norm.pending_validation',
  repealed: 'client.insurance.norm.repealed',
};

// How a norm stands today: «en vigor», «pendiente de convalidación», «derogada el …».
export const normStatusText = (s: NormSource, tr: Translate): string =>
  tr(NORM_STATUS[s.status], { fecha: s.statusSince ? dayText(s.statusSince) : '' });

function sourceLink(s: NormSource): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = s.url;
  a.rel = 'noopener';
  a.target = '_blank';
  a.textContent = s.citation;
  return a;
}

// Each rule a finding rests on: the norm and article, a link to it, since when and how it stands.
function renderRules(
  container: ParentNode,
  list: HTMLElement,
  sources: readonly NormSource[],
  tr: Translate,
) {
  list.replaceChildren(
    ...sources.map((s) => {
      const li = template(container, 'rule');
      const a = find<HTMLAnchorElement>(li, 'a');
      a.href = s.url;
      a.textContent = s.citation;
      const status = find(li, '[data-rule-status]');
      status.dataset['status'] = s.status;
      status.textContent = `${tr('client.insurance.source.since', { desde: dayText(s.inForceSince) })} · ${normStatusText(s, tr)}`;
      return li;
    }),
  );
}

// Each finding takes the colour and number of the tab that asks for its answers.
const TONE: Record<Finding['id'], 'dates' | 'salary'> = {
  non_renewal: 'salary',
  change_notice: 'salary',
  premium: 'salary',
  distance_withdrawal: 'dates',
  distance_withdrawal_compulsory: 'dates',
  distance_withdrawal_voluntary: 'dates',
};
const TAB_NUMBER = { dates: '02', salary: '03' } as const;

const markId = (state: string): string => `#insurance-mark-${state.replace(/_/g, '-')}`;

function renderFinding(
  container: ParentNode,
  f: Finding,
  position: number,
  tr: Translate,
): DocumentFragment {
  const frag = template(container, 'item');
  const card = find(frag, '[data-item]');
  const titleId = `insurance-item-${position}`;
  card.dataset['item'] = f.id;
  card.dataset['state'] = f.status;
  card.dataset['tone'] = TONE[f.id];
  find(card, '[data-tab-number]').textContent = TAB_NUMBER[TONE[f.id]];
  card.setAttribute('aria-labelledby', titleId);
  const title = find(card, '[data-title]');
  title.id = titleId;
  title.textContent = tr(`client.insurance.item.${f.id}`);
  find(card, '[data-mark] use').setAttributeNS(null, 'href', markId(f.status));
  find(card, '[data-status-text]').textContent = statusText(f, tr);
  find(card, '[data-calculation]').replaceChildren(
    ...calculationLines(f.calculation, tr).map((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      return li;
    }),
  );
  // The premium's change is a fact with no rule behind it.
  const rules = find(card, '[data-rules]');
  rules.hidden = f.sources.length === 0;
  find(card, '[data-rules-title]').hidden = f.sources.length === 0;
  renderRules(container, rules, f.sources, tr);
  return frag;
}

// ---------- Information ----------

function renderInformation(
  container: ParentNode,
  blocks: readonly InformationBlock[],
  tr: Translate,
) {
  find(container, '[data-information]').replaceChildren(
    ...blocks.map((b) => {
      const frag = template(container, 'information');
      find(frag, '[data-info-title]').textContent = tr(`client.insurance.info.${b.id}`);
      find(frag, '[data-info-text]').textContent = calculationLines(b.calculation, tr).join(' ');
      const links = find(frag, '[data-info-links]');
      links.replaceChildren(
        ...b.sources.map((s) => {
          const li = document.createElement('li');
          li.append(sourceLink(s));
          return li;
        }),
      );
      links.hidden = b.sources.length === 0;
      return frag;
    }),
  );
}

function renderUnchecked(container: ParentNode, review: InsuranceReview, tr: Translate) {
  find(container, '[data-unchecked]').replaceChildren(
    ...review.unchecked.map((code) => {
      const li = document.createElement('li');
      li.textContent = tr(`client.insurance.unchecked.${code}`);
      return li;
    }),
  );
}

// ---------- Result ----------

const inScopeParts = (root: ParentNode) => [
  ...root.querySelectorAll<HTMLElement>('[data-in-scope]'),
];

// Every finding with its days, its calculation and its rules; the information blocks folded and
// what the review does not look at. Nothing here carries euros owed, so nothing is locked.
export function renderInsuranceResult(
  root: HTMLElement,
  review: InsuranceReview,
  tr: Translate,
): void {
  find(root, '[data-out-of-scope]').hidden = true;
  for (const el of inScopeParts(root)) el.hidden = false;
  find(root, '[data-lead]').textContent = tr('client.insurance.result.lead');
  find(root, '[data-items]').replaceChildren(
    ...review.findings.map((f, i) => renderFinding(root, f, i, tr)),
  );
  renderInformation(root, review.information, tr);
  renderUnchecked(root, review, tr);
}

// A policy the review does not cover: why, and nothing worked out.
export function renderOutOfScope(root: HTMLElement, reason: OutOfScopeReason, tr: Translate): void {
  for (const el of inScopeParts(root)) el.hidden = true;
  find(root, '[data-items]').replaceChildren();
  find(root, '[data-information]').replaceChildren();
  find(root, '[data-lead]').textContent = tr('client.insurance.result.lead_out_of_scope');
  const box = find(root, '[data-out-of-scope]');
  box.hidden = false;
  find(box, '[data-out-of-scope-status]').textContent = tr('client.insurance.status.out_of_scope');
  find(box, '[data-out-of-scope-reason]').textContent = tr(
    `client.insurance.calculation.information.out_of_scope.${reason}`,
  );
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
      p.textContent = tr(`client.insurance.error.${code}`);
      p.hidden = false;
      p.closest<HTMLElement>('[data-field]')?.setAttribute('data-has-error', '');
    }
    for (const el of form.querySelectorAll(`[name="${field}"]`))
      el.setAttribute('aria-invalid', 'true');
  }
}
