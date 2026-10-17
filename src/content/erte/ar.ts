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

// The ERTE benefit page in Arabic, with the same shape as es.ts (./copy.ts).

export const ERTE_PAGE = {
  title: 'إعانة البطالة خلال إجراء ERTE: كم قد تتقاضى شهريًا',
  description:
    'بنوع إجراء ERTE المذكور في الإشعار الذي تلقيته، وما إذا كان يعلّق العقد أو يخفّض ساعات العمل، وبقاعدتك، قدّر إعانة البطالة ⁨(paro)⁩ الشهرية وما إذا كانت تستهلك إعانة البطالة المستقبلية.',
  h1: 'إعانة البطالة خلال إجراء ERTE',
  lead: 'قد يمنح إجراء ERTE الحق في إعانة البطالة ⁨(paro)⁩ طوال مدته. كم تتقاضى، وما إذا كان ذلك يستهلك إعانة البطالة المتبقية لك لاحقًا، يتوقف على نوع الإجراء.',
  beta: 'تجريبي',
  betaNote: 'تقدير تقريبي ببيانات تكتبها أنت؛ لا يحلّ محلّ ما يقرّه SEPE.',
  noJs: 'يحتاج هذا التقدير إلى JavaScript.',
  button: 'احسب',
  restart: 'ابدأ من جديد',
} as const;

// The paragraphs of the legal notice about the page.
export const ERTE_LEGAL = {
  title: 'تقدير إعانة البطالة خلال إجراء ERTE',
  does: 'يقدّر إعانة البطالة الإجمالية شهريًا خلال إجراء ERTE لأسباب اقتصادية أو تقنية أو تنظيمية أو إنتاجية، أو للقوة القاهرة ⁨(fuerza mayor)⁩، أو في إطار آلية RED ⁨(mecanismo RED)⁩، بالقاعدة المرجعية ⁨(base reguladora)⁩ وبالبيانات التي تكتبها أنت: المبلغ مع حدوده، وما إذا كانت البطالة كلية أو جزئية، وما إذا كان يستهلك إعانة البطالة المتبقية لك لاحقًا، والاشتراك اللازم. تذكر كل فقرة المادة التي تستند إليها من القانون العام للضمان الاجتماعي ⁨(Ley General de la Seguridad Social)⁩، بما في ذلك حكماه الإضافيان ⁨(disposiciones adicionales 41.ª y 46.ª)⁩.',
  doesNot:
    'لا يحسب قاعدتك المرجعية ولا ما تتقاضاه صافيًا، ولا يتحقق مما إذا كنت تستوفي الشروط ولا مما إذا كان إجراء ERTE صحيحًا، ولا يحلّ محلّ ما يقرّه SEPE. يقدّم معلومات عن القانون وليس استشارة قانونية.',
  beta: 'هذا قسم قيد التجربة: قد يتضمن أخطاء ما دامت مراجعته بحالات حقيقية جارية. إذا رأيت رقمًا لا يتوافق مع القانون، يمكنك الكتابة إلى',
} as const;

export const ERTE_QUESTIONS = {
  regime: {
    question: 'ما نوع إجراء ERTE الخاص بك؟',
    help: 'مذكور في الإشعار الذي أرسلته إليك الشركة.',
    options: [
      ['etop', 'لأسباب اقتصادية أو تقنية أو تنظيمية أو إنتاجية'],
      ['force_majeure', 'للقوة القاهرة'],
      ['red', 'آلية RED'],
      ['unknown', 'لا أعرف'],
    ],
  },
  measure: {
    question: 'هل يعلّق إجراء ERTE الخاص بك العقد أم يخفّض ساعات العمل؟',
    options: [
      ['suspension', 'يعلّق العقد'],
      ['reduction', 'يخفّض ساعات العمل'],
    ],
  },
  percent: {
    label: 'نسبة تخفيض ساعات العمل',
    hint: 'بين 10 و70. مثلًا، 40 إذا كنت تعمل ساعات أقل بنسبة 40\u00a0%.',
  },
  base: {
    question: 'ما قاعدتك المرجعية ⁨(base reguladora)⁩؟',
    label: 'القاعدة المرجعية شهريًا',
    hint: 'المبلغ الإجمالي باليورو شهريًا: متوسط ما اشتُرك به عن البطالة خلال آخر 180 يومًا، دون الساعات الإضافية.',
    hintRed:
      'المبلغ الإجمالي باليورو شهريًا: متوسط قواعد الاشتراك ⁨(bases de cotización)⁩ عن حوادث العمل والأمراض المهنية في تلك الشركة خلال الـ180 يومًا السابقة للإجراء، أو خلال المدة التي قضيتها فيها إن كانت أقل، دون الساعات الإضافية.',
  },
  children: {
    question: 'كم عدد أبنائك أو بناتك المُعالين؟',
    help: 'يغيّر الحد الأدنى والحد الأقصى لإعانة البطالة الخاصة بك.',
    options: [
      ['0', 'لا أحد'],
      ['1', '1'],
      ['2', '2 أو أكثر'],
      ['not_said', 'أفضّل عدم الإجابة'],
    ],
  },
} as const;

const LEAD = 'تقدير إجمالي بالبيانات التي كتبتها. الرقم المعتمد هو الذي يقرّه SEPE.';

// «نحو 1.225 €», or «بين 560 € و1.225 €» when the readings differ by more than a euro.
function amount(r: Range): string {
  const lo = Math.round(r.min);
  const hi = Math.round(r.max);
  return lo === hi ? `نحو ${wholeEuros(lo)}` : `بين ${wholeEuros(lo)} و${wholeEuros(hi)}`;
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
  return `بين ${wholeEuros(lo)} و${wholeEuros(hi)}`;
}

function amountBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const reduction = input.measure.kind === 'reduction' ? input.measure : null;
  const rate =
    input.regime === 'etop'
      ? `تساوي 70\u00a0% من قاعدتك خلال أول 180 يومًا من الإعانة و60\u00a0% اعتبارًا من اليوم 181 ⁨(art. 270.2 LGSS)⁩.`
      : `تساوي 70\u00a0% من قاعدتك طوال مدة إجراء ERTE ⁨(${input.regime === 'red' ? 'DA 41.ª.4' : 'DA 46.ª'} LGSS)⁩.`;
  const first = amount(e.firstStretch);
  const second = e.secondStretch === null ? null : amount(e.secondStretch);
  const figure = belowFullTimeMinimum(input)
    ? `مع قاعدة أدنى من الحد الأدنى للدوام الكامل (${euros(BENEFIT_2026.minBaseAtep)})، يكون الدوام جزئيًا، وعندئذ ينخفض الحد الأدنى والحد الأقصى بنسبة ساعاتك ⁨(art. 270.3 LGSS)⁩. دون ساعاتك، لا يعطي هذا التقدير رقمًا.`
    : second === null
      ? `${capitalise(first)} شهريًا.`
      : second === first
        ? `${capitalise(first)} شهريًا، قبل اليوم 181 وبعده.`
        : `${capitalise(first)} شهريًا خلال أول 180 يومًا من الإعانة و${second} اعتبارًا من اليوم 181.`;
  const limit =
    input.regime === 'red'
      ? `بحد أقصى قدره ${capText(RED_MONTHLY_CAP)} شهريًا، أي 225\u00a0% من مؤشر IPREM مضافًا إليه السدس، ودون حد أدنى خاص بها ⁨(DA 41.ª.4 LGSS)⁩.`
      : belowFullTimeMinimum(input)
        ? ''
        : `مع حد أدنى وحد أقصى بحسب أبنائك أو بناتك المُعالين ⁨(art. 270.3 LGSS)⁩: ${capCopy(input.children)} شهريًا مع الدوام الكامل.`;
  const proportion = reduction
    ? input.regime === 'red'
      ? ` بما أن إجراء ERTE يخفّض ساعات عملك بنسبة ${percentText(reduction.percent)}، تحتسب المراجعة الإعانة بنسبة هذا التخفيض، كما في إعانة البطالة عند تخفيض ساعات العمل ⁨(art. 270.5 LGSS)⁩. لا يحدّد الحكم الإضافي ⁨(disposición adicional 41.ª)⁩ طريقة حسابها في آلية RED: هذا معيار اعتمدته المراجعة.`
      : ` بما أن إجراء ERTE يخفّض ساعات عملك بنسبة ${percentText(reduction.percent)}، تكون الإعانة متناسبة مع هذا التخفيض ⁨(art. 270.5 LGSS)⁩؛ ولا يُحتسب إلا التخفيض المؤقت المنصوص عليه في art. 47 ET.`
    : '';
  return {
    title: 'كم قد تتقاضى',
    text: [figure, rate, limit].filter(Boolean).join(' ') + proportion,
    source:
      input.regime === 'etop' ? 'Arts. 270.2, 270.3 y 270.5 LGSS' : REGIME_SOURCE[input.regime],
  };
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function unemploymentBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (regime === 'red')
    return {
      title: 'ما هذه الإعانة',
      text: 'في آلية RED تُصرف إعانة خاصة بها، سواء علّق الإجراء العقد أو خفّض ساعات العمل، وليست إعانة البطالة العامة.',
      source: 'DA 41.ª.1 LGSS',
    };
  return e.unemployment === 'total'
    ? {
        title: 'ما نوع البطالة',
        text: 'إجراء ERTE الذي يعلّق عقدك وضعٌ قانوني للبطالة الكلية ⁨(situación legal de desempleo total)⁩.',
        source: 'Arts. 262.2 y 267.1.b.1.º LGSS',
      }
    : {
        title: 'ما نوع البطالة',
        text: 'إجراء ERTE الذي يخفّض ساعات عملك وضعٌ قانوني للبطالة الجزئية ⁨(desempleo parcial)⁩. إذا طُبّق التخفيض بأيام كاملة، فتلك الأيام بطالة كلية.',
        source: 'Arts. 262.2, 262.3 y 267.1.c LGSS',
      };
}

function consumptionBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const title = 'هل يستهلك إعانة البطالة المستقبلية؟';
  if (!e.consumption.consumes)
    return {
      title,
      text:
        input.regime === 'red'
          ? 'لا. المدة التي تتقاضى فيها الإعانة في آلية RED لا تُعدّ مستهلَكة.'
          : 'تقاضيها لا يستهلك الاشتراكات التي كانت لديك: ⁨«el acceso a esta prestación no implicará el consumo de las cotizaciones previamente efectuadas a ningún efecto»⁩ (لا يترتّب على الحصول على هذه الإعانة استهلاك الاشتراكات المدفوعة سابقًا لأي غرض).',
      source: input.regime === 'red' ? 'DA 41.ª.8 LGSS' : 'DA 46.ª.b LGSS',
    };
  if (input.measure.kind === 'reduction')
    return {
      title,
      text: `نعم. مع تخفيض ساعات العمل يكون الاستهلاك بالساعات، بالنسبة نفسها للتخفيض: ${percentText(input.measure.percent)} من يوم إعانة بطالة عن كل يوم من إجراء ERTE.`,
      source: 'Art. 269.5 LGSS',
    };
  return {
    title,
    text: 'نعم. كل يوم من إجراء ERTE مع تعليق العقد يستهلك يومًا من إعانة البطالة المتبقية لك لاحقًا.',
    source: 'Art. 269 LGSS',
  };
}

function contributionBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (e.contribution.kind === 'minimum')
    return {
      title: 'كم يلزم من الاشتراك',
      text: `يلزم ${e.contribution.days} يومًا من الاشتراك ⁨(días cotizados)⁩ خلال السنوات الـ6 الأخيرة لم تستخدمها لإعانة بطالة أخرى.`,
      source: 'Arts. 266.b y 269 LGSS',
    };
  return {
    title: 'كم يلزم من الاشتراك',
    text: 'لا يُشترط حد أدنى من فترة الاشتراك.',
    source: regime === 'red' ? 'DA 41.ª.1 LGSS' : 'DA 46.ª LGSS',
  };
}

export function ertePositiveView(input: ErteInput, e: ErteEstimate): ErteView {
  return {
    title: 'إعانة البطالة الخاصة بك خلال إجراء ERTE (تقدير)',
    lead: LEAD,
    blocks: [
      amountBlock(input, e),
      unemploymentBlock(input.regime, e),
      consumptionBlock(input, e),
      contributionBlock(input.regime, e),
      ...(e.jobSeekerRegistration
        ? [
            {
              title: 'كيف تُطلب',
              text: 'تقدّم الشركة الطلب نيابةً عنك، خلال مهلة شهر واحد من تاريخ موافقة سلطة العمل المختصة على الإجراء. ولتقاضيها يُشترط التسجيل بصفة طالب عمل ⁨(demandante de empleo)⁩.',
              source: 'DA 41.ª.2 LGSS',
            },
          ]
        : []),
    ],
  };
}

export const erteUnknownView = (): ErteView => ({
  title: 'دون نوع إجراء ERTE لا يوجد رقم واحد',
  lead: 'يذكر إشعار الشركة نوع الإجراء. وفي الأثناء، هكذا تتغير القواعد.',
  blocks: [
    {
      title: 'لأسباب اقتصادية أو تقنية أو تنظيمية أو إنتاجية',
      text: '70\u00a0% من قاعدتك خلال أول 180 يومًا من الإعانة و60\u00a0% بعدها، ضمن الحدود الدنيا والقصوى بحسب الأبناء أو البنات المُعالين. يستهلك إعانة البطالة المستقبلية، ويلزم 360 يومًا من الاشتراك خلال السنوات الـ6 الأخيرة لم تستخدمها لإعانة بطالة أخرى.',
      source: 'Arts. 266.b, 269 y 270 LGSS',
    },
    {
      title: 'القوة القاهرة',
      text: '70\u00a0% من قاعدتك طوال مدة إجراء ERTE، ضمن الحدود الدنيا والقصوى بحسب الأبناء أو البنات المُعالين. لا يستهلك الاشتراكات التي كانت لديك، ولا يُشترط حد أدنى من فترة الاشتراك.',
      source: 'DA 46.ª LGSS',
    },
    {
      title: 'آلية RED',
      text: `70\u00a0% من قاعدتك طوال مدة إجراء ERTE، بحد أقصى قدره ${capText(RED_MONTHLY_CAP)} شهريًا، أي 225\u00a0% من مؤشر IPREM مضافًا إليه السدس. المدة التي تتقاضى فيها الإعانة لا تُعدّ مستهلَكة، ولا يُشترط حد أدنى من فترة الاشتراك، ويُشترط التسجيل بصفة طالب عمل ⁨(demandante de empleo)⁩.`,
      source: 'DA 41.ª LGSS',
    },
  ],
});

export const ERTE_GUIDE = {
  title: 'كيف تُحسب إعانة البطالة خلال إجراء ERTE',
  sheetTitle: 'الأنواع الثلاثة لإجراء ERTE',
  sheetLead:
    'ما الذي يتغير في إعانة البطالة مع كل نوع: المبلغ، وما إذا كان يستهلك إعانة البطالة المستقبلية، والاشتراك.',
  nextTitle: 'تابع القراءة',
  nextHub: 'إعانة البطالة',
  hubPath: 'paro/',
} as const;

export const ERTE_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: 'هل أتقاضى إعانة البطالة إذا كان إجراء ERTE يخفّض ساعات عملي؟',
    answer:
      'نعم، إذا استوفيت شروط نوع إجراء ERTE الخاص بك، بوصفها بطالة جزئية عندما يتراوح التخفيض المؤقت لساعات عملك اليومية العادية بين 10 و70\u00a0% ⁨(arts. 262.3 LGSS y 47.7.a ET)⁩. وتكون الإعانة متناسبة مع هذا التخفيض ⁨(art. 270.5 LGSS)⁩.',
  },
  {
    question: 'هل يستهلك إجراء ERTE إعانة البطالة المتبقية لي لاحقًا؟',
    answer:
      'يتوقف ذلك على النوع. في إجراء ERTE لأسباب اقتصادية أو تقنية أو تنظيمية أو إنتاجية، نعم: كل يوم يستهلك من إعانة البطالة، ومع تخفيض ساعات العمل يكون الاستهلاك بالساعات ⁨(art. 269.5 LGSS)⁩. وفي إجراء القوة القاهرة لا يستهلك الاشتراكات التي كانت لديك ⁨(DA 46.ª LGSS)⁩، وفي آلية RED لا تُعدّ المدة التي تتقاضى فيها الإعانة مستهلَكة ⁨(DA 41.ª.8 LGSS)⁩.',
  },
  {
    question: 'هل يلزم حد أدنى من الاشتراك لتقاضي إعانة البطالة في إجراء ERTE؟',
    answer:
      'في إجراء ERTE لأسباب اقتصادية أو تقنية أو تنظيمية أو إنتاجية يلزم 360 يومًا من الاشتراك خلال السنوات الـ6 الأخيرة لم تستخدمها لإعانة بطالة أخرى ⁨(arts. 266.b y 269 LGSS)⁩. وفي إجراء القوة القاهرة وفي آلية RED لا يُشترط حد أدنى من فترة الاشتراك ⁨(DA 46.ª y DA 41.ª.1 LGSS)⁩.',
  },
  {
    question: 'ماذا لو لم أكن أعرف نوع إجراء ERTE الخاص بي؟',
    answer:
      'يذكر الإشعار الذي أرسلته إليك الشركة نوع الإجراء. وفي الأثناء، اختر «لا أعرف» في النموذج وسترى كيف تتغير القواعد في كل نوع، دون رقم واحد.',
  },
];

export const ERTE_ERRORS = {
  regime: 'اختر خيارًا؛ «لا أعرف» صالح أيضًا',
  measure: 'اختر خيارًا',
  percent: `اكتب نسبة مئوية بين ${MIN_REDUCTION_PERCENT} و${MAX_REDUCTION_PERCENT}`,
  base: 'اكتب القاعدة باليورو شهريًا، مثلًا 1.500,00',
  children: 'اختر خيارًا؛ «أفضّل عدم الإجابة» صالح أيضًا',
} as const;

export const ERTE: ErteCopy = {
  page: ERTE_PAGE,
  crumb: 'إعانة البطالة خلال إجراء ERTE',
  legal: ERTE_LEGAL,
  questions: ERTE_QUESTIONS,
  errors: ERTE_ERRORS,
  guide: ERTE_GUIDE,
  faq: ERTE_FAQ,
  positiveView: ertePositiveView,
  unknownView: erteUnknownView,
};
