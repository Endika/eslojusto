import type {
  RentalCalculation,
  RentalFigure,
  RentalPhrase,
  RentalPhraseKey,
} from '../engine/rental/calculation';
import type { InformationBlock } from '../engine/rental/information';
import type { ItemReading } from '../engine/rental/item';
import type { DoubtReason } from '../engine/rental/outcome';
import type { RateFigure, RentUpdateReading } from '../engine/rental/rent-update';
import type { RentalItemResult, RentalReview } from '../engine/rental/review';
import type { RentalSource } from '../engine/rental/rules';
import type { OutOfScopeReason } from '../engine/rental/scope';
import type { ItemStatus, RentalInput } from '../engine/rental/types';
import {
  formatCalculationEuros,
  formatDays,
  formatEuros,
  formatInteger,
  formatWholeEuros,
} from '../calculator/number';
import type { ClientKey, Translate } from '../i18n/client';
import type { FieldError } from './form';
import {
  headline,
  roundToTens,
  shownOne,
  shownPair,
  summarise,
  totalLines,
  totalShare,
  type ItemSummary,
  type Shown,
  type Verdict,
} from './summary';

// «2025-03-14» → «14-03-2025».
export const dayText = (iso: string): string => iso.split('-').reverse().join('-');

const MONTH = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// «2025-02» → «febrero de 2025».
export const monthText = (month: string): string => MONTH.format(new Date(`${month}-01T00:00:00Z`));

const PERCENT = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' });

export const percentText = (n: number): string => `${PERCENT.format(n)} %`;

// A calendar year reads as it is written, «2022», never with a thousands dot.
const YEAR_VARS: ReadonlySet<string> = new Set(['year']);

function figureText(f: RentalFigure, tr: Translate, name: string): string {
  if (typeof f === 'number') return String(f);
  if (YEAR_VARS.has(name) && 'integer' in f) return String(f.integer);
  if ('percent' in f) return percentText(f.percent);
  if ('month' in f) return monthText(f.month);
  if ('date' in f) return dayText(f.date);
  if ('index' in f) return tr(`client.rental.index.${f.index}`);
  if ('days' in f) return formatDays(f.days);
  if ('euros' in f) return formatCalculationEuros(f.euros);
  return formatInteger(f.integer);
}

// Phrases that count something, with the variable that says how many: «1 mes», «2 meses».
const COUNTED = {
  'rent_update.before_anniversary': 'months',
  'rent_update.charged_before_notice': 'months',
  'rent_update.notice_not_written': 'months',
  'deposit.interest_stretch': 'days',
} as const satisfies Partial<Record<RentalPhraseKey, string>>;
type CountedKey = keyof typeof COUNTED;

const isCounted = (key: RentalPhraseKey): key is CountedKey => key in COUNTED;

function phraseKey(p: RentalPhrase): ClientKey {
  if (!isCounted(p.key))
    return `client.rental.calculation.${p.key as Exclude<RentalPhraseKey, CountedKey>}`;
  const count = p.vars?.[COUNTED[p.key]];
  const one =
    typeof count === 'object' &&
    (('integer' in count && count.integer === 1) || ('days' in count && count.days === 1));
  return `client.rental.calculation.${p.key}_${one ? 'one' : 'many'}`;
}

export function phraseText(p: RentalPhrase, tr: Translate): string {
  const vars = Object.fromEntries(
    Object.entries(p.vars ?? {}).map(([name, v]) => [
      name,
      typeof v === 'object' && 'key' in v ? phraseText(v, tr) : figureText(v, tr, name),
    ]),
  );
  return tr(phraseKey(p), vars);
}

export const calculationLines = (c: RentalCalculation, tr: Translate): string[] =>
  c.map((p) => phraseText(p, tr));

// An amount keeps its Spanish format and reads left to right, also inside right-to-left text.
function amountEl(n: number, format: (n: number) => string = formatEuros): HTMLElement {
  const bdi = document.createElement('bdi');
  bdi.dir = 'ltr';
  bdi.textContent = format(n);
  return bdi;
}

type Piece = string | Node;

// Fills a translated template, putting each `{variable}` amount in its own isolated element.
function pieces(
  template: string,
  vars: Readonly<Record<string, number | string | Piece[]>>,
  format: (n: number) => string = formatWholeEuros,
): Piece[] {
  return template.split(/\{(\w+)\}/).flatMap((part, i): Piece[] => {
    if (i % 2 === 0) return part === '' ? [] : [part];
    const v = vars[part];
    if (v === undefined) return [`{${part}}`];
    if (typeof v === 'number') return [amountEl(v, format)];
    return typeof v === 'string' ? [v] : v;
  });
}

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

// ---------- Summary ----------

// An amount as decided for it: whole euros to the ten, or with its cents.
const amountOf = (s: Shown): Piece[] => [
  amountEl(s.amount, s.cents ? formatEuros : formatWholeEuros),
];

// «unos 340 €»; an amount kept with its cents is said as it is.
const approx = (s: Shown, tr: Translate): Piece[] =>
  s.cents ? amountOf(s) : pieces(tr('client.rental.about'), { importe: amountOf(s) });

const FIGURED: ReadonlySet<ItemStatus> = new Set(['paid_over', 'owed', 'over_cap']);

// «Pagas de más: unos 340 €»; under 10 € the summary says so rather than «unos 0 €».
export function verdictPieces(v: Verdict, tr: Translate): Piece[] {
  if (!FIGURED.has(v.status)) return [tr(`client.rental.status.${v.status}`)];
  if (v.amount === null) return [tr('client.rental.status.over_cap_no_amount')];
  const status = v.status as 'paid_over' | 'owed' | 'over_cap';
  if (roundToTens(v.amount) < 10) return [tr(`client.rental.status.${status}_little`)];
  return pieces(tr(`client.rental.status.${status}`), { importe: approx(shownOne(v.amount), tr) });
}

export function reasonsText(reasons: readonly DoubtReason[], tr: Translate): string {
  const texts = reasons.map((r) => tr(`client.rental.reason.${r}`));
  const last = texts.pop() ?? '';
  if (texts.length === 0) return last;
  return tr('client.rental.reason_join', {
    a: texts.reduce((a, b) => tr('client.rental.reason_list', { a, b })),
    b: last,
  });
}

// The euros a reading stands for: its figure, or none at all for a result without one; only a
// result within the limit is truly «0 €».
const figureOf = (v: Verdict): number | null =>
  v.amount ?? (v.status === 'within_limit' ? 0 : null);

// One reading in words, with its amount when it carries one: «pagas de más unos 360 €».
function readingPieces(v: Verdict, tr: Translate): Piece[] {
  if (v.amount === null || !FIGURED.has(v.status)) return [tr(`client.rental.reading.${v.status}`)];
  const status = v.status as 'paid_over' | 'owed' | 'over_cap';
  return pieces(tr(`client.rental.reading_amount.${status}`), {
    importe: approx(shownOne(v.amount), tr),
  });
}

// «Depende de cómo se lea una norma derogada: entre 0 € y 50 €»; when a reading has no figure,
// each one in words: «no se puede comprobar o pagas de más unos 360 €».
export function dependsPieces(
  s: Extract<ItemSummary, { kind: 'depends' }>,
  tr: Translate,
): Piece[] {
  const motivo = reasonsText(s.reasons, tr);
  const low = figureOf(s.low);
  const high = figureOf(s.high);
  if (low === null || high === null || (s.low.status === s.high.status && low === high))
    return pieces(tr('client.rental.depends_status'), {
      motivo,
      una: readingPieces(s.low, tr),
      otra: readingPieces(s.high, tr),
    });
  const [minimo, maximo] = shownPair(low, high);
  return pieces(tr('client.rental.depends'), {
    motivo,
    minimo: amountOf(minimo),
    maximo: amountOf(maximo),
  });
}

const TONE: Record<RentalItemResult['kind'], string> = {
  fee: 'dates',
  guarantees: 'dates',
  guarantee: 'dates',
  advance: 'dates',
  rent_update: 'salary',
  charge: 'holidays',
  deposit_return: 'settlement',
  deposit_interest: 'settlement',
};
const TAB_NUMBER: Record<string, string> = {
  dates: '02',
  salary: '03',
  holidays: '04',
  settlement: '05',
};

export function itemTitle(item: RentalItemResult, input: RentalInput, tr: Translate): string {
  switch (item.kind) {
    case 'rent_update':
      return tr('client.rental.item.rent_update', {
        fecha: dayText(
          `${item.anniversary.y}-${String(item.anniversary.m).padStart(2, '0')}-${String(item.anniversary.d).padStart(2, '0')}`,
        ),
      });
    case 'fee': {
      const fee = input.fees[item.index ?? 0];
      return tr('client.rental.item.fee', {
        concepto: fee ? tr(`client.rental.fee.${fee.kind}`) : '',
      });
    }
    case 'guarantee': {
      const g = input.guarantees[item.index ?? 0];
      return tr('client.rental.item.guarantee', {
        tipo: g ? tr(`client.rental.guarantee.${g.kind}`) : '',
      });
    }
    case 'charge': {
      const c = input.charges[item.index ?? 0];
      const concepto = c ? tr(`client.rental.charge.${c.kind}`) : '';
      return item.year === null
        ? concepto
        : tr('client.rental.item.charge_year', { concepto, ejercicio: String(item.year) });
    }
    default:
      return tr(`client.rental.item.${item.kind}`);
  }
}

const NORM_STATUS: Record<RentalSource['status'], ClientKey> = {
  in_force: 'client.rental.norm.in_force',
  pending_validation: 'client.rental.norm.pending_validation',
  repealed: 'client.rental.norm.repealed',
};

// Each rule an item rests on: the norm and article, a link to it and how it stands today.
function renderRules(
  container: ParentNode,
  list: HTMLElement,
  sources: readonly RentalSource[],
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
      status.textContent = tr(NORM_STATUS[s.status], {
        fecha: s.statusSince ? dayText(s.statusSince) : '',
      });
      return li;
    }),
  );
}

const markOf = (s: ItemSummary): string =>
  s.kind === 'depends' ? 'depends' : s.verdict.status.replace(/_/g, '-');

function renderItem(
  container: ParentNode,
  item: RentalItemResult,
  input: RentalInput,
  position: number,
  tr: Translate,
): DocumentFragment {
  const frag = template(container, 'item');
  const card = find(frag, '[data-item]');
  const s = summarise(item);
  const titleId = `rental-item-${position}`;
  card.dataset['item'] = item.kind;
  card.dataset['state'] = s.kind === 'depends' ? 'depends' : s.verdict.status;
  card.dataset['tone'] = TONE[item.kind];
  card.setAttribute('aria-labelledby', titleId);
  find(card, '[data-tab-number]').textContent = TAB_NUMBER[TONE[item.kind]] ?? '';
  const title = find(card, '[data-title]');
  title.id = titleId;
  title.textContent = itemTitle(item, input, tr);
  find(card, '[data-mark] use').setAttributeNS(null, 'href', `#rental-mark-${markOf(s)}`);
  const status = find(card, '[data-status-text]');
  const depends = find(card, '[data-depends]');
  const share = find(card, '[data-total-share]');
  if (s.kind === 'single') status.replaceChildren(...verdictPieces(s.verdict, tr));
  else {
    status.textContent = tr('client.rental.status.depends');
    depends.replaceChildren(...dependsPieces(s, tr));
    depends.hidden = false;
    const how = totalShare(s);
    if (how !== 'in') {
      share.replaceChildren(
        ...(how === 'out'
          ? [tr('client.rental.share.out')]
          : pieces(tr('client.rental.share.lowest'), {
              importe: approx(shownPair(s.counted, s.upTo)[0], tr),
            })),
      );
      share.hidden = false;
    }
  }
  const hint = find(card, '[data-hint]');
  hint.hidden = !(item.kind === 'rent_update' && item.companyLandlordHint);
  renderRules(container, find(card, '[data-rules]'), item.sources, tr);
  return frag;
}

function renderInformation(
  container: ParentNode,
  blocks: readonly InformationBlock[],
  tr: Translate,
) {
  find(container, '[data-information]').replaceChildren(
    ...blocks.map((b) => {
      const frag = template(container, 'information');
      find(frag, '[data-info-title]').textContent = tr(`client.rental.info.${b.id}.title`);
      const vars: Record<string, string> = Object.fromEntries(
        Object.entries(b.dates).map(([name, iso]) => [name, dayText(iso)]),
      );
      if (b.region) vars['comunidad'] = tr(`client.rental.region.${b.region}`);
      const key: ClientKey =
        b.id === 'stressed_zone'
          ? b.answer === 'yes'
            ? 'client.rental.info.stressed_zone.text_yes'
            : 'client.rental.info.stressed_zone.text_unknown'
          : `client.rental.info.${b.id}.text`;
      find(frag, '[data-info-text]').textContent = tr(key, vars);
      const links = find(frag, '[data-info-links]');
      const linkLabel: ClientKey | null =
        b.id === 'stressed_zone' || b.id === 'reference_price'
          ? 'client.rental.info.serpavi'
          : b.id === 'regional_rules'
            ? 'client.rental.info.lau'
            : null;
      const sources = [
        ...b.links.map((url) => ({ url, text: linkLabel ? tr(linkLabel) : url })),
        ...b.sources.map((s) => ({ url: s.url, text: s.citation })),
      ];
      links.replaceChildren(
        ...sources.map(({ url, text }) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = url;
          a.rel = 'noopener';
          a.target = '_blank';
          a.textContent = text;
          li.append(a);
          return li;
        }),
      );
      links.hidden = sources.length === 0;
      return frag;
    }),
  );
}

function renderUnchecked(container: ParentNode, review: RentalReview, tr: Translate) {
  find(container, '[data-unchecked]').replaceChildren(
    ...review.unchecked.map((code) => {
      const li = document.createElement('li');
      li.textContent = tr(`client.rental.unchecked.${code}`);
      return li;
    }),
  );
}

function renderTotals(container: ParentNode, review: RentalReview, tr: Translate) {
  find(container, '[data-headline]').textContent = tr(`client.rental.headline.${headline(review)}`);
  find(container, '[data-totals]').replaceChildren(
    ...totalLines(review).map(({ kind, total }) => {
      const li = document.createElement('li');
      const [counted, upTo] = shownPair(total.counted, total.upTo).map((x) => approx(x, tr));
      const line =
        total.counted === 0
          ? pieces(tr(`client.rental.total.${kind}_doubtful`), {
              maximo: approx(shownOne(total.upTo), tr),
            })
          : total.upTo > total.counted
            ? pieces(tr(`client.rental.total.${kind}_up_to`), {
                importe: counted ?? [],
                maximo: upTo ?? [],
              })
            : pieces(tr(`client.rental.total.${kind}`), { importe: counted ?? [] });
      li.replaceChildren(...line);
      return li;
    }),
  );
}

// ---------- Detail ----------

function rateText(rate: RateFigure, tr: Translate): string {
  if (rate.kind === 'fixed')
    return tr('client.rental.detail.fixed_rate', { tasa: percentText(rate.rate) });
  const f = rate.figure;
  return tr(f.flash ? 'client.rental.detail.index_flash' : 'client.rental.detail.index', {
    indice: tr(`client.rental.index.${f.index}`),
    mes: monthText(f.month),
    tasa: percentText(f.rate),
    fecha: dayText(f.publishedOn),
  });
}

type Figures = readonly (readonly [ClientKey, string | number])[];

function riseFigures(
  r: RentUpdateReading,
  item: Extract<RentalItemResult, { kind: 'rent_update' }>,
  input: RentalInput,
  tr: Translate,
): Figures {
  const cap = r.cap && item.sources.find((s) => s.id === r.cap?.rule);
  const charged = input.updates[item.index]?.newRent;
  return [
    ['client.rental.detail.base', r.base],
    ...(r.agreed ? ([['client.rental.detail.agreed', rateText(r.agreed, tr)]] as const) : []),
    ...(r.cap
      ? ([
          [
            'client.rental.detail.cap',
            cap ? `${rateText(r.cap.rate, tr)} · ${cap.citation}` : rateText(r.cap.rate, tr),
          ],
        ] as const)
      : []),
    ...(r.maxRent !== null ? ([['client.rental.detail.max_rent', r.maxRent]] as const) : []),
    ...(charged !== undefined ? ([['client.rental.detail.charged', charged]] as const) : []),
    ['client.rental.detail.months', formatInteger(r.months)],
    ['client.rental.detail.monthly', r.monthly],
    ['client.rental.detail.accumulated', r.accumulated],
  ];
}

function renderReading(
  container: ParentNode,
  title: string | null,
  figures: Figures,
  calculation: RentalCalculation,
  tr: Translate,
): DocumentFragment {
  const frag = template(container, 'reading');
  const heading = find(frag, '[data-reading-title]');
  heading.hidden = title === null;
  heading.textContent = title ?? '';
  const dl = find(frag, '[data-figures]');
  dl.hidden = figures.length === 0;
  dl.replaceChildren(
    ...figures.map(([key, value]) => {
      const row = template(container, 'figure');
      find(row, 'dt').textContent = tr(key);
      const dd = find(row, 'dd');
      if (typeof value === 'number') dd.replaceChildren(amountEl(value));
      else {
        dd.textContent = value;
        dd.classList.add('reading__text');
      }
      return row;
    }),
  );
  find(frag, '[data-calculation]').replaceChildren(
    ...calculationLines(calculation, tr).map((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      return li;
    }),
  );
  return frag;
}

function renderSources(
  container: ParentNode,
  list: HTMLElement,
  sources: readonly RentalSource[],
  tr: Translate,
) {
  list.replaceChildren(
    ...sources.map((s) => {
      const li = template(container, 'source');
      const a = find<HTMLAnchorElement>(li, 'a');
      a.href = s.url;
      a.textContent = s.citation;
      const since = dayText(s.inForceSince);
      const span = find(li, '[data-in-force]');
      const period =
        s.inForceUntil === null
          ? tr('client.rental.source.since', { desde: since })
          : tr('client.rental.source.between', { desde: since, hasta: dayText(s.inForceUntil) });
      span.textContent = `${period} · ${tr(NORM_STATUS[s.status], {
        fecha: s.statusSince ? dayText(s.statusSince) : '',
      })}`;
      return li;
    }),
  );
}

// The method behind an item: each reading's figures and calculation, and its sources with the
// days each was in force. Cloned in only when the detail may be shown.
function renderDetail(
  container: ParentNode,
  card: HTMLElement,
  item: RentalItemResult,
  input: RentalInput,
  tr: Translate,
) {
  const frag = template(container, 'detail');
  const readings = find(frag, '[data-readings]');
  const s = summarise(item);
  const titles =
    s.kind === 'depends'
      ? [tr('client.rental.detail.reading_low'), tr('client.rental.detail.reading_high')]
      : [null];
  if (item.kind === 'rent_update') {
    const values: readonly RentUpdateReading[] =
      item.outcome.kind === 'single' ? [item.outcome.value] : [item.outcome.low, item.outcome.high];
    readings.replaceChildren(
      ...values.map((r, i) =>
        renderReading(
          container,
          titles[i] ?? null,
          riseFigures(r, item, input, tr),
          r.calculation,
          tr,
        ),
      ),
    );
  } else {
    const values: readonly ItemReading[] =
      item.outcome.kind === 'single' ? [item.outcome.value] : [item.outcome.low, item.outcome.high];
    readings.replaceChildren(
      ...values.map((r, i) => renderReading(container, titles[i] ?? null, [], r.calculation, tr)),
    );
  }
  renderSources(container, find(frag, '[data-sources]'), item.sources, tr);
  find(card, '[data-detail-slot]').replaceChildren(frag);
}

// ---------- Result ----------

export interface RentalResultData {
  readonly review: RentalReview;
  readonly input: RentalInput;
}

const inScopeParts = (root: ParentNode) => [
  ...root.querySelectorAll<HTMLElement>('[data-in-scope]'),
];

// The free summary always: the verdict of each item, rounded, the doubts and the totals, the
// information blocks folded and what was not looked at. The detail (each reading's figures, the
// calculation and the sources) is cloned in only when it may be shown, so a locked result never
// carries it, not even hidden.
export function renderRentalResult(
  root: HTMLElement,
  { review, input }: RentalResultData,
  locked: boolean,
  tr: Translate,
): void {
  find(root, '[data-out-of-scope]').hidden = true;
  for (const el of inScopeParts(root)) el.hidden = false;
  find(root, '[data-lead]').textContent = tr(
    locked ? 'client.rental.result.lead_locked' : 'client.rental.result.lead',
  );
  renderTotals(root, review, tr);
  const items = find(root, '[data-items]');
  items.replaceChildren(...review.items.map((item, i) => renderItem(root, item, input, i, tr)));
  if (!locked)
    [...items.querySelectorAll<HTMLElement>('[data-item]')].forEach((card, i) => {
      const item = review.items[i];
      if (item) renderDetail(root, card, item, input, tr);
    });
  renderInformation(root, review.information, tr);
  renderUnchecked(root, review, tr);
}

// A contract the review does not cover: why, and nothing worked out.
export function renderOutOfScope(root: HTMLElement, reason: OutOfScopeReason, tr: Translate): void {
  for (const el of inScopeParts(root)) el.hidden = true;
  find(root, '[data-items]').replaceChildren();
  find(root, '[data-lead]').textContent = tr('client.rental.result.lead_out_of_scope');
  const box = find(root, '[data-out-of-scope]');
  box.hidden = false;
  find(box, '[data-out-of-scope-status]').textContent = tr(
    reason === 'before_2019'
      ? 'client.rental.out_of_scope.before_2019_status'
      : 'client.rental.out_of_scope.status',
  );
  find(box, '[data-out-of-scope-reason]').textContent = tr(`client.rental.out_of_scope.${reason}`);
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
      p.textContent = tr(`client.rental.error.${code}`);
      p.hidden = false;
      p.closest<HTMLElement>('[data-field]')?.setAttribute('data-has-error', '');
    }
    for (const el of form.querySelectorAll(`[name="${field}"]`))
      el.setAttribute('aria-invalid', 'true');
  }
}
