import type { CivilDate } from '../engine/date';

// Whether a section's result shows its detail: locked until a pass unlocks it, where a pass exists.
export type Detail = 'locked' | 'unlocked';

// A review's walk through its sheets: what navigation and the tabs need to know of a section's
// form, and nothing else. Step ids are also the URL fragments.
export interface Flow<S extends string> {
  // Every sheet in order, then the result.
  readonly steps: readonly [S, ...S[]];
  // The tab, and ground colour, each step belongs to; a tab can own more than one step.
  readonly sectionOfStep: Readonly<Record<S, string>>;
  // Whether a sheet is asked, given the answers so far.
  applies(form: HTMLFormElement, step: S): boolean;
  // Whether a sheet answers cleanly.
  complete(form: HTMLFormElement, step: S, today: CivilDate): boolean;
  // Readies the last sheet each time it is shown.
  prepareLastSheet?(form: HTMLFormElement, today: CivilDate): void;
}

export const resultStep = <S extends string>(flow: Flow<S>): number => flow.steps.length - 1;
export const lastSheet = <S extends string>(flow: Flow<S>): number => flow.steps.length - 2;

export const stepAt = <S extends string>(flow: Flow<S>, i: number): S =>
  flow.steps[i] ?? flow.steps[0];

export function indexOfHash<S extends string>(flow: Flow<S>, hash: string): number {
  const i = flow.steps.indexOf(hash.replace(/^#/, '') as S);
  return i < 0 ? 0 : i;
}

// The next sheet asked in `direction`, or the result going forward.
export function stepFrom<S extends string>(
  flow: Flow<S>,
  form: HTMLFormElement,
  from: number,
  direction: 1 | -1,
): number {
  let i = from + direction;
  while (i > 0 && i < resultStep(flow) && !flow.applies(form, stepAt(flow, i))) i += direction;
  return i;
}

// The furthest sheet a visitor may open: every sheet before it answers cleanly.
export function firstIncomplete<S extends string>(
  flow: Flow<S>,
  form: HTMLFormElement,
  today: CivilDate,
): number {
  const i = flow.steps.findIndex(
    (s, j) => j <= lastSheet(flow) && flow.applies(form, s) && !flow.complete(form, s, today),
  );
  return i < 0 ? lastSheet(flow) : i;
}
