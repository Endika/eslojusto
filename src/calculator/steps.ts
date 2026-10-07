import { applies, prepareFigures } from './conditions';
import type { Flow } from './flow';
import { SHEETS, sheetErrors, type Sheet } from './form';

// A step is one sheet or the result; a section (one tab, one ground colour) can own more than one
// step. Step ids are also the URL fragments, so they keep their Spanish names.
export const STEPS = [...SHEETS, 'resultado'] as const;
export type Step = (typeof STEPS)[number];
export const SECTION_OF_STEP: Record<Step, string> = {
  causa: 'cause',
  temporal: 'cause',
  fechas: 'dates',
  prorrateo: 'salary',
  salario: 'salary',
  pagas: 'salary',
  vacaciones: 'holidays',
  preaviso: 'holidays',
  hijos: 'holidays',
  otros: 'holidays',
  finiquito: 'settlement',
  resultado: 'result',
};

const isSheet = (step: Step): step is Sheet => step !== 'resultado';

export const FINAL_PAY_FLOW: Flow<Step> = {
  steps: STEPS,
  sectionOfStep: SECTION_OF_STEP,
  applies,
  complete: (form, step, today) => !isSheet(step) || sheetErrors(form, step, today).length === 0,
  prepareLastSheet: prepareFigures,
};
