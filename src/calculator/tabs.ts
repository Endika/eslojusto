import { SECTION_OF_STEP, STEPS } from './steps';

function asTab(el: HTMLElement, link: boolean): HTMLElement {
  if (el instanceof HTMLAnchorElement === link) return el;
  const other = document.createElement(link ? 'a' : 'span');
  for (const { name, value } of el.attributes) other.setAttribute(name, value);
  other.append(...el.childNodes);
  el.replaceWith(other);
  return other;
}

// A tab is a link once its section is reached and plain text before; it swaps element on change.
export function setUpTabs(root: ParentNode): (current: number, reached: number) => void {
  const tabs = [...root.querySelectorAll<HTMLElement>('[data-tab]')];
  return (current, reached) => {
    const currentSection = SECTION_OF_STEP[STEPS[current] ?? 'causa'];
    tabs.forEach((el, i) => {
      const id = el.dataset['tab'] ?? 'cause';
      const first = STEPS.findIndex((p) => SECTION_OF_STEP[p] === id);
      const available = first <= reached;
      const isCurrent = id === currentSection;
      const p = asTab(el, available);
      tabs[i] = p;
      if (available) {
        p.setAttribute('href', `#${STEPS[first]}`);
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
