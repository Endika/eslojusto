import type { KeyValueStore } from './ports';

export const OUTAGE_KEY = 'eslojusto-lectura-no-disponible';
export const OUTAGE_MS = 60 * 60 * 1000;

export interface OutageMemory {
  // Whether reading answered `model_unavailable` less than an hour ago in this tab.
  active(): boolean;
  remember(): void;
}

// Kept in the tab's session storage: only the time it happened, and only for an hour.
export function createOutageMemory(store: KeyValueStore, now: () => number): OutageMemory {
  return {
    active() {
      const since = Number(store.get(OUTAGE_KEY));
      const age = now() - since;
      if (since > 0 && age >= 0 && age < OUTAGE_MS) return true;
      store.remove(OUTAGE_KEY);
      return false;
    },
    remember() {
      store.set(OUTAGE_KEY, String(now()));
    },
  };
}
