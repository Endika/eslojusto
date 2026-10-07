import { applies, prepareFigures } from './conditions';
import { stepAt, stepFrom, type Flow } from './flow';
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

// A page about one cause marks it in the HTML. While that answer stands, the visit opens on the
// sheet after it; once the visitor picks another cause, on the cause again.
export const presetCauseFlow = (cause: string): Flow<Step> => ({
  ...FINAL_PAY_FLOW,
  opensOn: (form) =>
    new FormData(form).get('cause') === cause
      ? stepAt(FINAL_PAY_FLOW, stepFrom(FINAL_PAY_FLOW, form, 0, 1))
      : 'causa',
});
