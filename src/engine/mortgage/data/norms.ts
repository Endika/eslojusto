import type { NormReview, NormTable } from '../norms';

const inForce = {
  inForceUntil: null,
  status: 'in_force',
  statusSince: null,
  statusUrl: null,
} as const;

// Each starts on the day its rules began to apply, as the BOE gives it.
export const MORTGAGE_NORMS: NormTable = {
  // Applies to contracts concluded from 16-06-2019; some provisions reach earlier ones through its
  // transitional provisions.
  lcci: {
    id: 'lcci',
    citation: 'Ley 5/2019, de 15 de marzo, reguladora de los contratos de crédito inmobiliario',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2019-3814',
    inForceSince: '2019-06-16',
    ...inForce,
  },
  // Art. 29, second paragraph: the lender bears the tax on the mortgage deed from 10-11-2018.
  trlitpajd29: {
    id: 'trlitpajd29',
    citation:
      'Texto refundido de la Ley del Impuesto sobre Transmisiones Patrimoniales y Actos Jurídicos Documentados, art. 29, en la redacción del Real Decreto-ley 17/2018, de 8 de noviembre',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1993-25359',
    inForceSince: '2018-11-10',
    ...inForce,
  },
  // Arts. 7 to 9: compensation for early repayment of loans concluded before the LCCI.
  law41_2007: {
    id: 'law41_2007',
    citation:
      'Ley 41/2007, de 7 de diciembre, por la que se modifica la Ley 2/1981, de 25 de marzo, de Regulación del Mercado Hipotecario y otras normas del sistema hipotecario y financiero',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-21086',
    inForceSince: '2007-12-09',
    ...inForce,
  },
  // Art. 12 rewrote art. 23.6 LCCI; its additional provision 1.ª opened a window without
  // compensation for variable-rate loans.
  rdl19_2022: {
    id: 'rdl19_2022',
    citation:
      'Real Decreto-ley 19/2022, de 22 de noviembre, por el que se establece un Código de Buenas Prácticas para aliviar la subida de los tipos de interés en préstamos hipotecarios sobre vivienda habitual',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2022-19403',
    inForceSince: '2022-11-24',
    ...inForce,
  },
  // Rewrote art. 23.6 LCCI again and the window of the additional provision 1.ª of RDL 19/2022.
  rdl8_2023: {
    id: 'rdl8_2023',
    citation: 'Real Decreto-ley 8/2023, de 27 de diciembre',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2023-26452',
    inForceSince: '2023-12-29',
    ...inForce,
  },
  // Third paragraph: the cap on late interest in loans for the main home, from Ley 1/2013.
  lh114: {
    id: 'lh114',
    citation: 'Ley Hipotecaria, art. 114, párrafo tercero, en la redacción de la Ley 1/2013',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1946-2453',
    inForceSince: '2013-05-15',
    ...inForce,
  },
  // Art. 6: the handwritten statement of the borrower, until the LCCI.
  law1_2013: {
    id: 'law1_2013',
    citation:
      'Ley 1/2013, de 14 de mayo, de medidas para reforzar la protección a los deudores hipotecarios, reestructuración de deuda y alquiler social',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2013-5073',
    inForceSince: '2013-05-15',
    ...inForce,
  },
  // Art. 1303: what is given back when a clause is set aside.
  cc: {
    id: 'cc',
    citation: 'Código Civil',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1889-4763',
    inForceSince: '1889-08-16',
    ...inForce,
  },
  // Added art. 439 bis to the Ley de Enjuiciamiento Civil, the step before going to court over the
  // clauses of a mortgage, from 03-04-2025.
  lo1_2025: {
    id: 'lo1_2025',
    citation:
      'Ley Orgánica 1/2025, de 2 de enero, de medidas en materia de eficiencia del Servicio Público de Justicia',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2025-76',
    inForceSince: '2025-04-03',
    ...inForce,
  },
  // Art. 30: the Servicio de Reclamaciones del Banco de España.
  law44_2002: {
    id: 'law44_2002',
    citation: 'Ley 44/2002, de 22 de noviembre, de Medidas de Reforma del Sistema Financiero',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2002-22807',
    inForceSince: '2002-11-24',
    ...inForce,
  },
  // Final provision 1.ª added art. 25 bis to the LCCI from 08-10-2026, for assignments made from
  // that day. RDL 26/2026 had added it on 01-10-2026 and was repealed on 02-10-2026; this one still
  // awaits the Congress's validation.
  lcci_25bis: {
    id: 'lcci_25bis',
    citation:
      'Real Decreto-ley 29/2026, de 6 de octubre, por el que se adoptan medidas urgentes para la protección de la función social de la vivienda y la ampliación de la oferta de vivienda asequible',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2026-20823',
    inForceSince: '2026-10-08',
    inForceUntil: null,
    status: 'pending_validation',
    statusSince: null,
    statusUrl: null,
  },
};

export const NORM_REVIEW: NormReview = {
  lcci: null,
  trlitpajd29: null,
  law41_2007: null,
  rdl19_2022: null,
  rdl8_2023: null,
  lh114: null,
  law1_2013: null,
  cc: null,
  lo1_2025: null,
  law44_2002: null,
  lcci_25bis: null,
};
