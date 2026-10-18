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
// fees, and the deposit, its return and the charges, in Chinese, with the shape, paths and
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

export const REVIEW = { path: '/alquiler/', name: '核查您的租房' } as const;
const INDICES = { path: '/alquiler/irav-ipc/', name: '每月的 IRAV 和 IPC' } as const;

export const RENTAL_PAGES: Record<RentalPageId, PageMeta> = {
  rise: {
    path: '/alquiler/subida/',
    slug: 'subida',
    name: '您的租金最多能涨多少',
    crumb: '涨租',
    title: '2026年您的租金最多能涨多少',
    description: '按合同每满一年的日期列出涨租上限，附每项上限所依据的法规和一个带数字的例子。',
    h1: '2026年您的租金最多能涨多少',
  },
  decree: {
    path: '/alquiler/decreto-2026/',
    slug: 'decreto-2026',
    name: '2026年租房法令',
    crumb: '2026年租房法令',
    title: '2026年租房法令：有哪些变化及其状态',
    description:
      'Real Decreto-ley 29/2026 给租客带来了哪些变化，以及它目前的状态：自十月8日起生效，待众议院确认（convalidación）。',
    h1: '2026年租房法令：有哪些变化，目前处于什么状态',
  },
  fees: {
    path: '/alquiler/honorarios-inmobiliaria/',
    slug: 'honorarios-inmobiliaria',
    name: '房产中介费',
    crumb: '房产中介费',
    title: '房产中介可以向您收费吗？中介费',
    description: '根据您签订合同的日期，租房时的房产中介费由谁支付，并附每种情况适用的 LAU 条款。',
    h1: '房产中介可以向您收费吗？租房中介费',
  },
  deposit: {
    path: '/alquiler/fianza/',
    slug: 'fianza',
    name: '房东最多可以要求多少押金',
    crumb: '房东最多可以要求多少押金',
    title: '租房押金：最多可以要求多少（art. 36 LAU）',
    description:
      '押金（fianza）为一个月的租金，额外担保最多再加两个月的租金，预付最多一个月的租金。请对照每项上限的条款，核查向您要求的金额。',
    h1: '租房押金：最多可以向您要求多少',
  },
  deposit_return: {
    path: '/alquiler/devolucion-fianza/',
    slug: 'devolucion-fianza',
    name: '押金退还',
    crumb: '押金退还',
    title: '租房押金退还：期限和利息',
    description:
      '自您交还钥匙起，房东有一个月的时间退还押金；超过这一期限，按法定利率计息（art. 36.4 LAU）。附一个带数字的例子。',
    h1: '房东不退还押金：期限和利息',
  },
  charges: {
    path: '/alquiler/gastos/',
    slug: 'gastos',
    name: '房东可以向您收取的费用',
    crumb: '房东可以向您收取的费用',
    title: '租房中的 IBI、物业费和垃圾费：可以向您收取哪些',
    description:
      '只有双方以书面形式约定并写明年度金额，房东才能把费用转给您，而且前几年的涨幅有限制。art. 20 LAU 的规定。',
    h1: 'IBI、物业费和垃圾费：房东可以向您收取哪些',
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
    capitalized(decreeSentence('zh', norms, key, 'rdl29_2026', checkedOn));
  return {
    deposit: {
      lead: '住房租赁的押金（fianza）为一个月的租金。合同还可以要求其他担保，但法律对其规定了上限。',
      faq: [
        {
          question: '住房租赁最多可以要求多少押金？',
          answer: '一个月的租金，以现金支付（art. 36.1 LAU）。',
        },
        {
          question: '除押金外，还可以要求我提供其他担保吗？',
          answer:
            '可以，但在2019年三月6日起签订、期限不超过五年（房东是公司时不超过七年）的合同中，这项额外担保不得超过两个月的租金（art. 36.5 LAU）。',
        },
        {
          question: '可以要求我预付多少？',
          answer: '预付的租金不得超过一个月（art. 17 LAU）。',
        },
        {
          question: '可以强制我购买欠租险吗？',
          answer: decreed('rental.page.decree.insurance'),
        },
      ],
    },
    deposit_return: {
      lead: '您交还钥匙后，房东有一个月的时间退还押金。过了这一个月，尚未退还的部分按法定利率（interés legal del dinero）产生利息。',
      faq: [
        {
          question: '房东有多长时间退还押金？',
          answer:
            '自您交还钥匙起一个月。过了这一个月，尚未退还的部分按法定利率产生利息（art. 36.4 LAU）。',
        },
        {
          question: '利息从哪一天开始计算？',
          answer:
            '从这一个月届满后的第二天开始（按日期对日期计算），一直计算到退还款项的那一天，但这一天本身不计入（art. 36.4 LAU）。',
        },
        {
          question: '适用什么利率？',
          answer:
            '法定利率，每年由《国家总预算法》（Ley de Presupuestos Generales del Estado）确定。本核查对每个自然年的天数使用该年的利率，利率取自西班牙银行（Banco de España）的表格（art. 36.4 LAU）。',
        },
        {
          question: '房东可以因房屋损坏从押金中扣款吗？',
          answer:
            '本核查不评估因房屋损坏、清洁或其他名目的扣款是否合理：按房东给出的金额记录，不计入需支付给您的金额。',
        },
      ],
    },
    charges: {
      lead: '物业费（gastos de comunidad）和其他服务费用，只有在双方以书面形式约定并写明年度金额的情况下才由租客承担。而且其涨幅有上限。',
      faq: [
        {
          question: '除租金外，房东还可以向我收取哪些费用？',
          answer:
            '合同规定由租客承担的费用，但前提是双方以书面形式约定，并写明合同签订时的年度金额（art. 20 LAU）。',
        },
        {
          question: '这些费用最多能涨多少？',
          answer:
            '在合同的前五年（房东是公司时为前七年）内，这些费用（税费除外）每年只能经双方同意上涨一次，且涨幅任何时候都不得超过租金可上涨幅度的两倍（art. 20 LAU）。',
        },
        {
          question: '房东可以向我收取 IBI 吗？',
          answer: `取决于您签订合同的时间。${decreed('rental.page.decree.taxes')}${t('zh', 'rental.guide.charges.taxes_before', { desde: formatLongDay(norms.rdl29_2026.inForceSince, 'zh') })}`,
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
      status: t('zh', STATUS_KEY[s.status], {
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
  const tx = (key: Key, vars?: Record<string, string>) => t('zh', key, vars);
  const decree = norms.rdl29_2026;
  const decreeEve = formatLongDay(toIso(addDays(parseDate(decree.inForceSince), -1)), 'zh');
  const since = formatLongDay(decree.inForceSince, 'zh');
  const caps = capsCopy('zh', norms, {
    checkedOn,
    iravRate: ctx.irav,
    example: ctx.example,
  });
  const sentence = (key: Key, vars?: Record<string, string>) =>
    decreeSentence('zh', norms, key, 'rdl29_2026', checkedOn, vars);
  const sources = (rules: readonly RuleId[]) => pageSources(norms, rules);

  if (id === 'rise') {
    const { rent, anniversary } = RISE_EXAMPLE;
    const raise = (rate: number) => round2((rent * (100 + rate)) / 100);
    const capped = ctx.irav > DECREE_CAP;
    const exampleDecree = capped
      ? `您每月支付${formatEuros(rent)}，合同将于${formatLongDay(anniversary, 'zh')}再满一年。` +
        `按照最新公布的 IRAV（${formatRate(ctx.irav)}），如果 Real Decreto-ley 29/2026 适用，无新约定时的上限` +
        `为${pct(DECREE_CAP)}，而不是${formatRate(ctx.irav)}：您的租金最多可以涨到${formatEuros(raise(DECREE_CAP))}。`
      : `您每月支付${formatEuros(rent)}，合同将于${formatLongDay(anniversary, 'zh')}再满一年。` +
        `如果 Real Decreto-ley 29/2026 适用，无新约定时的上限为${pct(DECREE_CAP)}或 IRAV，取两者中较低者：` +
        `按照最新公布的 IRAV（${formatRate(ctx.irav)}），您的租金最多可以涨到${formatEuros(raise(ctx.irav))}。`;
    const exampleNoDecree =
      `如果众议院废止该法令，2023年五月26日起签订的合同的上限将重新为 IRAV 和 IPC 中较低者。` +
      `按照最新公布的 IRAV（${formatRate(ctx.irav)}），最多为${formatEuros(raise(ctx.irav))}，` +
      `前提是 IPC 不更低。适用的 IRAV 是截至${formatLongDay(anniversary, 'zh')}最新公布的那一个，目前尚未公布。`;
    return {
      lead: '涨租取决于三件事：合同是否约定涨租、合同每满一年的日期，以及当天的法定上限。以下逐项列出各项上限及其条款。',
      sections: [
        {
          id: 'topes',
          heading: '各项上限，按合同满一年的日期',
          paragraphs: [tx('rent_indices.caps_lead')],
          caps: caps.rows,
          status: caps.status,
          after: [...(caps.repealed ? [caps.repealed] : []), ...(caps.now ? [caps.now] : [])],
          folio: { article: '18', law: 'LAU' },
        },
        {
          id: 'sin-clausula',
          heading: '没有更新条款，就不涨租',
          paragraphs: [tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause })],
          folio: { article: '18.1', law: 'LAU' },
        },
        {
          id: 'aviso',
          heading: '如何通知您',
          paragraphs: [tx('rental.guide.update.notice')],
          folio: { article: '18.2', law: 'LAU' },
        },
        {
          id: 'ejemplo',
          heading: '计算示例',
          paragraphs: [],
          example: [exampleDecree, exampleNoDecree],
          after: [
            '在该法令待众议院确认期间，两种计算都有可能：众议院予以确认则为第一种，予以废止则为第二种。',
          ],
          folio: { article: '18', law: 'LAU · RDL 29/2026' },
        },
      ],
      faq: [
        {
          anchor: 'faq-desde-cuando',
          question: '从什么时候开始支付上涨后的租金？',
          answer: tx('rental.guide.update.notice'),
        },
        {
          anchor: 'faq-sin-clausula',
          question: '如果合同中什么都没写，房东可以给我涨租吗？',
          answer: tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause }),
        },
        {
          anchor: 'faq-pendiente',
          question: '“待众议院确认”（pendiente de convalidación）是什么意思？',
          answer: `${caps.status}在众议院表决之前，${pct(DECREE_CAP)}的涨幅和按 IRAV 或 IPC 计算的涨幅是两种可能的计算方式。`,
        },
        {
          anchor: 'faq-irav-o-ipc',
          question: '我适用 IRAV 还是 IPC？',
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
      standing ? tx(key, { ...vars, decreto: '该法令' }) : sentence(key, vars);
    const status = caps.status;
    return {
      lead: `Real Decreto-ley 29/2026 自${since}起生效。王室法令（decreto-ley）在其自身规定的日期生效（这一部是在公布后的第二天），但如果众议院未在30天内予以确认，就会失效：因此始终需要留意它处于什么状态。`,
      sections: [
        {
          id: 'estado',
          heading: '该法令目前处于什么状态',
          paragraphs: [],
          status,
          after: caps.repealed ? [caps.repealed] : [],
          folio: { article: '86.2', law: 'CE' },
        },
        {
          id: 'que-cambia',
          heading: '对租客有哪些变化',
          paragraphs: [
            standing
              ? `${decreeClause('zh', norms, 'rdl29_2026', checkedOn)}的主要变化如下，每一项都附有所依据的法规：`
              : '主要变化如下，每一项都附有所依据的法规：',
          ],
          list: [
            `租金上涨：${point('rental.page.decree.rise')}`,
            `住房紧张地区：${point('rental.page.decree.zones')}`,
            `中介费：${point('rental.page.decree.fees', { desde: since })}`,
            `欠租险：${point('rental.page.decree.insurance')}`,
            `IBI 等税费：${point('rental.page.decree.taxes')}`,
            `物业费：${point('rental.page.charges.community')}`,
            `合同终止文件：${point('rental.page.decree.closing')}`,
          ],
          links: (['rise', 'fees', 'deposit', 'charges', 'deposit_return'] as const).map((to) => ({
            label: RENTAL_PAGES[to].name,
            path: RENTAL_PAGES[to].path,
          })),
          folio: { law: 'RDL 29/2026' },
        },
        {
          id: 'contexto',
          heading: '住房紧张地区、大房东和合同延期',
          paragraphs: [
            '住房紧张地区（zonas de mercado tensionado）、大房东（grandes tenedores）和合同延期都有各自的规则，可能会改变适用于您的内容。这里不计算这些规则：它们取决于您的住房所在地、您的房东是谁以及您的合同日期。',
            '本核查会询问您住房所在的地区和房东的情况，并给出您合同的各个日期。',
          ],
        },
      ],
      faq: [
        {
          anchor: 'faq-vigor',
          question: '该法令现在有效吗？',
          answer: status,
        },
        {
          anchor: 'faq-derogado',
          question: '如果众议院不予确认会怎样？',
          answer: `该法令即被废止，从那天起不再适用；在其有效期间发生的情况属于存疑情况。${tx('rental.guide.update.doubtful')}`,
        },
        {
          anchor: 'faq-anteriores',
          question: '此前有哪些法令被废止？',
          answer: caps.repealed ?? '无。',
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
      : `；如果您自${since}起签订合同，根据 Real Decreto-ley 29/2026（${tx(`rent_indices.status_short.${decree.status}`)}），房东也不能以其他名义把这笔费用转给您`;
  return {
    lead: '房产中介管理费和合同签订费用由谁支付，取决于您签订合同的日期。以下是相关规则及其条款。',
    sections: [
      {
        id: 'regla',
        heading: '由谁支付，取决于您何时签订合同',
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
        heading: '计算示例',
        paragraphs: [],
        example: [
          `房产中介向您收取一个月的租金（租金为${formatEuros(rent)}），外加${pct(vat)}的增值税（IVA）：${formatEuros(rent)} + ${formatEuros(round2(charge - rent))} = ${formatEuros(charge)}。`,
          `如果您自2023年五月26日起签订合同，这笔费用由房东承担${from2026}。如果您已经支付，就是多付了${formatEuros(charge)}。`,
        ],
        links: [{ label: REVIEW.name, path: REVIEW.path }],
        folio: { article: '20', law: 'LAU' },
      },
    ],
    faq: [
      {
        anchor: 'faq-honorarios',
        question: '可以向我收取中介费吗？',
        answer: `${tx('rental.guide.fees.2019')}${tx('rental.guide.fees.2023_open')}`,
      },
      {
        anchor: 'faq-otro-nombre',
        question: '如果称之为“偿付能力评估”（estudio de solvencia）或“预订费”（reserva）呢？',
        answer: otherNames,
      },
      {
        anchor: 'faq-persona',
        question: '我的房东是个人，我在2020年签的合同：由谁支付？',
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
  return capitalized(decreeSentence('zh', NORMS, key, 'rdl29_2026', checkedOn));
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
