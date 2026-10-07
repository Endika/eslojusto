import { SHEETS } from './form';

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
export const LAST_SHEET = SHEETS.length - 1;
export const RESULT_STEP = STEPS.length - 1;

export const stepAt = (i: number): Step => STEPS[i] ?? 'causa';

export const indexOfHash = (hash: string): number => {
  const i = STEPS.indexOf(hash.replace(/^#/, '') as Step);
  return i < 0 ? 0 : i;
};
