import type { NormReview, NormTable } from '../norms';

const inForce = {
  inForceUntil: null,
  status: 'in_force',
  statusSince: null,
  statusUrl: null,
} as const;

// Each starts on the day it entered into force, as the BOE gives it: the LCS six months after its
// publication (final provision), Ley 22/2007 three months after (third final provision).
export const INSURANCE_NORMS: NormTable = {
  // Arts. 8, 10, 30 and 31; art. 22 in the wording in force since 01-01-2016.
  lcs: {
    id: 'lcs',
    citation: 'Ley 50/1980, de 8 de octubre, de Contrato de Seguro',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501',
    inForceSince: '1981-04-17',
    ...inForce,
  },
  // Arts. 10 and 11. The consumer credit bill of 07-01-2026 would repeal it; until a law does,
  // it stays in force.
  law22_2007: {
    id: 'law22_2007',
    citation:
      'Ley 22/2007, de 11 de julio, sobre comercialización a distancia de servicios financieros destinados a los consumidores',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-13411',
    inForceSince: '2007-10-12',
    ...inForce,
  },
};

export const NORM_REVIEW: NormReview = {
  lcs: null,
  law22_2007: null,
};
