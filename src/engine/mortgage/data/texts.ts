import type { TextTable } from '../norms';

const LCCI = 'https://www.boe.es/buscar/act.php?id=BOE-A-2019-3814';
const LCCI_NAME = 'Ley 5/2019, de contratos de crédito inmobiliario';
// The day these passages were last read in the consolidated text.
const READ_ON = '2026-10-10';

// Copied verbatim from the BOE's consolidated texts, as worded on READ_ON. A new wording flagged by
// the monthly review means rereading them.
export const MORTGAGE_TEXTS: TextTable = {
  // 14.1.e, its first three points: who bears the valuation, the agency, the notary and the
  // registry. The BOE prints «iii» without its full stop.
  lcci_14: {
    id: 'lcci_14',
    basis: 'statute',
    citation: `${LCCI_NAME}, art. 14.1.e`,
    article: '14.1.e',
    url: `${LCCI}#ar-14`,
    inForceSince: '2019-06-16',
    lastVerified: READ_ON,
    verified: true,
    quotes: [
      'Los gastos de tasación del inmueble corresponderán a prestatario y los de gestoría al prestamista.',
      'El prestamista asumirá el coste de los aranceles notariales de la escritura de préstamo hipotecario y los de las copias los asumirá quien las solicite.',
      'Los gastos de inscripción de las garantías en el registro de la propiedad corresponderán al prestamista.',
    ],
  },
  lcci_15: {
    id: 'lcci_15',
    basis: 'statute',
    citation: `${LCCI_NAME}, art. 15.8`,
    article: '15.8',
    url: `${LCCI}#ar-15`,
    inForceSince: '2019-06-16',
    lastVerified: READ_ON,
    verified: true,
    quotes: [
      'El acta donde conste la entrega y asesoramiento imparcial al prestatario no generará coste arancelario alguno.',
    ],
  },
  lcci_21: {
    id: 'lcci_21',
    basis: 'statute',
    citation: `${LCCI_NAME}, art. 21.3`,
    article: '21.3',
    url: `${LCCI}#ar-21`,
    inForceSince: '2019-06-16',
    lastVerified: READ_ON,
    verified: true,
    quotes: [
      'En las operaciones con tipo de interés variable no se podrá fijar un límite a la baja del tipo de interés.',
    ],
  },
  // Second paragraph, as Real Decreto-ley 17/2018 worded it for deeds from 10-11-2018.
  trlitpajd_29: {
    id: 'trlitpajd_29',
    basis: 'statute',
    citation:
      'Ley del Impuesto sobre Transmisiones Patrimoniales y Actos Jurídicos Documentados, art. 29',
    article: '29',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1993-25359#a29',
    inForceSince: '2018-11-10',
    lastVerified: READ_ON,
    verified: true,
    quotes: [
      'Cuando se trate de escrituras de préstamo con garantía hipotecaria, se considerará sujeto pasivo al prestamista.',
    ],
  },
};
