import { addDays, daysInMonth, parseDate, toIso, type CivilDate } from '../date';
import { CONDITION_GRACE_DAYS } from '../law/verification';
import type { BillsNormId, NormTable } from './norms';
import { TABLE_NAMES, valueOn, type BillsTables, type TableName } from './tables';

export interface DueDeps {
  readonly norms: NormTable;
  readonly tables: BillsTables;
}

// What the monthly review of the bills tables has to look at.
export type DueItem =
  // A reduction still waiting on its figure; overdue a week after it was due.
  | {
      readonly kind: 'condition_open';
      readonly norm: BillsNormId;
      readonly text: string;
      readonly decidesOn: string;
      readonly overdue: boolean;
    }
  // A month of this year whose tax rate depends on a norm not yet settled.
  | {
      readonly kind: 'month_conditional';
      readonly month: string;
      readonly table: 'electricityTax' | 'vat';
      readonly norms: readonly BillsNormId[];
    }
  // A month of this year with days no rate covers.
  | { readonly kind: 'month_missing'; readonly month: string; readonly table: TableName }
  // The last day each table covers, soonest first.
  | { readonly kind: 'table_ends'; readonly table: TableName; readonly lastDay: string }
  | { readonly kind: 'holidays_missing'; readonly year: number }
  // A decree the Congress has not validated yet, and the day it came into force.
  | { readonly kind: 'validation_pending'; readonly norm: BillsNormId; readonly since: string };

const TAX_TABLES = ['electricityTax', 'vat'] as const;

const monthDays = (y: number, m: number): readonly string[] =>
  Array.from({ length: daysInMonth(y, m) }, (_, i) => toIso({ y, m, d: i + 1 }));

// The tables with no value on `day` (ISO), holidays included: a bill falling due that day could
// not be checked whole.
export function uncoveredOn(
  day: string,
  { norms, tables }: DueDeps,
): readonly (TableName | 'holidays')[] {
  const missing: (TableName | 'holidays')[] = TABLE_NAMES.filter(
    (name) => valueOn<unknown>(tables[name], day, norms).kind === 'missing',
  );
  const year = parseDate(day).y;
  if (!tables.holidays.some((h) => h.year === year)) missing.push('holidays');
  return missing;
}

export function billsDue(today: CivilDate, deps: DueDeps): readonly DueItem[] {
  const { norms, tables } = deps;
  const items: DueItem[] = [];
  const iso = toIso(today);

  for (const norm of Object.values(norms)) {
    if (norm.status !== 'conditional' || norm.condition?.met !== null) continue;
    const { text, decidesOn } = norm.condition;
    const overdue = iso > toIso(addDays(parseDate(decidesOn), CONDITION_GRACE_DAYS));
    items.push({ kind: 'condition_open', norm: norm.id, text, decidesOn, overdue });
  }

  for (let m = today.m; m <= 12; m++) {
    const month = `${today.y}-${String(m).padStart(2, '0')}`;
    for (const table of TAX_TABLES) {
      const lookups = monthDays(today.y, m).map((day) =>
        valueOn<unknown>(tables[table], day, norms),
      );
      const deciding = new Set(lookups.flatMap((l) => (l.kind === 'conditional' ? l.norms : [])));
      if (deciding.size > 0)
        items.push({ kind: 'month_conditional', month, table, norms: [...deciding] });
      if (lookups.some((l) => l.kind === 'missing'))
        items.push({ kind: 'month_missing', month, table });
    }
  }

  const ends = TABLE_NAMES.flatMap((table) => {
    const untils = tables[table].map((r) => r.until);
    const closed = untils.filter((u): u is string => u !== null);
    if (closed.length === 0 || closed.length < untils.length) return [];
    const lastDay = closed.reduce((a, b) => (b > a ? b : a));
    return [{ kind: 'table_ends' as const, table, lastDay }];
  });
  items.push(...ends.sort((a, b) => a.lastDay.localeCompare(b.lastDay)));

  if (!tables.holidays.some((h) => h.year === today.y))
    items.push({ kind: 'holidays_missing', year: today.y });

  for (const norm of Object.values(norms))
    if (norm.status === 'pending_validation')
      items.push({ kind: 'validation_pending', norm: norm.id, since: norm.inForceSince });

  return items;
}
