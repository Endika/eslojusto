import { stepAt, type Flow } from './flow';

function asTab(el: HTMLElement, link: boolean): HTMLElement {
  if (el instanceof HTMLAnchorElement === link) return el;
  const other = document.createElement(link ? 'a' : 'span');
  for (const { name, value } of el.attributes) other.setAttribute(name, value);
  other.append(...el.childNodes);
  el.replaceWith(other);
  return other;
}

// A tab is a link once its section is reached and plain text before; it swaps element on change.
export function setUpTabs<S extends string>(
  root: ParentNode,
  flow: Flow<S>,
): (current: number, reached: number) => void {
  const { steps, sectionOfStep } = flow;
  const tabs = [...root.querySelectorAll<HTMLElement>('[data-tab]')];
  return (current, reached) => {
    const currentSection = sectionOfStep[stepAt(flow, current)];
    tabs.forEach((el, i) => {
      const id = el.dataset['tab'] ?? sectionOfStep[steps[0]];
      const first = steps.findIndex((p) => sectionOfStep[p] === id);
      const available = first <= reached;
      const isCurrent = id === currentSection;
      const p = asTab(el, available);
      tabs[i] = p;
      if (available) {
        p.setAttribute('href', `#${steps[first]}`);
        p.removeAttribute('aria-disabled');
      } else {
        p.removeAttribute('href');
        p.setAttribute('aria-disabled', 'true');
      }
      p.dataset['state'] = isCurrent ? 'current' : available ? 'done' : 'pending';
      if (isCurrent) p.setAttribute('aria-current', 'step');
      else p.removeAttribute('aria-current');
    });
  };
}
