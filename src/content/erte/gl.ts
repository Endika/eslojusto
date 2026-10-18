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

// The ERTE benefit page in Galician, with the same shape as es.ts (./copy.ts).

export const ERTE_PAGE = {
  title: 'Paro durante un ERTE: canto cobrarías ao mes',
  description:
    'Co tipo de ERTE da túa comunicación, se suspende o contrato ou reduce a xornada e a túa base, estima o paro ao mes e se gasta o teu paro futuro.',
  h1: 'Paro durante un ERTE',
  lead: 'Un ERTE pode dar dereito a paro mentres dure. Canto cobras, e se gasta o paro que che quede para máis adiante, depende do tipo de ERTE.',
  beta: 'Beta',
  betaNote: 'Estimación aproximada con datos que escribes ti; non substitúe o que recoñeza o SEPE.',
  noJs: 'Esta estimación necesita JavaScript.',
  button: 'Calcular',
  restart: 'Comezar de novo',
} as const;

// The paragraphs of the legal notice about the page.
export const ERTE_LEGAL = {
  title: 'A estimación do paro durante un ERTE',
  does: 'Estima o paro bruto ao mes durante un ERTE por causas económicas, técnicas, organizativas ou de produción, por forza maior ou do mecanismo RED, coa base reguladora e os datos que escribes ti: a contía cos seus límites, se é desemprego total ou parcial, se gasta o paro que che quede para máis adiante e a cotización que fai falta. Cada bloque indica o artigo da Ley General de la Seguridad Social do que sae, tamén das súas disposicións adicionais 41.ª e 46.ª.',
  doesNot:
    'Non calcula a túa base reguladora nin o que cobras en neto, non comproba se cumpres os requisitos nin se o ERTE é válido, e non substitúe o que recoñeza o SEPE. Informa sobre a lei e non é asesoramento xurídico.',
  beta: 'É unha sección en probas: pode ter erros mentres se revisa con casos reais. Se ves unha cifra que non cadra coa lei, podes escribir a',
} as const;

export const ERTE_QUESTIONS = {
  regime: {
    question: 'Que tipo de ERTE tes?',
    help: 'Indícao a comunicación que che mandou a empresa.',
    options: [
      ['etop', 'Por causas económicas, técnicas, organizativas ou de produción'],
      ['force_majeure', 'Por forza maior'],
      ['red', 'Mecanismo RED'],
      ['unknown', 'Non o sei'],
    ],
  },
  measure: {
    question: 'O teu ERTE suspende o contrato ou reduce a xornada?',
    options: [
      ['suspension', 'Suspende o contrato'],
      ['reduction', 'Reduce a xornada'],
    ],
  },
  percent: {
    label: 'Porcentaxe de redución da xornada',
    hint: 'Entre 10 e 70. Por exemplo, 40 se traballas un 40\u00a0% menos de horas.',
  },
  base: {
    question: 'Cal é a túa base reguladora?',
    label: 'Base reguladora ao mes',
    hint: 'Bruto en euros ao mes: a media do cotizado por desemprego nos últimos 180 días, sen horas extraordinarias.',
    hintRed:
      'Bruto en euros ao mes: a media das bases de cotización por accidentes de traballo e enfermidades profesionais nesa empresa nos 180 días anteriores á medida, ou nos que leves se son menos, sen horas extraordinarias.',
  },
  children: {
    question: 'Cantos fillos ou fillas tes ao teu cargo?',
    help: 'Cambia o mínimo e o máximo do teu paro.',
    options: [
      ['0', 'Ningún'],
      ['1', '1'],
      ['2', '2 ou máis'],
      ['not_said', 'Prefiro non dicilo'],
    ],
  },
} as const;

const LEAD =
  'Unha estimación bruta cos datos que escribiches. A cifra que vale é a que recoñeza o SEPE.';

// «uns 1.225 €», or «entre 560 € e 1.225 €» when the readings differ by more than a euro.
function amount(r: Range): string {
  const lo = Math.round(r.min);
  const hi = Math.round(r.max);
  return lo === hi ? `uns ${wholeEuros(lo)}` : `entre ${wholeEuros(lo)} e ${wholeEuros(hi)}`;
}

// A cap reads to the euro when it is whole, never rounded past the law.
const capText = (n: number): string => (Number.isInteger(n) ? wholeEuros(n) : euros(n));

const percentText = (n: number): string => `${Number(n.toFixed(2)).toLocaleString('es-ES')}\u00a0%`;

const REGIME_SOURCE = {
  etop: 'Arts. 269 e 270 LGSS',
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
  return `entre ${wholeEuros(lo)} e ${wholeEuros(hi)}`;
}

function amountBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const reduction = input.measure.kind === 'reduction' ? input.measure : null;
  const rate =
    input.regime === 'etop'
      ? `É o 70\u00a0% da túa base os primeiros 180 días de prestación e o 60\u00a0% desde o día 181 (art. 270.2 LGSS).`
      : `É o 70\u00a0% da túa base durante todo o ERTE (${input.regime === 'red' ? 'DA 41.ª.4' : 'DA 46.ª'} LGSS).`;
  const first = amount(e.firstStretch);
  const second = e.secondStretch === null ? null : amount(e.secondStretch);
  const figure = belowFullTimeMinimum(input)
    ? `Cunha base por debaixo da mínima dunha xornada completa (${euros(BENEFIT_2026.minBaseAtep)}), a xornada é parcial, e entón o mínimo e o máximo baixan en proporción ás túas horas (art. 270.3 LGSS). Sen as túas horas, esta estimación non dá unha cifra.`
    : second === null
      ? `${capitalise(first)} ao mes.`
      : second === first
        ? `${capitalise(first)} ao mes, antes e despois do día 181.`
        : `${capitalise(first)} ao mes os primeiros 180 días de prestación e ${second} desde o día 181.`;
  const limit =
    input.regime === 'red'
      ? `Cun límite de ${capText(RED_MONTHLY_CAP)} ao mes, o 225\u00a0% do IPREM máis un sexto, e sen mínimo propio (DA 41.ª.4 LGSS).`
      : belowFullTimeMinimum(input)
        ? ''
        : `Co mínimo e o máximo segundo os teus fillos ou fillas ao cargo (art. 270.3 LGSS): ${capCopy(input.children)} ao mes con xornada completa.`;
  const proportion = reduction
    ? input.regime === 'red'
      ? ` Como o ERTE reduce a túa xornada un ${percentText(reduction.percent)}, a revisión toma a prestación en proporción a esa redución, como no paro por redución de xornada (art. 270.5 LGSS). A disposición adicional 41.ª non di como se calcula no mecanismo RED: é un criterio da revisión.`
      : ` Como o ERTE reduce a túa xornada un ${percentText(reduction.percent)}, a prestación é proporcional a esa redución (art. 270.5 LGSS); só conta a redución temporal do art. 47 ET.`
    : '';
  return {
    title: 'Canto cobrarías',
    text: [figure, rate, limit].filter(Boolean).join(' ') + proportion,
    source:
      input.regime === 'etop' ? 'Arts. 270.2, 270.3 e 270.5 LGSS' : REGIME_SOURCE[input.regime],
  };
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function unemploymentBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (regime === 'red')
    return {
      title: 'Que prestación é',
      text: 'No mecanismo RED cóbrase a súa propia prestación, tanto se suspende o contrato como se reduce a xornada, e non a prestación por desemprego xeral.',
      source: 'DA 41.ª.1 LGSS',
    };
  return e.unemployment === 'total'
    ? {
        title: 'Que tipo de desemprego é',
        text: 'Un ERTE que suspende o teu contrato é unha situación legal de desemprego total.',
        source: 'Arts. 262.2 e 267.1.b.1.º LGSS',
      }
    : {
        title: 'Que tipo de desemprego é',
        text: 'Un ERTE que reduce a túa xornada é unha situación legal de desemprego parcial. Se a redución se aplica en días completos, eses días son desemprego total.',
        source: 'Arts. 262.2, 262.3 e 267.1.c LGSS',
      };
}

function consumptionBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const title = 'Gasta o teu paro futuro?';
  if (!e.consumption.consumes)
    return {
      title,
      text:
        input.regime === 'red'
          ? 'Non. O tempo que cobres no mecanismo RED non se considera consumido.'
          : 'Cobralo non gasta as cotizacións que xa tiñas: «el acceso a esta prestación no implicará el consumo de las cotizaciones previamente efectuadas a ningún efecto».',
      source: input.regime === 'red' ? 'DA 41.ª.8 LGSS' : 'DA 46.ª.b LGSS',
    };
  if (input.measure.kind === 'reduction')
    return {
      title,
      text: `Si. Cunha redución de xornada gástase por horas, na mesma porcentaxe que a redución: un ${percentText(input.measure.percent)} dun día de paro por cada día de ERTE.`,
      source: 'Art. 269.5 LGSS',
    };
  return {
    title,
    text: 'Si. Cada día de ERTE co contrato suspendido gasta un día do paro que che quede para máis adiante.',
    source: 'Art. 269 LGSS',
  };
}

function contributionBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (e.contribution.kind === 'minimum')
    return {
      title: 'Canto hai que ter cotizado',
      text: `Fan falta ${e.contribution.days} días cotizados nos últimos 6 anos que non usases para outro paro.`,
      source: 'Arts. 266.b e 269 LGSS',
    };
  return {
    title: 'Canto hai que ter cotizado',
    text: 'Non fai falta un período mínimo de cotización.',
    source: regime === 'red' ? 'DA 41.ª.1 LGSS' : 'DA 46.ª LGSS',
  };
}

export function ertePositiveView(input: ErteInput, e: ErteEstimate): ErteView {
  return {
    title: 'O teu paro durante o ERTE (estimación)',
    lead: LEAD,
    blocks: [
      amountBlock(input, e),
      unemploymentBlock(input.regime, e),
      consumptionBlock(input, e),
      contributionBlock(input.regime, e),
      ...(e.jobSeekerRegistration
        ? [
            {
              title: 'Como pedilo',
              text: 'A solicitude preséntaa a empresa no teu nome, no prazo dun mes desde que a autoridade laboral autoriza a medida. Para cobralo tes que estar inscrito ou inscrita como demandante de emprego.',
              source: 'DA 41.ª.2 LGSS',
            },
          ]
        : []),
    ],
  };
}

export const erteUnknownView = (): ErteView => ({
  title: 'Sen o tipo de ERTE non hai unha soa cifra',
  lead: 'A comunicación da empresa di de que tipo é. Mentres tanto, así cambian as regras.',
  blocks: [
    {
      title: 'Causas económicas, técnicas, organizativas ou de produción',
      text: 'O 70\u00a0% da túa base os primeiros 180 días de prestación e o 60\u00a0% despois, dentro dos mínimos e máximos por fillos ou fillas. Gasta o teu paro futuro e fan falta 360 días cotizados nos últimos 6 anos que non usases para outro paro.',
      source: 'Arts. 266.b, 269 e 270 LGSS',
    },
    {
      title: 'Forza maior',
      text: 'O 70\u00a0% da túa base durante todo o ERTE, dentro dos mínimos e máximos por fillos ou fillas. Non gasta as cotizacións que xa tiñas e non fai falta un período mínimo de cotización.',
      source: 'DA 46.ª LGSS',
    },
    {
      title: 'Mecanismo RED',
      text: `O 70\u00a0% da túa base durante todo o ERTE, cun límite de ${capText(RED_MONTHLY_CAP)} ao mes, o 225\u00a0% do IPREM máis un sexto. O tempo que cobres non se considera consumido, non fai falta un período mínimo de cotización e tes que estar inscrito ou inscrita como demandante de emprego.`,
      source: 'DA 41.ª LGSS',
    },
  ],
});

export const ERTE_GUIDE = {
  title: 'Como se calcula o paro durante un ERTE',
  sheetTitle: 'Os tres tipos de ERTE',
  sheetLead: 'O que cambia no paro con cada un: a contía, se gasta o paro futuro e a cotización.',
  nextTitle: 'Segue lendo',
  nextHub: 'Paro',
  hubPath: 'paro/',
} as const;

export const ERTE_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: 'Cobro paro se o meu ERTE reduce a xornada?',
    answer:
      'Si, se cumpres os requisitos do teu tipo de ERTE, como desemprego parcial cando a redución temporal da túa xornada diaria ordinaria é de entre un 10 e un 70\u00a0% (arts. 262.3 LGSS e 47.7.a ET). A prestación é proporcional a esa redución (art. 270.5 LGSS).',
  },
  {
    question: 'Un ERTE gasta o meu paro para máis adiante?',
    answer:
      'Depende do tipo. No ERTE por causas económicas, técnicas, organizativas ou de produción, si: cada día gasta paro, e nunha redución de xornada gástase por horas (art. 269.5 LGSS). No de forza maior non gasta as cotizacións que xa tiñas (DA 46.ª LGSS), e no mecanismo RED o tempo que cobres non se considera consumido (DA 41.ª.8 LGSS).',
  },
  {
    question: 'Fai falta ter cotizado un mínimo para cobrar paro nun ERTE?',
    answer:
      'No ERTE por causas económicas, técnicas, organizativas ou de produción fan falta 360 días cotizados nos últimos 6 anos que non usases para outro paro (arts. 266.b e 269 LGSS). No de forza maior e no mecanismo RED non fai falta un período mínimo de cotización (DA 46.ª e DA 41.ª.1 LGSS).',
  },
  {
    question: 'Que pasa se non sei de que tipo é o meu ERTE?',
    answer:
      'A comunicación que che mandou a empresa di de que tipo é. Mentres tanto, escolle «Non o sei» no formulario e verás como cambian as regras en cada tipo, sen unha soa cifra.',
  },
];

export const ERTE_ERRORS = {
  regime: 'Escolle unha opción; «Non o sei» tamén vale',
  measure: 'Escolle unha opción',
  percent: `Escribe unha porcentaxe entre ${MIN_REDUCTION_PERCENT} e ${MAX_REDUCTION_PERCENT}`,
  base: 'Escribe a base en euros ao mes, por exemplo 1.500,00',
  children: 'Escolle unha opción; «Prefiro non dicilo» tamén vale',
} as const;

export const ERTE: ErteCopy = {
  page: ERTE_PAGE,
  crumb: 'Paro durante un ERTE',
  legal: ERTE_LEGAL,
  questions: ERTE_QUESTIONS,
  errors: ERTE_ERRORS,
  guide: ERTE_GUIDE,
  faq: ERTE_FAQ,
  positiveView: ertePositiveView,
  unknownView: erteUnknownView,
};
