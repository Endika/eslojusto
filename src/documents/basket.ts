import type { CivilDate } from '../engine/date';
import type { ClientKey, Translate } from '../i18n/client';
import type { LetterDetails, LetterKind } from './letter';
import type { DocumentModel, Download, PaidReview } from './ports';

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

// The letters a basket can give, over every review kept: those the pass pays for and those that
// carry no figure and download free.
export interface BasketLetters<T> {
  paid(entries: readonly T[]): readonly LetterKind[];
  free?(entries: readonly T[]): readonly LetterKind[];
  letter(
    entries: readonly T[],
    kind: LetterKind,
    details: LetterDetails,
    tr: Translate,
  ): DocumentModel;
  filename(kind: LetterKind): ClientKey;
}

// What a section brings to sell one pass for its whole basket: the rule that offers it, over every
// review kept, the report that adds them up and the letters, if it has any.
export interface BasketSection<T> {
  offer(entries: readonly T[]): boolean;
  report(entries: readonly T[], tr: Translate, today: CivilDate): DocumentModel;
  readonly reportFilename: ClientKey;
  readonly letters?: BasketLetters<T>;
}

// A basket as the pass sees it. A letter the basket does not offer is never built.
export function basketCase<T>(entries: readonly T[], section: BasketSection<T>): PaidReview {
  const kept = [...entries];
  const { letters } = section;
  const letterKinds = letters?.paid(kept) ?? [];
  const freeLetterKinds = letters?.free?.(kept) ?? [];
  return {
    offer: kept.length > 0 && section.offer(kept),
    letterKinds,
    freeLetterKinds,
    report: (tr, today) => section.report(kept, tr, today),
    letter(kind, details, tr) {
      if (!letters || ![...letterKinds, ...freeLetterKinds].includes(kind))
        throw new Error(`This basket has no ${kind} letter`);
      return letters.letter(kept, kind, details, tr);
    },
    filename: (document: Download, kind?: LetterKind) =>
      document === 'letter' && kind !== undefined && letters
        ? letters.filename(kind)
        : section.reportFilename,
  };
}
