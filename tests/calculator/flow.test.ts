// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  firstIncomplete,
  indexOfHash,
  lastSheet,
  resultStep,
  stepAt,
  stepFrom,
  type Flow,
} from '../../src/calculator/flow';
import { createNavigation, type NavigationEvents } from '../../src/calculator/navigation';
import { setUpTabs } from '../../src/calculator/tabs';
import { FINAL_PAY_FLOW, SECTION_OF_STEP, STEPS } from '../../src/calculator/steps';

const today = { y: 2026, m: 10, d: 7 };

// A made-up review of three sheets in two tabs: «extra» is asked only when «a» says so, and a
// sheet is complete once its input holds anything.
type Demo = 'a' | 'extra' | 'b' | 'end';
const answer = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? '');
const prepared: number[] = [];
const demo: Flow<Demo> = {
  steps: ['a', 'extra', 'b', 'end'],
  sectionOfStep: { a: 'first', extra: 'first', b: 'second', end: 'result' },
  applies: (form, step) => step !== 'extra' || answer(form, 'a') === 'more',
  complete: (form, step) => step === 'end' || answer(form, step) !== '',
  prepareLastSheet: () => void prepared.push(1),
};

function page() {
  document.body.innerHTML = `
    <main>
      <nav class="tabs">
        <span data-tab="first">First</span><span data-tab="second">Second</span>
        <span data-tab="result">Result</span>
      </nav>
      <form>
        <section data-sheet="a"><h2 tabindex="-1">A</h2><input name="a" /></section>
        <section data-sheet="extra"><h2 tabindex="-1">Extra</h2><input name="extra" /></section>
        <section data-sheet="b"><h2 tabindex="-1">B</h2><input name="b" /></section>
        <div class="actions">
          <button data-back></button><button data-next></button><button data-submit></button>
        </div>
      </form>
      <section id="result"><h2 tabindex="-1">Result</h2></section>
    </main>`;
  const root = document.querySelector('main') as HTMLElement;
  const form = root.querySelector('form') as HTMLFormElement;
  const all = <T extends Element>(s: string) => [...root.querySelectorAll<T>(s)];
  return { root, form, all };
}

const fill = (form: HTMLFormElement, values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values))
    (form.querySelector(`[name="${name}"]`) as HTMLInputElement).value = value;
};

describe('a flow', () => {
  beforeEach(() => {
    prepared.length = 0;
  });

  it('knows its last sheet and its result, and falls back to its first step', () => {
    expect(lastSheet(demo)).toBe(2);
    expect(resultStep(demo)).toBe(3);
    expect(stepAt(demo, 7)).toBe('a');
    expect(indexOfHash(demo, '#b')).toBe(2);
    expect(indexOfHash(demo, 'end')).toBe(3);
    expect(indexOfHash(demo, '#nowhere')).toBe(0);
  });

  it('skips the sheets that are not asked, both ways', () => {
    const { form } = page();
    expect(stepFrom(demo, form, 0, 1)).toBe(2);
    expect(stepFrom(demo, form, 2, -1)).toBe(0);
    fill(form, { a: 'more' });
    expect(stepFrom(demo, form, 0, 1)).toBe(1);
    expect(stepFrom(demo, form, 2, 1)).toBe(3);
  });

  it('opens up to the first sheet asked that does not answer cleanly', () => {
    const { form } = page();
    expect(firstIncomplete(demo, form, today)).toBe(0);
    fill(form, { a: 'less' });
    expect(firstIncomplete(demo, form, today)).toBe(2);
    fill(form, { a: 'more' });
    expect(firstIncomplete(demo, form, today)).toBe(1);
    fill(form, { extra: 'x', b: 'y' });
    expect(firstIncomplete(demo, form, today)).toBe(lastSheet(demo));
  });

  it('drives navigation and the tabs without knowing the review', () => {
    const { root, form, all } = page();
    const shown: Demo[] = [];
    const back: [Demo, Demo][] = [];
    const events: NavigationEvents<Demo> = {
      stepShown: (step) => void shown.push(step),
      wentBack: (from, to) => void back.push([from, to]),
    };
    const button = (s: string) => root.querySelector(s) as HTMLButtonElement;
    const nav = createNavigation(
      {
        root,
        form,
        result: root.querySelector('#result') as HTMLElement,
        resultTitle: root.querySelector('#result h2') as HTMLElement,
        sheets: all<HTMLElement>('[data-sheet]'),
        actions: root.querySelector('.actions') as HTMLElement,
        backButton: button('[data-back]'),
        nextButton: button('[data-next]'),
        reviewButton: button('[data-submit]'),
      },
      events,
      () => today,
      demo,
    );
    nav.reached = 2;
    nav.show(1);
    // «extra» is not asked, so the sheet before it is shown.
    expect(nav.current).toBe(0);
    expect(root.dataset['section']).toBe('first');
    nav.show(2);
    expect(root.dataset['section']).toBe('second');
    expect(prepared).toEqual([1]);
    expect(button('[data-submit]').hidden).toBe(false);
    expect(button('[data-next]').hidden).toBe(true);
    nav.goBack(0, {});
    expect(shown).toEqual(['a', 'b', 'a']);
    expect(back).toEqual([['b', 'a']]);
    const tabs = all<HTMLElement>('[data-tab]');
    expect(tabs.map((t) => t.dataset['state'])).toEqual(['current', 'done', 'pending']);
    expect(tabs.map((t) => t.getAttribute('href'))).toEqual(['#a', '#b', null]);
  });

  it('marks a tab current from any of its steps', () => {
    const { root } = page();
    const render = setUpTabs(root, demo);
    render(1, 1);
    const tabs = [...root.querySelectorAll<HTMLElement>('[data-tab]')];
    expect(tabs.map((t) => t.getAttribute('aria-current'))).toEqual(['step', null, null]);
  });
});

describe('the final pay flow', () => {
  it('walks every sheet and ends on the result', () => {
    expect(FINAL_PAY_FLOW.steps).toEqual(STEPS);
    expect(FINAL_PAY_FLOW.steps.at(-1)).toBe('resultado');
    expect(FINAL_PAY_FLOW.sectionOfStep).toBe(SECTION_OF_STEP);
  });
});
