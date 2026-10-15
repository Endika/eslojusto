import type { TextTable } from '../norms';

const ACT = 'https://www.boe.es/buscar/act.php?id=';
// The days these passages were last read in the consolidated text: those on the bills' charges
// were read later than the rest.
const READ_ON = '2026-10-13';
const CHARGES_READ_ON = '2026-10-15';

// Copied verbatim from the BOE's consolidated texts, as worded on the day they were read. A new
// wording flagged by the monthly review means rereading them.
export const BILLS_TEXTS: TextTable = {
  // 6.1.m, with effects from 12-06-2026 (final provision 9.ª.4).
  rd88_6: {
    id: 'rd88_6',
    basis: 'statute',
    citation: 'Real Decreto 88/2026, art. 6.1.m',
    article: '6.1.m',
    url: `${ACT}BOE-A-2026-3212#a6`,
    inForceSince: '2026-06-12',
    lastVerified: READ_ON,
    verified: true,
    quotes: [
      'Ser avisado de forma transparente y comprensible por su comercializador o agregador independiente, con al menos un mes de antelación, por escrito y de manera separada a su factura, de cualquier intención de modificar las condiciones del contrato e informado de su derecho a rescindir el contrato sin coste alguno cuando reciba el aviso.',
    ],
  },
  // 62.5, added by Real Decreto-ley 7/2021 with effects from 01-01-2022.
  trlgdcu_62: {
    id: 'trlgdcu_62',
    basis: 'statute',
    citation:
      'Texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios, art. 62.5',
    article: '62.5',
    url: `${ACT}BOE-A-2007-20555#a62`,
    inForceSince: '2022-01-01',
    lastVerified: READ_ON,
    verified: true,
    quotes: [
      'En caso de que el usuario incumpla el compromiso de permanencia adquirido con la empresa, la penalización por baja o cese prematuro de la relación contractual, será proporcional al número de días no efectivos del compromiso de permanencia acordado.',
    ],
  },
  // Second paragraph; kept in force by the first transitional provision of Ley 11/2022.
  rd899_7: {
    id: 'rd899_7',
    basis: 'statute',
    citation: 'Real Decreto 899/2009, art. 7',
    article: '7',
    url: `${ACT}BOE-A-2009-8961#a7`,
    inForceSince: '2009-08-30',
    lastVerified: READ_ON,
    verified: true,
    quotes: [
      'El operador se abstendrá de facturar y cobrar cualquier cantidad que se haya podido devengar, por causa no imputable al usuario final, con posterioridad al plazo de dos días en que debió surtir efectos la baja.',
    ],
  },
  // Single wording since the decree took effect; 24.1 and the deadline of 24.2.
  rd899_24: {
    id: 'rd899_24',
    basis: 'statute',
    citation: 'Real Decreto 899/2009, art. 24',
    article: '24',
    url: `${ACT}BOE-A-2009-8961#a24`,
    inForceSince: '2009-08-30',
    lastVerified: CHARGES_READ_ON,
    verified: true,
    quotes: [
      'Los operadores que presten el servicio telefónico disponible al público deberán garantizar a sus abonados el derecho a la desconexión de determinados servicios, entre los que se incluirá, al menos, el de llamadas internacionales y a servicios de tarificación adicional.',
      'El operador habrá de proceder a dicha desconexión como máximo en el plazo de 10 días desde la recepción de la comunicación del abonado.',
    ],
  },
  // 66 quáter.1, added by Ley 3/2014 with effects from 29-03-2014; single wording since.
  trlgdcu_66quater: {
    id: 'trlgdcu_66quater',
    basis: 'statute',
    citation:
      'Texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios, art. 66 quáter.1',
    article: '66 quáter.1',
    url: `${ACT}BOE-A-2007-20555#a66quater`,
    inForceSince: '2014-03-29',
    lastVerified: CHARGES_READ_ON,
    verified: true,
    quotes: [
      'Queda prohibido el envío y el suministro al consumidor y usuario de bienes, de agua, gas o electricidad, de calefacción mediante sistemas urbanos, de contenido digital o de prestación de servicios no solicitados por él, cuando dichos envíos y suministros incluyan una pretensión de pago de cualquier naturaleza.',
      'En tal caso, la falta de respuesta del consumidor y usuario a dicho envío, suministro o prestación de servicios no solicitados no se considerará consentimiento.',
    ],
  },
};
