import type { MortgageSourceId, SourceTable } from '../norms';

const CENDOJ = 'https://www.poderjudicial.es/search/indexAN.jsp';
const SUPREME_CIVIL = 'Tribunal Supremo, Sala de lo Civil';
const COURT_OF_JUSTICE = 'Tribunal de Justicia de la Unión Europea';
const EUR_LEX = 'https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:';
// The day these criteria were last looked up at their source.
const READ_ON = '2026-10-07';

// A Supreme Court ruling not yet opened in CENDOJ: its number and date come from official notes,
// so nothing that rests on it gives an amount.
const supreme = (
  id: MortgageSourceId,
  number: string,
  decidedOn: string,
  citation: string,
  article: string,
): SourceTable[MortgageSourceId] => ({
  id,
  basis: 'case_law',
  citation,
  article,
  url: CENDOJ,
  inForceSince: decidedOn,
  court: SUPREME_CIVIL,
  number,
  decidedOn,
  ecli: null,
  lastVerified: READ_ON,
  verified: false,
  quotes: [],
});

// A judgment of the Court of Justice, read in EUR-Lex; `celex` is its document number there.
const courtOfJustice = (
  id: MortgageSourceId,
  number: string,
  decidedOn: string,
  celex: string,
  citation: string,
  article: string,
  ecli: string,
): SourceTable[MortgageSourceId] => ({
  id,
  basis: 'case_law',
  citation,
  article,
  url: `${EUR_LEX}${celex}`,
  inForceSince: decidedOn,
  court: COURT_OF_JUSTICE,
  number,
  decidedOn,
  ecli,
  lastVerified: READ_ON,
  verified: true,
  quotes: [],
});

// Court criteria are shown as such, never as law, each with the day it was last read.
export const MORTGAGE_SOURCES: SourceTable = {
  // The tax on the mortgage deed fell on the borrower before RDL 17/2018.
  sts147_148_2018: supreme(
    'sts147_148_2018',
    '147/2018 y 148/2018',
    '2018-03-15',
    'SSTS 147/2018 y 148/2018, de 15 de marzo',
    'impuesto de actos jurídicos documentados del préstamo hipotecario',
  ),
  // Interest on each set-up cost runs from the day it was paid (art. 1303 CC).
  sts725_2018: supreme(
    'sts725_2018',
    '725/2018',
    '2018-12-19',
    'STS 725/2018, de 19 de diciembre',
    'intereses de las cantidades pagadas por gastos',
  ),
  // Valuation, registry and agency costs to the lender, the notary by halves, before the LCCI.
  // ECLI:ES:TS:2021:61 per the official note, to be confirmed in CENDOJ.
  sts35_2021: supreme(
    'sts35_2021',
    '35/2021',
    '2021-01-27',
    'STS 35/2021, de 27 de enero (Pleno)',
    'reparto de los gastos de constitución de la hipoteca',
  ),
  // The notary by halves; the opening fee assessed case by case.
  // ECLI:ES:TS:2023:2131 per the official note, to be confirmed in CENDOJ.
  sts816_2023: supreme(
    'sts816_2023',
    '816/2023',
    '2023-05-29',
    'STS 816/2023, de 29 de mayo',
    'gastos de notaría y comisión de apertura',
  ),
  // Floor clauses and their transparency.
  sts241_2013: supreme(
    'sts241_2013',
    '241/2013',
    '2013-05-09',
    'STS 241/2013, de 9 de mayo (Pleno)',
    'cláusulas suelo',
  ),
  // Late interest over the ordinary rate plus 2 points, in loans to consumers.
  sts364_2016: supreme(
    'sts364_2016',
    '364/2016',
    '2016-06-03',
    'STS 364/2016, de 3 de junio',
    'intereses de demora',
  ),
  // Early termination clauses after the Court of Justice's judgment of 26-03-2019.
  sts463_2019: supreme(
    'sts463_2019',
    '463/2019',
    '2019-09-11',
    'STS 463/2019, de 11 de septiembre (Pleno)',
    'vencimiento anticipado',
  ),
  // When the time limit for the set-up costs starts to run.
  sts857_2024: supreme(
    'sts857_2024',
    '857/2024',
    '2024-06-14',
    'STS 857/2024, de 14 de junio',
    'plazo de la acción de restitución de gastos',
  ),
  tjue_c154_15: courtOfJustice(
    'tjue_c154_15',
    'C-154/15, C-307/15 y C-308/15',
    '2016-12-21',
    '62015CJ0154',
    'Sentencia del TJUE de 21 de diciembre de 2016, asuntos acumulados C-154/15, C-307/15 y C-308/15',
    'efectos en el tiempo de las cláusulas suelo',
    'ECLI:EU:C:2016:980',
  ),
  tjue_c96_16: courtOfJustice(
    'tjue_c96_16',
    'C-96/16 y C-94/17',
    '2018-08-07',
    '62016CJ0096',
    'Sentencia del TJUE de 7 de agosto de 2018, asuntos acumulados C-96/16 y C-94/17',
    'intereses de demora',
    'ECLI:EU:C:2018:643',
  ),
  tjue_c70_17: courtOfJustice(
    'tjue_c70_17',
    'C-70/17 y C-179/17',
    '2019-03-26',
    '62017CJ0070',
    'Sentencia del TJUE de 26 de marzo de 2019, asuntos acumulados C-70/17 y C-179/17',
    'vencimiento anticipado',
    'ECLI:EU:C:2019:250',
  ),
  tjue_c125_18: courtOfJustice(
    'tjue_c125_18',
    'C-125/18',
    '2020-03-03',
    '62018CJ0125',
    'Sentencia del TJUE de 3 de marzo de 2020, asunto C-125/18',
    'IRPH',
    'ECLI:EU:C:2020:138',
  ),
  tjue_c452_18: courtOfJustice(
    'tjue_c452_18',
    'C-452/18',
    '2020-07-09',
    '62018CJ0452',
    'Sentencia del TJUE de 9 de julio de 2020, asunto C-452/18',
    'novación de cláusulas suelo',
    'ECLI:EU:C:2020:536',
  ),
  // What is given back of the set-up costs, unless national law puts them on the consumer.
  tjue_c224_19: courtOfJustice(
    'tjue_c224_19',
    'C-224/19 y C-259/19',
    '2020-07-16',
    '62019CJ0224',
    'Sentencia del TJUE de 16 de julio de 2020, asuntos acumulados C-224/19 y C-259/19',
    'gastos de constitución y comisión de apertura',
    'ECLI:EU:C:2020:578',
  ),
  tjue_c565_21: courtOfJustice(
    'tjue_c565_21',
    'C-565/21',
    '2023-03-16',
    '62021CJ0565',
    'Sentencia del TJUE de 16 de marzo de 2023, asunto C-565/21',
    'comisión de apertura',
    'ECLI:EU:C:2023:212',
  ),
  tjue_c265_22: courtOfJustice(
    'tjue_c265_22',
    'C-265/22',
    '2023-07-13',
    '62022CJ0265',
    'Sentencia del TJUE de 13 de julio de 2023, asunto C-265/22',
    'IRPH',
    'ECLI:EU:C:2023:578',
  ),
  tjue_c561_21: courtOfJustice(
    'tjue_c561_21',
    'C-561/21',
    '2024-04-25',
    '62021CJ0561',
    'Sentencia del TJUE de 25 de abril de 2024, asunto C-561/21',
    'inicio del plazo de la acción de restitución',
    'ECLI:EU:C:2024:362',
  ),
};
