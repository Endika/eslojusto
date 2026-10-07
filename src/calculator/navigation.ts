import type { CivilDate } from '../engine/date';
import { applies, prepareFigures, stepFrom } from './conditions';
import type { CalculatorEvents } from './ports';
import { LAST_SHEET, RESULT_STEP, SECTION_OF_STEP, STEPS, stepAt } from './steps';
import { setUpTabs } from './tabs';

export interface Screen {
  readonly root: HTMLElement;
  readonly form: HTMLFormElement;
  readonly result: HTMLElement;
  readonly resultTitle: HTMLElement;
  readonly sheets: readonly HTMLElement[];
  readonly actions: HTMLElement;
  readonly backButton: HTMLButtonElement;
  readonly nextButton: HTMLButtonElement;
  readonly reviewButton: HTMLButtonElement;
}

export interface ShowOptions {
  readonly history?: 'push' | 'replace';
  readonly focus?: boolean;
}

export interface Navigation {
  readonly current: number;
  // The furthest step the visitor may open.
  reached: number;
  show(i: number, options?: ShowOptions): void;
  goBack(i: number, options: ShowOptions): void;
  renderTabs(): void;
}

// The step on screen, the furthest one reached, and the browser history that follows them.
export function createNavigation(
  screen: Screen,
  events: CalculatorEvents,
  today: () => CivilDate,
): Navigation {
  const { root, form, result, resultTitle, sheets, actions } = screen;
  const tabs = setUpTabs(root);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = -1;
  let reached = 0;

  const renderTabs = () => tabs(current, reached);

  function show(i: number, options: ShowOptions = {}) {
    let target = Math.max(0, Math.min(i, reached));
    if (!applies(form, target)) target = stepFrom(form, target, -1);
    const firstTime = current < 0;
    const changes = target !== current;
    current = target;
    const id = STEPS[current] ?? 'causa';

    sheets.forEach((h, j) => (h.hidden = j !== current));
    result.hidden = current !== RESULT_STEP;
    actions.hidden = current === RESULT_STEP;
    screen.backButton.hidden = current === 0;
    screen.nextButton.hidden = current >= LAST_SHEET;
    screen.reviewButton.hidden = current !== LAST_SHEET;
    root.dataset['section'] = SECTION_OF_STEP[id];
    events.stepShown(id);
    if (current === LAST_SHEET) prepareFigures(form, today());
    renderTabs();

    if (options.history === 'push') history.pushState(null, '', `#${id}`);
    else if (options.history === 'replace') history.replaceState(null, '', `#${id}`);

    const visible = current === RESULT_STEP ? result : sheets[current];
    if (changes && !firstTime && visible && !reducedMotion.matches) {
      visible.classList.remove('turning');
      void visible.offsetWidth;
      visible.classList.add('turning');
    }
    if (changes && !firstTime) window.scrollTo({ top: 0 });
    if (options.focus) {
      const title = current === RESULT_STEP ? resultTitle : visible?.querySelector('h2');
      title?.focus({ preventScroll: true });
    }
  }

  // Any move to an earlier step: the Back button, a tab or the browser's back.
  function goBack(i: number, options: ShowOptions) {
    const before = current;
    show(i, options);
    if (current < before) events.wentBack(stepAt(before), stepAt(current));
  }

  return {
    get current() {
      return current;
    },
    get reached() {
      return reached;
    },
    set reached(i: number) {
      reached = i;
    },
    show,
    goBack,
    renderTabs,
  };
}
