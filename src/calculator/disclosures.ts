import type { ItemId } from '../engine/types';
import type { CalculatorEvents } from './ports';

// Tells which help topic or item detail a visitor opens.
export function watchDisclosures(root: HTMLElement, events: CalculatorEvents): void {
  // `toggle` does not bubble, so it is caught on the way down.
  root.addEventListener(
    'toggle',
    (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.open) return;
      if (d.hasAttribute('data-help')) events.helpOpened(d.id);
      const item = d.closest<HTMLElement>('[data-item]')?.dataset['item'];
      if (d.hasAttribute('data-detail') && item) events.detailOpened(item as ItemId);
    },
    true,
  );
}
