import type { TextTable } from '../norms';

const ACT = 'https://www.boe.es/buscar/act.php?id=';
// The day these passages were last read in the consolidated text.
const READ_ON = '2026-10-13';

// Copied verbatim from the BOE's consolidated texts, as worded on READ_ON. A new wording flagged by
// the monthly review means rereading them.
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
};
