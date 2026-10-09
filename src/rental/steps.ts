import type { Flow } from '../calculator/flow';
import type { NormTable } from '../engine/rental/norms';
import { applies } from './conditions';
import { SHEETS, sheetErrors, type Sheet } from './form';

// Step ids are also the URL fragments, so they keep their Spanish names. A tab can own more than
// one sheet; its id is the ground colour it shows.
export const STEPS = [...SHEETS, 'resultado'] as const;
export type Step = (typeof STEPS)[number];

export const SECTION_OF_STEP: Record<Step, string> = {
  contrato: 'cause',
  fechas: 'cause',
  casero: 'cause',
  'gran-tenedor': 'cause',
  vivienda: 'cause',
  entrada: 'dates',
  garantias: 'dates',
  pagos: 'dates',
  renta: 'salary',
  actualizacion: 'salary',
  subidas: 'salary',
  salida: 'settlement',
  fianza: 'settlement',
  gastos: 'holidays',
  resultado: 'result',
};

// The tabs in order: the ground colour, the first step (its URL fragment), the number it shows and
// its share of the rail, which follows how many sheets it holds (the result counts two). The
// move-out comes before the charges, as the walk does.
export const TABS = [
  ['cause', 'contrato', '01', 5],
  ['dates', 'entrada', '02', 3],
  ['salary', 'renta', '03', 3],
  ['settlement', 'salida', '04', 2],
  ['holidays', 'gastos', '05', 1],
  ['result', 'resultado', '06', 2],
] as const;

export const TAB_NUMBER: Readonly<Record<string, string>> = Object.fromEntries(
  TABS.map(([tone, , number]) => [tone, number]),
);

const isSheet = (step: Step): step is Sheet => step !== 'resultado';

export const rentalFlow = (norms: NormTable): Flow<Step> => ({
  steps: STEPS,
  sectionOfStep: SECTION_OF_STEP,
  applies: (form, step) => applies(form, step, norms),
  complete: (form, step, today) => !isSheet(step) || sheetErrors(form, step, today).length === 0,
});
