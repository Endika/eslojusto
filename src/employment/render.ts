import type { Figure } from '../engine/calculation';
import type {
  EmploymentCalculation,
  EmploymentPhrase,
  EmploymentPhraseKey,
} from '../engine/employment/calculation';
import type { ClauseAssessment } from '../engine/employment/clauses';
import type { InformationBlock } from '../engine/employment/information';
import type { InformationDuty } from '../engine/employment/information-duty';
import type { NormSource } from '../engine/law/sources';
import type { OfferComparison, OfferDifference } from '../engine/employment/offer';
import type { PermanentReference } from '../engine/employment/reference';
import type { EmploymentReview } from '../engine/employment/review';
import type {
  Assessed,
  EmploymentInput,
  Finding,
  FindingStatus,
  ItemId,
  Reading,
} from '../engine/employment/types';
import type { Source } from '../engine/sources';
import {
  formatCalculationEuros,
  formatDays,
  formatEuros,
  formatInteger,
  formatWholeEuros,
} from '../calculator/number';
import type { ClientKey, Translate } from '../i18n/client';
import type { FieldError } from './form';
import type { OutOfScopeReason } from './ports';
import {
  amountOf,
  headline,
  shortfallOf,
  shownOne,
  shownPair,
  stateOf,
  type Shown,
} from './summary';

// «2025-03-14» → «14-03-2025».
export const dayText = (iso: string): string => iso.split('-').reverse().join('-');

const civilText = ({ y, m, d }: { y: number; m: number; d: number }): string =>
  `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;

const MONTH_NAME = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' });
const monthName = (m: number): string =>
  MONTH_NAME.format(new Date(Date.UTC(2000, Math.max(0, m - 1), 1)));

// Hours, percentages and coefficients: Spanish decimals, up to four of them.
const NUMBER = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 4 });
const numberText = (n: number): string => NUMBER.format(n);

// ---------- Phrases ----------

type Unit = 'day' | 'week' | 'month' | 'contract' | 'extension' | 'extra_pay';

// Variables that count something, with what they count: «1 mes», «2 meses».
const UNITS: Partial<Record<EmploymentPhraseKey, Readonly<Record<string, Unit>>>> = {
  'chaining.within': { dias: 'day', limite: 'day', contratos: 'contract' },
  'chaining.near_limit': { dias: 'day', limite: 'day', contratos: 'contract' },
  'chaining.exceeds': { dias: 'day', limite: 'day', contratos: 'contract' },
  'chaining.same_group_not_counted': { contratos: 'contract' },
  'chaining.kind_unknown_not_counted': { contratos: 'contract' },
  'modality.extensions': { prorrogas: 'extension' },
  'modality.occasional_days': { dias: 'day', limite: 'day' },
  'modality.training_too_short': { minimo: 'month', maximo: 'month' },
  'modality.training_too_long': { minimo: 'month', maximo: 'month' },
  'modality.training_within': { minimo: 'month', maximo: 'month' },
  'modality.practice_window': { meses: 'month', limite: 'month' },
  'minimum_wage.pay.day': { days: 'day' },
  'minimum_wage.pay.extra_pays_unknown': { count: 'extra_pay' },
  'minimum_wage.pay.hour_with_paid_rest': { restDays: 'day' },
  'minimum_wage.year.below': { days: 'day' },
  'extra_pays.count': { count: 'extra_pay' },
  'extra_pays.in_daily_minimum': { days: 'day' },
  'trial.amount_days': { amount: 'day' },
  'trial.amount_weeks': { amount: 'week' },
  'trial.amount_months': { amount: 'month' },
  'trial.within_legal_limit': { months: 'month' },
  'trial.over_legal_limit': { months: 'month' },
  'trial.within_your_agreement': { months: 'month' },
  'trial.over_your_agreement': { months: 'month' },
  'trial.temporary_end_unknown': { months: 'month' },
  'clauses.non_compete_months': { months: 'month', cap: 'month' },
  'clauses.retention_months': { months: 'month', cap: 'month' },
  'part_time.complementary_notice': { days: 'day', minimum: 'day' },
  'working_time.night_hours_in_schedule': { days: 'day' },
  'holidays.calendar_days': { days: 'day' },
  'holidays.working_days': { days: 'day' },
  'holidays.working_days_equivalent': { days: 'day', week: 'day', calendar: 'day' },
  'holidays.counted_in_calendar_days': { minimum: 'day' },
  'holidays.under_your_agreement': { agreed: 'day' },
  'holidays.prorated_entitlement': { span: 'day', entitled: 'day' },
  'holidays.under_your_agreement_prorated': { agreed: 'day', entitled: 'day' },
  'holidays.short_temporary_exception': { days: 'day' },
};

// A calendar year, or a year of the contract, reads as it is written: never «2.026».
const YEAR_VARS: ReadonlySet<string> = new Set(['year', 'referenceYear', 'anio', 'from']);

const valueOf = (f: Figure): number =>
  typeof f === 'number' ? f : 'days' in f ? f.days : 'euros' in f ? f.euros : f.integer;

const counted = (n: number, unit: Unit, tr: Translate, text: string): string =>
  tr(`client.employment.unit.${unit}_${n === 1 ? 'one' : 'many'}`, { n: text });

function figureText(key: EmploymentPhraseKey, name: string, f: Figure, tr: Translate): string {
  const n = valueOf(f);
  if (YEAR_VARS.has(name)) return String(n);
  if (name === 'month' && key.startsWith('minimum_wage.payslip.')) return monthName(n);
  if (name === 'day' && key === 'working_time.longest_day')
    return tr(`client.employment.weekday.${n}` as ClientKey);
  const text =
    typeof f === 'number'
      ? numberText(f)
      : 'euros' in f
        ? formatCalculationEuros(f.euros)
        : 'days' in f
          ? formatDays(f.days)
          : formatInteger(f.integer);
  const unit = UNITS[key]?.[name];
  return unit === undefined ? text : counted(n, unit, tr, text);
}

// Phrases whose figure may be missing take a wording without it: a year below the minimum with
// no total (fixed-discontinuous), a year unverified with no year before it loaded.
const VARIANTS: Partial<Record<EmploymentPhraseKey, { needs: string; key: ClientKey }>> = {
  'minimum_wage.year.below': {
    needs: 'accrued',
    key: 'client.employment.calculation.minimum_wage.year.below_no_total',
  },
  'minimum_wage.year.effects_unverified': {
    needs: 'previous',
    key: 'client.employment.calculation.minimum_wage.year.effects_unverified_no_previous',
  },
  'minimum_wage.temporary.effects_unverified': {
    needs: 'previous',
    key: 'client.employment.calculation.minimum_wage.temporary.effects_unverified_no_previous',
  },
};

// «6 meses y 3 días», «6 meses», «3 días».
function durationText(vars: EmploymentPhrase['vars'], tr: Translate): string {
  const months = vars?.['meses'];
  const days = vars?.['dias'];
  const m = typeof months === 'object' && 'integer' in months ? months.integer : 0;
  const d = typeof days === 'object' && 'integer' in days ? days.integer : 0;
  const parts = [
    ...(m > 0 ? [counted(m, 'month', tr, formatInteger(m))] : []),
    ...(d > 0 || m === 0 ? [counted(d, 'day', tr, formatInteger(d))] : []),
  ];
  return parts.length === 2
    ? tr('client.employment.and', { a: parts[0] ?? '', b: parts[1] ?? '' })
    : (parts[0] ?? '');
}

export function phraseText(p: EmploymentPhrase, tr: Translate): string {
  const vars = Object.fromEntries(
    Object.entries(p.vars ?? {}).map(([name, v]) => [
      name,
      typeof v === 'object' && 'key' in v ? phraseText(v, tr) : figureText(p.key, name, v, tr),
    ]),
  );
  if (p.key === 'modality.duration' || p.key === 'modality.duration_so_far')
    vars['duracion'] = durationText(p.vars, tr);
  const variant = VARIANTS[p.key];
  if (variant !== undefined && !(variant.needs in vars)) return tr(variant.key, vars);
  return tr(`client.employment.calculation.${p.key}`, vars);
}

export const calculationLines = (c: EmploymentCalculation, tr: Translate): string[] =>
  c.map((p) => phraseText(p, tr));

// ---------- DOM helpers ----------

// An amount keeps its Spanish format and reads left to right, also inside right-to-left text.
function amountEl(n: number, format: (n: number) => string = formatEuros): HTMLElement {
  const bdi = document.createElement('bdi');
  bdi.dir = 'ltr';
  bdi.textContent = format(n);
  return bdi;
}

type Piece = string | Node;

// Fills a translated template, putting each `{variable}` amount in its own isolated element.
function pieces(template: string, vars: Readonly<Record<string, string | Piece[]>>): Piece[] {
  return template.split(/\{(\w+)\}/).flatMap((part, i): Piece[] => {
    if (i % 2 === 0) return part === '' ? [] : [part];
    const v = vars[part];
    if (v === undefined) return [`{${part}}`];
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

const listItems = (lines: readonly string[]): HTMLLIElement[] =>
  lines.map((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    return li;
  });

function link(url: string, text: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.target = '_blank';
  a.textContent = text;
  return a;
}

// ---------- Verdicts ----------

const shownPieces = (s: Shown): Piece[] => [
  amountEl(s.amount, s.cents ? formatEuros : formatWholeEuros),
];

// «unos 340 €»; an amount kept with its cents is said as it is.
const approx = (s: Shown, tr: Translate): Piece[] =>
  s.cents ? shownPieces(s) : pieces(tr('client.employment.about'), { importe: shownPieces(s) });

// A finding's status in words, with its euros when it carries them: «Por debajo del SMI: unos
// 900 € al año».
function statusPieces(f: Finding, tr: Translate, shown?: Shown): Piece[] {
  const amount = amountOf(f);
  if (amount === null) return [tr(`client.employment.status.${f.status}`)];
  const shortfall = shortfallOf(f);
  if (shortfall !== null)
    return pieces(tr(`client.employment.status.below_minimum_${shortfall.per}`), {
      importe: approx(shownOne(shortfall.amount), tr),
    });
  return pieces(
    tr(
      f.id === 'smi_monthly'
        ? 'client.employment.status.below_minimum_payslips'
        : 'client.employment.status.below_minimum_amount',
    ),
    { importe: approx(shown ?? shownOne(amount), tr) },
  );
}

// One reading in words, lower case, with its euros when it carries them.
function readingPieces(f: Finding, tr: Translate, shown: Shown | null): Piece[] {
  const amount = amountOf(f);
  if (amount === null || shown === null)
    return [tr(`client.employment.reading_status.${f.status}`)];
  return pieces(tr('client.employment.reading_status.below_minimum_amount'), {
    importe: approx(shown, tr),
  });
}

// The amounts each reading shows: two readings with euros are rounded as a pair, so the range
// never reads as one figure.
function readingAmounts(readings: readonly Reading[]): (Shown | null)[] {
  const amounts = readings.map((r) => amountOf(r.finding));
  const [a, b] = amounts;
  if (amounts.length === 2 && a != null && b != null) {
    const [low, high] = shownPair(Math.min(a, b), Math.max(a, b));
    return a <= b ? [low, high] : [high, low];
  }
  return amounts.map((n) => (n === null ? null : shownOne(n)));
}

const uniqueSources = (sources: readonly NormSource[]): NormSource[] =>
  sources.filter((s, i) => sources.findIndex((o) => o.citation === s.citation) === i);

const findingsOf = (a: Assessed): readonly Finding[] =>
  a.kind === 'single' ? [a.finding] : a.readings.map((r) => r.finding);

const NORM_STATUS: Record<NormSource['status'], ClientKey> = {
  in_force: 'client.employment.norm.in_force',
  pending_validation: 'client.employment.norm.pending_validation',
  repealed: 'client.employment.norm.repealed',
};

const normStatusText = (s: NormSource, tr: Translate): string =>
  tr(NORM_STATUS[s.status], { fecha: s.statusSince ? dayText(s.statusSince) : '' });

// Each rule a point rests on: the norm and article, a link to it and how it stands today.
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
      const since = dayText(s.inForceSince);
      const period =
        s.inForceUntil === null
          ? tr('client.employment.source.since', { desde: since })
          : tr('client.employment.source.between', {
              desde: since,
              hasta: dayText(s.inForceUntil),
            });
      find(li, '[data-in-force]').textContent = `${period} · ${normStatusText(s, tr)}`;
      return li;
    }),
  );
}

const TONE: Record<ItemId, string> = {
  minimum_wage: 'salary',
  modality: 'dates',
  chaining: 'dates',
  trial_period: 'settlement',
  working_time: 'holidays',
  part_time: 'holidays',
  holidays_pay: 'settlement',
  clauses: 'settlement',
  information: 'settlement',
  offer: 'settlement',
};
const TAB_NUMBER: Record<string, string> = {
  dates: '02',
  salary: '03',
  holidays: '04',
  settlement: '05',
};

const markId = (state: string): string => `#employment-mark-${state.replace(/_/g, '-')}`;

// The words of the law a finding quotes. Arts. 15.4 and 15.5 ET are introduced as what the law
// says, never as what the person is.
function renderLiteral(box: HTMLElement, findings: readonly Finding[], tr: Translate) {
  const f = findings.find((x) => x.literal !== null && x.literal.text !== '');
  box.hidden = f === undefined;
  if (f === undefined || f.literal === null) return;
  const breach = f.sources.find((s) => s.id === 'permanent_on_breach');
  const chaining = f.id === 'chaining_18_in_24' ? f.sources[0] : undefined;
  const source = breach ?? chaining ?? f.sources[0];
  find(box, '[data-literal-intro]').textContent = breach
    ? tr('client.employment.permanent.15_4')
    : chaining
      ? tr('client.employment.permanent.15_5')
      : tr('client.employment.literal.intro', { cita: source?.citation ?? '' });
  find(box, '[data-literal-text]').textContent = `«${f.literal.text}»`;
  const a = find<HTMLAnchorElement>(box, '[data-literal-link]');
  a.hidden = source === undefined;
  if (source) {
    a.href = source.url;
    a.textContent = tr('client.employment.literal.link', { cita: source.citation });
  }
}

interface Card {
  readonly frag: DocumentFragment;
  readonly card: HTMLElement;
}

function card(
  container: ParentNode,
  { title, tone, state, id }: { title: string; tone: string; state: string; id: string },
): Card {
  const frag = template(container, 'item');
  const el = find(frag, '[data-item]');
  el.dataset['item'] = id;
  el.dataset['state'] = state;
  el.dataset['tone'] = tone;
  const titleId = `employment-item-${id}`;
  el.setAttribute('aria-labelledby', titleId);
  find(el, '[data-tab-number]').textContent = TAB_NUMBER[tone] ?? '';
  const heading = find(el, '[data-title]');
  heading.id = titleId;
  heading.textContent = title;
  find(el, '[data-mark] use').setAttributeNS(null, 'href', markId(state));
  return { frag, card: el };
}

function note(el: HTMLElement, text: string | null) {
  el.hidden = text === null;
  el.textContent = text ?? '';
}

// An assessed point on its card: the verdict, or each reading of a «No lo sé», with the rules.
function fillAssessed(
  container: ParentNode,
  el: HTMLElement,
  assessed: Assessed,
  tr: Translate,
): void {
  const status = find(el, '[data-status-text]');
  const readings = find(el, '[data-readings]');
  if (assessed.kind === 'single') status.replaceChildren(...statusPieces(assessed.finding, tr));
  else {
    status.textContent = tr('client.employment.status.depends');
    const shown = readingAmounts(assessed.readings);
    find(el, '[data-question]').textContent = tr(`client.employment.question.${assessed.question}`);
    find(el, '[data-question]').hidden = false;
    readings.replaceChildren(
      ...assessed.readings.map((r, i) => {
        const li = document.createElement('li');
        li.replaceChildren(
          ...pieces(tr('client.employment.reading_line'), {
            cuando: tr(`client.employment.reading.${r.when}`),
            resultado: readingPieces(r.finding, tr, shown[i] ?? null),
          }),
        );
        return li;
      }),
    );
    readings.hidden = false;
  }
  const findings = findingsOf(assessed);
  note(
    find(el, '[data-answer-note]'),
    findings.some((f) => f.basedOnYourAnswer) ? tr('client.employment.note.your_answer') : null,
  );
  note(
    find(el, '[data-agreement-note]'),
    findings.some((f) => f.agreementMaySetOther && f.status !== 'depends_on_agreement')
      ? tr('client.employment.note.agreement')
      : null,
  );
  const first = findings[0];
  const since =
    assessed.kind === 'single' && first !== undefined && shortfallOf(first)?.per === 'year'
      ? amountOf(first)
      : null;
  const total = find(el, '[data-total]');
  total.hidden = since === null;
  if (since !== null)
    total.replaceChildren(
      ...pieces(tr('client.employment.since_start'), { importe: approx(shownOne(since), tr) }),
    );
  renderLiteral(find(el, '[data-literal]'), findings, tr);
  renderRules(
    container,
    find(el, '[data-rules]'),
    uniqueSources(findings.flatMap((f) => f.sources)),
    tr,
  );
}

// The method behind a point: each reading's calculation and its sources with the days each was
// in force. Cloned in only when the detail may be shown.
function renderDetail(container: ParentNode, el: HTMLElement, assessed: Assessed, tr: Translate) {
  const frag = template(container, 'detail');
  const values: readonly { title: string | null; finding: Finding }[] =
    assessed.kind === 'single'
      ? [{ title: null, finding: assessed.finding }]
      : assessed.readings.map((r) => ({
          title: tr(`client.employment.reading.${r.when}`),
          finding: r.finding,
        }));
  find(frag, '[data-readings-detail]').replaceChildren(
    ...values.map(({ title, finding }) => {
      const reading = template(container, 'reading');
      const heading = find(reading, '[data-reading-title]');
      heading.hidden = title === null;
      heading.textContent = title ?? '';
      const lines = calculationLines(finding.calculation, tr);
      find(reading, '[data-calculation]').replaceChildren(
        ...listItems(lines.length > 0 ? lines : [tr(`client.employment.status.${finding.status}`)]),
      );
      return reading;
    }),
  );
  renderSources(
    container,
    find(frag, '[data-sources]'),
    uniqueSources(findingsOf(assessed).flatMap((f) => f.sources)),
    tr,
  );
  find(el, '[data-detail-slot]').replaceChildren(frag);
}

function itemCard(
  container: ParentNode,
  assessed: Assessed,
  position: number,
  locked: boolean,
  tr: Translate,
): DocumentFragment {
  const first = findingsOf(assessed)[0];
  if (first === undefined) return document.createDocumentFragment();
  const { frag, card: el } = card(container, {
    title: tr(`client.employment.finding.${first.id}`),
    tone: TONE[first.item],
    state: stateOf(assessed),
    id: `${position}`,
  });
  fillAssessed(container, el, assessed, tr);
  if (!locked) renderDetail(container, el, assessed, tr);
  return frag;
}

function clauseCard(
  container: ParentNode,
  clause: ClauseAssessment,
  input: EmploymentInput,
  locked: boolean,
  tr: Translate,
): DocumentFragment {
  const { frag, card: el } = card(container, {
    title: tr(`client.employment.clause.${clause.label}`),
    tone: 'settlement',
    state: clause.assessed === null ? 'not_assessed' : stateOf(clause.assessed),
    id: `clause-${clause.index}`,
  });
  const words = input.clauses[clause.index]?.literal.text ?? '';
  const quote = find(el, '[data-clause-words]');
  quote.hidden = words === '';
  find(quote, '[data-clause-text]').textContent = `«${words}»`;
  if (clause.assessed !== null) {
    fillAssessed(container, el, clause.assessed, tr);
    if (!locked) renderDetail(container, el, clause.assessed, tr);
    return frag;
  }
  find(el, '[data-status-text]').textContent = tr(
    clause.checkedIn === null
      ? 'client.employment.clause_not_assessed'
      : 'client.employment.clause_checked_in',
  );
  find(el, '[data-rules-title]').hidden = true;
  return frag;
}

// ---------- Information duty, offer and reference ----------

const DUTY_ORDER: readonly FindingStatus[] = ['missing_requirement', 'review_it', 'within_limit'];

function dutyCard(
  container: ParentNode,
  duty: InformationDuty,
  locked: boolean,
  tr: Translate,
): DocumentFragment {
  if (!duty.applies) {
    const { frag, card: el } = card(container, {
      title: tr('client.employment.duty.title'),
      tone: 'settlement',
      state: 'not_applicable_to_date',
      id: 'duty',
    });
    find(el, '[data-status-text]').textContent = tr(`client.employment.duty.${duty.reason}`);
    renderRules(container, find(el, '[data-rules]'), duty.sources, tr);
    return frag;
  }
  const checked = duty.elements.flatMap((e) => (e.applies ? [{ ...e }] : []));
  const statuses = checked.map((e) => e.finding.status);
  const state = DUTY_ORDER.find((s) => statuses.includes(s)) ?? 'within_limit';
  const missing = statuses.filter((s) => s === 'missing_requirement').length;
  const toReview = statuses.filter((s) => s === 'review_it').length;
  const { frag, card: el } = card(container, {
    title: tr('client.employment.duty.title'),
    tone: 'settlement',
    state,
    id: 'duty',
  });
  const count = (key: 'missing' | 'review', n: number) =>
    tr(`client.employment.duty.${key}_${n === 1 ? 'one' : 'many'}`, { n: String(n) });
  find(el, '[data-status-text]').textContent =
    missing > 0
      ? count('missing', missing)
      : toReview > 0
        ? count('review', toReview)
        : tr('client.employment.duty.complete');
  note(find(el, '[data-answer-note]'), tr(`client.employment.duty.${duty.moment}`));
  renderRules(
    container,
    find(el, '[data-rules]'),
    uniqueSources(checked.flatMap((e) => e.finding.sources)),
    tr,
  );
  if (!locked) {
    const detail = template(container, 'duty-detail');
    find(detail, '[data-duty-elements]').replaceChildren(
      ...duty.elements.map((e) => {
        const li = template(container, 'duty-element');
        find(li, '[data-element-name]').textContent = tr(
          `client.employment.info.${e.element}` as ClientKey,
        );
        const status = find(li, '[data-element-status]');
        const elState = e.applies ? e.finding.status : 'not_applicable_to_date';
        find(li, '[data-mark] use').setAttributeNS(null, 'href', markId(elState));
        status.textContent = e.applies
          ? tr(`client.employment.status.${e.finding.status}`)
          : tr('client.employment.duty.temp_agency_only');
        find(li, '[data-element-lines]').replaceChildren(
          ...listItems(e.applies ? calculationLines(e.finding.calculation, tr) : []),
        );
        return li;
      }),
    );
    find(el, '[data-detail-slot]').replaceChildren(detail);
  }
  return frag;
}

const remoteText = (r: string, tr: Translate) => tr(`client.employment.remote.${r}` as ClientKey);

function differenceText(d: OfferDifference, tr: Translate): Piece[] {
  const template = tr(`client.employment.offer.difference.${d.field}`);
  switch (d.field) {
    case 'gross_annual':
      return pieces(template, {
        oferta: [amountEl(d.offer, formatWholeEuros)],
        contrato: [amountEl(d.contract, formatWholeEuros)],
      });
    case 'weekly_hours':
      return pieces(template, { oferta: numberText(d.offer), contrato: numberText(d.contract) });
    case 'modality':
      return pieces(template, {
        oferta: tr(`client.employment.modality.${d.offer}`),
        contrato: tr(`client.employment.modality.${d.contract}`),
      });
    case 'remote':
      return pieces(template, {
        oferta: remoteText(d.offer, tr),
        contrato: remoteText(d.contract, tr),
      });
  }
}

function offerCard(
  container: ParentNode,
  offer: OfferComparison,
  locked: boolean,
  tr: Translate,
): DocumentFragment {
  const { frag, card: el } = card(container, {
    title: tr('client.employment.offer.title'),
    tone: 'settlement',
    state: 'no_verdict',
    id: 'offer',
  });
  const n = offer.differences.length;
  find(el, '[data-status-text]').textContent =
    n === 0
      ? tr('client.employment.offer.none')
      : tr(`client.employment.offer.count_${n === 1 ? 'one' : 'many'}`, { n: String(n) });
  note(find(el, '[data-answer-note]'), tr('client.employment.offer.no_verdict'));
  find(el, '[data-rules-title]').hidden = true;
  if (!locked) {
    const detail = template(container, 'offer-detail');
    find(detail, '[data-offer-differences]').replaceChildren(
      ...offer.differences.map((d) => {
        const li = document.createElement('li');
        li.replaceChildren(...differenceText(d, tr));
        return li;
      }),
    );
    find(detail, '[data-offer-not-compared]').replaceChildren(
      ...listItems(
        offer.notCompared.map((c) =>
          tr(`client.employment.offer.not_compared.${c.reason}`, {
            dato: tr(`client.employment.offer.field.${c.field}`),
          }),
        ),
      ),
    );
    find(el, '[data-detail-slot]').replaceChildren(detail);
  }
  return frag;
}

function severanceText(key: ClientKey, amount: number, low: number, high: number, tr: Translate) {
  const li = document.createElement('li');
  li.replaceChildren(
    ...(low === high
      ? pieces(tr(key), { importe: [amountEl(amount)] })
      : pieces(tr(`${key}_range` as ClientKey), {
          minimo: [amountEl(low)],
          maximo: [amountEl(high)],
        })),
  );
  return li;
}

// «Si un juzgado lo declarase así»: two reference figures, never part of anything else.
function referenceCard(
  container: ParentNode,
  reference: PermanentReference,
  tr: Translate,
): DocumentFragment {
  const { frag, card: el } = card(container, {
    title: tr('client.employment.reference.title'),
    tone: 'dates',
    state: 'no_verdict',
    id: 'reference',
  });
  find(el, '[data-status-text]').textContent = tr('client.employment.reference.lead', {
    fecha: civilText(reference.on),
  });
  const detail = template(container, 'reference-detail');
  const { fixedTermEnd: end, unfairDismissal: unfair } = reference;
  find(detail, '[data-reference-figures]').replaceChildren(
    severanceText(
      'client.employment.reference.fixed_term_end',
      end.amount,
      end.range.min,
      end.range.max,
      tr,
    ),
    severanceText(
      'client.employment.reference.unfair_dismissal',
      unfair.amount,
      unfair.range.min,
      unfair.range.max,
      tr,
    ),
  );
  const sources: Source[] = [...end.sources, ...unfair.sources].filter(
    (s, i, all) => all.findIndex((o) => o.citation === s.citation) === i,
  );
  find(detail, '[data-reference-sources]').replaceChildren(
    ...sources.map((s) => {
      const li = document.createElement('li');
      li.append(link(s.url, s.citation));
      return li;
    }),
  );
  find(el, '[data-rules-title]').hidden = true;
  find(el, '[data-detail-slot]').replaceChildren(detail);
  return frag;
}

// ---------- Information blocks and the rest ----------

function renderInformation(
  container: ParentNode,
  blocks: readonly InformationBlock[],
  tr: Translate,
) {
  find(container, '[data-information]').replaceChildren(
    ...blocks.map((b) => {
      const frag = template(container, 'information');
      find(frag, '[data-info-title]').textContent = tr(`client.employment.block.${b.id}`);
      find(frag, '[data-info-text]').replaceChildren(
        ...listItems(calculationLines(b.calculation, tr)),
      );
      const links = find(frag, '[data-info-links]');
      const items = [
        ...b.links.map((l) => link(l.url, tr(`client.employment.link.${l.id}`))),
        ...b.sources.map((s) => link(s.url, s.citation)),
      ];
      links.replaceChildren(
        ...items.map((a) => {
          const li = document.createElement('li');
          li.append(a);
          return li;
        }),
      );
      links.hidden = items.length === 0;
      return frag;
    }),
  );
}

// ---------- Result ----------

export interface EmploymentResultData {
  readonly review: EmploymentReview;
  readonly input: EmploymentInput;
}

const inScopeParts = (root: ParentNode) => [
  ...root.querySelectorAll<HTMLElement>('[data-in-scope]'),
];

// The free summary always: each point's verdict, the shortfall against the minimum wage rounded,
// the «No lo sé» readings, the law's words on fixed-term contracts, the information blocks folded
// and what was not looked at. The detail (each calculation, the full information list, the offer
// side by side and the reference figures) is cloned in only when it may be shown, so a locked
// result never carries it, not even hidden.
export function renderEmploymentResult(
  root: HTMLElement,
  { review, input }: EmploymentResultData,
  locked: boolean,
  tr: Translate,
): void {
  find(root, '[data-out-of-scope]').hidden = true;
  for (const el of inScopeParts(root)) el.hidden = false;
  find(root, '[data-information-section]').hidden = false;
  find(root, '[data-lead]').textContent = tr(
    locked ? 'client.employment.result.lead_locked' : 'client.employment.result.lead',
  );
  const partial = find(root, '[data-partial]');
  partial.hidden = !(review.scope.inScope && review.scope.partial);
  find(root, '[data-headline]').textContent = tr(`client.employment.headline.${headline(review)}`);
  find(root, '[data-warnings]').replaceChildren(
    ...listItems(review.warnings.map((w) => tr(`client.employment.warning.${w.code}`))),
  );
  find(root, '[data-items]').replaceChildren(
    ...review.items.map((a, i) => itemCard(root, a, i, locked, tr)),
    ...review.clauses.map((c) => clauseCard(root, c, input, locked, tr)),
    ...(review.informationDuty === null
      ? []
      : [dutyCard(root, review.informationDuty, locked, tr)]),
    ...(review.offer === null ? [] : [offerCard(root, review.offer, locked, tr)]),
    ...(review.reference === null || locked ? [] : [referenceCard(root, review.reference, tr)]),
  );
  renderInformation(root, review.information, tr);
  find(root, '[data-unchecked]').replaceChildren(
    ...listItems(review.unchecked.map((code) => tr(`client.employment.unchecked.${code}`))),
  );
}

// A relationship the review does not cover: why, and for a minor the rules that apply, as
// information.
export function renderOutOfScope(
  root: HTMLElement,
  reason: OutOfScopeReason,
  information: readonly InformationBlock[],
  tr: Translate,
): void {
  for (const el of inScopeParts(root)) el.hidden = true;
  find(root, '[data-items]').replaceChildren();
  find(root, '[data-lead]').textContent = tr('client.employment.result.lead_out_of_scope');
  const box = find(root, '[data-out-of-scope]');
  box.hidden = false;
  find(box, '[data-out-of-scope-status]').textContent = tr('client.employment.out_of_scope.status');
  find(box, '[data-out-of-scope-reason]').textContent = tr(
    `client.employment.out_of_scope.${reason}`,
  );
  const minors = information.filter((b) => b.id === 'minors');
  renderInformation(root, minors, tr);
  find(root, '[data-information-section]').hidden = minors.length === 0;
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
      p.textContent = tr(`client.employment.error.${code}`);
      p.hidden = false;
      p.closest<HTMLElement>('[data-field]')?.setAttribute('data-has-error', '');
    }
    for (const el of form.querySelectorAll(`[name="${field}"]`))
      el.setAttribute('aria-invalid', 'true');
  }
}
