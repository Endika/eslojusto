// source: cbf3c50ce7b9
import type { Range } from '../../engine/money';
import {
  belowFullTimeMinimum,
  RED_MONTHLY_CAP,
  type ErteEstimate,
  type ErteInput,
  type ErteRegime,
} from '../../engine/erte';
import { BENEFIT_2026 } from '../../engine/unemployment';
import { euros, wholeEuros } from '../format';

import type { ErteBlock, ErteCopy, ErteView } from './copy';
import { MAX_REDUCTION_PERCENT, MIN_REDUCTION_PERCENT } from '../../engine/erte';

// The ERTE benefit page in Catalan, with the same shape as es.ts (./copy.ts).

export const ERTE_PAGE = {
  title: 'Atur durant un ERTE: quant cobraries al mes',
  description:
    'Amb el tipus d’ERTE de la teva comunicació, si suspèn el contracte o redueix la jornada i la teva base, estima l’atur al mes i si gasta el teu atur futur.',
  h1: 'Atur durant un ERTE',
  lead: 'Un ERTE (expediente de regulación temporal de empleo) pot donar dret a atur mentre duri. Quant cobres, i si gasta l’atur que et quedi per a més endavant, depèn del tipus d’ERTE.',
  beta: 'Beta',
  betaNote:
    'Estimació aproximada amb dades que escrius tu; no substitueix el que reconegui el SEPE.',
  noJs: 'Aquesta estimació necessita JavaScript.',
  button: 'Calcular',
  restart: 'Tornar a començar',
} as const;

// The paragraphs of the legal notice about the page.
export const ERTE_LEGAL = {
  title: 'L’estimació de l’atur durant un ERTE',
  does: 'Estima l’atur brut al mes durant un ERTE per causes econòmiques, tècniques, organitzatives o de producció, per força major o del mecanisme RED, amb la base reguladora i les dades que escrius tu: la quantia amb els seus límits, si és desocupació total o parcial, si gasta l’atur que et quedi per a més endavant i la cotització que cal. Cada bloc indica l’article de la Ley General de la Seguridad Social d’on surt, també de les seves disposicions addicionals 41.ª i 46.ª.',
  doesNot:
    'No calcula la teva base reguladora ni el que cobres en net, no comprova si compleixes els requisits ni si l’ERTE és vàlid, i no substitueix el que reconegui el SEPE. Informa sobre la llei i no és assessorament jurídic.',
  beta: 'És una secció en proves: pot tenir errors mentre es revisa amb casos reals. Si veus una xifra que no quadra amb la llei, pots escriure a',
} as const;

export const ERTE_QUESTIONS = {
  regime: {
    question: 'Quin tipus d’ERTE tens?',
    help: 'Ho posa a la comunicació que et va enviar l’empresa.',
    options: [
      ['etop', 'Per causes econòmiques, tècniques, organitzatives o de producció'],
      ['force_majeure', 'Per força major'],
      ['red', 'Mecanisme RED'],
      ['unknown', 'No ho sé'],
    ],
  },
  measure: {
    question: 'El teu ERTE suspèn el contracte o redueix la jornada?',
    options: [
      ['suspension', 'Suspèn el contracte'],
      ['reduction', 'Redueix la jornada'],
    ],
  },
  percent: {
    label: 'Percentatge de reducció de la jornada',
    hint: 'Entre 10 i 70. Per exemple, 40 si treballes un 40\u00a0% menys d’hores.',
  },
  base: {
    question: 'Quina és la teva base reguladora?',
    label: 'Base reguladora al mes',
    hint: 'Brut en euros al mes: la mitjana del que has cotitzat per desocupació en els últims 180 dies, sense hores extraordinàries.',
    hintRed:
      'Brut en euros al mes: la mitjana de les bases de cotització per accidents de treball i malalties professionals en aquesta empresa en els 180 dies anteriors a la mesura, o en els que hi portis si són menys, sense hores extraordinàries.',
  },
  children: {
    question: 'Quants fills o filles tens a càrrec teu?',
    help: 'Canvia el mínim i el màxim del teu atur.',
    options: [
      ['0', 'Cap'],
      ['1', '1'],
      ['2', '2 o més'],
      ['not_said', 'Prefereixo no dir-ho'],
    ],
  },
} as const;

const LEAD =
  'Una estimació bruta amb les dades que has escrit. La xifra que val és la que reconegui el SEPE.';

// «uns 1.225 €», or «entre 560 € i 1.225 €» when the readings differ by more than a euro.
function amount(r: Range): string {
  const lo = Math.round(r.min);
  const hi = Math.round(r.max);
  return lo === hi ? `uns ${wholeEuros(lo)}` : `entre ${wholeEuros(lo)} i ${wholeEuros(hi)}`;
}

// A cap reads to the euro when it is whole, never rounded past the law.
const capText = (n: number): string => (Number.isInteger(n) ? wholeEuros(n) : euros(n));

const percentText = (n: number): string => `${Number(n.toFixed(2)).toLocaleString('es-ES')}\u00a0%`;

const REGIME_SOURCE = {
  etop: 'Arts. 269 i 270 LGSS',
  force_majeure: 'DA 46.ª LGSS',
  red: 'DA 41.ª LGSS',
} as const;

// The monthly floor and ceiling for the answer on children; the full span only without an answer.
function capCopy(children: ErteInput['children']): string {
  const { minCap, maxCap } = BENEFIT_2026;
  const [lo, hi] =
    children === null
      ? [minCap[0], maxCap[2]]
      : [minCap[Math.min(children, 1) as 0 | 1], maxCap[children]];
  return `entre ${wholeEuros(lo)} i ${wholeEuros(hi)}`;
}

function amountBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const reduction = input.measure.kind === 'reduction' ? input.measure : null;
  const rate =
    input.regime === 'etop'
      ? `És el 70\u00a0% de la teva base els primers 180 dies de prestació i el 60\u00a0% a partir del dia 181 (art. 270.2 LGSS).`
      : `És el 70\u00a0% de la teva base durant tot l’ERTE (${input.regime === 'red' ? 'DA 41.ª.4' : 'DA 46.ª'} LGSS).`;
  const first = amount(e.firstStretch);
  const second = e.secondStretch === null ? null : amount(e.secondStretch);
  const figure = belowFullTimeMinimum(input)
    ? `Amb una base per sota de la mínima d’una jornada completa (${euros(BENEFIT_2026.minBaseAtep)}), la jornada és parcial, i aleshores el mínim i el màxim baixen en proporció a les teves hores (art. 270.3 LGSS). Sense les teves hores, aquesta estimació no dona cap xifra.`
    : second === null
      ? `${capitalise(first)} al mes.`
      : second === first
        ? `${capitalise(first)} al mes, abans i després del dia 181.`
        : `${capitalise(first)} al mes els primers 180 dies de prestació i ${second} a partir del dia 181.`;
  const limit =
    input.regime === 'red'
      ? `Amb un límit fixat en ${capText(RED_MONTHLY_CAP)} al mes, el 225\u00a0% de l’IPREM més una sisena part, i sense mínim propi (DA 41.ª.4 LGSS).`
      : belowFullTimeMinimum(input)
        ? ''
        : `Amb el mínim i el màxim segons els fills o filles que tinguis a càrrec teu (art. 270.3 LGSS): ${capCopy(input.children)} al mes amb jornada completa.`;
  const proportion = reduction
    ? input.regime === 'red'
      ? ` Com que l’ERTE redueix la teva jornada un ${percentText(reduction.percent)}, la revisió pren la prestació en proporció a aquesta reducció, com en l’atur per reducció de jornada (art. 270.5 LGSS). La disposició addicional 41.ª no diu com es calcula en el mecanisme RED: és un criteri de la revisió.`
      : ` Com que l’ERTE redueix la teva jornada un ${percentText(reduction.percent)}, la prestació és proporcional a aquesta reducció (art. 270.5 LGSS); només compta la reducció temporal de l’art. 47 ET.`
    : '';
  return {
    title: 'Quant cobraries',
    text: [figure, rate, limit].filter(Boolean).join(' ') + proportion,
    source:
      input.regime === 'etop' ? 'Arts. 270.2, 270.3 i 270.5 LGSS' : REGIME_SOURCE[input.regime],
  };
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function unemploymentBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (regime === 'red')
    return {
      title: 'Quina prestació és',
      text: 'En el mecanisme RED es cobra una prestació pròpia, tant si suspèn el contracte com si redueix la jornada, i no la prestació per desocupació general.',
      source: 'DA 41.ª.1 LGSS',
    };
  return e.unemployment === 'total'
    ? {
        title: 'Quin tipus de desocupació és',
        text: 'Un ERTE que suspèn el teu contracte és una situació legal de desocupació total.',
        source: 'Arts. 262.2 i 267.1.b.1.º LGSS',
      }
    : {
        title: 'Quin tipus de desocupació és',
        text: 'Un ERTE que redueix la teva jornada és una situació legal de desocupació parcial. Si la reducció s’aplica en dies complets, aquests dies són desocupació total.',
        source: 'Arts. 262.2, 262.3 i 267.1.c LGSS',
      };
}

function consumptionBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const title = 'Gasta el teu atur futur?';
  if (!e.consumption.consumes)
    return {
      title,
      text:
        input.regime === 'red'
          ? 'No. El temps que cobris en el mecanisme RED no es considera consumit.'
          : 'Cobrar-lo no gasta les cotitzacions que ja tenies: «el acceso a esta prestación no implicará el consumo de las cotizaciones previamente efectuadas a ningún efecto».',
      source: input.regime === 'red' ? 'DA 41.ª.8 LGSS' : 'DA 46.ª.b LGSS',
    };
  if (input.measure.kind === 'reduction')
    return {
      title,
      text: `Sí. Amb una reducció de jornada es gasta per hores, en el mateix percentatge que la reducció: un ${percentText(input.measure.percent)} d’un dia d’atur per cada dia d’ERTE.`,
      source: 'Art. 269.5 LGSS',
    };
  return {
    title,
    text: 'Sí. Cada dia d’ERTE amb el contracte suspès gasta un dia de l’atur que et quedi per a més endavant.',
    source: 'Art. 269 LGSS',
  };
}

function contributionBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (e.contribution.kind === 'minimum')
    return {
      title: 'Quant cal haver cotitzat',
      text: `Calen ${e.contribution.days} dies cotitzats en els últims 6 anys que no hagis fet servir per a un altre atur.`,
      source: 'Arts. 266.b i 269 LGSS',
    };
  return {
    title: 'Quant cal haver cotitzat',
    text: 'No cal un període mínim de cotització.',
    source: regime === 'red' ? 'DA 41.ª.1 LGSS' : 'DA 46.ª LGSS',
  };
}

export function ertePositiveView(input: ErteInput, e: ErteEstimate): ErteView {
  return {
    title: 'El teu atur durant l’ERTE (estimació)',
    lead: LEAD,
    blocks: [
      amountBlock(input, e),
      unemploymentBlock(input.regime, e),
      consumptionBlock(input, e),
      contributionBlock(input.regime, e),
      ...(e.jobSeekerRegistration
        ? [
            {
              title: 'Com es demana',
              text: 'La sol·licitud la presenta l’empresa en nom teu, en el termini d’un mes des que l’autoritat laboral autoritza la mesura. Per cobrar-lo cal que t’hagis inscrit com a demandant d’ocupació.',
              source: 'DA 41.ª.2 LGSS',
            },
          ]
        : []),
    ],
  };
}

export const erteUnknownView = (): ErteView => ({
  title: 'Sense el tipus d’ERTE no hi ha una sola xifra',
  lead: 'La comunicació de l’empresa diu de quin tipus és. Mentrestant, així canvien les regles.',
  blocks: [
    {
      title: 'Causes econòmiques, tècniques, organitzatives o de producció',
      text: 'El 70\u00a0% de la teva base els primers 180 dies de prestació i el 60\u00a0% després, dins dels mínims i màxims per fills o filles. Gasta el teu atur futur i calen 360 dies cotitzats en els últims 6 anys que no hagis fet servir per a un altre atur.',
      source: 'Arts. 266.b, 269 i 270 LGSS',
    },
    {
      title: 'Força major',
      text: 'El 70\u00a0% de la teva base durant tot l’ERTE, dins dels mínims i màxims per fills o filles. No gasta les cotitzacions que ja tenies i no cal un període mínim de cotització.',
      source: 'DA 46.ª LGSS',
    },
    {
      title: 'Mecanisme RED',
      text: `El 70\u00a0% de la teva base durant tot l’ERTE, amb un límit fixat en ${capText(RED_MONTHLY_CAP)} al mes, el 225\u00a0% de l’IPREM més una sisena part. El temps que cobris no es considera consumit, no cal un període mínim de cotització i cal que t’hagis inscrit com a demandant d’ocupació.`,
      source: 'DA 41.ª LGSS',
    },
  ],
});

export const ERTE_GUIDE = {
  title: 'Com es calcula l’atur durant un ERTE',
  sheetTitle: 'Els tres tipus d’ERTE',
  sheetLead:
    'El que canvia en l’atur amb cadascun: la quantia, si gasta l’atur futur i la cotització.',
  nextTitle: 'Continua llegint',
  nextHub: 'Atur',
  hubPath: 'paro/',
} as const;

export const ERTE_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: 'Cobro l’atur si el meu ERTE redueix la jornada?',
    answer:
      'Sí, si compleixes els requisits del teu tipus d’ERTE, com a desocupació parcial quan la reducció temporal de la teva jornada diària ordinària és d’entre un 10 i un 70\u00a0% (arts. 262.3 LGSS i 47.7.a ET). La prestació és proporcional a aquesta reducció (art. 270.5 LGSS).',
  },
  {
    question: 'Un ERTE gasta el meu atur per a més endavant?',
    answer:
      'Depèn del tipus. En l’ERTE per causes econòmiques, tècniques, organitzatives o de producció, sí: cada dia gasta atur, i en una reducció de jornada es gasta per hores (art. 269.5 LGSS). En el de força major no gasta les cotitzacions que ja tenies (DA 46.ª LGSS), i en el mecanisme RED el temps que cobris no es considera consumit (DA 41.ª.8 LGSS).',
  },
  {
    question: 'Cal haver cotitzat un mínim per cobrar l’atur en un ERTE?',
    answer:
      'En l’ERTE per causes econòmiques, tècniques, organitzatives o de producció calen 360 dies cotitzats en els últims 6 anys que no hagis fet servir per a un altre atur (arts. 266.b i 269 LGSS). En el de força major i en el mecanisme RED no cal un període mínim de cotització (DA 46.ª i DA 41.ª.1 LGSS).',
  },
  {
    question: 'Què passa si no sé de quin tipus és el meu ERTE?',
    answer:
      'La comunicació que et va enviar l’empresa diu de quin tipus és. Mentrestant, tria «No ho sé» al formulari i veuràs com canvien les regles en cada tipus, sense una sola xifra.',
  },
];

export const ERTE_ERRORS = {
  regime: 'Tria una opció; «No ho sé» també val',
  measure: 'Tria una opció',
  percent: `Escriu un percentatge entre ${MIN_REDUCTION_PERCENT} i ${MAX_REDUCTION_PERCENT}`,
  base: 'Escriu la base en euros al mes, per exemple 1.500,00',
  children: 'Tria una opció; «Prefereixo no dir-ho» també val',
} as const;

export const ERTE: ErteCopy = {
  page: ERTE_PAGE,
  crumb: 'Atur durant un ERTE',
  legal: ERTE_LEGAL,
  questions: ERTE_QUESTIONS,
  errors: ERTE_ERRORS,
  guide: ERTE_GUIDE,
  faq: ERTE_FAQ,
  positiveView: ertePositiveView,
  unknownView: erteUnknownView,
};
