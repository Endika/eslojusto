import type { Flow } from '../calculator/flow';
import { applies } from './conditions';
import { SHEETS, sheetErrors, type Sheet } from './form';

// Step ids are also the URL fragments, so they keep their Spanish names. A tab can own more than
// one sheet; its id is the ground colour it shows.
export const STEPS = [...SHEETS, 'resultado'] as const;
export type Step = (typeof STEPS)[number];

export const SECTION_OF_STEP: Record<Step, string> = {
  producto: 'cause',
  uso: 'cause',
  importe: 'cause',
  contrato: 'cause',
  interes: 'salary',
  tae: 'salary',
  cuotas: 'salary',
  'cuota-final': 'salary',
  apertura: 'salary',
  'otros-gastos': 'salary',
  seguro: 'salary',
  'seguro-pago': 'salary',
  tarjeta: 'salary',
  comparar: 'salary',
  amortizacion: 'settlement',
  compensacion: 'settlement',
  'fin-pactado': 'settlement',
  detalles: 'settlement',
  desistimiento: 'dates',
  resultado: 'result',
};

const isSheet = (step: Step): step is Sheet => step !== 'resultado';

export const CREDIT_FLOW: Flow<Step> = {
  steps: STEPS,
  sectionOfStep: SECTION_OF_STEP,
  applies,
  complete: (form, step, today) => !isSheet(step) || sheetErrors(form, step, today).length === 0,
};
