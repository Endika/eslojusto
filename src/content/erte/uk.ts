// source: f89d3a3982c4
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

// The ERTE benefit page in Ukrainian, with the same shape as es.ts (./copy.ts).

export const ERTE_PAGE = {
  title: 'Допомога по безробіттю під час ERTE: скільки ви отримували б щомісяця',
  description:
    'За типом ERTE з вашого повідомлення, залежно від того, чи воно призупиняє договір, чи скорочує робочий час, і за вашою базою розрахунку оцініть допомогу по безробіттю на місяць і те, чи витрачає вона вашу майбутню допомогу.',
  h1: 'Допомога по безробіттю під час ERTE',
  lead: 'ERTE (тимчасове призупинення або скорочення роботи) може давати право на допомогу по безробіттю (paro), поки воно триває. Скільки ви отримуєте і чи витрачається допомога, що залишиться вам на майбутнє, залежить від типу ERTE.',
  beta: 'Бета',
  betaNote: 'Приблизна оцінка за даними, які вводите ви; вона не замінює того, що визнає SEPE.',
  noJs: 'Для цієї оцінки потрібен JavaScript.',
  button: 'Розрахувати',
  restart: 'Почати спочатку',
} as const;

// The paragraphs of the legal notice about the page, only in a build that has it.
export const ERTE_LEGAL = {
  title: 'Оцінка допомоги по безробіттю під час ERTE',
  does: 'Оцінює допомогу по безробіттю брутто на місяць під час ERTE з економічних, технічних, організаційних або виробничих причин, через непереборну силу (fuerza mayor) або в межах механізму RED, за базою розрахунку (base reguladora) і даними, які вводите ви: суму з її межами, чи це повне, чи часткове безробіття, чи витрачається допомога, що залишиться вам на майбутнє, і які потрібні внески. Для кожного блоку вказано статтю Ley General de la Seguridad Social, з якої він випливає, зокрема з її додаткових положень 41.ª і 46.ª.',
  doesNot:
    'Не розраховує вашої бази розрахунку чи суми нетто, не перевіряє, чи ви відповідаєте вимогам і чи дійсне ERTE, і не замінює того, що визнає SEPE. Інформує про закон і не є юридичною консультацією.',
  beta: 'Це розділ у тестуванні: він може містити помилки, поки його перевіряють на реальних випадках. Якщо ви бачите цифру, яка не збігається із законом, можете написати на',
} as const;

export const ERTE_QUESTIONS = {
  regime: {
    question: 'Який у вас тип ERTE?',
    help: 'Це зазначено в повідомленні, яке вам надіслала компанія.',
    options: [
      ['etop', 'З економічних, технічних, організаційних або виробничих причин'],
      ['force_majeure', 'Через непереборну силу (fuerza mayor)'],
      ['red', 'Механізм RED'],
      ['unknown', 'Не знаю'],
    ],
  },
  measure: {
    question: 'ERTE призупиняє ваш договір чи скорочує ваш робочий час?',
    options: [
      ['suspension', 'Призупиняє договір'],
      ['reduction', 'Скорочує робочий час'],
    ],
  },
  percent: {
    label: 'Відсоток скорочення робочого часу',
    hint: 'Від 10 до 70. Наприклад, 40, якщо ви працюєте на 40\u00a0% годин менше.',
  },
  base: {
    question: 'Яка ваша база розрахунку (base reguladora)?',
    label: 'База розрахунку на місяць',
    hint: 'Брутто в євро на місяць: середнє значення внесків на випадок безробіття за останні 180 днів, без понаднормових годин.',
    hintRed:
      'Брутто в євро на місяць: середнє значення баз внесків (bases de cotización) на випадок нещасних випадків на виробництві та професійних захворювань у цій компанії за 180 днів до запровадження заходу або за той час, який ви там працюєте, якщо він коротший, без понаднормових годин.',
  },
  children: {
    question: 'Скільки дітей у вас на утриманні?',
    help: 'Від цього залежать мінімум і максимум вашої допомоги.',
    options: [
      ['0', 'Немає'],
      ['1', '1'],
      ['2', '2 або більше'],
      ['not_said', 'Волію не казати'],
    ],
  },
} as const;

const LEAD = 'Оцінка брутто за введеними даними. Чинною є сума, яку визнає SEPE.';

// «близько 1.225 €», or «від 560 € до 1.225 €» when the readings differ by more than a euro.
function amount(r: Range): string {
  const lo = Math.round(r.min);
  const hi = Math.round(r.max);
  return lo === hi ? `близько ${wholeEuros(lo)}` : `від ${wholeEuros(lo)} до ${wholeEuros(hi)}`;
}

// A cap reads to the euro when it is whole, never rounded past the law.
const capText = (n: number): string => (Number.isInteger(n) ? wholeEuros(n) : euros(n));

const percentText = (n: number): string => `${Number(n.toFixed(2)).toLocaleString('es-ES')}\u00a0%`;

const REGIME_SOURCE = {
  etop: 'Arts. 269 і 270 LGSS',
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
  return `від ${wholeEuros(lo)} до ${wholeEuros(hi)}`;
}

function amountBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const reduction = input.measure.kind === 'reduction' ? input.measure : null;
  const rate =
    input.regime === 'etop'
      ? `Це 70\u00a0% вашої бази протягом перших 180 днів виплати допомоги і 60\u00a0% починаючи з 181-го дня (art. 270.2 LGSS).`
      : `Це 70\u00a0% вашої бази протягом усього ERTE (${input.regime === 'red' ? 'DA 41.ª.4' : 'DA 46.ª'} LGSS).`;
  const first = amount(e.firstStretch);
  const second = e.secondStretch === null ? null : amount(e.secondStretch);
  const figure = belowFullTimeMinimum(input)
    ? `Якщо база нижча за мінімальну базу для повного робочого часу (${euros(BENEFIT_2026.minBaseAtep)}), робочий час неповний, і тоді мінімум і максимум зменшуються пропорційно вашим годинам (art. 270.3 LGSS). Без ваших годин ця оцінка не дає суми.`
    : second === null
      ? `${capitalise(first)} на місяць.`
      : second === first
        ? `${capitalise(first)} на місяць, до і після 181-го дня.`
        : `${capitalise(first)} на місяць протягом перших 180 днів виплати допомоги і ${second} починаючи з 181-го дня.`;
  const limit =
    input.regime === 'red'
      ? `Граничний рівень — ${capText(RED_MONTHLY_CAP)} на місяць, тобто 225\u00a0% IPREM плюс одна шоста, і власного мінімуму немає (DA 41.ª.4 LGSS).`
      : belowFullTimeMinimum(input)
        ? ''
        : `Мінімум і максимум залежать від кількості дітей на утриманні (art. 270.3 LGSS): ${capCopy(input.children)} на місяць за повного робочого часу.`;
  const proportion = reduction
    ? input.regime === 'red'
      ? ` Оскільки ERTE скорочує ваш робочий час на ${percentText(reduction.percent)}, перевірка розраховує допомогу пропорційно цьому скороченню, як допомогу по безробіттю при скороченні робочого часу (art. 270.5 LGSS). Додаткове положення 41.ª не визначає, як вона розраховується в механізмі RED: це підхід самої перевірки.`
      : ` Оскільки ERTE скорочує ваш робочий час на ${percentText(reduction.percent)}, допомога пропорційна цьому скороченню (art. 270.5 LGSS); враховується лише тимчасове скорочення за art. 47 ET.`
    : '';
  return {
    title: 'Скільки ви отримували б',
    text: [figure, rate, limit].filter(Boolean).join(' ') + proportion,
    source:
      input.regime === 'etop' ? 'Arts. 270.2, 270.3 і 270.5 LGSS' : REGIME_SOURCE[input.regime],
  };
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function unemploymentBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (regime === 'red')
    return {
      title: 'Яка це допомога',
      text: 'У механізмі RED виплачується окрема допомога, як при призупиненні договору, так і при скороченні робочого часу, а не загальна допомога по безробіттю.',
      source: 'DA 41.ª.1 LGSS',
    };
  return e.unemployment === 'total'
    ? {
        title: 'Який це вид безробіття',
        text: 'Якщо ERTE призупиняє ваш договір, це законний статус повного безробіття (situación legal de desempleo total).',
        source: 'Arts. 262.2 і 267.1.b.1.º LGSS',
      }
    : {
        title: 'Який це вид безробіття',
        text: 'Якщо ERTE скорочує ваш робочий час, це законний статус часткового безробіття (situación legal de desempleo parcial). Якщо скорочення застосовується повними днями, ці дні є повним безробіттям.',
        source: 'Arts. 262.2, 262.3 і 267.1.c LGSS',
      };
}

function consumptionBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const title = 'Чи витрачається ваша майбутня допомога?';
  if (!e.consumption.consumes)
    return {
      title,
      text:
        input.regime === 'red'
          ? 'Ні. Час, протягом якого ви отримуєте допомогу в механізмі RED, не вважається використаним.'
          : 'Її отримання не витрачає вже сплачених вами внесків: «el acceso a esta prestación no implicará el consumo de las cotizaciones previamente efectuadas a ningún efecto» (доступ до цієї допомоги в жодному разі не означає використання раніше сплачених внесків).',
      source: input.regime === 'red' ? 'DA 41.ª.8 LGSS' : 'DA 46.ª.b LGSS',
    };
  if (input.measure.kind === 'reduction')
    return {
      title,
      text: `Так. При скороченні робочого часу вона витрачається погодинно, у тому самому відсотку, що й скорочення: ${percentText(input.measure.percent)} дня допомоги за кожен день ERTE.`,
      source: 'Art. 269.5 LGSS',
    };
  return {
    title,
    text: 'Так. Кожен день ERTE з призупиненим договором витрачає один день допомоги, що залишиться вам на майбутнє.',
    source: 'Art. 269 LGSS',
  };
}

function contributionBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (e.contribution.kind === 'minimum')
    return {
      title: 'Скільки потрібно мати сплачених внесків',
      text: `Потрібно ${e.contribution.days} дн. сплачених внесків за останні 6 років, які ви не використали для іншої допомоги.`,
      source: 'Arts. 266.b і 269 LGSS',
    };
  return {
    title: 'Скільки потрібно мати сплачених внесків',
    text: 'Мінімальний період сплати внесків не потрібен.',
    source: regime === 'red' ? 'DA 41.ª.1 LGSS' : 'DA 46.ª LGSS',
  };
}

export function ertePositiveView(input: ErteInput, e: ErteEstimate): ErteView {
  return {
    title: 'Ваша допомога по безробіттю під час ERTE (оцінка)',
    lead: LEAD,
    blocks: [
      amountBlock(input, e),
      unemploymentBlock(input.regime, e),
      consumptionBlock(input, e),
      contributionBlock(input.regime, e),
      ...(e.jobSeekerRegistration
        ? [
            {
              title: 'Як подати заяву',
              text: 'Заяву подає компанія від вашого імені протягом місяця від дня, коли орган з питань праці (autoridad laboral) дозволяє захід. Щоб отримувати допомогу, ви маєте бути зареєстровані як шукач роботи (demandante de empleo).',
              source: 'DA 41.ª.2 LGSS',
            },
          ]
        : []),
    ],
  };
}

export const erteUnknownView = (): ErteView => ({
  title: 'Без типу ERTE немає однієї суми',
  lead: 'У повідомленні компанії зазначено, якого типу ERTE. А поки що ось як змінюються правила.',
  blocks: [
    {
      title: 'Економічні, технічні, організаційні або виробничі причини',
      text: '70\u00a0% вашої бази протягом перших 180 днів виплати допомоги і 60\u00a0% після цього, у межах мінімумів і максимумів залежно від дітей на утриманні. Витрачає вашу майбутню допомогу, і потрібно 360 днів сплачених внесків за останні 6 років, які ви не використали для іншої допомоги.',
      source: 'Arts. 266.b, 269 і 270 LGSS',
    },
    {
      title: 'Непереборна сила (fuerza mayor)',
      text: '70\u00a0% вашої бази протягом усього ERTE, у межах мінімумів і максимумів залежно від дітей на утриманні. Не витрачає вже сплачених вами внесків, і мінімальний період сплати внесків не потрібен.',
      source: 'DA 46.ª LGSS',
    },
    {
      title: 'Механізм RED',
      text: `70\u00a0% вашої бази протягом усього ERTE, з граничним рівнем ${capText(RED_MONTHLY_CAP)} на місяць, тобто 225\u00a0% IPREM плюс одна шоста. Час, протягом якого ви отримуєте допомогу, не вважається використаним, мінімальний період сплати внесків не потрібен, і ви маєте бути зареєстровані як шукач роботи (demandante de empleo).`,
      source: 'DA 41.ª LGSS',
    },
  ],
});

export const ERTE_GUIDE = {
  title: 'Як розраховується допомога по безробіттю під час ERTE',
  sheetTitle: 'Три типи ERTE',
  sheetLead:
    'Що змінюється в допомозі по безробіттю з кожним із них: сума, чи витрачається майбутня допомога і потрібні внески.',
  nextTitle: 'Читати далі',
  nextHub: 'Допомога по безробіттю',
  hubPath: 'paro/',
} as const;

export const ERTE_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: 'Чи отримую я допомогу по безробіттю, якщо ERTE скорочує мій робочий час?',
    answer:
      'Так, якщо ви відповідаєте вимогам свого типу ERTE, як часткове безробіття, коли тимчасове скорочення вашого звичайного щоденного робочого часу становить від 10 до 70\u00a0% (arts. 262.3 LGSS і 47.7.a ET). Допомога пропорційна цьому скороченню (art. 270.5 LGSS).',
  },
  {
    question: 'Чи витрачає ERTE мою допомогу на майбутнє?',
    answer:
      'Залежить від типу. У ERTE з економічних, технічних, організаційних або виробничих причин — так: кожен день витрачає допомогу, а при скороченні робочого часу вона витрачається погодинно (art. 269.5 LGSS). У ERTE через непереборну силу вже сплачені внески не витрачаються (DA 46.ª LGSS), а в механізмі RED час, протягом якого ви отримуєте допомогу, не вважається використаним (DA 41.ª.8 LGSS).',
  },
  {
    question:
      'Чи потрібен мінімальний період сплати внесків, щоб отримувати допомогу по безробіттю під час ERTE?',
    answer:
      'У ERTE з економічних, технічних, організаційних або виробничих причин потрібно 360 днів сплачених внесків за останні 6 років, які ви не використали для іншої допомоги (arts. 266.b і 269 LGSS). У ERTE через непереборну силу і в механізмі RED мінімальний період сплати внесків не потрібен (DA 46.ª і DA 41.ª.1 LGSS).',
  },
  {
    question: 'Що робити, якщо я не знаю, якого типу моє ERTE?',
    answer:
      'У повідомленні, яке вам надіслала компанія, зазначено, якого воно типу. А поки що виберіть у формі «Не знаю», і ви побачите, як змінюються правила для кожного типу, без однієї суми.',
  },
];

export const ERTE_ERRORS = {
  regime: 'Виберіть варіант; «Не знаю» теж підходить',
  measure: 'Виберіть варіант',
  percent: `Введіть відсоток від ${MIN_REDUCTION_PERCENT} до ${MAX_REDUCTION_PERCENT}`,
  base: 'Введіть базу в євро на місяць, наприклад 1.500,00',
  children: 'Виберіть варіант; «Волію не казати» теж підходить',
} as const;

export const ERTE: ErteCopy = {
  page: ERTE_PAGE,
  crumb: 'Допомога по безробіттю під час ERTE',
  legal: ERTE_LEGAL,
  questions: ERTE_QUESTIONS,
  errors: ERTE_ERRORS,
  guide: ERTE_GUIDE,
  faq: ERTE_FAQ,
  positiveView: ertePositiveView,
  unknownView: erteUnknownView,
};
