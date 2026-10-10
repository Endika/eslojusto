import type { CivilDate } from '../date';
import { findingsOf, totalsOf, type BillItem, type BillTotals } from './finding';
import type { NormTable, SourceTable } from './norms';
import { telecomScope } from './scope';
import type { BillsTables } from './tables';
import { checkChargesAfterExit } from './telecom-after-exit';
import { checkChangeExit } from './telecom-change-exit';
import { checkCommitment } from './telecom-commitment';
import type { TelecomInput, TelecomScope } from './types';
import { validateTelecom, type TelecomField, type ValidationError } from './validate';

// What the review never looks at, always listed at the end.
export type TelecomUncheckedCode =
  'agreed_price' | 'service_cuts' | 'premium_rate_services' | 'unrequested_services';

export const TELECOM_UNCHECKED: readonly TelecomUncheckedCode[] = [
  'agreed_price',
  'service_cuts',
  'premium_rate_services',
  'unrequested_services',
];

export interface TelecomDeps {
  readonly norms: NormTable;
  readonly tables: Pick<BillsTables, 'holidays'>;
  readonly sources: SourceTable;
}

export interface TelecomReview {
  readonly scope: TelecomScope;
  readonly items: readonly BillItem[];
  readonly totals: BillTotals;
  readonly unchecked: readonly TelecomUncheckedCode[];
}

export type TelecomResult =
  | { readonly ok: false; readonly errors: readonly ValidationError<TelecomField>[] }
  | { readonly ok: true; readonly review: TelecomReview };

// Leaving over a change of conditions settles what the penalty may be in every reading; otherwise
// the commitment's own proportional cap does. Never both: they are the same euros.
const settlesPenalty = (item: BillItem | null): boolean =>
  item !== null &&
  findingsOf(item).every((f) => f.status === 'paid_over' || f.status === 'within_limit');

// The review of a phone or internet exit: the commitment, leaving over a change of conditions and
// what was billed after the exit took effect.
export function reviewTelecom(
  input: TelecomInput,
  today: CivilDate,
  deps: TelecomDeps,
): TelecomResult {
  const reach = telecomScope(input);
  if (!reach.inScope)
    return {
      ok: true,
      review: {
        scope: reach,
        items: [],
        totals: { counted: 0, upTo: 0, under: 0 },
        unchecked: TELECOM_UNCHECKED,
      },
    };
  const errors = validateTelecom(input, today);
  if (errors.length > 0) return { ok: false, errors };
  const change = checkChangeExit(input, deps);
  const commitment = checkCommitment(input, deps.norms).filter(
    (item) => !settlesPenalty(change) || findingsOf(item)[0]?.id !== 'commitment_penalty',
  );
  const items = [
    ...commitment,
    ...(change === null ? [] : [change]),
    ...checkChargesAfterExit(input, { norms: deps.norms, holidays: deps.tables.holidays }),
  ];
  return {
    ok: true,
    review: { scope: reach, items, totals: totalsOf(items), unchecked: TELECOM_UNCHECKED },
  };
}
