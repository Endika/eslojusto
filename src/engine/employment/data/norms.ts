import type { NormReview, NormTable } from '../norms';

const inForce = {
  inForceUntil: null,
  status: 'in_force',
  statusSince: null,
  statusUrl: null,
} as const;

// Dates as published in the BOE (fecha de entrada en vigor). Each minimum wage decree has effects
// for its calendar year only (disposición final 3.ª).
export const EMPLOYMENT_NORMS: NormTable = {
  et: {
    id: 'et',
    citation: 'Real Decreto Legislativo 2/2015, de 23 de octubre (Estatuto de los Trabajadores)',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430',
    inForceSince: '2015-11-13',
    ...inForce,
  },
  // Art. 10 (art. 34.9 ET, daily time record), applicable from 12-05-2019 (DF 6.ª.4).
  rdl8_2019: {
    id: 'rdl8_2019',
    citation: 'Real Decreto-ley 8/2019, de 8 de marzo',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2019-3481',
    inForceSince: '2019-03-13',
    ...inForce,
  },
  law10_2021: {
    id: 'law10_2021',
    citation: 'Ley 10/2021, de 9 de julio, de trabajo a distancia',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2021-11472',
    inForceSince: '2021-07-11',
    ...inForce,
  },
  // New wording of arts. 11, 15 and 16 ET from 30-03-2022 (DF 8.ª).
  rdl32_2021: {
    id: 'rdl32_2021',
    citation: 'Real Decreto-ley 32/2021, de 28 de diciembre',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2021-21788',
    inForceSince: '2021-12-31',
    ...inForce,
  },
  // Last wording of arts. 11.4.b and 14.3 ET.
  law4_2023: {
    id: 'law4_2023',
    citation: 'Ley 4/2023, de 28 de febrero',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2023-5366',
    inForceSince: '2023-03-02',
    ...inForce,
  },
  // DF 11.ª: art. 15.2 ET, 120 days of occasional production contracts in the agri-food sector.
  // The BOE dates its entry into force on 02-01-2025, before its publication on 02-04-2025.
  law1_2025: {
    id: 'law1_2025',
    citation: 'Ley 1/2025, de 1 de abril',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2025-6597',
    inForceSince: '2025-01-02',
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
  rd723_2026: {
    id: 'rd723_2026',
    citation: 'Real Decreto 723/2026, de 9 de septiembre',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2026-19200',
    inForceSince: '2026-10-05',
    ...inForce,
  },
  // Special working-time regimes under arts. 34.7, 36.1 and 37.1 ET: shorter rests between days
  // and split weekly rests for some activities and for shift changes.
  rd1561_1995: {
    id: 'rd1561_1995',
    citation: 'Real Decreto 1561/1995, de 21 de septiembre, sobre jornadas especiales de trabajo',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1995-21346',
    inForceSince: '1995-09-27',
    ...inForce,
  },
};

export const NORM_REVIEW: NormReview = {
  et: '2026-10-07',
  rdl8_2019: '2026-10-07',
  law10_2021: '2026-10-07',
  rdl32_2021: '2026-10-07',
  law4_2023: '2026-10-07',
  law1_2025: '2026-10-07',
  rd99_2023: '2026-10-07',
  rd145_2024: '2026-10-07',
  rd87_2025: '2026-10-07',
  rd126_2026: '2026-10-07',
  rd723_2026: '2026-10-07',
  rd1561_1995: '2026-10-07',
};
