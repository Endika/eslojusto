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

const NBSP = ' ';

// The ERTE benefit page in French, with the same shape as es.ts (./copy.ts).

export const ERTE_PAGE = {
  title: 'Allocation chômage pendant un ERTE : combien vous percevriez par mois',
  description:
    "Avec le type d'ERTE indiqué dans votre notification, selon qu'il suspend le contrat ou réduit le temps de travail, et votre base de calcul, estimez l'allocation chômage mensuelle et si elle consomme votre chômage futur.",
  h1: 'Allocation chômage pendant un ERTE',
  lead: "Un ERTE (chômage partiel temporaire) peut ouvrir droit au chômage pendant toute sa durée. Le montant perçu, et le fait qu'il consomme ou non le chômage qui vous resterait pour plus tard, dépendent du type d'ERTE.",
  beta: 'Bêta',
  betaNote:
    'Estimation approximative à partir des données que vous saisissez ; elle ne remplace pas ce que reconnaîtra le SEPE.',
  noJs: 'Cette estimation nécessite JavaScript.',
  button: 'Calculer',
  restart: 'Recommencer',
} as const;

// The paragraphs of the legal notice about the page.
export const ERTE_LEGAL = {
  title: "L'estimation de l'allocation chômage pendant un ERTE",
  does: "Elle estime l'allocation chômage brute mensuelle pendant un ERTE pour causes économiques, techniques, organisationnelles ou de production, pour force majeure ou dans le cadre du mécanisme RED, à partir de la base de calcul (base reguladora) et des données que vous saisissez : le montant avec ses limites, s'il s'agit de chômage total ou partiel, s'il consomme le chômage qui vous resterait pour plus tard et la cotisation requise. Chaque bloc indique l'article de la Ley General de la Seguridad Social dont il provient, y compris de ses dispositions additionnelles 41.ª et 46.ª.",
  doesNot:
    "Elle ne calcule pas votre base de calcul ni ce que vous percevez en net, elle ne vérifie pas si vous remplissez les conditions ni si l'ERTE est valable, et elle ne remplace pas ce que reconnaîtra le SEPE. Elle informe sur la loi et ne constitue pas un conseil juridique.",
  beta: "C'est une section en test : elle peut contenir des erreurs pendant qu'elle est vérifiée sur des cas réels. Si un chiffre ne vous semble pas conforme à la loi, vous pouvez écrire à",
} as const;

export const ERTE_QUESTIONS = {
  regime: {
    question: 'De quel type est votre ERTE ?',
    help: "C'est indiqué dans la notification que l'entreprise vous a envoyée.",
    options: [
      ['etop', 'Pour causes économiques, techniques, organisationnelles ou de production'],
      ['force_majeure', 'Pour force majeure'],
      ['red', 'Mécanisme RED'],
      ['unknown', 'Je ne sais pas'],
    ],
  },
  measure: {
    question: 'Votre ERTE suspend-il le contrat ou réduit-il le temps de travail ?',
    options: [
      ['suspension', 'Il suspend le contrat'],
      ['reduction', 'Il réduit le temps de travail'],
    ],
  },
  percent: {
    label: 'Pourcentage de réduction du temps de travail',
    hint: "Entre 10 et 70. Par exemple, 40 si vous travaillez 40\u00a0% d'heures en moins.",
  },
  base: {
    question: 'Quelle est votre base de calcul ?',
    label: 'Base de calcul mensuelle',
    hint: 'Brut en euros par mois : la moyenne de ce qui a été cotisé au titre du chômage au cours des 180 derniers jours, sans les heures supplémentaires.',
    hintRed:
      "Brut en euros par mois : la moyenne des assiettes de cotisation (bases de cotización) au titre des accidents du travail et des maladies professionnelles dans cette entreprise au cours des 180 jours précédant la mesure, ou de ceux que vous y avez passés s'ils sont moins nombreux, sans les heures supplémentaires.",
  },
  children: {
    question: "Combien d'enfants avez-vous à charge ?",
    help: 'Cela change le minimum et le maximum de votre allocation chômage.',
    options: [
      ['0', 'Aucun'],
      ['1', '1'],
      ['2', '2 ou plus'],
      ['not_said', 'Je préfère ne pas le dire'],
    ],
  },
} as const;

const LEAD =
  'Une estimation brute à partir des données que vous avez saisies. Le chiffre qui fait foi est celui que reconnaîtra le SEPE.';

// «environ 1.225 €», or «entre 560 € et 1.225 €» when the readings differ by more than a euro.
function amount(r: Range): string {
  const lo = Math.round(r.min);
  const hi = Math.round(r.max);
  return lo === hi ? `environ ${wholeEuros(lo)}` : `entre ${wholeEuros(lo)} et ${wholeEuros(hi)}`;
}

// A cap reads to the euro when it is whole, never rounded past the law.
const capText = (n: number): string => (Number.isInteger(n) ? wholeEuros(n) : euros(n));

const percentText = (n: number): string => `${Number(n.toFixed(2)).toLocaleString('es-ES')}\u00a0%`;

const REGIME_SOURCE = {
  etop: 'Arts. 269 et 270 LGSS',
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
  return `entre ${wholeEuros(lo)} et ${wholeEuros(hi)}`;
}

function amountBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const reduction = input.measure.kind === 'reduction' ? input.measure : null;
  const rate =
    input.regime === 'etop'
      ? `C'est 70\u00a0% de votre base les 180 premiers jours de prestation et 60\u00a0% à partir du 181e jour (art. 270.2 LGSS).`
      : `C'est 70\u00a0% de votre base pendant toute la durée de l'ERTE (${input.regime === 'red' ? 'DA 41.ª.4' : 'DA 46.ª'} LGSS).`;
  const first = amount(e.firstStretch);
  const second = e.secondStretch === null ? null : amount(e.secondStretch);
  const figure = belowFullTimeMinimum(input)
    ? `Avec une base inférieure à la base minimale d'un temps plein (${euros(BENEFIT_2026.minBaseAtep)}), le temps de travail est partiel, et le minimum et le maximum baissent alors en proportion de vos heures (art. 270.3 LGSS). Sans vos heures, cette estimation ne donne pas de chiffre.`
    : second === null
      ? `${capitalise(first)} par mois.`
      : second === first
        ? `${capitalise(first)} par mois, avant et après le 181e jour.`
        : `${capitalise(first)} par mois les 180 premiers jours de prestation et ${second} à partir du 181e jour.`;
  const limit =
    input.regime === 'red'
      ? `Avec un plafond de ${capText(RED_MONTHLY_CAP)} par mois, soit 225\u00a0% de l'IPREM plus un sixième, et sans minimum propre (DA 41.ª.4 LGSS).`
      : belowFullTimeMinimum(input)
        ? ''
        : `Avec le minimum et le maximum selon vos enfants à charge (art. 270.3 LGSS)${NBSP}: ${capCopy(input.children)} par mois à temps plein.`;
  const proportion = reduction
    ? input.regime === 'red'
      ? ` Comme l'ERTE réduit votre temps de travail de ${percentText(reduction.percent)}, la vérification calcule la prestation en proportion de cette réduction, comme pour le chômage en cas de réduction du temps de travail (art. 270.5 LGSS). La disposition additionnelle 41.ª ne dit pas comment elle se calcule dans le mécanisme RED${NBSP}: c'est un critère de la vérification.`
      : ` Comme l'ERTE réduit votre temps de travail de ${percentText(reduction.percent)}, la prestation est proportionnelle à cette réduction (art. 270.5 LGSS)${NBSP}; seule compte la réduction temporaire de l'art. 47 ET.`
    : '';
  return {
    title: 'Combien vous percevriez',
    text: [figure, rate, limit].filter(Boolean).join(' ') + proportion,
    source:
      input.regime === 'etop' ? 'Arts. 270.2, 270.3 et 270.5 LGSS' : REGIME_SOURCE[input.regime],
  };
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function unemploymentBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (regime === 'red')
    return {
      title: "De quelle prestation il s'agit",
      text: 'Dans le mécanisme RED, on perçoit une prestation qui lui est propre, que le contrat soit suspendu ou le temps de travail réduit, et non la prestation de chômage générale.',
      source: 'DA 41.ª.1 LGSS',
    };
  return e.unemployment === 'total'
    ? {
        title: "De quel type de chômage il s'agit",
        text: 'Un ERTE qui suspend votre contrat constitue une situation légale de chômage total.',
        source: 'Arts. 262.2 et 267.1.b.1.º LGSS',
      }
    : {
        title: "De quel type de chômage il s'agit",
        text: "Un ERTE qui réduit votre temps de travail constitue une situation légale de chômage partiel. Si la réduction s'applique par journées de travail complètes, ces journées sont du chômage total.",
        source: 'Arts. 262.2, 262.3 et 267.1.c LGSS',
      };
}

function consumptionBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const title = 'Cela consomme-t-il votre chômage futur ?';
  if (!e.consumption.consumes)
    return {
      title,
      text:
        input.regime === 'red'
          ? "Non. Le temps pendant lequel vous percevez la prestation du mécanisme RED n'est pas considéré comme consommé."
          : 'La percevoir ne consomme pas les cotisations que vous aviez déjà : «el acceso a esta prestación no implicará el consumo de las cotizaciones previamente efectuadas a ningún efecto».',
      source: input.regime === 'red' ? 'DA 41.ª.8 LGSS' : 'DA 46.ª.b LGSS',
    };
  if (input.measure.kind === 'reduction')
    return {
      title,
      text: `Oui. Avec une réduction du temps de travail, le chômage se consomme par heures, dans le même pourcentage que la réduction${NBSP}: ${percentText(input.measure.percent)} d'un jour de chômage pour chaque jour d'ERTE.`,
      source: 'Art. 269.5 LGSS',
    };
  return {
    title,
    text: "Oui. Chaque jour d'ERTE avec le contrat suspendu consomme un jour du chômage qui vous resterait pour plus tard.",
    source: 'Art. 269 LGSS',
  };
}

function contributionBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (e.contribution.kind === 'minimum')
    return {
      title: 'Combien il faut avoir cotisé',
      text: `Il faut ${e.contribution.days} jours cotisés au cours des 6 dernières années, non utilisés pour une autre allocation chômage.`,
      source: 'Arts. 266.b et 269 LGSS',
    };
  return {
    title: 'Combien il faut avoir cotisé',
    text: "Aucune période minimale de cotisation n'est exigée.",
    source: regime === 'red' ? 'DA 41.ª.1 LGSS' : 'DA 46.ª LGSS',
  };
}

export function ertePositiveView(input: ErteInput, e: ErteEstimate): ErteView {
  return {
    title: "Votre allocation chômage pendant l'ERTE (estimation)",
    lead: LEAD,
    blocks: [
      amountBlock(input, e),
      unemploymentBlock(input.regime, e),
      consumptionBlock(input, e),
      contributionBlock(input.regime, e),
      ...(e.jobSeekerRegistration
        ? [
            {
              title: 'Comment la demander',
              text: "La demande est présentée par l'entreprise en votre nom, dans un délai d'un mois à compter de l'autorisation de la mesure par l'autorité du travail. Pour la percevoir, l'inscription comme demandeur d'emploi (demandante de empleo) est obligatoire.",
              source: 'DA 41.ª.2 LGSS',
            },
          ]
        : []),
    ],
  };
}

export const erteUnknownView = (): ErteView => ({
  title: "Sans le type d'ERTE, pas de chiffre unique",
  lead: "La notification de l'entreprise indique de quel type il est. En attendant, voici comment les règles changent.",
  blocks: [
    {
      title: 'Causes économiques, techniques, organisationnelles ou de production',
      text: '70\u00a0% de votre base les 180 premiers jours de prestation et 60\u00a0% ensuite, dans les limites des minimums et maximums selon les enfants à charge. Il consomme votre chômage futur et il faut 360 jours cotisés au cours des 6 dernières années, non utilisés pour une autre allocation chômage.',
      source: 'Arts. 266.b, 269 et 270 LGSS',
    },
    {
      title: 'Force majeure',
      text: "70\u00a0% de votre base pendant toute la durée de l'ERTE, dans les limites des minimums et maximums selon les enfants à charge. Il ne consomme pas les cotisations que vous aviez déjà et aucune période minimale de cotisation n'est exigée.",
      source: 'DA 46.ª LGSS',
    },
    {
      title: 'Mécanisme RED',
      text: `70\u00a0% de votre base pendant toute la durée de l'ERTE, avec un plafond de ${capText(RED_MONTHLY_CAP)} par mois, soit 225\u00a0% de l'IPREM plus un sixième. Le temps pendant lequel vous percevez la prestation n'est pas considéré comme consommé, aucune période minimale de cotisation n'est exigée et l'inscription comme demandeur d'emploi est obligatoire.`,
      source: 'DA 41.ª LGSS',
    },
  ],
});

export const ERTE_GUIDE = {
  title: "Comment se calcule l'allocation chômage pendant un ERTE",
  sheetTitle: "Les trois types d'ERTE",
  sheetLead:
    "Ce qui change pour le chômage avec chacun : le montant, s'il consomme le chômage futur et la cotisation.",
  nextTitle: 'Pour aller plus loin',
  nextHub: 'Chômage',
  hubPath: 'paro/',
} as const;

export const ERTE_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: 'Ai-je droit au chômage si mon ERTE réduit mon temps de travail ?',
    answer:
      "Oui, si vous remplissez les conditions de votre type d'ERTE, au titre du chômage partiel lorsque la réduction temporaire de votre durée ordinaire de travail journalière est comprise entre 10 et 70\u00a0% (arts. 262.3 LGSS et 47.7.a ET). La prestation est proportionnelle à cette réduction (art. 270.5 LGSS).",
  },
  {
    question: 'Un ERTE consomme-t-il mon chômage pour plus tard ?',
    answer:
      "Cela dépend du type. Dans l'ERTE pour causes économiques, techniques, organisationnelles ou de production, oui : chaque jour consomme du chômage, et en cas de réduction du temps de travail il se consomme par heures (art. 269.5 LGSS). Dans celui pour force majeure, les cotisations que vous aviez déjà ne sont pas consommées (DA 46.ª LGSS), et dans le mécanisme RED le temps pendant lequel vous percevez la prestation n'est pas considéré comme consommé (DA 41.ª.8 LGSS).",
  },
  {
    question: 'Faut-il avoir cotisé un minimum pour percevoir le chômage pendant un ERTE ?',
    answer:
      "Dans l'ERTE pour causes économiques, techniques, organisationnelles ou de production, il faut 360 jours cotisés au cours des 6 dernières années, non utilisés pour une autre allocation chômage (arts. 266.b et 269 LGSS). Dans celui pour force majeure et dans le mécanisme RED, aucune période minimale de cotisation n'est exigée (DA 46.ª et DA 41.ª.1 LGSS).",
  },
  {
    question: 'Que faire si je ne sais pas de quel type est mon ERTE ?',
    answer:
      "La notification que l'entreprise vous a envoyée indique de quel type il est. En attendant, choisissez « Je ne sais pas » dans le formulaire et vous verrez comment les règles changent pour chaque type, sans chiffre unique.",
  },
];

export const ERTE_ERRORS = {
  regime: 'Choisissez une option ; « Je ne sais pas » convient aussi',
  measure: 'Choisissez une option',
  percent: `Saisissez un pourcentage entre ${MIN_REDUCTION_PERCENT} et ${MAX_REDUCTION_PERCENT}`,
  base: 'Saisissez la base en euros par mois, par exemple 1.500,00',
  children: 'Choisissez une option ; « Je préfère ne pas le dire » convient aussi',
} as const;

export const ERTE: ErteCopy = {
  page: ERTE_PAGE,
  crumb: 'Allocation chômage pendant un ERTE',
  legal: ERTE_LEGAL,
  questions: ERTE_QUESTIONS,
  errors: ERTE_ERRORS,
  guide: ERTE_GUIDE,
  faq: ERTE_FAQ,
  positiveView: ertePositiveView,
  unknownView: erteUnknownView,
};
