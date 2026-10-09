import { required } from '../calculator/dom';
import { erteUnknownView, ertePositiveView, type ErteView } from '../content/erte';
import { estimateErte } from '../engine/erte';
import {
  ERTE_ERRORS,
  ERTE_FIELDS,
  parseErte,
  type ErteAnswers,
  type ErteField,
} from '../erte/form';

const form = required(document.querySelector<HTMLFormElement>('#erte-form'), 'erte form');
const result = required(document.querySelector<HTMLElement>('#erte-result'), 'erte result');
const title = required(result.querySelector<HTMLElement>('#erte-result-title'), 'result title');
const lead = required(result.querySelector<HTMLElement>('[data-result-lead]'), 'result lead');
const blocks = required(result.querySelector<HTMLElement>('[data-result-blocks]'), 'result blocks');

const answers = (): ErteAnswers =>
  Object.fromEntries(
    ERTE_FIELDS.map((name) => {
      const el = form.elements.namedItem(name);
      return [name, el instanceof RadioNodeList || el instanceof HTMLInputElement ? el.value : ''];
    }),
  ) as ErteAnswers;

const setActive = (el: HTMLElement, active: boolean) => {
  el.hidden = !active;
  for (const input of el.querySelectorAll<HTMLInputElement>('input')) input.disabled = !active;
};

// The questions follow the type: none after «No lo sé», no children for RED, the percentage only
// for a reduction.
function applyConditions() {
  const a = answers();
  const known = a.regime !== '' && a.regime !== 'unknown';
  for (const el of form.querySelectorAll<HTMLElement>('[data-known-only]'))
    setActive(el, known && !(el.hasAttribute('data-not-red') && a.regime === 'red'));
  for (const el of form.querySelectorAll<HTMLElement>('[data-if-measure]'))
    setActive(el, known && el.dataset['ifMeasure'] === a.measure);
  const base = form.querySelector<HTMLElement>('[data-hint-red]');
  const hint = base?.querySelector('.hint');
  const text = a.regime === 'red' ? base?.dataset['hintRed'] : base?.dataset['hintOther'];
  if (hint && text) hint.textContent = text;
}

function showErrors(fields: readonly ErteField[]) {
  for (const name of ERTE_FIELDS) {
    const slot = form.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
    if (!slot) continue;
    const failed = fields.includes(name);
    slot.hidden = !failed;
    slot.textContent = failed ? ERTE_ERRORS[name] : '';
    form.querySelector(`[name="${name}"]`)?.setAttribute('aria-invalid', String(failed));
  }
}

function show(view: ErteView) {
  title.textContent = view.title;
  lead.textContent = view.lead;
  blocks.replaceChildren(
    ...view.blocks.flatMap((b) => {
      const heading = document.createElement('h3');
      heading.textContent = b.title;
      const text = document.createElement('p');
      text.textContent = b.text;
      const folio = document.createElement('p');
      folio.className = 'folio';
      folio.textContent = b.source;
      return [heading, text, folio];
    }),
  );
  result.hidden = false;
  title.focus();
}

form.addEventListener('change', () => {
  applyConditions();
  result.hidden = true;
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const parsed = parseErte(answers());
  if (parsed.kind === 'errors') {
    showErrors(parsed.fields);
    result.hidden = true;
    form.querySelector<HTMLElement>(`[name="${parsed.fields[0]}"]`)?.focus();
    return;
  }
  showErrors([]);
  show(
    parsed.kind === 'unknown_regime'
      ? erteUnknownView()
      : ertePositiveView(parsed.input, estimateErte(parsed.input)),
  );
});

result.querySelector('[data-restart]')?.addEventListener('click', () => {
  form.reset();
  applyConditions();
  showErrors([]);
  result.hidden = true;
  form.querySelector<HTMLElement>('#question-regime')?.focus();
});

applyConditions();
