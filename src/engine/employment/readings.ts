import { assessAcross as lawAssessAcross } from '../law/readings';
import {
  READINGS,
  type Assessed,
  type DoubtQuestion,
  type Finding,
  type FindingStatus,
  type ReadingCode,
} from './types';

// The worlds to assess: the person's answer, or every reading when they answered «No lo sé».
export const worldsOf = <Q extends DoubtQuestion>(
  question: Q,
  answer: ReadingCode<Q> | null,
): readonly ReadingCode<Q>[] => (answer === null ? READINGS[question] : [answer]);

// Assesses one point in each world; when every world agrees the answer did not matter.
export const assessAcross = <Q extends DoubtQuestion>(
  question: Q,
  worlds: readonly ReadingCode<Q>[],
  assess: (world: ReadingCode<Q>) => Finding,
): Assessed => lawAssessAcross(question, worlds, assess);

// Findings that say something concrete is wrong (below the minimum, over a legal limit, a void
// clause, a fixed-term contract the law turns permanent).
const CONCRETE: ReadonlySet<FindingStatus> = new Set([
  'below_minimum',
  'over_legal_limit',
  'clause_void',
  'becomes_permanent',
]);

// A limit the collective agreement can move is only «depends on your agreement».
const isConcrete = (f: Finding): boolean => CONCRETE.has(f.status) && !f.agreementMaySetOther;

// The pass is offered only for a concrete finding that holds in every reading.
export function offerPass(assessed: readonly Assessed[]): boolean {
  return assessed.some((a) =>
    a.kind === 'single' ? isConcrete(a.finding) : a.readings.every((r) => isConcrete(r.finding)),
  );
}
