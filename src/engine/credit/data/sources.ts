import type { SourceTable } from '../norms';

// A ruling's own PDF in CENDOJ, by the reference and date its search result links to.
const cendojPdf = (reference: string, optimize: string): string =>
  `https://www.poderjudicial.es/search/contenidos.action?action=contentpdf&databasematch=TS&reference=${reference}&optimize=${optimize}&publicinterface=true`;
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
    url: cendojPdf('10303585', '20230224'),
    inForceSince: '2023-02-15',
    court: `${SUPREME_CIVIL} (Pleno)`,
    number: '258/2023',
    decidedOn: '2023-02-15',
    ecli: 'ECLI:ES:TS:2023:442',
    lastVerified: '2026-10-19',
    verified: true,
    quotes: [
      'consideramos más adecuado seguir el criterio de que la diferencia entre el tipo medio de mercado y el convenido sea superior a 6 puntos porcentuales.',
      'Según el boletín estadístico el tipo medio TEDR ese año estaba en el 19,32.',
    ],
  },
  // Consumer loans: the revolving threshold is not directly applicable but may be taken into
  // account, so the loan indicator gives the distance in points and the ruling, never a band.
  sts366_2026: {
    id: 'sts366_2026',
    basis: 'case_law',
    citation: 'STS 366/2026, de 9 de marzo',
    article: 'criterio sobre préstamos al consumo',
    url: cendojPdf('11659366', '20260318'),
    inForceSince: '2026-03-09',
    court: SUPREME_CIVIL,
    number: '366/2026',
    decidedOn: '2026-03-09',
    ecli: 'ECLI:ES:TS:2026:1013',
    lastVerified: '2026-10-19',
    verified: true,
    quotes: [
      'no resulta directamente aplicable a un supuesto como el presente de préstamo personal, en el que el tipo medio de mercado es inferior al 15%.',
      'Pero, nada impide que se tenga en consideración para realizar la valoración de si el interés pactado es notablemente superior al tipo medio de mercado de estas operaciones de crédito en el momento que se pactó.',
      'en este caso es bastante superior a los 6 puntos, siendo del 8,51%',
    ],
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
