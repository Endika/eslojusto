export interface Fuente {
  readonly id: string;
  readonly norma: string;
  readonly url: string;
  readonly vigenteDesde: string;
}

export const ET = 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430';
const NOTA_CGPJ =
  'https://www.poderjudicial.es/stfls/CGPJ/UTILIDADES/20260727_Nota_actualizacion_%20julio_2026.pdf';
export const LGSS = 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11724';
const GUIA_CGPJ =
  'https://www.poderjudicial.es/stfls/CGPJ/UTILIDADES/Guia_pr%C3%A1ctica_legal_y_jurisprudencial_calculo_indemnizaciones_v06_actualizada_a_julio_2026.pdf';

export const FUENTES: Record<
  | 'et49'
  | 'et49_1c'
  | 'et49_1d'
  | 'et55'
  | 'et53'
  | 'et56'
  | 'etDt11'
  | 'etDt8'
  | 'et38'
  | 'et31'
  | 'et26'
  | 'guiaCgpj'
  | 'sts651_2026'
  | 'lgss267'
  | 'lgss268'
  | 'lgss269'
  | 'lgss270'
  | 'ordenCotizacion2026'
  | 'sepeCuantias',
  Fuente
> = {
  et49: {
    id: 'et49',
    norma: 'Estatuto de los Trabajadores, art. 49',
    url: `${ET}#a49`,
    vigenteDesde: '2015-11-13',
  },
  et49_1c: {
    id: 'et49_1c',
    norma: 'Estatuto de los Trabajadores, art. 49.1.c',
    url: `${ET}#a49`,
    vigenteDesde: '2015-11-13',
  },
  et49_1d: {
    id: 'et49_1d',
    norma: 'Estatuto de los Trabajadores, art. 49.1.d',
    url: `${ET}#a49`,
    vigenteDesde: '2015-11-13',
  },
  et55: {
    id: 'et55',
    norma: 'Estatuto de los Trabajadores, art. 55.7',
    url: `${ET}#a55`,
    vigenteDesde: '2015-11-13',
  },
  et53: {
    id: 'et53',
    norma: 'Estatuto de los Trabajadores, art. 53',
    url: `${ET}#a53`,
    vigenteDesde: '2015-11-13',
  },
  et56: {
    id: 'et56',
    norma: 'Estatuto de los Trabajadores, art. 56',
    url: `${ET}#a56`,
    vigenteDesde: '2015-11-13',
  },
  etDt11: {
    id: 'etDt11',
    norma: 'Estatuto de los Trabajadores, disposición transitoria 11.ª',
    url: `${ET}#dtundecima`,
    vigenteDesde: '2012-02-12',
  },
  etDt8: {
    id: 'etDt8',
    norma: 'Estatuto de los Trabajadores, disposición transitoria 8.ª',
    url: `${ET}#dtoctava`,
    vigenteDesde: '2015-11-13',
  },
  et38: {
    id: 'et38',
    norma: 'Estatuto de los Trabajadores, art. 38',
    url: `${ET}#a38`,
    vigenteDesde: '2015-11-13',
  },
  et31: {
    id: 'et31',
    norma: 'Estatuto de los Trabajadores, art. 31',
    url: `${ET}#a31`,
    vigenteDesde: '2015-11-13',
  },
  et26: {
    id: 'et26',
    norma: 'Estatuto de los Trabajadores, art. 26',
    url: `${ET}#a26`,
    vigenteDesde: '2015-11-13',
  },
  guiaCgpj: {
    id: 'guiaCgpj',
    norma: 'CGPJ, guía práctica para el cálculo de indemnizaciones (v0.6)',
    url: GUIA_CGPJ,
    vigenteDesde: '2026-07-09',
  },
  sts651_2026: {
    id: 'sts651_2026',
    norma: 'STS 651/2026 y nota de actualización del CGPJ de julio de 2026',
    url: NOTA_CGPJ,
    vigenteDesde: '2026-07-09',
  },
  lgss267: {
    id: 'lgss267',
    norma: 'Ley General de la Seguridad Social, art. 267',
    url: `${LGSS}#a267`,
    vigenteDesde: '2023-03-02',
  },
  lgss268: {
    id: 'lgss268',
    norma: 'Ley General de la Seguridad Social, art. 268',
    url: `${LGSS}#a268`,
    vigenteDesde: '2023-03-02',
  },
  lgss269: {
    id: 'lgss269',
    norma: 'Ley General de la Seguridad Social, art. 269',
    url: `${LGSS}#a269`,
    vigenteDesde: '2024-05-23',
  },
  lgss270: {
    id: 'lgss270',
    norma: 'Ley General de la Seguridad Social, art. 270',
    url: `${LGSS}#a270`,
    vigenteDesde: '2023-01-01',
  },
  ordenCotizacion2026: {
    id: 'ordenCotizacion2026',
    norma: 'Orden PJC/297/2026, normas de cotización a la Seguridad Social para 2026',
    url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-7296',
    vigenteDesde: '2026-01-01',
  },
  sepeCuantias: {
    id: 'sepeCuantias',
    norma: 'SEPE, cuantías anuales de las prestaciones por desempleo',
    url: 'https://www.sepe.es/HomeSepe/prestaciones-desempleo/Cuantias-anuales.html',
    vigenteDesde: '2026-01-01',
  },
};
