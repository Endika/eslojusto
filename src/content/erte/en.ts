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

// The ERTE benefit page in English, with the same shape as es.ts (./copy.ts).

export const ERTE_PAGE = {
  title: 'Unemployment benefit during an ERTE: how much you would receive a month',
  description:
    'With the type of ERTE (temporary lay-off scheme) in your notice, and whether it suspends the contract or reduces your working hours, and your benefit base, estimate your monthly unemployment benefit and whether it uses up your future benefit.',
  h1: 'Unemployment benefit during an ERTE',
  lead: 'An ERTE (temporary lay-off scheme) can give entitlement to unemployment benefit (paro) while it lasts. How much you receive, and whether it uses up the benefit you have left for later, depends on the type of ERTE.',
  beta: 'Beta',
  betaNote:
    'An approximate estimate with figures you enter yourself; it does not replace what SEPE recognises.',
  noJs: 'This estimate needs JavaScript.',
  button: 'Calculate',
  restart: 'Start again',
} as const;

// The paragraphs of the legal notice about the page.
export const ERTE_LEGAL = {
  title: 'The estimate of unemployment benefit during an ERTE',
  does: 'It estimates gross monthly unemployment benefit during an ERTE (temporary lay-off scheme) for economic, technical, organisational or production reasons, for force majeure or under the mecanismo RED, with the benefit base (base reguladora) and the figures you enter yourself: the amount with its limits, whether it is total or partial unemployment, whether it uses up the benefit you have left for later and the contributions required. Each block carries the article of the Ley General de la Seguridad Social it comes from, including its additional provisions 41.ª and 46.ª.',
  doesNot:
    'It does not calculate your benefit base or what you receive net, it does not check whether you meet the requirements or whether the ERTE is valid, and it does not replace what SEPE recognises. It gives information about the law and is not legal advice.',
  beta: 'This is a section in testing: it may contain errors while it is checked against real cases. If you see a figure that does not match the law, you can write to',
} as const;

export const ERTE_QUESTIONS = {
  regime: {
    question: 'What type of ERTE are you in?',
    help: 'It says so in the notice your employer sent you.',
    options: [
      ['etop', 'For economic, technical, organisational or production reasons'],
      ['force_majeure', 'For force majeure'],
      ['red', 'Mecanismo RED'],
      ['unknown', "I don't know"],
    ],
  },
  measure: {
    question: 'Does your ERTE suspend the contract or reduce your working hours?',
    options: [
      ['suspension', 'It suspends the contract'],
      ['reduction', 'It reduces working hours'],
    ],
  },
  percent: {
    label: 'Percentage reduction in working hours',
    hint: 'Between 10 and 70. For example, 40 if you work 40\u00a0% fewer hours.',
  },
  base: {
    question: 'What is your benefit base?',
    label: 'Benefit base per month',
    hint: 'Gross in euros per month: the average of the unemployment contributions in the last 180 days, without overtime.',
    hintRed:
      'Gross in euros per month: the average of the contribution bases for accidents at work and occupational diseases at that employer in the 180 days before the measure, or in the days you have been there if fewer, without overtime.',
  },
  children: {
    question: 'How many dependent sons or daughters do you have?',
    help: 'It changes the minimum and maximum of your unemployment benefit.',
    options: [
      ['0', 'None'],
      ['1', '1'],
      ['2', '2 or more'],
      ['not_said', "I'd rather not say"],
    ],
  },
} as const;

const LEAD =
  'A gross estimate with the figures you have entered. The figure that counts is the one SEPE recognises.';

// «about 1.225 €», or «between 560 € and 1.225 €» when the readings differ by more than a euro.
function amount(r: Range): string {
  const lo = Math.round(r.min);
  const hi = Math.round(r.max);
  return lo === hi ? `about ${wholeEuros(lo)}` : `between ${wholeEuros(lo)} and ${wholeEuros(hi)}`;
}

// A cap reads to the euro when it is whole, never rounded past the law.
const capText = (n: number): string => (Number.isInteger(n) ? wholeEuros(n) : euros(n));

const percentText = (n: number): string => `${Number(n.toFixed(2)).toLocaleString('es-ES')}\u00a0%`;

const REGIME_SOURCE = {
  etop: 'Arts. 269 and 270 LGSS',
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
  return `between ${wholeEuros(lo)} and ${wholeEuros(hi)}`;
}

function amountBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const reduction = input.measure.kind === 'reduction' ? input.measure : null;
  const rate =
    input.regime === 'etop'
      ? `It is 70\u00a0% of your base for the first 180 days of benefit and 60\u00a0% from day 181 (art. 270.2 LGSS).`
      : `It is 70\u00a0% of your base for the whole ERTE (${input.regime === 'red' ? 'DA 41.ª.4' : 'DA 46.ª'} LGSS).`;
  const first = amount(e.firstStretch);
  const second = e.secondStretch === null ? null : amount(e.secondStretch);
  const figure = belowFullTimeMinimum(input)
    ? `With a base below the minimum for full-time work (${euros(BENEFIT_2026.minBaseAtep)}), the working hours are part-time, and then the minimum and maximum go down in proportion to your hours (art. 270.3 LGSS). Without your hours, this estimate gives no figure.`
    : second === null
      ? `${capitalise(first)} a month.`
      : second === first
        ? `${capitalise(first)} a month, before and after day 181.`
        : `${capitalise(first)} a month for the first 180 days of benefit and ${second} from day 181.`;
  const limit =
    input.regime === 'red'
      ? `With a cap of ${capText(RED_MONTHLY_CAP)} a month, 225\u00a0% of the IPREM plus one sixth, and no minimum of its own (DA 41.ª.4 LGSS).`
      : belowFullTimeMinimum(input)
        ? ''
        : `With the minimum and maximum depending on your dependent sons or daughters (art. 270.3 LGSS): ${capCopy(input.children)} a month with full-time work.`;
  const proportion = reduction
    ? input.regime === 'red'
      ? ` As the ERTE reduces your working hours by ${percentText(reduction.percent)}, the review takes the benefit in proportion to that reduction, as with unemployment benefit for reduced working hours (art. 270.5 LGSS). Additional provision 41.ª does not say how it is calculated under the mecanismo RED: this is the review's own approach.`
      : ` As the ERTE reduces your working hours by ${percentText(reduction.percent)}, the benefit is proportional to that reduction (art. 270.5 LGSS); only the temporary reduction under art. 47 ET counts.`
    : '';
  return {
    title: 'How much you would receive',
    text: [figure, rate, limit].filter(Boolean).join(' ') + proportion,
    source:
      input.regime === 'etop' ? 'Arts. 270.2, 270.3 and 270.5 LGSS' : REGIME_SOURCE[input.regime],
  };
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function unemploymentBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (regime === 'red')
    return {
      title: 'Which benefit it is',
      text: 'Under the mecanismo RED its own benefit is paid, whether it suspends the contract or reduces working hours, and not the general unemployment benefit.',
      source: 'DA 41.ª.1 LGSS',
    };
  return e.unemployment === 'total'
    ? {
        title: 'What type of unemployment it is',
        text: 'An ERTE that suspends your contract is a legal situation of total unemployment.',
        source: 'Arts. 262.2 and 267.1.b.1.º LGSS',
      }
    : {
        title: 'What type of unemployment it is',
        text: 'An ERTE that reduces your working hours is a legal situation of partial unemployment. If the reduction is applied in whole days, those days are total unemployment.',
        source: 'Arts. 262.2, 262.3 and 267.1.c LGSS',
      };
}

function consumptionBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const title = 'Does it use up your future unemployment benefit?';
  if (!e.consumption.consumes)
    return {
      title,
      text:
        input.regime === 'red'
          ? 'No. The time you receive benefit under the mecanismo RED is not considered used up.'
          : 'Receiving it does not use up the contributions you already had: «el acceso a esta prestación no implicará el consumo de las cotizaciones previamente efectuadas a ningún efecto» (access to this benefit will not use up the contributions previously paid for any purpose).',
      source: input.regime === 'red' ? 'DA 41.ª.8 LGSS' : 'DA 46.ª.b LGSS',
    };
  if (input.measure.kind === 'reduction')
    return {
      title,
      text: `Yes. With reduced working hours it is used up by hours, in the same percentage as the reduction: ${percentText(input.measure.percent)} of a day of unemployment benefit for each day of ERTE.`,
      source: 'Art. 269.5 LGSS',
    };
  return {
    title,
    text: 'Yes. Each day of ERTE with the contract suspended uses up one day of the unemployment benefit you have left for later.',
    source: 'Art. 269 LGSS',
  };
}

function contributionBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (e.contribution.kind === 'minimum')
    return {
      title: 'How much you need to have contributed',
      text: `You need ${e.contribution.days} days of contributions in the last 6 years that you have not used for another period of unemployment benefit.`,
      source: 'Arts. 266.b and 269 LGSS',
    };
  return {
    title: 'How much you need to have contributed',
    text: 'No minimum contribution period is required.',
    source: regime === 'red' ? 'DA 41.ª.1 LGSS' : 'DA 46.ª LGSS',
  };
}

export function ertePositiveView(input: ErteInput, e: ErteEstimate): ErteView {
  return {
    title: 'Your unemployment benefit during the ERTE (estimate)',
    lead: LEAD,
    blocks: [
      amountBlock(input, e),
      unemploymentBlock(input.regime, e),
      consumptionBlock(input, e),
      contributionBlock(input.regime, e),
      ...(e.jobSeekerRegistration
        ? [
            {
              title: 'How to apply',
              text: 'The application is submitted by the employer on your behalf, within one month of the labour authority authorising the measure. To receive it you have to be registered as a jobseeker.',
              source: 'DA 41.ª.2 LGSS',
            },
          ]
        : []),
    ],
  };
}

export const erteUnknownView = (): ErteView => ({
  title: 'Without the type of ERTE there is no single figure',
  lead: "Your employer's notice says which type it is. In the meantime, this is how the rules change.",
  blocks: [
    {
      title: 'Economic, technical, organisational or production reasons',
      text: '70\u00a0% of your base for the first 180 days of benefit and 60\u00a0% after that, within the minimums and maximums for sons or daughters. It uses up your future unemployment benefit, and you need 360 days of contributions in the last 6 years that you have not used for another period of unemployment benefit.',
      source: 'Arts. 266.b, 269 and 270 LGSS',
    },
    {
      title: 'Force majeure',
      text: '70\u00a0% of your base for the whole ERTE, within the minimums and maximums for sons or daughters. It does not use up the contributions you already had and no minimum contribution period is required.',
      source: 'DA 46.ª LGSS',
    },
    {
      title: 'Mecanismo RED',
      text: `70\u00a0% of your base for the whole ERTE, with a cap of ${capText(RED_MONTHLY_CAP)} a month, 225\u00a0% of the IPREM plus one sixth. The time you receive it is not considered used up, no minimum contribution period is required and you have to be registered as a jobseeker.`,
      source: 'DA 41.ª LGSS',
    },
  ],
});

export const ERTE_GUIDE = {
  title: 'How unemployment benefit is calculated during an ERTE',
  sheetTitle: 'The three types of ERTE',
  sheetLead:
    'What changes in unemployment benefit with each one: the amount, whether it uses up future benefit and the contributions.',
  nextTitle: 'Keep reading',
  nextHub: 'Unemployment benefit',
  hubPath: 'paro/',
} as const;

export const ERTE_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: 'Do I receive unemployment benefit if my ERTE reduces my working hours?',
    answer:
      'Yes, if you meet the requirements for your type of ERTE, as partial unemployment when the temporary reduction in your ordinary daily working hours is between 10 and 70\u00a0% (arts. 262.3 LGSS and 47.7.a ET). The benefit is proportional to that reduction (art. 270.5 LGSS).',
  },
  {
    question: 'Does an ERTE use up my unemployment benefit for later?',
    answer:
      'It depends on the type. In an ERTE for economic, technical, organisational or production reasons, yes: each day uses up benefit, and with reduced working hours it is used up by hours (art. 269.5 LGSS). In a force majeure ERTE it does not use up the contributions you already had (DA 46.ª LGSS), and under the mecanismo RED the time you receive benefit is not considered used up (DA 41.ª.8 LGSS).',
  },
  {
    question:
      'Do I need a minimum period of contributions to receive unemployment benefit in an ERTE?',
    answer:
      'In an ERTE for economic, technical, organisational or production reasons you need 360 days of contributions in the last 6 years that you have not used for another period of unemployment benefit (arts. 266.b and 269 LGSS). In a force majeure ERTE and under the mecanismo RED no minimum contribution period is required (DA 46.ª and DA 41.ª.1 LGSS).',
  },
  {
    question: 'What if I do not know which type my ERTE is?',
    answer:
      "The notice your employer sent you says which type it is. In the meantime, choose “I don't know” in the form and you will see how the rules change for each type, without a single figure.",
  },
];

export const ERTE_ERRORS = {
  regime: "Choose an option; “I don't know” is also valid",
  measure: 'Choose an option',
  percent: `Enter a percentage between ${MIN_REDUCTION_PERCENT} and ${MAX_REDUCTION_PERCENT}`,
  base: 'Enter the base in euros per month, for example 1.500,00',
  children: "Choose an option; “I'd rather not say” is also valid",
} as const;

export const ERTE: ErteCopy = {
  page: ERTE_PAGE,
  crumb: 'Unemployment benefit during an ERTE',
  legal: ERTE_LEGAL,
  questions: ERTE_QUESTIONS,
  errors: ERTE_ERRORS,
  guide: ERTE_GUIDE,
  faq: ERTE_FAQ,
  positiveView: ertePositiveView,
  unknownView: erteUnknownView,
};
