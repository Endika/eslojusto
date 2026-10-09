import type { NormReview, NormTable } from '../norms';

const ACT = 'https://www.boe.es/buscar/act.php?id=';
const DOC = 'https://www.boe.es/buscar/doc.php?id=';
const TXT = 'https://www.boe.es/diario_boe/txt.php?id=';
const AEAT_NEWS =
  'https://sede.agenciatributaria.gob.es/Sede/impuestos-especiales-medioambientales/novedades-impuestos-especiales-medioambientales/2026';

const inForce = {
  inForceUntil: null,
  status: 'in_force',
  statusSince: null,
  statusUrl: null,
} as const;

// Status as published in the BOE, each norm from the day it took effect; a table row may start
// later, on the first day it uses the norm.
//
// The tax reductions of 2026 hang on the electricity CPI (INE, subclass 04.5.1.0) of an earlier
// month, so each month is a conditional norm of its own. Once the INE publishes the figure, set
// `condition.met`, with the AEAT notice in `statusSince` and `statusUrl`.
export const BILLS_NORMS: NormTable = {
  // The tolls take effect the day after publication; its prices apply from 01-01-2026.
  cnmc_tolls_2026: {
    id: 'cnmc_tolls_2026',
    citation:
      'Resolución de 18 de diciembre de 2025, de la Comisión Nacional de los Mercados y la Competencia (peajes de transporte y distribución de electricidad para 2026)',
    url: `${TXT}BOE-A-2025-26348`,
    inForceSince: '2025-12-23',
    ...inForce,
  },
  // Charges of the electricity system for 2026 and the social bonus funding until 25-06-2026.
  order_ted1524_2025: {
    id: 'order_ted1524_2025',
    citation:
      'Orden TED/1524/2025, de 23 de diciembre, por la que se establecen los precios de los cargos del sistema eléctrico',
    url: `${TXT}BOE-A-2025-26705`,
    inForceSince: '2026-01-01',
    ...inForce,
  },
  // The social bonus funding, with effects from the day after publication (25-06-2026).
  order_ted634_2026: {
    id: 'order_ted634_2026',
    citation:
      'Orden TED/634/2026, de 17 de junio (reparto de las cantidades a financiar relativas al bono social)',
    url: `${TXT}BOE-A-2026-13759`,
    inForceSince: '2026-06-26',
    ...inForce,
  },
  // Annex II: the fixed retail margin of the PVPC; no later norm confirms it (data/pvpc.ts).
  order_etu1948_2016: {
    id: 'order_etu1948_2016',
    citation:
      'Orden ETU/1948/2016, de 22 de diciembre (costes de comercialización de las comercializadoras de referencia)',
    url: `${ACT}BOE-A-2016-12274`,
    inForceSince: '2016-12-25',
    ...inForce,
  },
  // Arts. 95, 97 and 99: when the electricity tax falls due, its base and its rate.
  law38_1992: {
    id: 'law38_1992',
    citation: 'Ley 38/1992, de 28 de diciembre, de Impuestos Especiales',
    url: `${ACT}BOE-A-1992-28741`,
    inForceSince: '1993-01-01',
    ...inForce,
  },
  // Arts. 75, 78 and 90: when VAT falls due, its base and the general rate.
  law37_1992: {
    id: 'law37_1992',
    citation: 'Ley 37/1992, de 28 de diciembre, del Impuesto sobre el Valor Añadido',
    url: `${ACT}BOE-A-1992-28740`,
    inForceSince: '1993-01-01',
    ...inForce,
  },
  // Art. 1: the social bonus discounts of 2026. Arts. 40 and 42.a: the electricity tax at 0,5 %
  // and VAT at 10 % until 30-06-2026. Validated on 26-03-2026.
  rdl7_2026: {
    id: 'rdl7_2026',
    citation: 'Real Decreto-ley 7/2026, de 20 de marzo',
    url: `${ACT}BOE-A-2026-6544`,
    inForceSince: '2026-03-22',
    inForceUntil: null,
    status: 'in_force',
    statusSince: '2026-03-26',
    statusUrl: `${DOC}BOE-A-2026-7125`,
  },
  // Arts. 40.Dos and 42.a of RDL 7/2026: the reductions stop in June unless the April CPI rose
  // more than 15 %. The AEAT gave it as not met for the electricity tax; the VAT clause turns on
  // the same figure.
  rdl7_2026_june: {
    id: 'rdl7_2026_june',
    citation: 'Real Decreto-ley 7/2026, arts. 40.Dos y 42.a (rebaja de junio de 2026)',
    url: `${ACT}BOE-A-2026-6544#a4-2`,
    inForceSince: '2026-06-01',
    inForceUntil: '2026-06-30',
    status: 'conditional',
    statusSince: '2026-05-19',
    statusUrl: `${AEAT_NEWS}/mayo/19/clausula-desactivacion-rebaja-tipo-impositivo-electricidad.html`,
    condition: {
      text: 'Que el IPC de la electricidad de abril de 2026 suba más del 15 % interanual',
      decidesOn: '2026-05-14',
      source: 'ine_cpi_electricity',
      met: false,
    },
  },
  // Final provision 2.ª rewrote art. 42.a of RDL 7/2026: VAT at 10 % for power «inferior o igual
  // a» 10 kW from 30-04-2026. Validated on 20-05-2026.
  rdl10_2026: {
    id: 'rdl10_2026',
    citation: 'Real Decreto-ley 10/2026, de 28 de abril',
    url: `${ACT}BOE-A-2026-9286`,
    inForceSince: '2026-04-30',
    inForceUntil: null,
    status: 'in_force',
    statusSince: '2026-05-20',
    statusUrl: `${DOC}BOE-A-2026-10986`,
  },
  // Arts. 10 to 13: VAT and the electricity tax reduced in August and September only if the June
  // and July CPI rose more than 15 %. Validated on 23-07-2026.
  rdl18_2026: {
    id: 'rdl18_2026',
    citation: 'Real Decreto-ley 18/2026, de 29 de junio',
    url: `${ACT}BOE-A-2026-14112`,
    inForceSince: '2026-07-01',
    inForceUntil: null,
    status: 'in_force',
    statusSince: '2026-07-23',
    statusUrl: `${DOC}BOE-A-2026-16170`,
  },
  // The AEAT gave both months as not met for the electricity tax on 01-09-2026; the VAT clauses
  // turn on the same figures.
  rdl18_2026_august: {
    id: 'rdl18_2026_august',
    citation: 'Real Decreto-ley 18/2026, arts. 10 y 12 (rebaja de agosto de 2026)',
    url: `${ACT}BOE-A-2026-14112#a1-2`,
    inForceSince: '2026-08-01',
    inForceUntil: '2026-08-31',
    status: 'conditional',
    statusSince: '2026-09-01',
    statusUrl: `${AEAT_NEWS}/septiembre/1/tipos-impositivos-impuesto-especial-sobre-2026_.html`,
    condition: {
      text: 'Que el IPC de la electricidad de junio de 2026 suba más del 15 % interanual',
      decidesOn: '2026-07-15',
      source: 'ine_cpi_electricity',
      met: false,
    },
  },
  rdl18_2026_september: {
    id: 'rdl18_2026_september',
    citation: 'Real Decreto-ley 18/2026, arts. 11 y 13 (rebaja de septiembre de 2026)',
    url: `${ACT}BOE-A-2026-14112#a1-3`,
    inForceSince: '2026-09-01',
    inForceUntil: '2026-09-30',
    status: 'conditional',
    statusSince: '2026-09-01',
    statusUrl: `${AEAT_NEWS}/septiembre/1/tipos-impositivos-impuesto-especial-sobre-2026_.html`,
    condition: {
      text: 'Que el IPC de la electricidad de julio de 2026 suba más del 15 % interanual',
      decidesOn: '2026-08-13',
      source: 'ine_cpi_electricity',
      met: false,
    },
  },
  // Arts. 18 to 21: VAT and the electricity tax reduced in November and December. Still awaiting
  // the Congress's validation: its reductions stand only while it does.
  rdl25_2026: {
    id: 'rdl25_2026',
    citation: 'Real Decreto-ley 25/2026, de 29 de septiembre',
    url: `${ACT}BOE-A-2026-20265`,
    inForceSince: '2026-10-01',
    inForceUntil: null,
    status: 'pending_validation',
    statusSince: null,
    statusUrl: null,
  },
  // «De acuerdo con la información que publique en octubre el Instituto Nacional de Estadística»:
  // the September CPI comes out on 14-10-2026 in the INE calendar.
  rdl25_2026_november: {
    id: 'rdl25_2026_november',
    citation: 'Real Decreto-ley 25/2026, arts. 18 y 20 (rebaja de noviembre de 2026)',
    url: `${ACT}BOE-A-2026-20265#a1-10`,
    inForceSince: '2026-11-01',
    inForceUntil: '2026-11-30',
    status: 'conditional',
    statusSince: null,
    statusUrl: null,
    condition: {
      text: 'Que el IPC de la electricidad de septiembre de 2026 suba más del 15 % interanual',
      decidesOn: '2026-10-14',
      source: 'ine_cpi_electricity',
      met: null,
    },
  },
  // The October CPI comes out on 13-11-2026.
  rdl25_2026_december: {
    id: 'rdl25_2026_december',
    citation: 'Real Decreto-ley 25/2026, arts. 19 y 21 (rebaja de diciembre de 2026)',
    url: `${ACT}BOE-A-2026-20265#a1-11`,
    inForceSince: '2026-12-01',
    inForceUntil: '2026-12-31',
    status: 'conditional',
    statusSince: null,
    statusUrl: null,
    condition: {
      text: 'Que el IPC de la electricidad de octubre de 2026 suba más del 15 % interanual',
      decidesOn: '2026-11-13',
      source: 'ine_cpi_electricity',
      met: null,
    },
  },
  // Transitional provision: the regulated rent of meters, «hasta que se apruebe el precio
  // definitivo».
  order_iet1491_2013: {
    id: 'order_iet1491_2013',
    citation: 'Orden IET/1491/2013, de 1 de agosto',
    url: `${ACT}BOE-A-2013-8561`,
    inForceSince: '2013-08-03',
    ...inForce,
  },
  // Annex I, in the wording of Real Decreto-ley 18/2022 from 20-10-2022: the kWh a year with the
  // social bonus discount.
  rd897_2017: {
    id: 'rd897_2017',
    citation:
      'Real Decreto 897/2017, de 6 de octubre, por el que se regula la figura del consumidor vulnerable y el bono social',
    url: `${ACT}BOE-A-2017-11505`,
    inForceSince: '2017-10-08',
    ...inForce,
  },
  // The regulation of supply, retail and aggregation of electricity. Final provision 9.ª.1: in
  // force the day of its publication; 9.ª.4: arts. 6, 13, 28, 29, 30, 43, 44 and 45 take effect
  // four months later, on 12-06-2026 (rules.ts).
  rd88_2026: {
    id: 'rd88_2026',
    citation:
      'Real Decreto 88/2026, por el que se aprueba el Reglamento general de suministro, comercialización y agregación de energía eléctrica',
    url: `${ACT}BOE-A-2026-3212`,
    inForceSince: '2026-02-12',
    ...inForce,
  },
  // The PVPC: who may take it and what its bills may carry.
  rd216_2014: {
    id: 'rd216_2014',
    citation:
      'Real Decreto 216/2014, de 28 de marzo, por el que se establece la metodología de cálculo de los precios voluntarios para el pequeño consumidor de energía eléctrica y su régimen jurídico de contratación',
    url: `${ACT}BOE-A-2014-3376`,
    inForceSince: '2014-03-30',
    ...inForce,
  },
  // Art. 62.5: a commitment penalty in proportion to the days left, for exits from 01-01-2022.
  trlgdcu: {
    id: 'trlgdcu',
    citation:
      'Texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios (Real Decreto Legislativo 1/2007, de 16 de noviembre)',
    url: `${ACT}BOE-A-2007-20555`,
    inForceSince: '2007-12-01',
    ...inForce,
  },
};

export const NORM_REVIEW: NormReview = {
  cnmc_tolls_2026: null,
  order_ted1524_2025: null,
  order_ted634_2026: null,
  order_etu1948_2016: null,
  law38_1992: null,
  law37_1992: null,
  rdl7_2026: null,
  rdl7_2026_june: null,
  rdl10_2026: null,
  rdl18_2026: null,
  rdl18_2026_august: null,
  rdl18_2026_september: null,
  rdl25_2026: null,
  rdl25_2026_november: null,
  rdl25_2026_december: null,
  order_iet1491_2013: null,
  rd897_2017: null,
  rd88_2026: null,
  rd216_2014: null,
  trlgdcu: null,
};
