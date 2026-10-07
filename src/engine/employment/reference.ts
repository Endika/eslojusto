import type { CivilDate } from '../date';
import { computeSeverance, type Severance } from '../severance';
import type { FixedTermType } from '../types';
import type { Assessed, EmploymentInput, Finding, ItemId, Modality } from './types';

// Two reference figures shown only «si un juzgado lo declarase así»: what the end of the
// fixed-term contract pays (art. 49.1.c ET) and what an unfair dismissal of an open-ended one would
// (art. 56 ET). Never part of a total, never in a letter.
export interface PermanentReference {
  readonly on: CivilDate;
  readonly fixedTermEnd: Severance;
  readonly unfairDismissal: Severance;
}

const TEMPORALITY: ReadonlySet<ItemId> = new Set(['modality', 'chaining']);

const isConcreteTemporality = (f: Finding): boolean =>
  TEMPORALITY.has(f.item) &&
  !f.agreementMaySetOther &&
  (f.status === 'becomes_permanent' || f.status === 'over_legal_limit');

const holds = (a: Assessed): boolean =>
  a.kind === 'single'
    ? isConcreteTemporality(a.finding)
    : a.readings.every((r) => isConcreteTemporality(r.finding));

const FIXED_TERM_TYPE: Partial<Record<Modality, FixedTermType>> = {
  replacement: 'replacement',
  replacement_selection: 'replacement',
  interim: 'replacement',
  training_alternance: 'training',
  training_practice: 'training',
};

// Only with a temporality finding that holds in every reading, on the end day or, without one,
// today. The yearly salary comes from the minimum wage review of the same contract.
export function permanentReference(
  input: EmploymentInput,
  today: CivilDate,
  assessed: readonly Assessed[],
  annualSalary: number | null,
): PermanentReference | null {
  if (annualSalary === null || annualSalary <= 0 || !assessed.some(holds)) return null;
  const on = input.endDate ?? today;
  const common = { startDate: input.startDate, endDate: on, annualSalary };
  return {
    on,
    fixedTermEnd: computeSeverance({
      ...common,
      cause: 'fixed_term_end',
      fixedTermType: FIXED_TERM_TYPE[input.modality] ?? 'production_circumstances',
    }),
    unfairDismissal: computeSeverance({ ...common, cause: 'unfair_dismissal' }),
  };
}
