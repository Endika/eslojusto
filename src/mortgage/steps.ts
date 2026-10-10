import type { Flow } from '../calculator/flow';
import { applies } from './conditions';
import { SHEETS, sheetErrors, type Sheet } from './form';

// Step ids are also the URL fragments, so they keep their Spanish names. A tab can own more than
// one sheet; its id is the ground colour it shows.
export const STEPS = [...SHEETS, 'resultado'] as const;
export type Step = (typeof STEPS)[number];

export const SECTION_OF_STEP: Record<Step, string> = {
  hipoteca: 'cause',
  titular: 'cause',
  escritura: 'cause',
  tipo: 'cause',
  'clausula-gastos': 'salary',
  suelo: 'salary',
  indice: 'salary',
  demora: 'salary',
  vencimiento: 'salary',
  apertura: 'salary',
  otras: 'salary',
  facturas: 'settlement',
  notaria: 'settlement',
  registro: 'settlement',
  gestoria: 'settlement',
  tasacion: 'settlement',
  impuesto: 'settlement',
  pago: 'settlement',
  acuerdo: 'settlement',
  amortizacion: 'dates',
  operacion: 'dates',
  condiciones: 'dates',
  seguro: 'dates',
  resultado: 'result',
};

const isSheet = (step: Step): step is Sheet => step !== 'resultado';

export const MORTGAGE_FLOW: Flow<Step> = {
  steps: STEPS,
  sectionOfStep: SECTION_OF_STEP,
  applies,
  complete: (form, step, today) => !isSheet(step) || sheetErrors(form, step, today).length === 0,
};
