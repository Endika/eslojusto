import type { NormReview, NormTable } from '../norms';

const inForce = {
  inForceUntil: null,
  status: 'in_force',
  statusSince: null,
  statusUrl: null,
} as const;

export const RD1620_ID = 'BOE-A-2011-17975';
export const RDL16_ID = 'BOE-A-2022-14680';

// Dates as published in the BOE (fecha de entrada en vigor). The decrees are the minimum wage
// ones of the employment section: art. 4.2 of each gives the household hourly rate.
export const HOUSEHOLD_NORMS: NormTable = {
  // The text read is the one in force on 09-10-2026, as amended by RDL 16/2022. The 01-01-2012
  // start (disposición final 3.ª) was not re-read: no rule starts before the amendment anyway.
  rd1620_2011: {
    id: 'rd1620_2011',
    citation:
      'Real Decreto 1620/2011, de 14 de noviembre, por el que se regula la relación laboral de carácter especial del servicio del hogar familiar',
    url: `https://www.boe.es/buscar/act.php?id=${RD1620_ID}`,
    inForceSince: '2012-01-01',
    ...inForce,
  },
  // Published on 08-09-2022 and in force the next day; DT 1.ª applies it to the contracts in
  // force then, and DT 2.ª makes the unemployment contribution mandatory from 01-10-2022.
  rdl16_2022: {
    id: 'rdl16_2022',
    citation:
      'Real Decreto-ley 16/2022, de 6 de septiembre, para la mejora de las condiciones de trabajo y de Seguridad Social de las personas trabajadoras al servicio del hogar',
    url: `https://www.boe.es/buscar/act.php?id=${RDL16_ID}`,
    inForceSince: '2022-09-09',
    ...inForce,
  },
  et: {
    id: 'et',
    citation: 'Real Decreto Legislativo 2/2015, de 23 de octubre (Estatuto de los Trabajadores)',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430',
    inForceSince: '2015-11-13',
    ...inForce,
  },
  lgss: {
    id: 'lgss',
    citation:
      'Real Decreto Legislativo 8/2015, de 30 de octubre (Ley General de la Seguridad Social)',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11724',
    inForceSince: '2016-01-02',
    ...inForce,
  },
  // Arts. 5.1 and 5.2: how a period fixed in days is counted.
  cc: {
    id: 'cc',
    citation: 'Código Civil',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1889-4763',
    inForceSince: '1974-07-29',
    ...inForce,
  },
  rd99_2023: {
    id: 'rd99_2023',
    citation: 'Real Decreto 99/2023, de 14 de febrero',
    url: 'https://www.boe.es/eli/es/rd/2023/02/14/99/con',
    inForceSince: '2023-02-16',
    ...inForce,
    inForceUntil: '2023-12-31',
  },
  rd145_2024: {
    id: 'rd145_2024',
    citation: 'Real Decreto 145/2024, de 6 de febrero',
    url: 'https://www.boe.es/eli/es/rd/2024/02/06/145/con',
    inForceSince: '2024-02-08',
    ...inForce,
    inForceUntil: '2024-12-31',
  },
  rd87_2025: {
    id: 'rd87_2025',
    citation: 'Real Decreto 87/2025, de 11 de febrero',
    url: 'https://www.boe.es/eli/es/rd/2025/02/11/87/con',
    inForceSince: '2025-02-13',
    ...inForce,
    inForceUntil: '2025-12-31',
  },
  rd126_2026: {
    id: 'rd126_2026',
    citation: 'Real Decreto 126/2026, de 18 de febrero',
    url: 'https://www.boe.es/eli/es/rd/2026/02/18/126/con',
    inForceSince: '2026-02-20',
    ...inForce,
    inForceUntil: '2026-12-31',
  },
};

export const NORM_REVIEW: NormReview = {
  rd1620_2011: '2026-10-09',
  rdl16_2022: '2026-10-09',
  et: '2026-10-09',
  lgss: '2026-10-09',
  cc: '2026-10-09',
  rd99_2023: '2026-10-07',
  rd145_2024: '2026-10-07',
  rd87_2025: '2026-10-07',
  rd126_2026: '2026-10-07',
};
