import type { Flow } from '../calculator/flow';
import { applies } from './conditions';
import { SHEETS, sheetErrors, type Sheet } from './form';

// Step ids are also the URL fragments, so they keep their Spanish names. A tab can own more than
// one sheet; its id is the ground colour it shows.
export const STEPS = [...SHEETS, 'resultado'] as const;
export type Step = (typeof STEPS)[number];

export const SECTION_OF_STEP: Record<Step, string> = {
  trabajo: 'cause',
  fechas: 'dates',
  desistimiento: 'settlement',
  escrito: 'settlement',
  indemnizacion: 'settlement',
  preaviso: 'settlement',
  noche: 'settlement',
  sueldo: 'salary',
  pagas: 'salary',
  'pagas-cuando': 'salary',
  jornada: 'holidays',
  descansos: 'holidays',
  vacaciones: 'holidays',
  resultado: 'result',
};

// The tabs in order: the ground colour, the first step (its URL fragment), the number it shows and
// its share of the rail, which follows how many sheets it holds (the result counts two).
export const TABS = [
  ['cause', 'trabajo', '01', 1],
  ['dates', 'fechas', '02', 1],
  ['settlement', 'desistimiento', '03', 5],
  ['salary', 'sueldo', '04', 3],
  ['holidays', 'jornada', '05', 3],
  ['result', 'resultado', '06', 2],
] as const;

export const TAB_NUMBER: Readonly<Record<string, string>> = Object.fromEntries(
  TABS.map(([tone, , number]) => [tone, number]),
);

const isSheet = (step: Step): step is Sheet => step !== 'resultado';

export const HOUSEHOLD_FLOW: Flow<Step> = {
  steps: STEPS,
  sectionOfStep: SECTION_OF_STEP,
  applies,
  complete: (form, step, today) => !isSheet(step) || sheetErrors(form, step, today).length === 0,
};
