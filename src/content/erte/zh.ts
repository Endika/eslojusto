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

// The ERTE benefit page in Chinese, with the same shape as es.ts (./copy.ts).

export const ERTE_PAGE = {
  title: 'ERTE 期间的失业金：您每月能领多少',
  description:
    '根据您收到的通知中的 ERTE 类型、它是暂停合同还是缩短工时，以及您的计算基数，估算每月的失业金，以及是否会消耗您今后的失业金。',
  h1: 'ERTE 期间的失业金',
  lead: 'ERTE（临时停工或减时）持续期间，您可能有权领取失业金（paro）。能领多少，以及是否会消耗您留待以后使用的失业金，取决于 ERTE 的类型。',
  beta: '测试版',
  betaNote: '根据您填写的数据所作的大致估算，不能代替 SEPE（西班牙公共就业服务局）认定的结果。',
  noJs: '此估算需要 JavaScript。',
  button: '计算',
  restart: '重新开始',
} as const;

// The paragraphs of the legal notice about the page.
export const ERTE_LEGAL = {
  title: 'ERTE 期间失业金的估算',
  does: '根据计算基数（base reguladora）和您填写的数据，估算因经济、技术、组织或生产原因、因不可抗力（fuerza mayor）或在 RED 机制下的 ERTE 期间每月的税前失业金：金额及其上下限、属于完全失业还是部分失业、是否会消耗您留待以后使用的失业金，以及所需的缴费。每一部分都附有其所依据的《社会保障总法》（Ley General de la Seguridad Social）条文，也包括该法的第41.ª和第46.ª附加条款（disposiciones adicionales）。',
  doesNot:
    '不计算您的计算基数，也不计算税后金额；不核查您是否符合条件，也不核查 ERTE 是否有效；不能代替 SEPE 认定的结果。本页介绍法律规定，不提供法律咨询。',
  beta: '这是测试中的栏目：在用真实案例核查期间，可能会有错误。如果您发现某个数字与法律规定不一致，可以写信至',
} as const;

export const ERTE_QUESTIONS = {
  regime: {
    question: '您的 ERTE 是哪种类型？',
    help: '公司发给您的通知中写明了类型。',
    options: [
      ['etop', '因经济、技术、组织或生产原因'],
      ['force_majeure', '因不可抗力（fuerza mayor）'],
      ['red', 'RED 机制'],
      ['unknown', '不知道'],
    ],
  },
  measure: {
    question: '您的 ERTE 是暂停合同还是缩短工时？',
    options: [
      ['suspension', '暂停合同'],
      ['reduction', '缩短工时'],
    ],
  },
  percent: {
    label: '工时缩短的百分比',
    hint: '在10到70之间。例如，如果您的工作时间减少40\u00a0%，就填40。',
  },
  base: {
    question: '您的计算基数（base reguladora）是多少？',
    label: '每月计算基数',
    hint: '每月税前欧元金额：最近180天失业保险缴费的平均值，不含加班。',
    hintRed:
      '每月税前欧元金额：在该公司采取措施前180天内（如果您在该公司的时间更短，则按实际天数）工伤和职业病缴费基数（bases de cotización）的平均值，不含加班。',
  },
  children: {
    question: '您需要抚养几个子女？',
    help: '这会影响您失业金的最低和最高金额。',
    options: [
      ['0', '没有'],
      ['1', '1'],
      ['2', '2个或以上'],
      ['not_said', '不想透露'],
    ],
  },
} as const;

const LEAD = '根据您填写的数据所作的税前估算。以 SEPE 认定的金额为准。';

// «约1.225 €», or «560 €至1.225 €» when the readings differ by more than a euro.
function amount(r: Range): string {
  const lo = Math.round(r.min);
  const hi = Math.round(r.max);
  return lo === hi ? `约${wholeEuros(lo)}` : `${wholeEuros(lo)}至${wholeEuros(hi)}`;
}

// A cap reads to the euro when it is whole, never rounded past the law.
const capText = (n: number): string => (Number.isInteger(n) ? wholeEuros(n) : euros(n));

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
  return `${wholeEuros(lo)}至${wholeEuros(hi)}`;
}

function amountBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const reduction = input.measure.kind === 'reduction' ? input.measure : null;
  const rate =
    input.regime === 'etop'
      ? `领取失业金的前180天为您计算基数的70\u00a0%，从第181天起为60\u00a0%（art. 270.2 LGSS）。`
      : `整个 ERTE 期间均为您计算基数的70\u00a0%（${input.regime === 'red' ? 'DA 41.ª.4' : 'DA 46.ª'} LGSS）。`;
  const first = amount(e.firstStretch);
  const second = e.secondStretch === null ? null : amount(e.secondStretch);
  const figure = belowFullTimeMinimum(input)
    ? `如果计算基数低于全日制的最低基数（${euros(BENEFIT_2026.minBaseAtep)}），则属于非全日制，此时最低和最高金额按您的工时比例降低（art. 270.3 LGSS）。没有您的工时，此估算不给出金额。`
    : second === null
      ? `每月${capitalise(first)}。`
      : second === first
        ? `每月${capitalise(first)}，第181天前后相同。`
        : `领取失业金的前180天每月${capitalise(first)}，从第181天起每月${second}。`;
  const limit =
    input.regime === 'red'
      ? `上限为每月${capText(RED_MONTHLY_CAP)}，即 IPREM 的225\u00a0%再加六分之一，没有单独的最低金额（DA 41.ª.4 LGSS）。`
      : belowFullTimeMinimum(input)
        ? ''
        : `最低和最高金额取决于您需要抚养的子女人数（art. 270.3 LGSS）：全日制时每月${capCopy(input.children)}。`;
  const proportion = reduction
    ? input.regime === 'red'
      ? `由于 ERTE 将您的工时缩短${percentText(reduction.percent)}，本核查按该缩短比例计算失业金，与因缩短工时领取的失业金相同（art. 270.5 LGSS）。第41.ª附加条款没有规定 RED 机制下如何计算：这是本核查采用的计算方式。`
      : `由于 ERTE 将您的工时缩短${percentText(reduction.percent)}，失业金与该缩短比例成正比（art. 270.5 LGSS）；只计算 art. 47 ET 规定的临时缩短。`
    : '';
  return {
    title: '您能领多少',
    text: [figure, rate, limit].filter(Boolean).join('') + proportion,
    source:
      input.regime === 'etop' ? 'Arts. 270.2, 270.3 y 270.5 LGSS' : REGIME_SOURCE[input.regime],
  };
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function unemploymentBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (regime === 'red')
    return {
      title: '这是哪种津贴',
      text: '在 RED 机制下，无论是暂停合同还是缩短工时，领取的都是该机制自己的津贴，而不是一般的失业金。',
      source: 'DA 41.ª.1 LGSS',
    };
  return e.unemployment === 'total'
    ? {
        title: '属于哪种失业',
        text: '暂停您合同的 ERTE 属于法定完全失业状态（situación legal de desempleo total）。',
        source: 'Arts. 262.2 y 267.1.b.1.º LGSS',
      }
    : {
        title: '属于哪种失业',
        text: '缩短您工时的 ERTE 属于法定部分失业状态（situación legal de desempleo parcial）。如果按整天缩短，这些天属于完全失业。',
        source: 'Arts. 262.2, 262.3 y 267.1.c LGSS',
      };
}

function consumptionBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const title = '会消耗您今后的失业金吗？';
  if (!e.consumption.consumes)
    return {
      title,
      text:
        input.regime === 'red'
          ? '不会。在 RED 机制下领取津贴的时间不视为已消耗。'
          : '领取这项失业金不会消耗您已有的缴费：«el acceso a esta prestación no implicará el consumo de las cotizaciones previamente efectuadas a ningún efecto»（领取该津贴在任何情况下均不意味着消耗此前的缴费）。',
      source: input.regime === 'red' ? 'DA 41.ª.8 LGSS' : 'DA 46.ª.b LGSS',
    };
  if (input.measure.kind === 'reduction')
    return {
      title,
      text: `会。缩短工时时按小时消耗，比例与缩短比例相同：每一个 ERTE 日消耗一天失业金的${percentText(input.measure.percent)}。`,
      source: 'Art. 269.5 LGSS',
    };
  return {
    title,
    text: '会。合同暂停期间，每一个 ERTE 日都会消耗一天您留待以后使用的失业金。',
    source: 'Art. 269 LGSS',
  };
}

function contributionBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (e.contribution.kind === 'minimum')
    return {
      title: '需要缴费多久',
      text: `需要在最近6年内有${e.contribution.days}天的缴费，且这些缴费没有用于其他失业金。`,
      source: 'Arts. 266.b y 269 LGSS',
    };
  return {
    title: '需要缴费多久',
    text: '不需要最低缴费期。',
    source: regime === 'red' ? 'DA 41.ª.1 LGSS' : 'DA 46.ª LGSS',
  };
}

export function ertePositiveView(input: ErteInput, e: ErteEstimate): ErteView {
  return {
    title: '您在 ERTE 期间的失业金（估算）',
    lead: LEAD,
    blocks: [
      amountBlock(input, e),
      unemploymentBlock(input.regime, e),
      consumptionBlock(input, e),
      contributionBlock(input.regime, e),
      ...(e.jobSeekerRegistration
        ? [
            {
              title: '如何申请',
              text: '申请由公司以您的名义提交，期限为劳动主管部门（autoridad laboral）批准该措施之日起一个月内。要领取津贴，您必须登记为求职者（demandante de empleo）。',
              source: 'DA 41.ª.2 LGSS',
            },
          ]
        : []),
    ],
  };
}

export const erteUnknownView = (): ErteView => ({
  title: '不知道 ERTE 类型，就无法给出单一金额',
  lead: '公司的通知中写明了类型。在此之前，以下是各类型的规则差异。',
  blocks: [
    {
      title: '经济、技术、组织或生产原因',
      text: '领取失业金的前180天为您计算基数的70\u00a0%，之后为60\u00a0%，在按子女人数确定的最低和最高金额之内。会消耗您今后的失业金，并且需要在最近6年内有360天的缴费，且这些缴费没有用于其他失业金。',
      source: 'Arts. 266.b, 269 y 270 LGSS',
    },
    {
      title: '不可抗力（fuerza mayor）',
      text: '整个 ERTE 期间为您计算基数的70\u00a0%，在按子女人数确定的最低和最高金额之内。不会消耗您已有的缴费，也不需要最低缴费期。',
      source: 'DA 46.ª LGSS',
    },
    {
      title: 'RED 机制',
      text: `整个 ERTE 期间为您计算基数的70\u00a0%，上限为每月${capText(RED_MONTHLY_CAP)}，即 IPREM 的225\u00a0%再加六分之一。领取津贴的时间不视为已消耗，不需要最低缴费期，并且您必须登记为求职者（demandante de empleo）。`,
      source: 'DA 41.ª LGSS',
    },
  ],
});

export const ERTE_GUIDE = {
  title: 'ERTE 期间的失业金如何计算',
  sheetTitle: '三种 ERTE',
  sheetLead: '每种类型下失业金的不同之处：金额、是否消耗今后的失业金，以及所需的缴费。',
  nextTitle: '继续阅读',
  nextHub: '失业金',
  hubPath: 'paro/',
} as const;

export const ERTE_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: '如果我的 ERTE 缩短工时，我能领失业金吗？',
    answer:
      '能，前提是您符合您那种 ERTE 的条件：当您日常正常工时的临时缩短幅度在10至70\u00a0%之间时，按部分失业领取（arts. 262.3 LGSS y 47.7.a ET）。失业金与该缩短比例成正比（art. 270.5 LGSS）。',
  },
  {
    question: 'ERTE 会消耗我留待以后使用的失业金吗？',
    answer:
      '取决于类型。因经济、技术、组织或生产原因的 ERTE 会消耗：每天都消耗失业金，缩短工时时按小时消耗（art. 269.5 LGSS）。因不可抗力的 ERTE 不会消耗您已有的缴费（DA 46.ª LGSS）；在 RED 机制下，领取津贴的时间不视为已消耗（DA 41.ª.8 LGSS）。',
  },
  {
    question: 'ERTE 期间领取失业金需要最低缴费期吗？',
    answer:
      '因经济、技术、组织或生产原因的 ERTE，需要在最近6年内有360天的缴费，且这些缴费没有用于其他失业金（arts. 266.b y 269 LGSS）。因不可抗力的 ERTE 和 RED 机制不需要最低缴费期（DA 46.ª y DA 41.ª.1 LGSS）。',
  },
  {
    question: '如果我不知道自己的 ERTE 是哪种类型怎么办？',
    answer:
      '公司发给您的通知中写明了类型。在此之前，您可以在表单中选择“不知道”，就能看到各类型的规则有何不同，但不会给出单一金额。',
  },
];

export const ERTE_ERRORS = {
  regime: '请选择一项；“不知道”也可以',
  measure: '请选择一项',
  percent: `请填写${MIN_REDUCTION_PERCENT}到${MAX_REDUCTION_PERCENT}之间的百分比`,
  base: '请填写每月的欧元基数，例如1.500,00',
  children: '请选择一项；“不想透露”也可以',
} as const;

export const ERTE: ErteCopy = {
  page: ERTE_PAGE,
  crumb: 'ERTE 期间的失业金',
  legal: ERTE_LEGAL,
  questions: ERTE_QUESTIONS,
  errors: ERTE_ERRORS,
  guide: ERTE_GUIDE,
  faq: ERTE_FAQ,
  positiveView: ertePositiveView,
  unknownView: erteUnknownView,
};
