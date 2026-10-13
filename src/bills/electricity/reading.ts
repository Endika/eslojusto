import type { ElectricityFieldName, ElectricityListName } from '../../documents/contract';
import type { DocumentReading } from '../../documents/ports';
import type { Translate } from '../../i18n/client';
import { electricityPrefill, type BillRead } from './prefill';

export interface ElectricityReading extends DocumentReading<
  ElectricityFieldName,
  ElectricityListName
> {
  // The next bill read and not yet in the form, which it now is; null when none is left.
  next(): BillRead | null;
  // How many bills read wait for their turn.
  pending(): number;
  // What tells the bill in the form apart from a copy of it, when it was read; never in the form.
  fingerprint(): string | null;
  // The bill in the form was reviewed: it is no longer one waiting.
  reviewed(): void;
  // The form starts another bill, typed by hand.
  typed(): void;
}

// How the electricity review takes what was read: one bill at a time. A read of several bills
// fills the form with the oldest and keeps the rest, in this page's memory only, for the person to
// review one after the other. A new read starts a new bill, and a bill read and not yet reviewed
// waits its turn again rather than being lost.
export function electricityReading(form: HTMLFormElement, tr: Translate): ElectricityReading {
  let waiting: BillRead[] = [];
  let current: BillRead | null = null;
  let reviewed = false;
  return {
    prefill(extraction, _answers, checks) {
      const { bills, notes } = electricityPrefill(extraction, tr, checks);
      const [first, ...rest] = bills;
      if (!first) return { entries: [], marks: [], count: 0, lowConfidence: false, notes };
      if (current && !reviewed) waiting.unshift(current);
      waiting = [...rest, ...waiting];
      current = first;
      reviewed = false;
      // A bill read replaces whatever bill the form held, so no answer of one mixes with another.
      form.reset();
      return { ...first, notes: [...notes, ...first.notes] };
    },
    wordsEveryCheck: true,
    next() {
      current = waiting.shift() ?? null;
      reviewed = false;
      return current;
    },
    pending: () => waiting.length,
    fingerprint: () => current?.fingerprint ?? null,
    reviewed() {
      reviewed = true;
    },
    typed() {
      current = null;
      reviewed = false;
    },
  };
}
