import type { CivilDate } from '../engine/date';
import type { ClientKey, Translate } from '../i18n/client';
import type { DocumentModel, PaidReview } from './ports';

// Several reviews of one section under one pass, such as a year of bills, each confirmed on its
// own. It lives in the page's memory only and is never stored: closing the tab empties it.
export interface ReviewBasket<T> {
  // Keeps the review being worked on: reviewing it again replaces it rather than adding it twice.
  put(entry: T): void;
  // Takes the review being worked on out, as when it falls outside the review or starts over.
  drop(): void;
  // The next review put is another one, beside those kept.
  next(): void;
  entries(): readonly T[];
}

export function createBasket<T>(): ReviewBasket<T> {
  const kept: T[] = [];
  let current: number | null = null;
  return {
    put(entry) {
      if (current === null) {
        current = kept.length;
        kept.push(entry);
      } else kept[current] = entry;
    },
    drop() {
      if (current === null) return;
      kept.splice(current, 1);
      current = null;
    },
    next() {
      current = null;
    },
    entries: () => [...kept],
  };
}

// What a section brings to sell one pass for its whole basket: the rule that offers it, over every
// review kept, and the report that adds them up.
export interface BasketSection<T> {
  offer(entries: readonly T[]): boolean;
  report(entries: readonly T[], tr: Translate, today: CivilDate): DocumentModel;
  readonly reportFilename: ClientKey;
}

// A basket as the pass sees it. It has no letter of its own.
export function basketCase<T>(entries: readonly T[], section: BasketSection<T>): PaidReview {
  const kept = [...entries];
  return {
    offer: kept.length > 0 && section.offer(kept),
    letterKinds: [],
    report: (tr, today) => section.report(kept, tr, today),
    letter() {
      throw new Error('A basket has no letter');
    },
    filename: () => section.reportFilename,
  };
}
