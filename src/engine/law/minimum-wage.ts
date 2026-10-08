// One year of the minimum wage, as fixed by that year's royal decree. Shared by every section that
// compares pay with it; `Id` is the section's own set of norm ids.
export interface MinimumWageRow<Id extends string = string> {
  readonly year: number;
  readonly norm: Id;
  readonly url: string;
  // Day the decree came out in the BOE.
  readonly publishedOn: string;
  // The calendar year the amounts have effects for (disposición final 3.ª of each decree).
  readonly effectsFrom: string;
  readonly effectsUntil: string;
  // True only once the BOE text was read to pay the amounts from 1 January even though the decree
  // came out later; false sends payslips before `publishedOn` to review.
  readonly retroactiveVerified: boolean;
  // Art. 1: per month with fourteen payments, and per day.
  readonly monthly: number;
  readonly daily: number;
  // Art. 3.1: the yearly floor of comparison.
  readonly annual: number;
  // Art. 4.1: per legal working day for fixed-term contracts of up to 120 days.
  readonly temporaryPerDay: number;
  // Art. 4.2: household employees paid by the hour (art. 8.5 RD 1620/2011).
  readonly householdPerHour: number;
}

export type MinimumWageTable<Id extends string = string> = readonly MinimumWageRow<Id>[];

export type MinimumWageLookup<Id extends string = string> =
  | { readonly kind: 'published'; readonly row: MinimumWageRow<Id> }
  // A year after the last decree loaded: its amount is unknown, the latest year is only a reference.
  | {
      readonly kind: 'not_published';
      readonly year: number;
      readonly reference: MinimumWageRow<Id>;
    }
  // A year before the first one loaded.
  | { readonly kind: 'not_loaded'; readonly year: number };

export function minimumWageFor<Id extends string>(
  year: number,
  table: MinimumWageTable<Id>,
): MinimumWageLookup<Id> {
  const row = table.find((r) => r.year === year);
  if (row !== undefined) return { kind: 'published', row };
  const latest = table.reduce<MinimumWageRow<Id> | null>(
    (last, r) => (last === null || r.year > last.year ? r : last),
    null,
  );
  if (latest !== null && year > latest.year) {
    return { kind: 'not_published', year, reference: latest };
  }
  return { kind: 'not_loaded', year };
}
