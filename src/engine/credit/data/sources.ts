import type { SourceTable } from '../norms';

const CENDOJ = 'https://www.poderjudicial.es/search/indexAN.jsp';
const SUPREME_CIVIL = 'Tribunal Supremo, Sala de lo Civil';

// Court criteria are shown as such, never as law. A criterion read in its own text is verified for
// its number, date and doctrine; its ECLI stays null until it is opened in CENDOJ.
export const CREDIT_SOURCES: SourceTable = {
  // Revolving cards: a rate more than 6 percentage points above the average of the month is
  // notably higher; before June 2010 the reference is the 19,32 % it gives for 2010, which matches
  // the December 2010 figure.
  sts258_2023: {
    id: 'sts258_2023',
    basis: 'case_law',
    citation: 'STS 258/2023, de 15 de febrero (Pleno)',
    article: 'criterio sobre tarjetas revolving',
    url: CENDOJ,
    inForceSince: '2023-02-15',
    court: `${SUPREME_CIVIL} (Pleno)`,
    number: '258/2023',
    decidedOn: '2023-02-15',
    ecli: null,
    lastVerified: '2026-10-07',
    verified: true,
    quotes: [],
  },
  // Consumer loans: the revolving threshold is not directly applicable but may be taken into
  // account. Not yet read in CENDOJ, so the loan indicator gives only the distance in points.
  sts366_2026: {
    id: 'sts366_2026',
    basis: 'case_law',
    citation: 'STS 366/2026, de 9 de marzo',
    article: 'criterio sobre préstamos al consumo',
    url: CENDOJ,
    inForceSince: '2026-03-09',
    court: SUPREME_CIVIL,
    number: '366/2026',
    decidedOn: '2026-03-09',
    ecli: null,
    lastVerified: '2026-10-07',
    verified: false,
    quotes: [],
  },
  // The monthly averages the indicator compares with (data/be1904.ts).
  bde_be1904: {
    id: 'bde_be1904',
    basis: 'official_data',
    citation: 'Banco de España, Boletín Estadístico, cuadro 19.4',
    article: 'series BE_19_4.7 a BE_19_4.11',
    url: 'https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/be1904.csv',
    inForceSince: '2003-01-01',
    lastVerified: '2026-10-07',
    verified: true,
    quotes: [],
  },
};
