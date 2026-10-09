import type { Figure } from '../engine/calculation';
import type { HouseholdPhrase } from '../engine/household/calculation';
import type { HouseholdFinalPay } from '../engine/household/final-pay';
import { countedAmount, highestAmount, type HouseholdReview } from '../engine/household/review';
import type { NormSource } from '../engine/law/sources';
import type {
  Assessed,
  Finding,
  FindingStatus,
  HouseholdInput,
  ItemId,
} from '../engine/household/types';
import type { Item } from '../engine/types';
import { formatCalculationEuros, formatDays, formatInteger } from '../calculator/number';
import { calculationText } from '../calculator/calculation';
import {
  pieces,
  shownAmount,
  shownOne,
  shownPair,
  type Piece,
  type Shown,
} from '../calculator/amounts';
import type { ClientKey, Translate } from '../i18n/client';
import type { FieldError } from './form';
import type { HouseholdItemKind, OutOfScopeReason } from './ports';
import { TAB_NUMBER } from './steps';

// «2025-03-14» → «14-03-2025».
const dayText = (iso: string): string => iso.split('-').reverse().join('-');

// Hours, percentages and coefficients: Spanish decimals, up to four of them.
const NUMBER = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 4 });

// A calendar year reads as it is written: never «2.026».
const YEAR_VARS: ReadonlySet<string> = new Set(['year', 'referenceYear']);

const figureText = (name: string, f: Figure): string => {
  if (typeof f === 'number') return YEAR_VARS.has(name) ? String(f) : NUMBER.format(f);
  if ('days' in f) return formatDays(f.days);
  if ('euros' in f) return formatCalculationEuros(f.euros);
  return formatInteger(f.integer);
};

export function phraseText(p: HouseholdPhrase, tr: Translate): string {
  const vars = Object.fromEntries(
    Object.entries(p.vars ?? {}).map(([name, v]) => [
      name,
      typeof v === 'string'
        ? v
        : typeof v === 'object' && 'key' in v
          ? phraseText(v, tr)
          : figureText(name, v),
    ]),
  );
  return tr(`client.household.calculation.${p.key}`, vars);
}

// ---------- DOM helpers ----------

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

const listItems = (lines: readonly string[]): HTMLLIElement[] =>
  lines.map((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    return li;
  });

function note(el: HTMLElement, text: string | null) {
  el.hidden = text === null;
  el.textContent = text ?? '';
}

// ---------- Amounts and verdicts ----------

// «unos 340 €»; an amount kept with its cents is said as it is.
const approx = (s: Shown, tr: Translate): Piece[] =>
  s.cents ? shownAmount(s) : pieces(tr('client.household.about'), { importe: shownAmount(s) });

// What a point counts and the most it can be, as the free summary says them: the lower amount,
// and the higher only as «y hasta».
function rangePieces(key: 'owed' | 'depends', low: number, high: number, tr: Translate): Piece[] {
  if (key === 'depends')
    return pieces(tr('client.household.status.depends_up_to'), {
      maximo: shownAmount(shownOne(high)),
    });
  if (high <= low)
    return pieces(tr('client.household.status.owed'), { importe: approx(shownOne(low), tr) });
  const [a, b] = shownPair(low, high);
  return pieces(tr('client.household.status.owed_up_to'), {
    importe: approx(a, tr),
    maximo: shownAmount(b),
  });
}

function statusPieces(a: Assessed, tr: Translate): Piece[] {
  const [low, high] = [countedAmount(a), highestAmount(a)];
  if (low > 0) return rangePieces('owed', low, high, tr);
  if (a.kind === 'readings')
    return high > 0
      ? rangePieces('depends', low, high, tr)
      : [tr('client.household.status.depends')];
  return [tr(`client.household.status.${a.finding.status}`)];
}

const findingsOf = (a: Assessed): readonly Finding[] =>
  a.kind === 'single' ? [a.finding] : a.readings.map((r) => r.finding);

const stateOf = (a: Assessed): FindingStatus | 'depends' =>
  a.kind === 'single' ? a.finding.status : 'depends';

const uniqueSources = (sources: readonly NormSource[]): NormSource[] =>
  sources.filter((s, i) => sources.findIndex((o) => o.citation === s.citation) === i);

const NORM_STATUS: Record<NormSource['status'], ClientKey> = {
  in_force: 'client.household.norm.in_force',
  pending_validation: 'client.household.norm.pending_validation',
  repealed: 'client.household.norm.repealed',
};

const normStatusText = (s: NormSource, tr: Translate): string =>
  tr(NORM_STATUS[s.status], { fecha: s.statusSince ? dayText(s.statusSince) : '' });

function inForceText(s: NormSource, tr: Translate): string {
  const since = dayText(s.inForceSince);
  const period =
    s.inForceUntil === null
      ? tr('client.household.source.since', { desde: since })
      : tr('client.household.source.between', { desde: since, hasta: dayText(s.inForceUntil) });
  return `${period} · ${normStatusText(s, tr)}`;
}

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
      status.textContent = normStatusText(s, tr);
      return li;
    }),
  );
}

function renderSources(
  container: ParentNode,
  list: HTMLElement,
  sources: readonly NormSource[],
  tr: Translate,
) {
  list.replaceChildren(
    ...sources.map((s) => {
      const li = template(container, 'source');
      const a = find<HTMLAnchorElement>(li, 'a');
      a.href = s.url;
      a.textContent = s.citation;
      find(li, '[data-in-force]').textContent = inForceText(s, tr);
      return li;
    }),
  );
}

// ---------- Cards ----------

const TONE: Record<ItemId, string> = {
  minimum_wage: 'salary',
  working_time: 'holidays',
  holidays: 'holidays',
  termination: 'settlement',
  severance: 'settlement',
  notice: 'settlement',
  unemployment: 'settlement',
};

const markId = (state: string): string => `#household-mark-${state.replace(/_/g, '-')}`;

function readingLines(a: Assessed, tr: Translate): HTMLLIElement[] {
  if (a.kind === 'single') return [];
  return a.readings.map((r) => {
    const li = document.createElement('li');
    const owed = countedAmount({ kind: 'single', finding: r.finding });
    li.replaceChildren(
      ...pieces(tr('client.household.reading_line'), {
        cuando: tr(`client.household.reading.${r.when}`),
        resultado:
          owed > 0
            ? pieces(tr('client.household.reading_status.owed'), {
                importe: approx(shownOne(owed), tr),
              })
            : [tr(`client.household.reading_status.${r.finding.status}`)],
      }),
    );
    return li;
  });
}

function renderDetail(container: ParentNode, el: HTMLElement, a: Assessed, tr: Translate) {
  const frag = template(container, 'detail');
  const values =
    a.kind === 'single'
      ? [{ title: null, finding: a.finding }]
      : a.readings.map((r) => ({
          title: tr(`client.household.reading.${r.when}`),
          finding: r.finding,
        }));
  find(frag, '[data-readings-detail]').replaceChildren(
    ...values.map(({ title, finding }) => {
      const reading = template(container, 'reading');
      const heading = find(reading, '[data-reading-title]');
      heading.hidden = title === null;
      heading.textContent = title ?? '';
      const lines = finding.calculation.map((p) => phraseText(p, tr));
      find(reading, '[data-calculation]').replaceChildren(
        ...listItems(lines.length > 0 ? lines : [tr(`client.household.status.${finding.status}`)]),
      );
      return reading;
    }),
  );
  renderSources(
    container,
    find(frag, '[data-sources]'),
    uniqueSources(findingsOf(a).flatMap((f) => f.sources)),
    tr,
  );
  find(el, '[data-detail-slot]').replaceChildren(frag);
}

function itemCard(
  container: ParentNode,
  a: Assessed,
  position: number,
  tr: Translate,
): DocumentFragment {
  const first = findingsOf(a)[0];
  if (first === undefined) return document.createDocumentFragment();
  const frag = template(container, 'item');
  const el = find(frag, '[data-item]');
  const tone = TONE[first.item];
  const state = stateOf(a);
  el.dataset['item'] = String(position);
  // What the card is about, as a code: a point never names the person's own figures.
  el.dataset['kind'] = first.item satisfies HouseholdItemKind;
  el.dataset['state'] = state;
  el.dataset['tone'] = tone;
  const titleId = `household-item-${position}`;
  el.setAttribute('aria-labelledby', titleId);
  find(el, '[data-tab-number]').textContent = TAB_NUMBER[tone] ?? '';
  const heading = find(el, '[data-title]');
  heading.id = titleId;
  heading.textContent = tr(`client.household.finding.${first.id}`);
  find(el, '[data-mark] use').setAttributeNS(null, 'href', markId(state));
  find(el, '[data-status-text]').replaceChildren(...statusPieces(a, tr));

  const readings = find(el, '[data-readings]');
  if (a.kind === 'readings') {
    note(find(el, '[data-question]'), tr(`client.household.question.${a.question}`));
    readings.replaceChildren(...readingLines(a, tr));
    readings.hidden = false;
  }
  const findings = findingsOf(a);
  note(
    find(el, '[data-answer-note]'),
    findings.some((f) => f.basedOnYourAnswer) ? tr('client.household.note.your_answer') : null,
  );
  note(
    find(el, '[data-agreement-note]'),
    findings.some((f) => f.agreementMaySetOther) ? tr('client.household.note.agreement') : null,
  );
  renderRules(
    container,
    find(el, '[data-rules]'),
    uniqueSources(findings.flatMap((f) => f.sources)),
    tr,
  );
  renderDetail(container, el, a, tr);
  return frag;
}

// ---------- Final pay and unemployment ----------

function finalPayAmount(item: Item, tr: Translate): Piece[] {
  if (item.range === null) return [tr('client.household.final_pay.no_figure')];
  const { min, max } = item.range;
  if (max <= min) return approx(shownOne(min), tr);
  const [a, b] = shownPair(min, max);
  return pieces(tr('client.household.final_pay.up_to'), {
    importe: approx(a, tr),
    maximo: shownAmount(b),
  });
}

function finalPayLine(container: ParentNode, item: Item, tr: Translate): HTMLElement {
  const frag = template(container, 'final-pay-item');
  find(frag, '[data-final-pay-title]').textContent = tr(`client.household.final_pay.${item.id}`);
  find(frag, '[data-final-pay-amount]').replaceChildren(...finalPayAmount(item, tr));
  find(frag, '[data-final-pay-calculation]').textContent = calculationText(item.calculation, tr);
  renderRules(
    container,
    find(frag, '[data-rules]'),
    uniqueSources(item.sources as readonly NormSource[]),
    tr,
  );
  return find(frag, 'li');
}

function renderFinalPay(root: HTMLElement, finalPay: HouseholdFinalPay | null, tr: Translate) {
  const box = find(root, '[data-final-pay]');
  box.hidden = finalPay === null;
  if (finalPay === null) return;
  const lines = find(root, '[data-final-pay-lines]');
  const text = find(root, '[data-final-pay-note]');
  const rules = find(root, '[data-final-pay-rules]');
  if (finalPay.kind === 'monthly') {
    lines.replaceChildren(...finalPay.items.map((i) => finalPayLine(root, i, tr)));
    rules.replaceChildren();
    note(
      text,
      finalPay.extraPayAmountMissing ? tr('client.household.final_pay.extra_missing') : null,
    );
    return;
  }
  lines.replaceChildren();
  note(
    text,
    tr(
      finalPay.kind === 'hourly_external'
        ? 'client.household.final_pay.hourly_included'
        : 'client.household.final_pay.not_entered',
    ),
  );
  renderRules(root, rules, finalPay.kind === 'hourly_external' ? [finalPay.source] : [], tr);
}

function renderUnemployment(root: HTMLElement, review: HouseholdReview, tr: Translate) {
  const box = find(root, '[data-unemployment-engine]');
  const found = review.items.find(
    (a): a is Extract<Assessed, { kind: 'single' }> =>
      a.kind === 'single' && a.finding.item === 'unemployment',
  );
  box.hidden = found === undefined;
  // The engine's lines already say what the general text does, with their articles.
  find(root, '[data-unemployment-text]').hidden = found !== undefined;
  if (found === undefined) return;
  find(box, '[data-unemployment-lines]').replaceChildren(
    ...listItems(found.finding.calculation.map((p) => phraseText(p, tr))),
  );
  renderRules(root, find(box, '[data-rules]'), uniqueSources(found.finding.sources), tr);
}

// ---------- Result ----------

export interface HouseholdResultData {
  readonly review: HouseholdReview;
  readonly input: HouseholdInput;
  // «No lo sé» to how it ended: the end of the relationship is not reviewed.
  readonly endingUnknown: boolean;
}

const inScopeParts = (root: ParentNode) => [
  ...root.querySelectorAll<HTMLElement>('[data-in-scope]'),
];

const TO_REVIEW: ReadonlySet<FindingStatus> = new Set(['warning', 'review_it', 'not_published']);
const FOUND: ReadonlySet<FindingStatus> = new Set([
  'below_minimum',
  'over_legal_limit',
  'missing_requirement',
  'dismissal_regime_presumed',
]);

export type Headline = 'found' | 'to_review' | 'nothing_found' | 'nothing_entered';

// The summary's first line follows the engine: a point that falls short of the norm is «found»;
// a warning or a doubt is only to review.
export function headline(review: HouseholdReview): Headline {
  const findings = review.items.flatMap(findingsOf);
  if (findings.some((f) => FOUND.has(f.status))) return 'found';
  if (findings.some((f) => TO_REVIEW.has(f.status))) return 'to_review';
  return findings.every((f) => f.status === 'not_entered' || f.status === 'information')
    ? 'nothing_entered'
    : 'nothing_found';
}

// The warnings of the summary, each once: working time, holidays, the dismissal presumption and
// the night notice.
export type WarningCode = 'working_time' | 'holidays' | 'presumed' | 'night_notice';

export function warningCodes(review: HouseholdReview): readonly WarningCode[] {
  const findings = review.items.flatMap(findingsOf);
  const has = (item: ItemId, status: FindingStatus) =>
    findings.some((f) => f.item === item && f.status === status);
  const codes: WarningCode[] = [];
  if (has('working_time', 'warning')) codes.push('working_time');
  if (has('holidays', 'warning')) codes.push('holidays');
  if (findings.some((f) => f.status === 'dismissal_regime_presumed')) codes.push('presumed');
  if (findings.some((f) => f.id === 'live_in_night_notice' && f.status === 'missing_requirement'))
    codes.push('night_notice');
  return codes;
}

function renderTotals(list: HTMLElement, review: HouseholdReview, tr: Translate) {
  const counted = review.items.reduce((sum, a) => sum + countedAmount(a), 0);
  const upTo = review.items.reduce((sum, a) => sum + highestAmount(a), 0);
  const line = (pieceList: Piece[]) => {
    const li = document.createElement('li');
    li.replaceChildren(...pieceList);
    return li;
  };
  if (counted > 0) {
    const [low, high] = upTo > counted ? shownPair(counted, upTo) : [shownOne(counted), null];
    list.replaceChildren(
      line(pieces(tr('client.household.total.counted'), { importe: approx(low, tr) })),
      ...(high === null
        ? []
        : [line(pieces(tr('client.household.total.up_to'), { maximo: shownAmount(high) }))]),
    );
    return;
  }
  list.replaceChildren(
    line(
      upTo > 0
        ? pieces(tr('client.household.total.only_up_to'), {
            maximo: shownAmount(shownOne(upTo)),
          })
        : [
            tr(
              headline(review) === 'found'
                ? 'client.household.total.found_without_amount'
                : 'client.household.total.none',
            ),
          ],
    ),
  );
}

// The summary always, then each point on its card with its rules and, folded, its calculation;
// the final pay, the unemployment information and what was not looked at.
export function renderHouseholdResult(
  root: HTMLElement,
  { review, endingUnknown }: HouseholdResultData,
  tr: Translate,
): void {
  find(root, '[data-out-of-scope]').hidden = true;
  for (const el of inScopeParts(root)) el.hidden = false;
  find(root, '[data-lead]').textContent = tr('client.household.result.lead');
  find(root, '[data-headline]').textContent = tr(`client.household.headline.${headline(review)}`);
  renderTotals(find(root, '[data-totals]'), review, tr);
  find(root, '[data-warnings]').replaceChildren(
    ...listItems(warningCodes(review).map((code) => tr(`client.household.warning.${code}`))),
  );
  note(
    find(root, '[data-ending-unknown]'),
    endingUnknown ? tr('client.household.ending_unknown') : null,
  );
  find(root, '[data-items]').replaceChildren(
    ...review.items
      .filter((a) => findingsOf(a)[0]?.item !== 'unemployment')
      .map((a, i) => itemCard(root, a, i, tr)),
  );
  renderFinalPay(root, review.finalPay, tr);
  renderUnemployment(root, review, tr);
  find(root, '[data-unchecked]').replaceChildren(
    ...listItems(review.unchecked.map((code) => tr(`client.household.unchecked.${code}`))),
  );
}

// A relationship the review does not cover: why.
export function renderOutOfScope(root: HTMLElement, reason: OutOfScopeReason, tr: Translate): void {
  for (const el of inScopeParts(root)) el.hidden = true;
  find(root, '[data-items]').replaceChildren();
  find(root, '[data-lead]').textContent = tr('client.household.result.lead_out_of_scope');
  const box = find(root, '[data-out-of-scope]');
  box.hidden = false;
  find(box, '[data-out-of-scope-status]').textContent = tr('client.household.out_of_scope.status');
  find(box, '[data-out-of-scope-reason]').textContent = tr(
    `client.household.out_of_scope.${reason}`,
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
      p.textContent = tr(`client.household.error.${code}`);
      p.hidden = false;
      p.closest<HTMLElement>('[data-field]')?.setAttribute('data-has-error', '');
    }
    for (const el of form.querySelectorAll(`[name="${field}"]`))
      el.setAttribute('aria-invalid', 'true');
  }
}
