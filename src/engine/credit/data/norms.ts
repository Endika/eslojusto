import type { NormReview, NormTable } from '../norms';

const DCC_2023 = 'https://eur-lex.europa.eu/legal-content/ES/TXT/HTML/?uri=CELEX:32023L2225';
const CONSUMER_CREDIT_BILL =
  'https://portal.mineco.gob.es/RecursosArticulo/mineco/ministerio/participacion_publica/audiencia/ficheros/ECO_TES_20260108_AP_APL_Credito_Consumo.pdf';

const inForce = {
  inForceUntil: null,
  status: 'in_force',
  statusSince: null,
  statusUrl: null,
} as const;

export const CREDIT_NORMS: NormTable = {
  // Applies to contracts concluded from its entry into force.
  lcc: {
    id: 'lcc',
    citation: 'Ley 16/2011, de 24 de junio, de contratos de crédito al consumo',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2011-10970',
    inForceSince: '2011-09-25',
    ...inForce,
  },
  // Rewrote part II of annex I, the extra assumptions of the APR, from 09-02-2013.
  lcc_annex_2013: {
    id: 'lcc_annex_2013',
    citation:
      'Orden ECC/159/2013, de 6 de febrero, por la que se modifica la parte II del anexo I de la Ley 16/2011, de 24 de junio, de contratos de crédito al consumo',
    url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2013-1338',
    inForceSince: '2013-02-09',
    ...inForce,
  },
  // Art. 1: the law both average-rate criteria interpret.
  lru: {
    id: 'lru',
    citation: 'Ley de 23 de julio de 1908 sobre nulidad de los contratos de préstamos usurarios',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1908-5579',
    inForceSince: '1908-08-13',
    ...inForce,
  },
  // Its revolving credit chapter (arts. 33 bis to 33 octies) came with Orden ETD/699/2020, in force
  // from 27-01-2021.
  oeha: {
    id: 'oeha',
    citation:
      'Orden EHA/2899/2011, de 28 de octubre, de transparencia y protección del cliente de servicios bancarios',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2011-17015',
    inForceSince: '2012-04-29',
    ...inForce,
  },
  // Art. 5.1: how periods in days and months are counted.
  cc: {
    id: 'cc',
    citation: 'Código Civil',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1889-4763',
    inForceSince: '1974-07-29',
    ...inForce,
  },
  // Applies from 20-11-2026 but Spain has not transposed it: only a notice of the change to come.
  dcc_2023: {
    id: 'dcc_2023',
    citation: 'Directiva (UE) 2023/2225, relativa a los contratos de crédito al consumo',
    url: DCC_2023,
    inForceSince: '2026-11-20',
    inForceUntil: null,
    status: 'draft',
    statusSince: null,
    statusUrl: null,
  },
  // Approved by the Council of Ministers on 07-01-2026 and not yet passed. `inForceSince` holds that
  // day only because a draft never applies; it becomes the day the law takes effect once published.
  consumer_credit_bill: {
    id: 'consumer_credit_bill',
    citation: 'Anteproyecto de Ley de contratos de crédito al consumo, de 7 de enero de 2026',
    url: CONSUMER_CREDIT_BILL,
    inForceSince: '2026-01-07',
    inForceUntil: null,
    status: 'draft',
    statusSince: null,
    statusUrl: null,
  },
};

export const NORM_REVIEW: NormReview = {
  lcc: null,
  lcc_annex_2013: null,
  lru: null,
  oeha: null,
  cc: null,
  dcc_2023: null,
  consumer_credit_bill: null,
};
