import type { Flow } from '../calculator/flow';
import { applies } from './conditions';
import { SHEETS, sheetErrors, type Sheet } from './form';

// Step ids are also the URL fragments, so they keep their Spanish names. A tab can own more than
// one sheet; its id is the ground colour it shows.
export const STEPS = [...SHEETS, 'resultado'] as const;
export type Step = (typeof STEPS)[number];

export const SECTION_OF_STEP: Record<Step, string> = {
  relacion: 'cause',
  contratacion: 'cause',
  escrito: 'cause',
  fechas: 'cause',
  modalidad: 'dates',
  prorrogas: 'dates',
  causa: 'dates',
  sustitucion: 'dates',
  discontinuo: 'dates',
  formacion: 'dates',
  'formacion-datos': 'dates',
  historial: 'dates',
  salario: 'salary',
  periodo: 'salary',
  horas: 'salary',
  'pagas-extra': 'salary',
  desglose: 'salary',
  convenio: 'salary',
  'convenio-cifras': 'salary',
  nominas: 'salary',
  jornada: 'holidays',
  noche: 'holidays',
  'horas-extra': 'holidays',
  'horas-extra-pacto': 'holidays',
  parcial: 'holidays',
  'parcial-horas': 'holidays',
  complementarias: 'holidays',
  prueba: 'settlement',
  'prueba-duracion': 'settlement',
  'prueba-antes': 'settlement',
  vacaciones: 'settlement',
  'vacaciones-pago': 'settlement',
  'convenio-condiciones': 'settlement',
  clausulas: 'settlement',
  oferta: 'settlement',
  'oferta-salario': 'settlement',
  'oferta-contrato': 'settlement',
  informacion: 'settlement',
  'informacion-puesto': 'settlement',
  'informacion-salario': 'settlement',
  'informacion-duracion': 'settlement',
  'informacion-igualdad': 'settlement',
  'informacion-otros': 'settlement',
  resultado: 'result',
};

const isSheet = (step: Step): step is Sheet => step !== 'resultado';

export const EMPLOYMENT_FLOW: Flow<Step> = {
  steps: STEPS,
  sectionOfStep: SECTION_OF_STEP,
  applies,
  complete: (form, step, today) => !isSheet(step) || sheetErrors(form, step, today).length === 0,
};
