// source: 3c9f4c62bcf0
import { addDays, parseDate, toIso } from '../../engine/date';
import { round2 } from '../../engine/money';
import { checkDepositReturn } from '../../engine/rental/deposit-return';
import { checkCharges } from '../../engine/rental/charges';
import { checkGuarantees } from '../../engine/rental/guarantees';
import type { ItemReading, ItemResult } from '../../engine/rental/item';
import type { NormTable } from '../../engine/rental/norms';
import { ruleSource, type RuleId } from '../../engine/rental/rules';
import { RENTAL_TABLES } from '../../engine/rental/data/tables';
import { NORMS } from '../../engine/rental/data/norms';
import type { RentalFigure, RentalPhrase } from '../../engine/rental/calculation';
import type { RentalInput } from '../../engine/rental/types';
import { t, type Key } from '../../i18n';
import { capsCopy, type CapRow, type Source } from '../rent-caps';
import { decreeClause, decreeSentence } from '../rental-guide';
import { DECREE_CAP, formatDay, formatEuros, formatLongDay, formatRate } from '../rent-indices';
import type { Example } from '../rent-indices';
import { LAST_UPDATED } from '../updated';

// The six pages on a rental that sit under /alquiler/: the rise, the 2026 decree and the agency
// fees, and the deposit, its return and the charges, in Arabic, with the shape, paths and
// examples of es.ts. Only the loader imports this file.

export type RentalPageId = 'rise' | 'decree' | 'fees' | 'deposit' | 'deposit_return' | 'charges';

// In the order the hub lists them.
export const RENTAL_PAGE_IDS: readonly RentalPageId[] = [
  'rise',
  'decree',
  'fees',
  'deposit',
  'deposit_return',
  'charges',
];

export interface Question {
  // The id of its <details>, when other pages link to the question.
  readonly anchor?: string;
  readonly question: string;
  readonly answer: string;
}

// What every page says about itself, and what the pages next to it show of it.
export interface PageMeta {
  // From the site root, with its trailing slash.
  readonly path: string;
  // The last segment of the path.
  readonly slug: string;
  // How the other pages link to it.
  readonly name: string;
  // Its last step in the breadcrumb.
  readonly crumb: string;
  readonly title: string;
  readonly description: string;
  readonly h1: string;
}

export const REVIEW = { path: '/alquiler/', name: 'راجِع إيجارك' } as const;
const INDICES = { path: '/alquiler/irav-ipc/', name: 'مؤشرا IRAV وIPC لكل شهر' } as const;

export const RENTAL_PAGES: Record<RentalPageId, PageMeta> = {
  rise: {
    path: '/alquiler/subida/',
    slug: 'subida',
    name: 'كم يمكن أن يُرفع إيجارك',
    crumb: 'زيادة الإيجار',
    title: 'كم يمكن أن يُرفع إيجارك في 2026',
    description:
      'الحدود القصوى لزيادة الإيجار حسب اليوم الذي تكتمل فيه سنة العقد، مع النص القانوني لكل منها ومثال بالأرقام.',
    h1: 'كم يمكن أن يُرفع إيجارك في 2026',
  },
  decree: {
    path: '/alquiler/decreto-2026/',
    slug: 'decreto-2026',
    name: 'مرسوم الإيجار لعام 2026',
    crumb: 'مرسوم الإيجار لعام 2026',
    title: 'مرسوم الإيجار لعام 2026: ما الذي يتغيّر ووضعه',
    description:
      'ما الذي يغيّره Real Decreto-ley 29/2026 للمستأجِر وما وضعه: سارٍ منذ 8 أكتوبر، وبانتظار مصادقة البرلمان ⁨(Congreso)⁩.',
    h1: 'مرسوم الإيجار لعام 2026: ما الذي يتغيّر وما وضعه',
  },
  fees: {
    path: '/alquiler/honorarios-inmobiliaria/',
    slug: 'honorarios-inmobiliaria',
    name: 'أتعاب الوكالة العقارية',
    crumb: 'أتعاب الوكالة العقارية',
    title: 'هل يمكن للوكالة العقارية أن تحصّل منك؟ الأتعاب',
    description:
      'من يدفع أتعاب الوكالة العقارية في الإيجار حسب تاريخ توقيعك العقد، مع مادة LAU التي تنطبق على كل حالة.',
    h1: 'هل يمكن للوكالة العقارية أن تحصّل منك؟ الأتعاب في الإيجار',
  },
  deposit: {
    path: '/alquiler/fianza/',
    slug: 'fianza',
    name: 'كم يمكن أن يُطلب منك تأمينًا',
    crumb: 'كم يمكن أن يُطلب منك تأمينًا',
    title: 'تأمين الإيجار ⁨(fianza)⁩: كم قد يُطلب منك ⁨(art. 36 LAU)⁩',
    description:
      'إيجار شهر واحد تأمينًا، وحتى شهرين إضافيين ضمانًا إضافيًا، وشهر واحد دفعًا مسبقًا. قارِن ما طُلب منك بمادة كل حد أقصى.',
    h1: 'تأمين الإيجار ⁨(fianza)⁩: كم يمكن أن يُطلب منك',
  },
  deposit_return: {
    path: '/alquiler/devolucion-fianza/',
    slug: 'devolucion-fianza',
    name: 'إرجاع التأمين',
    crumb: 'إرجاع التأمين',
    title: 'إرجاع تأمين الإيجار ⁨(fianza)⁩: المهلة والفوائد',
    description:
      'أمام المؤجِّر شهر واحد من تسليمك المفاتيح لإرجاع التأمين؛ وبعده، الفائدة القانونية ⁨(art. 36.4 LAU)⁩. مع مثال بالأرقام.',
    h1: 'المؤجِّر لا يُرجع إليك التأمين ⁨(fianza)⁩: المهلة والفوائد',
  },
  charges: {
    path: '/alquiler/gastos/',
    slug: 'gastos',
    name: 'المصاريف التي يمكن أن يحصّلها منك المؤجِّر',
    crumb: 'المصاريف التي يمكن أن يحصّلها منك المؤجِّر',
    title: 'ضريبة IBI واتحاد الملاك والنفايات: ما الذي يُحصَّل منك',
    description:
      'لا يمكن للمؤجِّر أن يحمّلك مصاريف إلا إذا اتفقتما كتابيًا مع مبلغها السنوي، وزيادتها محدودة في السنوات الأولى. ما تنصّ عليه المادة ⁨(art. 20 LAU)⁩.',
    h1: 'ضريبة IBI واتحاد الملاك والنفايات: ما الذي يمكن أن يحصّله منك المؤجِّر',
  },
};

// The pages whose prose lives in a section component of its own.
export type StaticPageId = 'deposit' | 'deposit_return' | 'charges';

const STATIC_PAGE_IDS: readonly StaticPageId[] = ['deposit', 'deposit_return', 'charges'];

// Built on demand: their answers on the decree read its status from the norm table.
const staticPages = (
  norms: NormTable,
  checkedOn: string,
): Record<StaticPageId, { readonly lead: string; readonly faq: readonly Question[] }> => {
  const decreed = (key: Key) =>
    capitalized(decreeSentence('ar', norms, key, 'rdl29_2026', checkedOn));
  return {
    deposit: {
      lead: 'في إيجار المسكن، التأمين ⁨(fianza)⁩ هو إيجار شهر واحد. ويمكن أن يطلب العقد إضافةً إلى ذلك ضمانات أخرى، لكن القانون يضع لها حدًا أقصى.',
      faq: [
        {
          question: 'كم يمكن أن يُطلب مني تأمينًا في إيجار مسكن؟',
          answer: 'إيجار شهر واحد، يُدفع نقدًا ⁨(art. 36.1 LAU)⁩.',
        },
        {
          question: 'هل يمكن أن تُطلب مني ضمانات أخرى غير التأمين؟',
          answer:
            'نعم، لكن في العقود الموقَّعة منذ 6 مارس 2019 لمدة تصل إلى خمس سنوات، أو سبع إذا كان المؤجِّر شركة، لا يجوز أن يتجاوز هذا الضمان الإضافي إيجار شهرين ⁨(art. 36.5 LAU)⁩.',
        },
        {
          question: 'كم يمكن أن يُطلب مني دفعه مسبقًا؟',
          answer: 'لا أكثر من إيجار شهر واحد مسبقًا ⁨(art. 17 LAU)⁩.',
        },
        {
          question:
            'هل يمكن إلزامي بالتعاقد على وثيقة تأمين ضد عدم دفع الإيجار ⁨(seguro de impago)⁩؟',
          answer: decreed('rental.page.decree.insurance'),
        },
      ],
    },
    deposit_return: {
      lead: 'عندما تسلّم المفاتيح، يكون أمام المؤجِّر شهر واحد لإرجاع التأمين ⁨(fianza)⁩ إليك. وبعد انقضاء ذلك الشهر، يولّد ما يتبقى دون إرجاع الفائدة القانونية للمال ⁨(interés legal del dinero)⁩.',
      faq: [
        {
          question: 'كم من الوقت أمام المؤجِّر لإرجاع التأمين؟',
          answer:
            'شهر واحد من تسليمك المفاتيح. وبعد انقضاء ذلك الشهر، يولّد ما يتبقى دون إرجاع الفائدة القانونية للمال ⁨(art. 36.4 LAU)⁩.',
        },
        {
          question: 'من أي يوم تبدأ الفائدة بالسريان؟',
          answer:
            'من اليوم التالي لاكتمال الشهر، محسوبًا من تاريخ إلى التاريخ المقابل له، وحتى اليوم الذي يُرَدّ فيه المال إليك، وهذا اليوم لا يُحتسب ⁨(art. 36.4 LAU)⁩.',
        },
        {
          question: 'ما الفائدة المطبَّقة؟',
          answer:
            'الفائدة القانونية للمال، التي يحدّدها كل سنة قانون الموازنة العامة للدولة ⁨(Ley de Presupuestos Generales del Estado)⁩. وتستخدم المراجعة نسبة كل سنة تقويمية، من جدول البنك المركزي الإسباني ⁨(Banco de España)⁩، لأيام تلك السنة ⁨(art. 36.4 LAU)⁩.',
        },
        {
          question: 'هل يمكن أن يُخصم شيء من التأمين بسبب الأضرار؟',
          answer:
            'لا تقيّم هذه المراجعة ما إذا كان الخصم بسبب الأضرار أو التنظيف أو أي بند آخر في محلّه: تدوّنه كما أُبلغت به ولا تدرجه فيما يتبقى دون إرجاع.',
        },
      ],
    },
    charges: {
      lead: 'لا تنتقل رسوم اتحاد الملاك ⁨(comunidad)⁩ ومصاريف الخدمات الأخرى إلى المستأجِر إلا إذا اتفقتما على ذلك كتابيًا مع مبلغها السنوي. ولزيادتها حد أقصى.',
      faq: [
        {
          question: 'ما المصاريف التي يمكن أن يحصّلها مني المؤجِّر إضافةً إلى الإيجار؟',
          answer:
            'المصاريف التي يحمّلها العقد للمستأجِر، فقط إذا اتفقتما على ذلك كتابيًا ومع مبلغها السنوي في تاريخ العقد ⁨(art. 20 LAU)⁩.',
        },
        {
          question: 'كم يمكن أن ترتفع هذه المصاريف؟',
          answer:
            'في السنوات الخمس الأولى من العقد، أو السبع إذا كان المؤجِّر شركة، لا يجوز أن ترتفع هذه المصاريف، باستثناء الضرائب، إلا مرة واحدة في السنة، بالاتفاق، ولا أكثر أبدًا من ضعف ما يمكن أن يرتفع به الإيجار ⁨(art. 20 LAU)⁩.',
        },
        {
          question: 'هل يمكن أن يحصّل مني ضريبة العقارات ⁨(IBI)⁩؟',
          answer: `يتوقف ذلك على تاريخ توقيعك. ${decreed('rental.page.decree.taxes')} ${t('ar', 'rental.guide.charges.taxes_before', { desde: formatLongDay(norms.rdl29_2026.inForceSince, 'ar') })}`,
        },
      ],
    },
  };
};

// The worked examples are on made-up figures.
const RISE_EXAMPLE = { rent: 900, anniversary: '2026-11-01' } as const;
const FEE_EXAMPLE = { rent: 900, vat: 21 } as const;

export interface PageSource extends Source {
  readonly status: string;
  readonly statusCode: string;
}

export interface PageSection {
  readonly id: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly list?: readonly string[];
  // The yearly caps, one per period, like on the indices page.
  readonly caps?: readonly CapRow[];
  // A dated note about a norm's standing, set apart from the prose.
  readonly status?: string;
  // Text that follows the caps or the list.
  readonly after?: readonly string[];
  readonly example?: readonly string[];
  readonly links?: readonly { readonly label: string; readonly path: string }[];
  // The norm the section rests on, set at its foot like on the deposit and charges pages.
  readonly folio?: { readonly article?: string; readonly law: string };
}

export interface PageContext {
  readonly norms: NormTable;
  // The day the page's rules were last checked, ISO.
  readonly checkedOn: string;
  readonly irav: number;
  readonly example: Example;
}

// What a page shows besides what it says about itself. The pages without sections put their own
// in the view's slot.
export interface PageBody {
  readonly lead: string;
  readonly sections?: readonly PageSection[];
  readonly faq: readonly Question[];
  readonly sources: readonly PageSource[];
}

export interface RentalPage extends PageMeta, PageBody {
  readonly id: RentalPageId;
}

// The pages a page points to: the hub, the indices and the other five, its own group first.
export const nextPages = (id: RentalPageId): readonly { name: string; path: string }[] => {
  const grouped = (other: RentalPageId) =>
    STATIC_PAGE_IDS.includes(other as StaticPageId) ===
    STATIC_PAGE_IDS.includes(id as StaticPageId);
  const others = RENTAL_PAGE_IDS.filter((other) => other !== id);
  return [
    REVIEW,
    INDICES,
    ...others.filter(grouped).map((other) => RENTAL_PAGES[other]),
    ...others.filter((other) => !grouped(other)).map((other) => RENTAL_PAGES[other]),
  ].map(({ name, path }) => ({ name, path }));
};

const STATUS_KEY = {
  in_force: 'client.rental.norm.in_force',
  pending_validation: 'client.rental.norm.pending_validation',
  repealed: 'client.rental.norm.repealed',
} as const satisfies Record<string, Key>;

// The norms a page rests on, each with how it stands.
function pageSources(norms: NormTable, rules: readonly RuleId[]): PageSource[] {
  return rules.map((rule) => {
    const s = ruleSource(rule, norms);
    return {
      citation: s.citation,
      url: s.url,
      statusCode: s.status,
      status: t('ar', STATUS_KEY[s.status], {
        fecha: s.statusSince ? formatDay(s.statusSince) : '',
      }),
    };
  });
}

// What the pages without sections of their own rest on.
const STATIC_RULES: Record<StaticPageId, readonly RuleId[]> = {
  deposit: ['deposit_one_month', 'guarantee_cap', 'advance_cap', 'insurance_ban'],
  deposit_return: ['deposit_interest', 'legal_interest_rate', 'closing_document'],
  charges: ['charges_increase', 'charges_meters', 'taxes_ban'],
};

const pct = (n: number) => `${n}\u00a0%`;

export function rentalPage(id: RentalPageId, ctx: PageContext): RentalPage {
  const meta = RENTAL_PAGES[id];
  if (id === 'deposit' || id === 'deposit_return' || id === 'charges')
    return {
      id,
      ...meta,
      ...staticPages(ctx.norms, ctx.checkedOn)[id],
      sources: pageSources(ctx.norms, STATIC_RULES[id]),
    };
  return { id, ...meta, ...guideBody(id, ctx) };
}

function guideBody(id: 'rise' | 'decree' | 'fees', ctx: PageContext): PageBody {
  const { norms, checkedOn } = ctx;
  const tx = (key: Key, vars?: Record<string, string>) => t('ar', key, vars);
  const decree = norms.rdl29_2026;
  const decreeEve = formatLongDay(toIso(addDays(parseDate(decree.inForceSince), -1)), 'ar');
  const since = formatLongDay(decree.inForceSince, 'ar');
  const caps = capsCopy('ar', norms, {
    checkedOn,
    iravRate: ctx.irav,
    example: ctx.example,
  });
  const sentence = (key: Key, vars?: Record<string, string>) =>
    decreeSentence('ar', norms, key, 'rdl29_2026', checkedOn, vars);
  const sources = (rules: readonly RuleId[]) => pageSources(norms, rules);

  if (id === 'rise') {
    const { rent, anniversary } = RISE_EXAMPLE;
    const raise = (rate: number) => round2((rent * (100 + rate)) / 100);
    const capped = ctx.irav > DECREE_CAP;
    const exampleDecree = capped
      ? `تدفع ${formatEuros(rent)} شهريًا، ويُكمل عقدك سنة أخرى في ${formatLongDay(anniversary, 'ar')}. ` +
        `مع آخر IRAV منشور ⁨(${formatRate(ctx.irav)})⁩، إذا طُبِّق Real Decreto-ley 29/2026، فإن الحد الأقصى دون اتفاق جديد ` +
        `هو ${pct(DECREE_CAP)}، لا ${formatRate(ctx.irav)}: يمكن أن يصل إيجارك إلى ${formatEuros(raise(DECREE_CAP))} على الأكثر.`
      : `تدفع ${formatEuros(rent)} شهريًا، ويُكمل عقدك سنة أخرى في ${formatLongDay(anniversary, 'ar')}. ` +
        `إذا طُبِّق Real Decreto-ley 29/2026، فإن الحد الأقصى دون اتفاق جديد هو ${pct(DECREE_CAP)} أو IRAV، أيهما أدنى: ` +
        `مع آخر IRAV منشور ⁨(${formatRate(ctx.irav)})⁩، يمكن أن يصل إيجارك إلى ${formatEuros(raise(ctx.irav))} على الأكثر.`;
    const exampleNoDecree =
      `إذا ألغى البرلمان ⁨(Congreso)⁩ المرسوم، يعود الحد الأقصى في العقد الموقَّع منذ 26 مايو 2023 إلى IRAV أو IPC، أيهما أدنى. ` +
      `ومع آخر IRAV منشور ⁨(${formatRate(ctx.irav)})⁩، يكون ${formatEuros(raise(ctx.irav))} على الأكثر، ` +
      `ما لم يكن IPC أدنى. وIRAV المعتمد هو آخر مؤشر منشور في ${formatLongDay(anniversary, 'ar')}، وهو لم يصدر بعد.`;
    return {
      lead: 'تتوقف الزيادة على ثلاثة أمور: أن ينصّ عليها العقد، واليوم الذي تكتمل فيه كل سنة من العقد، والحد القانوني الأقصى في ذلك اليوم. هذه هي الحدود القصوى، واحدًا واحدًا ومع مادة كل منها.',
      sections: [
        {
          id: 'topes',
          heading: 'الحدود القصوى، حسب اليوم الذي تكتمل فيه السنة',
          paragraphs: [tx('rent_indices.caps_lead')],
          caps: caps.rows,
          status: caps.status,
          after: [...(caps.repealed ? [caps.repealed] : []), ...(caps.now ? [caps.now] : [])],
          folio: { article: '18', law: 'LAU' },
        },
        {
          id: 'sin-clausula',
          heading: 'لا زيادة دون بند في العقد',
          paragraphs: [tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause })],
          folio: { article: '18.1', law: 'LAU' },
        },
        {
          id: 'aviso',
          heading: 'كيف يُشترط إشعارك',
          paragraphs: [tx('rental.guide.update.notice')],
          folio: { article: '18.2', law: 'LAU' },
        },
        {
          id: 'ejemplo',
          heading: 'مثال تطبيقي',
          paragraphs: [],
          example: [exampleDecree, exampleNoDecree],
          after: [
            'ما دام المرسوم بانتظار مصادقة البرلمان ⁨(Congreso)⁩، فالحسبتان ممكنتان: الأولى إذا صادق عليه البرلمان، والثانية إذا ألغاه.',
          ],
          folio: { article: '18', law: 'LAU · RDL 29/2026' },
        },
      ],
      faq: [
        {
          anchor: 'faq-desde-cuando',
          question: 'ابتداءً من متى يُدفع الإيجار بعد الزيادة؟',
          answer: tx('rental.guide.update.notice'),
        },
        {
          anchor: 'faq-sin-clausula',
          question: 'هل يمكن أن يُرفع إيجاري إذا لم يذكر العقد شيئًا؟',
          answer: tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause }),
        },
        {
          anchor: 'faq-pendiente',
          question: 'ماذا يعني «بانتظار مصادقة البرلمان» ⁨(pendiente de convalidación)⁩؟',
          answer: `${caps.status} وإلى أن يصوّت البرلمان، تبقى زيادة ${pct(DECREE_CAP)} وزيادة IRAV أو IPC القراءتين الممكنتين.`,
        },
        {
          anchor: 'faq-irav-o-ipc',
          question: 'هل ينطبق عليّ IRAV أم IPC؟',
          answer: tx('rent_indices.faq.irav_or_ipc_answer', { decreto: caps.faqIravOrIpc }),
        },
      ],
      sources: sources([
        'update_clause',
        'update_clause_rdl29',
        'update_notice',
        'cap_ipc',
        'cap_igc_2022',
        'cap_igc_2023',
        'cap_3_2024',
        'cap_irav',
        'cap_2_rdl29',
      ]),
    };
  }

  if (id === 'decree') {
    // The list gives the decree's status once, in its opening line, while it stands.
    const standing = decree.status !== 'repealed';
    const point = (key: Key, vars?: Record<string, string>) =>
      standing ? tx(key, { ...vars, decreto: 'المرسوم' }) : sentence(key, vars);
    const status = caps.status;
    return {
      lead: `يسري Real Decreto-ley 29/2026 منذ ${since}. يدخل المرسوم بقانون ⁨(decreto-ley)⁩ حيّز التنفيذ حين ينصّ هو نفسه على ذلك (وهذا المرسوم، في اليوم التالي لنشره)، لكنه يسقط إذا لم يصادق عليه البرلمان ⁨(Congreso)⁩ خلال 30 يومًا: لهذا يهمّ دائمًا معرفة وضعه.`,
      sections: [
        {
          id: 'estado',
          heading: 'ما وضع المرسوم',
          paragraphs: [],
          status,
          after: caps.repealed ? [caps.repealed] : [],
          folio: { article: '86.2', law: 'CE' },
        },
        {
          id: 'que-cambia',
          heading: 'ما الذي يتغيّر للمستأجِر',
          paragraphs: [
            standing
              ? `أهم ما يغيّره ${decreeClause('ar', norms, 'rdl29_2026', checkedOn)} مع النص القانوني لكل نقطة:`
              : 'أهم النقاط، مع النص القانوني لكل نقطة:',
          ],
          list: [
            `زيادة الإيجار: ${point('rental.page.decree.rise')}`,
            `المناطق السكنية المتوترة: ${point('rental.page.decree.zones')}`,
            `أتعاب الوكالة: ${point('rental.page.decree.fees', { desde: since })}`,
            `وثيقة التأمين ضد عدم دفع الإيجار: ${point('rental.page.decree.insurance')}`,
            `الضرائب مثل ضريبة العقارات ⁨(IBI)⁩: ${point('rental.page.decree.taxes')}`,
            `رسوم اتحاد الملاك: ${point('rental.page.charges.community')}`,
            `وثيقة إنهاء العقد: ${point('rental.page.decree.closing')}`,
          ],
          links: (['rise', 'fees', 'deposit', 'charges', 'deposit_return'] as const).map((to) => ({
            label: RENTAL_PAGES[to].name,
            path: RENTAL_PAGES[to].path,
          })),
          folio: { law: 'RDL 29/2026' },
        },
        {
          id: 'contexto',
          heading: 'المناطق المتوترة والملاك الكبار والتمديدات',
          paragraphs: [
            'لمناطق السوق السكنية المتوترة ⁨(zonas de mercado tensionado)⁩ والملاك الكبار ⁨(grandes tenedores)⁩ وتمديدات العقد قواعد خاصة بها قد تغيّر ما ينطبق عليك. لا نحسبها هنا: فهي تتوقف على مكان مسكنك، وعلى هوية المؤجِّر، وعلى تواريخ عقدك.',
            'تسألك المراجعة عن المنطقة وعن المؤجِّر، وتعطيك تواريخ عقدك.',
          ],
        },
      ],
      faq: [
        {
          anchor: 'faq-vigor',
          question: 'هل المرسوم سارٍ؟',
          answer: status,
        },
        {
          anchor: 'faq-derogado',
          question: 'ماذا يحدث إذا لم يصادق عليه البرلمان ⁨(Congreso)⁩؟',
          answer: `يُلغى ويتوقف تطبيقه منذ ذلك اليوم؛ وما حدث أثناء سريانه حالة مشكوك فيها. ${tx('rental.guide.update.doubtful')}`,
        },
        {
          anchor: 'faq-anteriores',
          question: 'ما المراسيم السابقة التي سقطت؟',
          answer: caps.repealed ?? 'لا يوجد أي مرسوم.',
        },
      ],
      sources: sources([
        'cap_2_rdl29',
        'fees_2026',
        'insurance_ban',
        'taxes_ban',
        'closing_document',
        'extension_rdl29',
      ]),
    };
  }

  const { rent, vat } = FEE_EXAMPLE;
  const charge = round2((rent * (100 + vat)) / 100);
  // The same reading in the text and in the question, and the 2026 clause only while the decree
  // has not been voted down.
  const otherNames =
    decree.status === 'repealed'
      ? tx('rental.guide.fees.other_names_open')
      : tx('rental.guide.fees.other_names', { desde: since });
  const from2026 =
    decree.status === 'repealed'
      ? ''
      : `، وإذا وقّعت منذ ${since}، فوفق Real Decreto-ley 29/2026، ${tx(`rent_indices.status_short.${decree.status}`)}، لا يجوز له كذلك أن يحمّلك إياه باسم آخر`;
  return {
    lead: 'من يدفع مصاريف الإدارة العقارية وإبرام العقد يتوقف على تاريخ توقيعك. هذه هي القواعد، مع مادة كل منها.',
    sections: [
      {
        id: 'regla',
        heading: 'من يدفع، حسب تاريخ توقيعك العقد',
        paragraphs: [tx('rental.guide.fees.lead')],
        list: [
          tx('rental.guide.fees.2019'),
          decree.status === 'repealed'
            ? tx('rental.guide.fees.2023_open')
            : tx('rental.guide.fees.2023', { hasta: decreeEve }),
          sentence('rental.guide.fees.2026', { desde: since }),
        ],
        after: [otherNames],
        folio: { article: '20', law: 'LAU · RDL 29/2026' },
      },
      {
        id: 'ejemplo',
        heading: 'مثال تطبيقي',
        paragraphs: [],
        example: [
          `تحصّل منك الوكالة العقارية ما يعادل شهرًا واحدًا من إيجار قدره ${formatEuros(rent)} مضافًا إليه ${pct(vat)} ضريبة القيمة المضافة ⁨(IVA)⁩: ⁨${formatEuros(rent)} + ${formatEuros(round2(charge - rent))} = ${formatEuros(charge)}⁩.`,
          `إذا وقّعت منذ 26 مايو 2023 فهو مصروف على المؤجِّر${from2026}. وإذا دفعته، فهذه ${formatEuros(charge)} مدفوعة بالزيادة.`,
        ],
        links: [{ label: REVIEW.name, path: REVIEW.path }],
        folio: { article: '20', law: 'LAU' },
      },
    ],
    faq: [
      {
        anchor: 'faq-honorarios',
        question: 'هل يمكن أن تُحصَّل مني أتعاب الوكالة العقارية؟',
        answer: `${tx('rental.guide.fees.2019')} ${tx('rental.guide.fees.2023_open')}`,
      },
      {
        anchor: 'faq-otro-nombre',
        question: 'وماذا لو سمّوها «estudio de solvencia» (دراسة الملاءة) أو «reserva» (الحجز)؟',
        answer: otherNames,
      },
      {
        anchor: 'faq-persona',
        question: 'كان المؤجِّر شخصًا طبيعيًا ووقّعت في 2020: من يدفع؟',
        answer: tx('rental.guide.fees.2019'),
      },
    ],
    sources: sources(['fees_2019', 'fees_2023', 'fees_2026']),
  };
}

// A sentence of a section component that rests on RDL 29/2026, with its status read from the norm
// table like the other pages' (checked on the day the page's date says).
export function pageDecree(page: RentalPageId, key: Key): string {
  const checkedOn = LAST_UPDATED[RENTAL_PAGES[page].path];
  if (!checkedOn) throw new Error(`${RENTAL_PAGES[page].path} needs its date in LAST_UPDATED.`);
  return capitalized(decreeSentence('ar', NORMS, key, 'rdl29_2026', checkedOn));
}

const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

// ---------- Worked examples, read from the engine ----------

const CONTRACT: RentalInput = {
  contractType: 'main_home',
  signedOn: parseDate('2022-03-01'),
  startDate: parseDate('2022-03-01'),
  landlordType: 'person',
  largeLandlord: false,
  agreedMonths: 60,
  initialRent: 900,
  updateClause: 'none',
  region: 'MD',
  stressedZone: null,
  fees: [],
  deposit: 900,
  guarantees: [],
  advanceMonths: null,
  updates: [],
  charges: [],
  moveOut: null,
};

const item = (items: readonly ItemResult[], kind: ItemResult['kind']): ItemResult => {
  const found = items.find((i) => i.kind === kind);
  if (!found) throw new Error(`The example needs a ${kind} item.`);
  return found;
};

const single = (r: ItemResult): ItemReading => {
  if (r.outcome.kind !== 'single') throw new Error('The example needs one reading.');
  return r.outcome.value;
};

const figure = (phrase: RentalPhrase, name: string): RentalFigure => {
  const v = phrase.vars?.[name];
  if (v === undefined || (typeof v === 'object' && 'key' in v))
    throw new Error(`Missing ${name} in ${phrase.key}.`);
  return v;
};
const number = (phrase: RentalPhrase, name: string): number => {
  const v = figure(phrase, name);
  if (typeof v === 'number') return v;
  if ('euros' in v) return v.euros;
  if ('days' in v) return v.days;
  if ('percent' in v) return v.percent;
  if ('integer' in v) return v.integer;
  throw new Error(`${name} is not a number.`);
};
const day = (phrase: RentalPhrase, name: string): string => {
  const v = figure(phrase, name);
  if (typeof v === 'number' || !('date' in v)) throw new Error(`${name} is not a date.`);
  return v.date;
};

export interface InterestStretch {
  readonly from: string;
  readonly to: string;
  readonly days: number;
  readonly rate: number;
  readonly yearDays: number;
  readonly interest: number;
}

export interface DepositReturnExample {
  readonly deposit: number;
  readonly keysReturnedOn: string;
  readonly returnedOn: string;
  readonly interestFrom: string;
  readonly stretches: readonly InterestStretch[];
  // With the year counted at its calendar days, and with 360: no norm settles which.
  readonly total: number;
  readonly totalCommercial: number;
}

const DEPOSIT_RETURN_EXAMPLE = {
  keysReturnedOn: '2022-11-15',
  returnedOn: '2023-03-20',
} as const;

export function depositReturnExample(): DepositReturnExample {
  const { keysReturnedOn, returnedOn } = DEPOSIT_RETURN_EXAMPLE;
  const items = checkDepositReturn(
    {
      ...CONTRACT,
      moveOut: {
        keysReturnedOn: parseDate(keysReturnedOn),
        returns: [{ on: parseDate(returnedOn), amount: CONTRACT.deposit ?? 0 }],
        deductions: [],
      },
    },
    parseDate(returnedOn),
    RENTAL_TABLES,
  );
  const outcome = item(items, 'deposit_interest').outcome;
  if (outcome.kind !== 'depends') throw new Error('The example needs both day counts.');
  const calendar = outcome.readings.find((r) =>
    r.worlds.some((w) => w['interest_day_count'] === false),
  );
  if (!calendar) throw new Error('The example needs the calendar reading.');
  const stretches = calendar.value.calculation
    .filter((p) => p.key === 'deposit.interest_stretch')
    .map((p) => ({
      from: day(p, 'from'),
      to: day(p, 'to'),
      days: number(p, 'days'),
      rate: number(p, 'rate'),
      yearDays: number(p, 'yearDays'),
      interest: number(p, 'interest'),
    }));
  const amounts = [outcome.low.amount ?? 0, outcome.high.amount ?? 0];
  return {
    deposit: CONTRACT.deposit ?? 0,
    keysReturnedOn,
    returnedOn,
    interestFrom: stretches[0]?.from ?? '',
    stretches,
    total: calendar.value.amount ?? 0,
    totalCommercial: Math.max(...amounts),
  };
}

export interface DepositExample {
  readonly rent: number;
  readonly asked: number;
  // The deposit plus the most the extra guarantees may add.
  readonly allowed: number;
  readonly over: number;
}

const DEPOSIT_EXAMPLE = { asked: 3600 } as const;

export function depositExample(): DepositExample {
  const rent = CONTRACT.initialRent;
  const result = item(
    checkGuarantees({ ...CONTRACT, deposit: DEPOSIT_EXAMPLE.asked }, NORMS),
    'guarantees',
  );
  const reading = single(result);
  if (reading.status !== 'over_cap' || reading.amount === null)
    throw new Error('The example needs a guarantee over the cap.');
  return {
    rent,
    asked: DEPOSIT_EXAMPLE.asked,
    allowed: DEPOSIT_EXAMPLE.asked - reading.amount,
    over: reading.amount,
  };
}

export interface ChargesExample {
  readonly agreed: number;
  readonly charged: number;
  readonly over: number;
}

const CHARGES_EXAMPLE = { agreed: 600, charged: 720, year: 2022 } as const;

export function chargesExample(): ChargesExample {
  const { agreed, charged, year } = CHARGES_EXAMPLE;
  const result = item(
    checkCharges(
      {
        ...CONTRACT,
        charges: [
          {
            kind: 'community',
            inContract: true,
            annualAgreed: agreed,
            charged: [{ year, amount: charged }],
          },
        ],
      },
      RENTAL_TABLES,
    ),
    'charge',
  );
  const reading = single(result);
  if (reading.status !== 'paid_over' || reading.amount === null)
    throw new Error('The example needs a charge over the agreed amount.');
  return { agreed, charged, over: reading.amount };
}

// The words of the rental pages in a language: another language's file exports its own.
export interface RentalPagesCopy {
  readonly pages: Record<RentalPageId, PageMeta>;
  readonly review: { readonly path: string; readonly name: string };
  readonly nextPages: (id: RentalPageId) => readonly { name: string; path: string }[];
  readonly rentalPage: (id: RentalPageId, ctx: PageContext) => RentalPage;
  readonly pageDecree: (page: RentalPageId, key: Key) => string;
}

export const RENTAL_COPY: RentalPagesCopy = {
  pages: RENTAL_PAGES,
  review: REVIEW,
  nextPages,
  rentalPage,
  pageDecree,
};
