import type { Range } from '../engine/money';
import {
  RED_MONTHLY_CAP,
  type ErteEstimate,
  type ErteInput,
  type ErteRegime,
} from '../engine/erte';
import { BENEFIT_2026 } from '../engine/unemployment';
import { euros, wholeEuros } from './format';

// The ERTE benefit page is Spanish only, like the landing pages, and its words live here rather
// than in the dictionary so that a build without the page ships none of them.
export interface ErteBlock {
  readonly title: string;
  readonly text: string;
  // The article that backs the block.
  readonly source: string;
}

export interface ErteView {
  readonly title: string;
  readonly lead: string;
  readonly blocks: readonly ErteBlock[];
}

export const ERTE_PAGE = {
  title: 'Paro durante un ERTE: cuánto cobrarías al mes',
  description:
    'Con el tipo de ERTE de tu comunicación, si suspende el contrato o reduce la jornada y tu base, estima el paro al mes y si gasta tu paro futuro.',
  h1: 'Paro durante un ERTE',
  lead: 'Un ERTE puede dar derecho a paro mientras dure. Cuánto cobras, y si gasta el paro que te quede para más adelante, depende del tipo de ERTE.',
  beta: 'Beta',
  betaNote:
    'Estimación aproximada con datos que escribes tú; no sustituye lo que reconozca el SEPE.',
  noJs: 'Esta estimación necesita JavaScript.',
  button: 'Calcular',
  restart: 'Empezar de nuevo',
} as const;

export const ERTE_QUESTIONS = {
  regime: {
    question: '¿Qué tipo de ERTE tienes?',
    help: 'Lo pone en la comunicación que te mandó la empresa.',
    options: [
      ['etop', 'Por causas económicas, técnicas, organizativas o de producción'],
      ['force_majeure', 'Por fuerza mayor'],
      ['red', 'Mecanismo RED'],
      ['unknown', 'No lo sé'],
    ],
  },
  measure: {
    question: '¿Tu ERTE suspende el contrato o reduce la jornada?',
    options: [
      ['suspension', 'Suspende el contrato'],
      ['reduction', 'Reduce la jornada'],
    ],
  },
  percent: {
    label: 'Porcentaje de reducción de la jornada',
    hint: 'Entre 10 y 70. Por ejemplo, 40 si trabajas un 40\u00a0% menos de horas.',
  },
  base: {
    question: '¿Cuál es tu base reguladora?',
    label: 'Base reguladora al mes',
    hint: 'Bruto en euros al mes: la media de lo cotizado por desempleo en los últimos 180 días, sin horas extra.',
    hintRed:
      'Bruto en euros al mes: la media de las bases de cotización por accidentes de trabajo y enfermedades profesionales en esa empresa en los 180 días anteriores a la medida, o en los que lleves si son menos.',
  },
  children: {
    question: '¿Cuántos hijos o hijas tienes a tu cargo?',
    help: 'Cambia el mínimo y el máximo de tu paro.',
    options: [
      ['0', 'Ninguno'],
      ['1', '1'],
      ['2', '2 o más'],
      ['not_said', 'Prefiero no decirlo'],
    ],
  },
} as const;

const LEAD =
  'Una estimación bruta con los datos que has escrito. La cifra que vale es la que reconozca el SEPE.';

// «unos 1.225 €», or «entre 560 € y 1.225 €» when the readings differ by more than a euro.
function amount(r: Range): string {
  const lo = Math.round(r.min);
  const hi = Math.round(r.max);
  return lo === hi ? `unos ${wholeEuros(lo)}` : `entre ${wholeEuros(lo)} y ${wholeEuros(hi)}`;
}

const percentText = (n: number): string => `${Number(n.toFixed(2)).toLocaleString('es-ES')}\u00a0%`;

const REGIME_SOURCE = {
  etop: 'Arts. 269 y 270 LGSS',
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
  return `entre ${wholeEuros(lo)} y ${wholeEuros(hi)}`;
}

function amountBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const reduction = input.measure.kind === 'reduction' ? input.measure : null;
  const rate =
    input.regime === 'etop'
      ? `Es el 70\u00a0% de tu base los primeros 180 días de prestación y el 60\u00a0% desde el día 181 (art. 270.2 LGSS).`
      : `Es el 70\u00a0% de tu base durante todo el ERTE (${input.regime === 'red' ? 'DA 41.ª.4' : 'DA 46.ª'} LGSS).`;
  const figure =
    e.secondStretch === null
      ? `${capitalise(amount(e.firstStretch))} al mes.`
      : `${capitalise(amount(e.firstStretch))} al mes los primeros 180 días y ${amount(e.secondStretch)} desde el día 181.`;
  const limit =
    input.regime === 'red'
      ? `Con un tope de ${euros(RED_MONTHLY_CAP)} al mes, el 225\u00a0% del IPREM más un sexto, y sin mínimo propio (DA 41.ª.4 LGSS).`
      : `Con el mínimo y el máximo según tus hijos o hijas a cargo (art. 270.3 LGSS): ${capCopy(input.children)} al mes con jornada completa.`;
  const proportion = reduction
    ? ` Como el ERTE reduce tu jornada un ${percentText(reduction.percent)}, la prestación es proporcional a esa reducción (art. 270.5 LGSS); solo cuenta la reducción temporal del art. 47 ET.`
    : '';
  return {
    title: 'Cuánto cobrarías',
    text: `${figure} ${rate} ${limit}${proportion}`,
    source:
      input.regime === 'etop' ? 'Arts. 270.2, 270.3 y 270.5 LGSS' : REGIME_SOURCE[input.regime],
  };
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function unemploymentBlock(e: ErteEstimate): ErteBlock {
  return e.unemployment === 'total'
    ? {
        title: 'Qué tipo de desempleo es',
        text: 'Un ERTE que suspende tu contrato es una situación legal de desempleo total.',
        source: 'Arts. 262.2 y 267.1.b.1.º LGSS',
      }
    : {
        title: 'Qué tipo de desempleo es',
        text: 'Un ERTE que reduce tu jornada es una situación legal de desempleo parcial.',
        source: 'Arts. 262.3 y 267.1.c LGSS',
      };
}

function consumptionBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const title = '¿Gasta tu paro futuro?';
  if (!e.consumption.consumes)
    return {
      title,
      text:
        input.regime === 'red'
          ? 'No. El tiempo que cobres en el mecanismo RED no se considera consumido.'
          : 'No. Cobrar el paro por un ERTE de fuerza mayor no gasta las cotizaciones que ya tenías.',
      source: input.regime === 'red' ? 'DA 41.ª.8 LGSS' : 'DA 46.ª.b LGSS',
    };
  if (input.measure.kind === 'reduction')
    return {
      title,
      text: `Sí. Con una reducción de jornada se gasta por horas, en el mismo porcentaje que la reducción: un ${percentText(input.measure.percent)} de un día de paro por cada día de ERTE.`,
      source: 'Art. 269.5 LGSS',
    };
  return {
    title,
    text: 'Sí. Cada día de ERTE con el contrato suspendido gasta un día del paro que te quede para más adelante.',
    source: 'Art. 269 LGSS',
  };
}

function contributionBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (e.contribution.kind === 'minimum')
    return {
      title: 'Cuánto hay que haber cotizado',
      text: `Hacen falta ${e.contribution.days} días cotizados en los últimos 6 años que no hayas usado para otro paro.`,
      source: 'Arts. 266.b y 269 LGSS',
    };
  return {
    title: 'Cuánto hay que haber cotizado',
    text: 'No hace falta un período mínimo de cotización.',
    source: regime === 'red' ? 'DA 41.ª.1 LGSS' : 'DA 46.ª LGSS',
  };
}

export function ertePositiveView(input: ErteInput, e: ErteEstimate): ErteView {
  return {
    title: 'Tu paro durante el ERTE (estimación)',
    lead: LEAD,
    blocks: [
      amountBlock(input, e),
      unemploymentBlock(e),
      consumptionBlock(input, e),
      contributionBlock(input.regime, e),
      ...(e.jobSeekerRegistration
        ? [
            {
              title: 'Cómo pedirlo',
              text: 'Para cobrarlo en el mecanismo RED tienes que estar inscrito como demandante de empleo.',
              source: 'DA 41.ª.2.c LGSS',
            },
          ]
        : []),
    ],
  };
}

export const erteUnknownView = (): ErteView => ({
  title: 'Sin el tipo de ERTE no hay una sola cifra',
  lead: 'La comunicación de la empresa dice de qué tipo es. Mientras tanto, así cambian las reglas.',
  blocks: [
    {
      title: 'Causas económicas, técnicas, organizativas o de producción',
      text: 'El 70\u00a0% de tu base los primeros 180 días y el 60\u00a0% después, dentro de los mínimos y máximos por hijos o hijas. Gasta tu paro futuro y hacen falta 360 días cotizados en los últimos 6 años que no hayas usado para otro paro.',
      source: 'Arts. 266.b, 269 y 270 LGSS',
    },
    {
      title: 'Fuerza mayor',
      text: 'El 70\u00a0% de tu base durante todo el ERTE, dentro de los mínimos y máximos por hijos o hijas. No gasta las cotizaciones que ya tenías y no hace falta un período mínimo de cotización.',
      source: 'DA 46.ª LGSS',
    },
    {
      title: 'Mecanismo RED',
      text: `El 70\u00a0% de tu base durante todo el ERTE, con un tope de ${euros(RED_MONTHLY_CAP)} al mes, el 225\u00a0% del IPREM más un sexto. El tiempo que cobres no se considera consumido, no hace falta un período mínimo de cotización y tienes que estar inscrito como demandante de empleo.`,
      source: 'DA 41.ª LGSS',
    },
  ],
});

export const ERTE_GUIDE = {
  title: 'Cómo se calcula el paro durante un ERTE',
  sheetTitle: 'Los tres tipos de ERTE',
  sheetLead:
    'Lo que cambia en el paro con cada uno: la cuantía, si gasta el paro futuro y la cotización.',
  nextTitle: 'Sigue leyendo',
  nextHub: 'Paro',
  hubPath: 'paro/',
} as const;

export const ERTE_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: '¿Cobro paro si mi ERTE reduce la jornada?',
    answer:
      'Sí, como desempleo parcial, cuando la reducción temporal de tu jornada diaria ordinaria es de entre un 10 y un 70\u00a0% (arts. 262.3 LGSS y 47.7.a ET). La prestación es proporcional a esa reducción (art. 270.5 LGSS).',
  },
  {
    question: '¿Un ERTE gasta mi paro para más adelante?',
    answer:
      'Depende del tipo. En el ERTE por causas económicas, técnicas, organizativas o de producción, sí: cada día gasta paro, y en una reducción de jornada se gasta por horas (art. 269.5 LGSS). En el de fuerza mayor no gasta las cotizaciones que ya tenías (DA 46.ª LGSS), y en el mecanismo RED el tiempo que cobres no se considera consumido (DA 41.ª.8 LGSS).',
  },
  {
    question: '¿Hace falta haber cotizado un mínimo para cobrar paro en un ERTE?',
    answer:
      'En el ERTE por causas económicas, técnicas, organizativas o de producción hacen falta 360 días cotizados en los últimos 6 años que no hayas usado para otro paro (arts. 266.b y 269 LGSS). En el de fuerza mayor y en el mecanismo RED no hace falta un período mínimo de cotización (DA 46.ª y DA 41.ª.1 LGSS).',
  },
  {
    question: '¿Qué hago si no sé de qué tipo es mi ERTE?',
    answer:
      'La comunicación que te mandó la empresa dice de qué tipo es. Mientras tanto, elige «No lo sé» en el formulario y verás cómo cambian las reglas en cada tipo, sin una sola cifra.',
  },
];
