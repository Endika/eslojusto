import type { Flow } from '../../calculator/flow';
import { applies } from './conditions';
import { SHEETS, sheetErrors, type Sheet } from './form';

// Step ids are also the URL fragments, so they keep their Spanish names. A tab can own more than
// one sheet; its id is the ground colour it shows.
export const STEPS = [...SHEETS, 'resultado'] as const;
export type Step = (typeof STEPS)[number];

export type Tab = 'cause' | 'salary' | 'settlement' | 'result';

export const SECTION_OF_STEP: Record<Step, Tab> = {
  fechas: 'cause',
  potencia: 'salary',
  'potencia-actual': 'salary',
  'potencia-nueva': 'salary',
  energia: 'salary',
  'energia-actual': 'salary',
  'energia-nueva': 'salary',
  consumo: 'settlement',
  carta: 'settlement',
  contrato: 'settlement',
  envio: 'settlement',
  resultado: 'result',
};

const isSheet = (step: Step): step is Sheet => step !== 'resultado';

export const RENEWAL_FLOW: Flow<Step> = {
  steps: STEPS,
  sectionOfStep: SECTION_OF_STEP,
  applies,
  complete: (form, step, today) => !isSheet(step) || sheetErrors(form, step, today).length === 0,
};
