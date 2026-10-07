import type { NormTable } from '../norms';

// Status as published in the BOE. A validation or repeal vote changes `status`, `statusSince`,
// `statusUrl` and, on repeal, `inForceUntil` here; no rule needs to change.
export const NORMS: NormTable = {
  lau: {
    id: 'lau',
    citation: 'Ley 29/1994, de 24 de noviembre, de Arrendamientos Urbanos',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1994-26003',
    inForceSince: '1995-01-01',
    inForceUntil: null,
    status: 'in_force',
    statusSince: null,
    statusUrl: null,
  },
  // Arts. 9.1, 18.1, 20.1, 20.2 and 36.5 LAU for contracts signed from 06-03-2019.
  rdl7_2019: {
    id: 'rdl7_2019',
    citation: 'Real Decreto-ley 7/2019, de 1 de marzo',
    url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2019-3108',
    inForceSince: '2019-03-06',
    inForceUntil: null,
    status: 'in_force',
    statusSince: null,
    statusUrl: null,
  },
  // Art. 46: updates capped at the IGC for anniversaries from 31-03-2022 to 30-06-2022.
  rdl6_2022: {
    id: 'rdl6_2022',
    citation: 'Real Decreto-ley 6/2022, de 29 de marzo',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2022-4972',
    inForceSince: '2022-03-31',
    inForceUntil: null,
    status: 'in_force',
    statusSince: null,
    statusUrl: null,
  },
  // Art. 1.13: the IGC cap extended to 31-12-2022 (consolidated RDL 6/2022, version of 26-06-2022).
  rdl11_2022: {
    id: 'rdl11_2022',
    citation: 'Real Decreto-ley 11/2022, de 25 de junio',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2022-4972&tn=1&p=20220626',
    inForceSince: '2022-06-27',
    inForceUntil: null,
    status: 'in_force',
    statusSince: null,
    statusUrl: null,
  },
  // Art. 67: the IGC cap extended to 31-12-2023 (consolidated RDL 6/2022, version of 28-12-2022).
  rdl20_2022: {
    id: 'rdl20_2022',
    citation: 'Real Decreto-ley 20/2022, de 27 de diciembre',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2022-4972&tn=1&p=20221228',
    inForceSince: '2022-12-28',
    inForceUntil: null,
    status: 'in_force',
    statusSince: null,
    statusUrl: null,
  },
  // DF 1.ª (arts. 20.1 and DA 11.ª LAU), DF 6.ª (3 % cap in 2024) and DT 4.ª.
  law12_2023: {
    id: 'law12_2023',
    citation: 'Ley 12/2023, de 24 de mayo, por el derecho a la vivienda',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2023-12203',
    inForceSince: '2023-05-26',
    inForceUntil: null,
    status: 'in_force',
    statusSince: null,
    statusUrl: null,
  },
  // The IRAV as the cap of DA 11.ª LAU, with effects from 01-01-2025 (apartado tercero).
  ineIravResolution: {
    id: 'ineIravResolution',
    citation: 'Resolución de 18 de diciembre de 2024, de la Presidencia del INE',
    url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-26685',
    inForceSince: '2025-01-01',
    inForceUntil: null,
    status: 'in_force',
    statusSince: null,
    statusUrl: null,
  },
  // DA 42.ª: legal interest at 3,25 %, still applied while the 2023 budget stays extended.
  pge2023: {
    id: 'pge2023',
    citation: 'Ley 31/2022, de 23 de diciembre, de Presupuestos Generales del Estado para 2023',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2022-22128',
    inForceSince: '2023-01-01',
    inForceUntil: null,
    status: 'in_force',
    statusSince: null,
    statusUrl: null,
  },
  // Art. 2: updates capped at 2 % without a new agreement. The repeal is dated 30-04-2026, so its
  // last day with effects is 29-04; that it did not reach 30-04 is not settled.
  rdl8_2026: {
    id: 'rdl8_2026',
    citation: 'Real Decreto-ley 8/2026, de 20 de marzo',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2026-6545',
    inForceSince: '2026-03-22',
    inForceUntil: '2026-04-29',
    endUncertainUntil: '2026-04-30',
    status: 'repealed',
    statusSince: '2026-04-30',
    statusUrl: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-9359',
  },
  // In force on 01-10-2026 only; repealed on 02-10-2026.
  rdl26_2026: {
    id: 'rdl26_2026',
    citation: 'Real Decreto-ley 26/2026, de 29 de septiembre',
    url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2026-20266',
    inForceSince: '2026-10-01',
    inForceUntil: '2026-10-01',
    endUncertainUntil: '2026-10-02',
    status: 'repealed',
    statusSince: '2026-10-02',
    statusUrl: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2026-20526',
  },
  // Arts. 3 and 4 and DF 5.ª and 6.ª; in force from 08-10-2026 (DF 11.ª).
  rdl29_2026: {
    id: 'rdl29_2026',
    citation: 'Real Decreto-ley 29/2026, de 6 de octubre',
    url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2026-20823',
    inForceSince: '2026-10-08',
    inForceUntil: null,
    status: 'pending_validation',
    statusSince: null,
    statusUrl: null,
  },
  // Art. 10 LAU rewritten; in force from 15-11-2026 (DF 2.ª).
  rdl28_2026: {
    id: 'rdl28_2026',
    citation: 'Real Decreto-ley 28/2026, de 6 de octubre',
    url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2026-20822',
    inForceSince: '2026-11-15',
    inForceUntil: null,
    status: 'pending_validation',
    statusSince: null,
    statusUrl: null,
  },
};
