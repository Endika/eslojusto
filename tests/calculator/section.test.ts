// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FormEntries } from '../../src/calculator/fill';
import { setUpCalculator } from '../../src/calculator/main';
import type { CalculatorEvents } from '../../src/calculator/ports';
import { FINAL_PAY_FLOW, presetCauseFlow } from '../../src/calculator/steps';
import { setUpCredit } from '../../src/credit/main';
import type { CreditEvents } from '../../src/credit/ports';
import { BE1904 } from '../../src/engine/credit/data/be1904';
import { CREDIT_NORMS } from '../../src/engine/credit/data/norms';
import { CREDIT_SOURCES } from '../../src/engine/credit/data/sources';
import { pageTranslator } from '../../src/i18n/client';

// The shared walk through a review's sheets, on the built pages: their markup is what the walk
// finds, and their scripts are left out so only the section under test listens.
const built = existsSync('dist/finiquito/index.html') && existsSync('dist/financiacion/index.html');
const today = () => ({ y: 2026, m: 10, d: 17 });

function mount(page: string): void {
  const html = readFileSync(`dist/${page}/index.html`, 'utf8');
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  document.body.innerHTML = body.replace(
    /<script\b(?![^>]*application\/json)[^>]*>[\s\S]*?<\/script>/g,
    '',
  );
}

// Every event the section reports, in order, by name and arguments.
function recorder<T extends object>() {
  const log: [string, ...unknown[]][] = [];
  const events = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args: unknown[]) =>
          void log.push([String(name), ...args]),
    },
  ) as T;
  const named = (name: string) => log.filter(([n]) => n === name).map(([, ...args]) => args);
  return { events, log, named };
}

const control = <T extends HTMLElement = HTMLInputElement>(name: string) =>
  document.querySelector<T>(`[name="${name}"]:not([disabled])`) as T;
const tab = (id: string) => document.querySelector<HTMLElement>(`[data-tab="${id}"]`);
const clickNext = () => document.querySelector<HTMLButtonElement>('[data-next]')?.click();

// How the field is focused and its slip scrolled to, as the section asks for them.
function watchFocus(field: string) {
  const focused: unknown[] = [];
  const scrolled: unknown[] = [];
  const input = control(field);
  input.focus = (options) => {
    focused.push(options);
    HTMLElement.prototype.focus.call(input, options);
  };
  const slip = document.querySelector<HTMLElement>(`[data-error-for="${field}"]`) as HTMLElement;
  slip.scrollIntoView = (options) => void scrolled.push(options);
  return { input, focused, scrolled };
}

const RESIGNATION: FormEntries = [
  ['cause', 'resignation'],
  ['startDate', '2020-03-01'],
  ['endDate', '2026-09-15'],
  ['extraPayProrated', 'yes'],
  ['monthlySalary', '2000'],
  ['holidayDaysTaken', '0'],
  ['noticeDaysGiven', '15'],
  ['paid', 'no'],
];

function finalPay(flow = FINAL_PAY_FLOW) {
  const { events, log, named } = recorder<CalculatorEvents>();
  const calculator = setUpCalculator(document.body, { events, today, tr: pageTranslator(), flow });
  return { calculator, log, named };
}

beforeEach(() => history.replaceState(null, '', location.pathname));

describe.skipIf(!built)('the final pay on the shared walk', () => {
  it('reopens, after a result, only the sheets up to the first one that needs an answer', () => {
    mount('finiquito');
    const { calculator } = finalPay();
    calculator.fill(RESIGNATION);
    expect(calculator.review()).toBe(true);
    expect(tab('holidays')?.tagName).toBe('A');
    const endDate = control('endDate');
    endDate.value = '';
    endDate.dispatchEvent(new Event('input', { bubbles: true }));
    expect(tab('dates')?.tagName).toBe('A');
    expect(tab('salary')?.getAttribute('aria-disabled')).toBe('true');
    expect(tab('holidays')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('reviews the answers when the sheets left do not apply', () => {
    mount('finiquito');
    const { calculator, named } = finalPay({
      ...FINAL_PAY_FLOW,
      applies: (form, step) =>
        step !== 'pago' && step !== 'finiquito' && FINAL_PAY_FLOW.applies(form, step),
    });
    calculator.fill(RESIGNATION);
    calculator.open();
    for (let i = 0; i < 12 && location.hash !== '#resultado'; i++) clickNext();
    expect(location.hash).toBe('#resultado');
    expect(named('reviewCompleted')).toHaveLength(1);
    const completed = named('stepCompleted').map(([step]) => step);
    expect(new Set(completed).size).toBe(completed.length);
    expect(document.querySelector('#resultado [data-items]')?.children.length).toBeGreaterThan(0);
  });

  it('focuses a rejected field without scrolling and brings its slip into view', () => {
    mount('finiquito');
    const { calculator, named } = finalPay();
    calculator.fill([...RESIGNATION, ['endDate', '2019-01-01']]);
    const { input, focused, scrolled } = watchFocus('endDate');
    expect(calculator.review()).toBe(false);
    expect(location.hash).toBe('#fechas');
    expect(document.activeElement).toBe(input);
    expect(focused).toEqual([{ preventScroll: true }]);
    expect(scrolled).toEqual([{ block: 'nearest' }]);
    expect(named('fieldRejected')).toEqual([['fechas', 'endDate']]);
  });

  it('completes the last sheet before it reports the review, then shows the result', () => {
    mount('finiquito');
    const { calculator, log } = finalPay();
    calculator.fill(RESIGNATION);
    log.length = 0;
    calculator.review();
    expect(log.map(([name]) => name)).toEqual(['stepCompleted', 'reviewCompleted', 'stepShown']);
  });

  it('opens a page about one cause on the sheet after it, and starts over there', () => {
    mount('finiquito/baja-voluntaria');
    const { calculator, named } = finalPay(presetCauseFlow('resignation'));
    expect(location.hash).toBe('#fechas');
    calculator.fill(RESIGNATION);
    calculator.review();
    document.querySelector<HTMLButtonElement>('#resultado [data-restart]')?.click();
    expect(location.hash).toBe('#fechas');
    expect(named('startedOver')).toHaveLength(1);
    expect(control('endDate').value).toBe('');
  });

  it('reports the item detail a visitor opens beside the help topics', () => {
    mount('finiquito');
    const { calculator, named } = finalPay();
    calculator.fill(RESIGNATION);
    calculator.review();
    const detail = document.querySelector('#resultado details[data-detail]') as HTMLDetailsElement;
    const item = detail.closest<HTMLElement>('[data-item]')?.dataset['item'];
    expect(item).toBeTruthy();
    detail.open = true;
    const help = document.querySelector('details[data-help]') as HTMLDetailsElement;
    help.open = true;
    expect(named('detailOpened')).toEqual([[item]]);
    expect(named('helpOpened')).toEqual([[help.id]]);
  });
});

describe.skipIf(!built)('a section with none of the hooks', () => {
  function credit() {
    mount('financiacion');
    const { events, log, named } = recorder<CreditEvents>();
    const tables = {
      norms: CREDIT_NORMS,
      sources: CREDIT_SOURCES,
      rates: {
        'BE_19_4.7': BE1904['BE_19_4.7'],
        'BE_19_4.9': BE1904['BE_19_4.9'],
        'BE_19_4.10': BE1904['BE_19_4.10'],
        'BE_19_4.11': BE1904['BE_19_4.11'],
      },
    };
    const form = setUpCredit(document.body, { events, today, tr: pageTranslator(), tables });
    return { form, log, named };
  }

  it('opens on its first sheet when the address names no step', () => {
    credit();
    expect(location.hash).toBe('#producto');
  });

  it('reports a rejected field by its own name and focuses it as the others do', () => {
    const { named } = credit();
    const { focused, scrolled } = watchFocus('product');
    clickNext();
    expect(location.hash).toBe('#producto');
    expect(named('fieldRejected')).toEqual([['producto', 'product']]);
    expect(focused).toEqual([{ preventScroll: true }]);
    expect(scrolled).toEqual([{ block: 'nearest' }]);
  });

  it('reports only the help topics opened', () => {
    const { log } = credit();
    log.length = 0;
    for (const d of document.querySelectorAll<HTMLDetailsElement>('details')) d.open = true;
    expect(new Set(log.map(([name]) => name))).toEqual(new Set(['helpOpened']));
  });

  it('fills the answers it has controls for and starts over on its first sheet', () => {
    const { form, named } = credit();
    expect(
      form.fill([
        ['product', 'personal_loan'],
        ['nowhere', 'x'],
      ]),
    ).toEqual(['nowhere']);
    expect(form.entries()).toContainEqual(['product', 'personal_loan']);
    clickNext();
    document.querySelector<HTMLButtonElement>('#resultado [data-restart]')?.click();
    expect(location.hash).toBe('#producto');
    expect(named('startedOver')).toHaveLength(1);
    expect(named('reviewCleared')).toHaveLength(1);
    expect(form.entries()).not.toContainEqual(['product', 'personal_loan']);
  });
});
