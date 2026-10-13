import type { Flow } from '../../calculator/flow';
import { applies } from './conditions';
import { SHEETS, sheetErrors, type Sheet } from './form';

// Step ids are also the URL fragments, so they keep their Spanish names. A tab can own more than
// one sheet; its id is the ground colour it shows.
export const STEPS = [...SHEETS, 'resultado'] as const;
export type Step = (typeof STEPS)[number];

export type Tab = 'cause' | 'salary' | 'settlement' | 'dates' | 'result';

export const SECTION_OF_STEP: Record<Step, Tab> = {
  suministro: 'cause',
  autoconsumo: 'cause',
  'potencia-contratada': 'cause',
  fechas: 'cause',
  lecturas: 'cause',
  mercado: 'cause',
  titular: 'cause',
  potencia: 'salary',
  'potencia-punta': 'salary',
  'potencia-valle': 'salary',
  'potencia-maxima': 'salary',
  'energia-punta': 'salary',
  'energia-llano': 'salary',
  'energia-valle': 'salary',
  peajes: 'settlement',
  financiacion: 'settlement',
  'bono-social': 'settlement',
  'bono-social-consumo': 'settlement',
  contador: 'settlement',
  'contador-tipo': 'settlement',
  servicios: 'settlement',
  'servicio-1': 'settlement',
  'servicio-2': 'settlement',
  exceso: 'settlement',
  penalizacion: 'settlement',
  'penalizacion-contrato': 'settlement',
  ajustes: 'dates',
  'impuesto-electrico': 'dates',
  iva: 'dates',
  total: 'dates',
  resultado: 'result',
};

const isSheet = (step: Step): step is Sheet => step !== 'resultado';

export const ELECTRICITY_FLOW: Flow<Step> = {
  steps: STEPS,
  sectionOfStep: SECTION_OF_STEP,
  applies,
  complete: (form, step, today) => !isSheet(step) || sheetErrors(form, step, today).length === 0,
};
