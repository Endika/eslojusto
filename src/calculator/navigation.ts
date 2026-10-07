import type { CivilDate } from '../engine/date';
import { lastSheet, resultStep, stepAt, stepFrom, type Flow } from './flow';
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

export interface NavigationEvents<S extends string> {
  stepShown(step: S): void;
  wentBack(from: S, to: S): void;
}

// The step on screen, the furthest one reached, and the browser history that follows them.
export function createNavigation<S extends string>(
  screen: Screen,
  events: NavigationEvents<S>,
  today: () => CivilDate,
  flow: Flow<S>,
): Navigation {
  const { root, form, result, resultTitle, sheets, actions } = screen;
  const tabs = setUpTabs(root, flow);
  const lastSheetIndex = lastSheet(flow);
  const resultIndex = resultStep(flow);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = -1;
  let reached = 0;

  const renderTabs = () => tabs(current, reached);

  function show(i: number, options: ShowOptions = {}) {
    let target = Math.max(0, Math.min(i, reached));
    if (!flow.applies(form, stepAt(flow, target))) target = stepFrom(flow, form, target, -1);
    const firstTime = current < 0;
    const changes = target !== current;
    current = target;
    const id = stepAt(flow, current);

    sheets.forEach((h, j) => (h.hidden = j !== current));
    result.hidden = current !== resultIndex;
    actions.hidden = current === resultIndex;
    screen.backButton.hidden = current === 0;
    screen.nextButton.hidden = current >= lastSheetIndex;
    screen.reviewButton.hidden = current !== lastSheetIndex;
    root.dataset['section'] = flow.sectionOfStep[id];
    events.stepShown(id);
    if (current === lastSheetIndex) flow.prepareLastSheet?.(form, today());
    renderTabs();

    if (options.history === 'push') history.pushState(null, '', `#${id}`);
    else if (options.history === 'replace') history.replaceState(null, '', `#${id}`);

    const visible = current === resultIndex ? result : sheets[current];
    if (changes && !firstTime && visible && !reducedMotion.matches) {
      visible.classList.remove('turning');
      void visible.offsetWidth;
      visible.classList.add('turning');
    }
    if (changes && !firstTime) window.scrollTo({ top: 0 });
    if (options.focus) {
      const title = current === resultIndex ? resultTitle : visible?.querySelector('h2');
      title?.focus({ preventScroll: true });
    }
  }

  // Any move to an earlier step: the Back button, a tab or the browser's back.
  function goBack(i: number, options: ShowOptions) {
    const before = current;
    show(i, options);
    if (current < before) events.wentBack(stepAt(flow, before), stepAt(flow, current));
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
