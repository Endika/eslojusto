import type { Status, ItemResult } from '../engine/compare';
import type { Range } from '../engine/money';
import type { Source } from '../engine/sources';
import {
  BENEFIT_2026,
  benefitState,
  type BenefitDuration,
  type BenefitEstimate,
  type Children,
} from '../engine/unemployment';
import type { LateInterest } from '../engine/late-interest';
import type { Review } from '../engine/review';
import { SOURCES } from '../engine/sources';
import type { Cause, Erte, Item, ItemId, ProtectedSituation } from '../engine/types';
import type { ClientKey, Translate } from '../i18n/client';
import { pieces, shownAmount, shownOne } from './amounts';
import { calculationText, phraseText } from './calculation';
import type { FieldError } from './form';
import { formatInteger, formatEuros, formatWholeEuros } from './number';

export const TONE: Record<ItemId, string> = {
  pending_salary: 'salary',
  holiday_pay: 'holidays',
  extra_pay: 'salary',
  severance: 'cause',
  employer_notice: 'holidays',
  notice_deduction: 'holidays',
};

const TAB_NUMBER: Record<string, string> = { cause: '01', salary: '03', holidays: '04' };

export type VisibleStatus = Status | 'no_severance';

// A severance the law sets at zero, with no employer figure to compare, is not a finding.
export function visibleStatus(r: ItemResult): VisibleStatus {
  const { item } = r;
  return item.id === 'severance' && item.range?.max === 0 && r.employerFigure === null
    ? 'no_severance'
    : r.status;
}

// A disciplinary dismissal is zero only if it is upheld, so its line carries the reference figure.
const disciplinaryNeutral = (r: ItemResult, reference: number | null) =>
  visibleStatus(r) === 'no_severance' &&
  r.item.zeroReason === 'disciplinary_dismissal' &&
  reference !== null;

// The note under severance with the unfair-dismissal reference, when it is not already in the
// status: a disciplinary dismissal with a figure to compare, or any objective dismissal.
export function referenceKey(r: ItemResult, reference: number | null): ClientKey | null {
  if (r.item.id !== 'severance' || reference === null || disciplinaryNeutral(r, reference))
    return null;
  return r.item.zeroReason === 'disciplinary_dismissal'
    ? 'client.unfair_reference'
    : 'client.unfair_reference_objective';
}

type MissingAnswer = NonNullable<Item['missingAnswer']>;

const MISSING_STATUS: Record<MissingAnswer, ClientKey> = {
  days_taken: 'client.status.not_checkable_days',
  cause: 'client.status.not_checkable_cause',
  pre_erte_salary: 'client.status.not_checkable_erte',
};

// What a figure the review cannot give depends on: an answer left as «No lo sé», or the agreement.
const MISSING_RANGE: Record<MissingAnswer, ClientKey> = {
  days_taken: 'client.range.days',
  cause: 'client.range.cause',
  pre_erte_salary: 'client.range.erte',
};

export const missingRangeKey = (item: Item): ClientKey =>
  item.missingAnswer === undefined ? 'client.range.agreement' : MISSING_RANGE[item.missingAnswer];

function statusAndAmount(
  r: ItemResult,
  reference: number | null,
): { key: ClientKey; amount: number } {
  if (disciplinaryNeutral(r, reference))
    return { key: 'client.status.no_severance_disciplinary', amount: reference ?? 0 };
  if (r.status === 'not_checkable' && r.item.missingAnswer !== undefined)
    return { key: MISSING_STATUS[r.item.missingAnswer], amount: 0 };
  return { key: `client.status.${visibleStatus(r)}`, amount: r.difference ?? 0 };
}

export function statusText(r: ItemResult, tr: Translate, reference: number | null = null) {
  const { key, amount } = statusAndAmount(r, reference);
  return tr(key, { importe: formatEuros(amount) });
}

// «2015-11-13» → «13-11-2015».
export const sourceDate = (iso: string) => iso.split('-').reverse().join('-');

// An amount keeps its Spanish format and reads left to right, also inside right-to-left text.
function amountEl(n: number, format: (n: number) => string = formatEuros): HTMLElement {
  const bdi = document.createElement('bdi');
  bdi.dir = 'ltr';
  bdi.textContent = format(n);
  return bdi;
}

type Piece = string | Node;

// Fills a translated template, putting each `{variable}` amount in its own isolated element.
// A variable can also be a piece already built, such as «unos 1.225 €».
function piecesWithAmounts(
  template: string,
  figures: Record<string, number | Piece[]>,
  format?: (n: number) => string,
): Piece[] {
  return template.split(/\{(\w+)\}/).flatMap((part, i): Piece[] => {
    if (i % 2 === 0) return [part];
    const v = figures[part];
    if (v === undefined) return [`{${part}}`];
    return typeof v === 'number' ? [amountEl(v, format)] : v;
  });
}

function setWithAmounts(
  el: HTMLElement,
  template: string,
  figures: Record<string, number | Piece[]>,
  format?: (n: number) => string,
): void {
  el.replaceChildren(...piecesWithAmounts(template, figures, format));
}

function setRange(el: HTMLElement, item: Item, tr: Translate): void {
  const { range } = item;
  const deduction = item.direction === 'deduction';
  if (range === null) el.textContent = tr(missingRangeKey(item));
  else if (deduction) el.replaceChildren(amountEl(range.max));
  else if (range.min === range.max) el.replaceChildren(amountEl(range.min));
  else setWithAmounts(el, tr('client.range.between'), { minimo: range.min, maximo: range.max });
}

function template(container: HTMLElement, name: string): DocumentFragment {
  const t = container.querySelector<HTMLTemplateElement>(`template[data-template="${name}"]`);
  if (!t) throw new Error(`Missing template ${name}`);
  return t.content.cloneNode(true) as DocumentFragment;
}

function setText(root: ParentNode, selector: string, text: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  el.textContent = text;
  return el;
}

function renderItem(
  container: HTMLElement,
  r: ItemResult,
  unfairReference: number | null,
  tr: Translate,
): DocumentFragment {
  const { item } = r;
  const deduction = item.direction === 'deduction';
  const frag = template(container, 'item');
  const sheet = frag.querySelector<HTMLElement>('[data-item]');
  if (!sheet) throw new Error('Missing [data-item]');
  const titleId = `item-${item.id}`;
  sheet.dataset['item'] = item.id;
  sheet.dataset['tone'] = TONE[item.id];
  const status = visibleStatus(r);
  const neutral = status === 'no_severance';
  sheet.dataset['state'] = status;
  setText(sheet, '[data-tab-number]', TAB_NUMBER[TONE[item.id]] ?? '');
  sheet.setAttribute('aria-labelledby', titleId);
  setText(sheet, '[data-title]', tr(`client.item.${item.id}`)).id = titleId;
  const { key, amount } = statusAndAmount(r, unfairReference);
  setWithAmounts(setText(sheet, '[data-status-text]', ''), tr(key), { importe: amount });
  sheet
    .querySelector('[data-mark] use')
    ?.setAttributeNS(null, 'href', `#mark-${status.replace(/_/g, '-')}`);
  setText(
    sheet,
    '[data-range-label]',
    tr(deduction ? 'client.range.maximum_deduction' : 'client.range.minimum'),
  );
  setRange(setText(sheet, '[data-range]', ''), item, tr);
  const employer = setText(sheet, '[data-employer]', tr('client.no_figure'));
  if (r.employerFigure !== null) employer.replaceChildren(amountEl(r.employerFigure));
  const figures = sheet.querySelector<HTMLElement>('[data-figures]');
  if (figures) figures.hidden = neutral;
  const citation = sheet.querySelector<HTMLElement>('[data-citation]');
  const source = item.sources[0];
  if (citation && neutral && source) {
    const a = template(container, 'source').querySelector('a');
    if (a) {
      a.href = source.url;
      a.textContent = source.citation;
      citation.replaceChildren(a);
      citation.hidden = false;
    }
  }
  setText(sheet, '[data-calculation]', calculationText(item.calculation, tr));
  const counted = sheet.querySelector<HTMLElement>('[data-counted]');
  if (counted) {
    counted.hidden = item.counted === undefined;
    counted.textContent = item.counted ? phraseText(item.counted, tr) : '';
  }
  const basedOn = sheet.querySelector<HTMLElement>('[data-based-on]');
  if (basedOn) basedOn.hidden = !item.basedOnYourAnswer;
  const orMore = sheet.querySelector<HTMLElement>('[data-or-more]');
  if (orMore) {
    orMore.hidden = item.orMore === undefined;
    orMore.textContent = item.orMore ? tr(`client.or_more.${item.orMore}`) : '';
  }
  const agreement = sheet.querySelector<HTMLElement>('[data-agreement]');
  if (agreement) agreement.hidden = !(item.dependsOnAgreement && item.range !== null);
  const reference = sheet.querySelector<HTMLElement>('[data-reference]');
  if (reference) {
    const key = referenceKey(r, unfairReference);
    reference.hidden = key === null;
    if (key !== null && unfairReference !== null)
      setWithAmounts(reference, tr(key), { importe: unfairReference });
  }
  const list = sheet.querySelector<HTMLElement>('[data-sources]');
  if (list) setSources(container, list, item.sources, tr);
  return frag;
}

function setSources(
  container: HTMLElement,
  list: HTMLElement,
  sources: readonly Source[],
  tr: Translate,
): void {
  list.replaceChildren(
    ...sources.map((source) => {
      const li = template(container, 'source');
      const a = li.querySelector('a');
      if (a) {
        a.href = source.url;
        a.textContent = source.citation;
      }
      const inForce = li.querySelector<HTMLElement>('[data-in-force]');
      if (inForce) {
        inForce.textContent = tr('client.source.in_force', {
          fecha: sourceDate(source.inForceSince),
        });
        inForce.hidden = false;
      }
      return li;
    }),
  );
}

// «unos 1.225 €», or «entre 1.225 € y 1.575 €» when the children are unknown.
function approximate(r: Range, tr: Translate): Piece[] {
  const rounded = { minimo: Math.round(r.min), maximo: Math.round(r.max) };
  return rounded.minimo === rounded.maximo
    ? piecesWithAmounts(
        tr('client.unemployment.about'),
        { importe: rounded.minimo },
        formatWholeEuros,
      )
    : piecesWithAmounts(tr('client.range.between'), rounded, formatWholeEuros);
}

const MAX_DAYS = BENEFIT_2026.scale[0][1];

// The duration sentence. 720 days is the legal ceiling, so it is never «al menos» nor «puede ser
// más»; «hasta» keeps its own caveat; 0 days never reads «hasta 0».
export function durationKey(d: BenefitDuration): ClientKey {
  if (d.days === 0) return 'client.unemployment.duration.depends';
  if (d.kind === 'up_to') return 'client.unemployment.duration.up_to';
  if (d.days >= MAX_DAYS) return 'client.unemployment.duration.maximum';
  return `client.unemployment.duration.${d.kind}`;
}

// Unpaid holidays add days, so «puede salir algo más» only fits where more is still possible.
export const withHolidayNote = (d: BenefitDuration): boolean =>
  d.days > 0 && d.days < MAX_DAYS && d.kind !== 'up_to';

// Without the cause the estimate stands only if it is a dismissal or the end of a fixed term.
export const benefitStatusKey = (p: BenefitEstimate, cause: Cause): ClientKey =>
  p.entitled === 'no'
    ? 'client.unemployment.status.no'
    : cause === 'unknown'
      ? 'client.unemployment.status.unknown'
      : 'client.unemployment.status.yes';

// The benefit sheet: whether the cause gives the benefit, roughly how much and for how long, in the same
// words for every figure: «unos», «al menos», «hasta», never an exact promise.
export function renderBenefit(
  sheet: HTMLElement,
  p: BenefitEstimate,
  cause: Cause,
  children: Children,
  tr: Translate,
): void {
  const container = sheet.closest<HTMLElement>('[data-review]') ?? sheet;
  sheet.dataset['state'] = benefitState(p);
  const entitled = p.entitled === 'yes';
  setText(sheet, '[data-benefit-status-text]', tr(benefitStatusKey(p, cause)));
  sheet
    .querySelector('[data-benefit-mark] use')
    ?.setAttributeNS(null, 'href', entitled ? '#mark-benefit-yes' : '#mark-no-severance');
  for (const el of sheet.querySelectorAll<HTMLElement>('[data-benefit-yes]')) el.hidden = !entitled;
  for (const el of sheet.querySelectorAll<HTMLElement>('[data-benefit-no]')) el.hidden = entitled;
  const sources = sheet.querySelector<HTMLElement>('[data-benefit-sources]');
  if (sources) setSources(container, sources, p.sources, tr);
  setText(sheet, '[data-benefit-reason]', tr(`client.unemployment.reason.${cause}`));
  if (p.entitled === 'no') return;

  const amountText = setText(sheet, '[data-benefit-amount]', '');
  const deduction = setText(sheet, '[data-benefit-deduction]', '');
  const childrenUnknown = setText(
    sheet,
    '[data-benefit-children-unknown]',
    tr('client.unemployment.amount.children_unknown'),
  );
  deduction.hidden = p.figures === null;
  const fullTimeNote = sheet.querySelector<HTMLElement>('[data-benefit-full-time]');
  if (fullTimeNote) fullTimeNote.hidden = p.figures === null;
  childrenUnknown.hidden = true;
  if (p.figures === null)
    amountText.textContent = tr(
      p.noFigures === 'base_below_minimum'
        ? 'client.unemployment.no_figures_base'
        : 'client.unemployment.no_figures',
    );
  else {
    const { firstStretch, secondStretch, contribution } = p.figures;
    // With no duration known yet, both stretches are shown: it may well pass 180 days.
    const twoStretches = p.secondStretch || p.duration.days === 0;
    setWithAmounts(
      amountText,
      tr(twoStretches ? 'client.unemployment.amount.two' : 'client.unemployment.amount.one'),
      {
        tramo1: approximate(firstStretch, tr),
        tramo2: approximate(secondStretch, tr),
      },
    );
    setWithAmounts(
      deduction,
      tr('client.unemployment.deduction'),
      { ss: Math.round(contribution.min) },
      formatWholeEuros,
    );
    childrenUnknown.hidden =
      children !== null ||
      (Math.round(firstStretch.min) === Math.round(firstStretch.max) &&
        (!twoStretches || Math.round(secondStretch.min) === Math.round(secondStretch.max)));
  }

  const { duration } = p;
  const days = formatInteger(duration.days);
  const months = formatInteger(duration.days / 30);
  setText(
    sheet,
    '[data-benefit-duration]',
    tr(durationKey(duration), { dias: days, meses: months }),
  );
  setText(
    sheet,
    '[data-benefit-duration-note]',
    tr('client.unemployment.duration.holiday_note'),
  ).hidden = !withHolidayNote(duration);

  setText(sheet, '[data-benefit-qualifying]', qualifyingText(p, tr));
}

// Whether the days contributed reach the 360 the benefit needs, in words.
export function qualifyingText(
  p: Extract<BenefitEstimate, { entitled: 'yes' }>,
  tr: Translate,
): string {
  if (p.qualifying === 'met_by_this_contract')
    return tr('client.unemployment.qualifying.this_contract');
  if (p.qualifying === 'met_with_other_contracts')
    return tr('client.unemployment.qualifying.other_contracts', {
      dias: formatInteger(p.contributedDays),
    });
  return p.duration.kind !== 'at_least'
    ? tr('client.unemployment.qualifying.depends_other_contracts', {
        dias: formatInteger(p.contributedDays),
      })
    : tr('client.unemployment.qualifying.depends', { dias: formatInteger(p.contractDays) });
}

export function renderReview(container: HTMLElement, r: Review, tr: Translate): void {
  const items = container.querySelector('[data-items]');
  if (!items) throw new Error('Missing the result container');
  items.replaceChildren(...r.items.map((p) => renderItem(container, p, r.unfairReference, tr)));
  renderUnchecked(container, r, tr);
}

function renderUnchecked(container: HTMLElement, r: Review, tr: Translate): void {
  const unchecked = container.querySelector('[data-unchecked]');
  if (!unchecked) throw new Error('Missing the unchecked list');
  unchecked.replaceChildren(
    ...r.uncheckedCodes.map((code) => {
      const li = document.createElement('li');
      li.textContent = tr(`client.unchecked.${code}`);
      return li;
    }),
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
      p.textContent = tr(`client.error.${code}`);
      p.hidden = false;
      p.closest<HTMLElement>('[data-field]')?.setAttribute('data-has-error', '');
    }
    for (const el of form.querySelectorAll(`[name="${field}"]`))
      el.setAttribute('aria-invalid', 'true');
  }
}

// An approximate amount for the summary: to the nearest 10 €.
export const roundToTens = (n: number): number => Math.round(n / 10) * 10;

const SETTLED: ReadonlySet<VisibleStatus> = new Set([
  'matches',
  'above_minimum',
  'deduction_within_max',
  'not_checkable',
  'no_severance',
]);
const COMPARED: ReadonlySet<VisibleStatus> = new Set([
  'matches',
  'above_minimum',
  'deduction_within_max',
]);

export type SummaryHeadline = 'shortfall' | 'all_match' | 'nothing_short' | 'no_figures';

export function summaryHeadline(r: Review): SummaryHeadline {
  const statuses = r.items.map(visibleStatus);
  if (statuses.some((s) => s === 'below_minimum' || s === 'deduction_too_high')) return 'shortfall';
  if (statuses.every((s) => SETTLED.has(s)) && statuses.some((s) => COMPARED.has(s)))
    return 'all_match';
  return r.items.every((p) => p.employerFigure === null) ? 'no_figures' : 'nothing_short';
}

// One line per item that falls short: its name and roughly how much, never the range or the method.
export function shortfallLine(r: ItemResult, tr: Translate): Piece[] | null {
  const deduction = r.status === 'deduction_too_high';
  if (r.status !== 'below_minimum' && !deduction) return null;
  const amount = roundToTens(r.difference ?? 0);
  const partida = [tr(`client.item.${r.item.id}`)];
  if (amount < 10)
    return piecesWithAmounts(
      tr(deduction ? 'client.summary.deduction_little' : 'client.summary.missing_little'),
      { partida },
    );
  return piecesWithAmounts(
    tr(deduction ? 'client.summary.deduction' : 'client.summary.missing'),
    { partida, importe: amount },
    formatWholeEuros,
  );
}

function summaryBenefit(p: BenefitEstimate, cause: Cause, tr: Translate): Piece[] {
  if (p.entitled === 'no') return [tr('client.summary.benefit_no')];
  if (cause === 'unknown') return [tr('client.summary.benefit_unknown')];
  if (p.figures === null) return [tr('client.summary.benefit_yes_no_figures')];
  const { min, max } = p.figures.firstStretch;
  return piecesWithAmounts(tr('client.summary.benefit_yes'), {
    cuantia: approximate({ min: roundToTens(min), max: roundToTens(max) }, tr),
  });
}

const DISMISSALS: readonly Cause[] = [
  'objective_dismissal',
  'collective_dismissal',
  'unfair_dismissal',
  'disciplinary_dismissal',
];

// The deadlines that run for the person's own case: never behind the pass.
export function summaryDeadlines(cause: Cause, benefit: BenefitEstimate): ClientKey[] {
  return [
    ...(DISMISSALS.includes(cause) ? (['client.summary.dismissal_deadline'] as const) : []),
    ...(benefit.entitled === 'yes' ? (['client.summary.benefit_deadline'] as const) : []),
  ];
}

// The result before the pass: whether money is missing and roughly how much, the holiday days it
// counted, one line on the benefit and the deadlines that apply. The detail is the pass's.
export function renderSummary(
  container: HTMLElement,
  r: Review,
  benefit: BenefitEstimate,
  cause: Cause,
  tr: Translate,
): void {
  const summary = container.querySelector<HTMLElement>('[data-summary]');
  if (!summary) return;
  setText(summary, '[data-summary-headline]', tr(`client.summary.${summaryHeadline(r)}`));
  const lines = summary.querySelector('[data-summary-lines]');
  lines?.replaceChildren(
    ...r.items.flatMap((p) => {
      const line = shortfallLine(p, tr);
      if (!line) return [];
      const li = document.createElement('li');
      li.replaceChildren(...line);
      return [li];
    }),
  );
  const counted = r.items.find((p) => p.item.counted)?.item.counted;
  const note = setText(summary, '[data-summary-counted]', counted ? phraseText(counted, tr) : '');
  note.hidden = !counted;
  setText(summary, '[data-summary-benefit]', '').replaceChildren(
    ...summaryBenefit(benefit, cause, tr),
  );
  summary.querySelector('[data-summary-deadlines]')?.replaceChildren(
    ...summaryDeadlines(cause, benefit).map((key) => {
      const p = document.createElement('p');
      p.className = 'item__note';
      p.textContent = tr(key);
      return p;
    }),
  );
}

export interface ResultData {
  readonly review: Review;
  readonly benefit: BenefitEstimate;
  readonly cause: Cause;
  readonly children: Children;
  readonly erte?: Erte | undefined;
  // Answers that stay on this page: they reach only these warnings.
  readonly situations?: readonly ProtectedSituation[];
}

export type WarningId = 'cause_unknown' | 'null_dismissal' | 'erte_unknown' | 'late_interest';

// A warning beside the items, with no figure that opens a pass: never behind it either.
export interface Warning {
  readonly id: WarningId;
  readonly lines: readonly Piece[][];
  readonly sources: readonly Source[];
  // How a figure in it is worked out; only with the detail unlocked.
  readonly calculation: string | null;
}

// The 20 working days to challenge a dismissal also apply when the cause is not known.
const challengeable = (cause: Cause) => DISMISSALS.includes(cause) || cause === 'unknown';

// One sentence of the late-payment warning: its key and the figure it carries, if any.
export interface InterestLine {
  readonly key: ClientKey;
  readonly importe?: number;
  readonly dias?: number;
}

// The interest while the year to claim lasts, then that year: the 20 working days to challenge a
// dismissal are another deadline and are said apart.
export function lateInterestLines(l: LateInterest, cause: Cause): InterestLine[] {
  const lines: InterestLine[] = [];
  if (l.daysLeft >= 0)
    lines.push(
      l.amount > 0
        ? { key: 'client.warning.late_interest.amount', importe: l.amount }
        : { key: 'client.warning.late_interest.none' },
    );
  lines.push(
    l.daysLeft > 1
      ? { key: 'client.warning.late_interest.days_left', dias: l.daysLeft }
      : {
          key:
            l.daysLeft === 1
              ? 'client.warning.late_interest.one_day_left'
              : l.daysLeft === 0
                ? 'client.warning.late_interest.last_day'
                : 'client.warning.late_interest.lapsed',
        },
  );
  if (challengeable(cause)) lines.push({ key: 'client.warning.late_interest.other_deadline' });
  return lines;
}

const interestPieces = (line: InterestLine, tr: Translate): Piece[] =>
  line.importe === undefined
    ? [tr(line.key, line.dias === undefined ? {} : { dias: formatInteger(line.dias) })]
    : pieces(tr(line.key), { importe: shownAmount(shownOne(line.importe)) });

const PROTECTED: readonly ProtectedSituation[] = [
  'pregnancy',
  'family_leave',
  'back_from_leave',
  'care_rights',
  'gender_violence',
];

// The warnings a review carries, in order. The null warning never carries a figure, and a sick
// leave is worded more weakly than the cases art. 55.5 ET lists.
export function warnings(d: ResultData, locked: boolean, tr: Translate): Warning[] {
  const out: Warning[] = [];
  if (d.cause === 'unknown')
    out.push({
      id: 'cause_unknown',
      lines: [[tr('client.warning.cause_unknown')]],
      sources: [],
      calculation: null,
    });
  const situations = challengeable(d.cause) ? (d.situations ?? []) : [];
  const listed = situations.some((s) => PROTECTED.includes(s));
  const sick = situations.includes('sick_leave');
  if (listed || sick)
    out.push({
      id: 'null_dismissal',
      lines: [
        ...(listed ? [[tr('client.warning.null_dismissal.protected')]] : []),
        ...(sick ? [[tr('client.warning.null_dismissal.sick_leave')]] : []),
        [tr('client.warning.null_dismissal.effects')],
        [tr('client.warning.null_dismissal.deadline')],
      ],
      sources: [SOURCES.et55_5, SOURCES.et53, SOURCES.et59, ...(sick ? [SOURCES.ley15_2022] : [])],
      calculation: null,
    });
  if (d.erte === 'unknown' && DISMISSALS.includes(d.cause))
    out.push({
      id: 'erte_unknown',
      lines: [[tr('client.warning.erte_unknown')]],
      sources: [],
      calculation: null,
    });
  const interest = d.review.lateInterest;
  if (interest)
    out.push({
      id: 'late_interest',
      lines: lateInterestLines(interest, d.cause).map((line) => interestPieces(line, tr)),
      sources: interest.sources,
      calculation:
        locked || interest.daysLeft < 0 ? null : calculationText(interest.calculation, tr),
    });
  return out;
}

const WARNING_TONE: Record<WarningId, readonly [string, string]> = {
  cause_unknown: ['cause', '01'],
  null_dismissal: ['legal', 'ET'],
  erte_unknown: ['salary', '03'],
  late_interest: ['legal', 'ET'],
};

function renderWarnings(root: HTMLElement, d: ResultData, locked: boolean, tr: Translate) {
  const box = root.querySelector<HTMLElement>('[data-warnings]');
  if (!box) return;
  box.replaceChildren(
    ...warnings(d, locked, tr).map((w) => {
      const frag = template(root, 'warning');
      const section = frag.querySelector<HTMLElement>('[data-warning]');
      if (!section) throw new Error('Missing [data-warning]');
      const [tone, tab] = WARNING_TONE[w.id];
      section.dataset['warning'] = w.id;
      section.dataset['tone'] = tone;
      setText(section, '[data-warning-tab]', tab);
      const title = setText(section, '[data-warning-title]', tr(`client.warning.${w.id}.title`));
      title.id = `warning-${w.id}`;
      section.setAttribute('aria-labelledby', title.id);
      const lines = section.querySelector('[data-warning-lines]');
      lines?.replaceChildren(
        ...w.lines.map((line) => {
          const p = document.createElement('p');
          p.className = 'help';
          p.replaceChildren(...line);
          return p;
        }),
      );
      const detail = section.querySelector<HTMLElement>('[data-warning-detail]');
      if (detail) detail.hidden = w.calculation === null && w.sources.length === 0;
      const calculation = setText(section, '[data-warning-calculation]', w.calculation ?? '');
      calculation.hidden = w.calculation === null;
      const list = section.querySelector<HTMLElement>('[data-warning-sources]');
      if (list) setSources(root, list, w.sources, tr);
      return frag;
    }),
  );
  box.hidden = box.childElementCount === 0;
}

// Locked, only the summary is built: the detail is not in the page at all, not even hidden, so
// nothing a pass pays for can be read from it. Unlocked (a verified pass, or a build without the
// pass), the detail is cloned in from its templates and filled.
export function renderResult(root: HTMLElement, d: ResultData, locked: boolean, tr: Translate) {
  const summary = root.querySelector<HTMLElement>('[data-summary]');
  const lead = root.querySelector<HTMLElement>('[data-lead]');
  if (lead) lead.hidden = locked;
  if (summary) summary.hidden = !locked;
  renderUnchecked(root, d.review, tr);
  renderWarnings(root, d, locked, tr);
  const slots = [...root.querySelectorAll<HTMLElement>('[data-slot]')];
  if (locked) {
    root.querySelector('[data-items]')?.replaceChildren();
    for (const slot of slots) slot.replaceChildren();
    renderSummary(root, d.review, d.benefit, d.cause, tr);
    return;
  }
  for (const slot of slots) slot.replaceChildren(template(root, slot.dataset['slot'] ?? ''));
  renderReview(root, d.review, tr);
  const sheet = root.querySelector<HTMLElement>('[data-benefit]');
  if (sheet) renderBenefit(sheet, d.benefit, d.cause, d.children, tr);
}
