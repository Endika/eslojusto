import type { Status, ItemResult } from '../engine/compare';
import type { Range } from '../engine/money';
import type { Source } from '../engine/sources';
import {
  BENEFIT_2026,
  type BenefitDuration,
  type BenefitEstimate,
  type Children,
} from '../engine/unemployment';
import type { Review } from '../engine/review';
import type { Cause, Item, ItemId } from '../engine/types';
import type { ClientKey, Translate } from '../i18n/client';
import { benefitState } from '../analytics/events';
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

function statusAndAmount(
  r: ItemResult,
  reference: number | null,
): { key: ClientKey; amount: number } {
  if (disciplinaryNeutral(r, reference))
    return { key: 'client.status.no_severance_disciplinary', amount: reference ?? 0 };
  if (r.status === 'not_checkable' && r.item.missingAnswer === 'days_taken')
    return { key: 'client.status.not_checkable_days', amount: 0 };
  return { key: `client.status.${visibleStatus(r)}`, amount: r.difference ?? 0 };
}

export function statusText(r: ItemResult, tr: Translate, reference: number | null = null) {
  const { key, amount } = statusAndAmount(r, reference);
  return tr(key, { importe: formatEuros(amount) });
}

// «2015-11-13» → «13-11-2015».
const sourceDate = (iso: string) => iso.split('-').reverse().join('-');

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
  if (range === null)
    el.textContent = tr(
      item.missingAnswer === 'days_taken' ? 'client.range.days' : 'client.range.agreement',
    );
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
  setText(sheet, '[data-calculation]', item.calculation);
  const basedOn = sheet.querySelector<HTMLElement>('[data-based-on]');
  if (basedOn) basedOn.hidden = !item.basedOnYourAnswer;
  const agreement = sheet.querySelector<HTMLElement>('[data-agreement]');
  if (agreement) agreement.hidden = !(item.dependsOnAgreement && item.range !== null);
  const reference = sheet.querySelector<HTMLElement>('[data-reference]');
  if (reference) {
    const applies =
      item.id === 'severance' &&
      unfairReference !== null &&
      !disciplinaryNeutral(r, unfairReference);
    reference.hidden = !applies;
    if (applies)
      setWithAmounts(reference, tr('client.unfair_reference'), {
        importe: unfairReference,
      });
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
  setText(
    sheet,
    '[data-benefit-status-text]',
    tr(entitled ? 'client.unemployment.status.yes' : 'client.unemployment.status.no'),
  );
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

  const withOtherContracts = duration.kind !== 'at_least';
  setText(
    sheet,
    '[data-benefit-qualifying]',
    p.qualifying === 'met_by_this_contract'
      ? tr('client.unemployment.qualifying.this_contract')
      : p.qualifying === 'met_with_other_contracts'
        ? tr('client.unemployment.qualifying.other_contracts', {
            dias: formatInteger(p.contributedDays),
          })
        : withOtherContracts
          ? tr('client.unemployment.qualifying.depends_other_contracts', {
              dias: formatInteger(p.contributedDays),
            })
          : tr('client.unemployment.qualifying.depends', { dias: formatInteger(p.contractDays) }),
  );
}

export function renderReview(container: HTMLElement, r: Review, tr: Translate): void {
  const items = container.querySelector('[data-items]');
  const unchecked = container.querySelector('[data-unchecked]');
  if (!items || !unchecked) throw new Error('Missing the result container');
  items.replaceChildren(...r.items.map((p) => renderItem(container, p, r.unfairReference, tr)));
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
