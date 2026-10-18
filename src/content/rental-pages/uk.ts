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
// fees, and the deposit, its return and the charges, in Ukrainian, with the shape, paths and
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

export const REVIEW = { path: '/alquiler/', name: 'Перевірте свою оренду' } as const;
const INDICES = { path: '/alquiler/irav-ipc/', name: 'IRAV і IPC за кожен місяць' } as const;

export const RENTAL_PAGES: Record<RentalPageId, PageMeta> = {
  rise: {
    path: '/alquiler/subida/',
    slug: 'subida',
    name: 'Наскільки вам можуть підвищити орендну плату',
    crumb: 'Підвищення орендної плати',
    title: 'Наскільки вам можуть підвищити орендну плату у 2026 р.',
    description:
      'Граничні рівні підвищення орендної плати залежно від дня, коли виповнюється рік договору, з нормою для кожного з них і прикладом із цифрами.',
    h1: 'Наскільки вам можуть підвищити орендну плату у 2026 р.',
  },
  decree: {
    path: '/alquiler/decreto-2026/',
    slug: 'decreto-2026',
    name: 'Декрет про оренду 2026 р.',
    crumb: 'Декрет про оренду 2026 р.',
    title: 'Декрет про оренду 2026 р.: що змінюється і його статус',
    description:
      'Що змінюється для орендаря з Real Decreto-ley 29/2026 і який його статус: діє з 8 жовтня, очікує затвердження Конгресом (convalidación).',
    h1: 'Декрет про оренду 2026 р.: що змінюється і який його статус',
  },
  fees: {
    path: '/alquiler/honorarios-inmobiliaria/',
    slug: 'honorarios-inmobiliaria',
    name: 'Винагорода агентства нерухомості',
    crumb: 'Винагорода агентства нерухомості',
    title: 'Чи може агентство нерухомості стягнути винагороду з вас?',
    description:
      'Хто оплачує винагороду агентства нерухомості при оренді залежно від дати, коли ви підписали договір, зі статтею LAU для кожного випадку.',
    h1: 'Чи може агентство нерухомості стягнути винагороду з вас? Винагорода при оренді',
  },
  deposit: {
    path: '/alquiler/fianza/',
    slug: 'fianza',
    name: 'Який заставний депозит можуть від вас вимагати',
    crumb: 'Який заставний депозит можуть від вас вимагати',
    title: 'Заставний депозит при оренді: скільки можуть вимагати (art. 36 LAU)',
    description:
      'Місячна орендна плата як заставний депозит, ще до двох як додаткова гарантія і одна як оплата наперед. Перевірте, скільки з вас вимагали, зі статтею для кожного граничного рівня.',
    h1: 'Заставний депозит при оренді: скільки можуть від вас вимагати',
  },
  deposit_return: {
    path: '/alquiler/devolucion-fianza/',
    slug: 'devolucion-fianza',
    name: 'Повернення заставного депозиту',
    crumb: 'Повернення заставного депозиту',
    title: 'Повернення заставного депозиту за орендою: строк і відсотки',
    description:
      'Орендодавець має місяць від дня, коли ви повертаєте ключі, щоб повернути заставний депозит; після цього — відсотки за законною ставкою (art. 36.4 LAU). З прикладом із цифрами.',
    h1: 'Орендодавець не повертає вам заставний депозит: строк і відсотки',
  },
  charges: {
    path: '/alquiler/gastos/',
    slug: 'gastos',
    name: 'Витрати, які може стягувати з вас орендодавець',
    crumb: 'Витрати, які може стягувати з вас орендодавець',
    title: 'IBI, внески до ОСББ і вивіз сміття при оренді: що з вас можуть стягувати',
    description:
      'Орендодавець може перекладати на вас витрати, лише якщо ви домовилися про це письмово із зазначенням їхньої річної суми, а їхнє підвищення в перші роки обмежене. Що передбачає art. 20 LAU.',
    h1: 'IBI, внески до ОСББ і вивіз сміття: що може стягувати з вас орендодавець',
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
    capitalized(decreeSentence('uk', norms, key, 'rdl29_2026', checkedOn));
  return {
    deposit: {
      lead: 'При оренді житла заставний депозит (fianza) дорівнює місячній орендній платі. Договір може вимагати й інші гарантії, але закон установлює для них граничний рівень.',
      faq: [
        {
          question: 'Який заставний депозит можуть вимагати від мене при оренді житла?',
          answer: 'Місячну орендну плату, готівкою (art. 36.1 LAU).',
        },
        {
          question: 'Чи можуть вимагати від мене інші гарантії, крім заставного депозиту?',
          answer:
            'Так, але в договорах, підписаних з 6 березня 2019 р., строком до п’яти років, або до семи, якщо орендодавець — компанія, ця додаткова гарантія не може перевищувати двомісячної орендної плати (art. 36.5 LAU).',
        },
        {
          question: 'Скільки можуть вимагати від мене наперед?',
          answer: 'Не більше ніж місячну орендну плату наперед (art. 17 LAU).',
        },
        {
          question:
            'Чи можуть зобов’язати мене укласти договір страхування від несплати орендної плати?',
          answer: decreed('rental.page.decree.insurance'),
        },
      ],
    },
    deposit_return: {
      lead: 'Коли ви повертаєте ключі, орендодавець має місяць, щоб повернути вам заставний депозит. Після цього місяця на неповернену суму нараховуються відсотки за законною ставкою (interés legal del dinero).',
      faq: [
        {
          question: 'Скільки часу має орендодавець, щоб повернути заставний депозит?',
          answer:
            'Місяць від дня, коли ви повертаєте ключі. Після цього місяця на неповернену суму нараховуються відсотки за законною ставкою (art. 36.4 LAU).',
        },
        {
          question: 'З якого дня нараховуються відсотки?',
          answer:
            'З дня, наступного після того, як минає місяць, рахуючи від дати до дати, і до дня, коли вам повертають гроші, який уже не враховується (art. 36.4 LAU).',
        },
        {
          question: 'Яка ставка застосовується?',
          answer:
            'Законна ставка (interés legal del dinero), яку щороку встановлює Ley de Presupuestos Generales del Estado (закон про державний бюджет). Перевірка застосовує ставку кожного календарного року, за таблицею Banco de España, до днів цього року (art. 36.4 LAU).',
        },
        {
          question: 'Чи може орендодавець утримати щось із заставного депозиту за пошкодження?',
          answer:
            'Ця перевірка не оцінює, чи обґрунтоване утримання за пошкодження, прибирання чи з іншої підстави: вона фіксує його так, як вам його вказали, і не включає до суми, що вам належить.',
        },
      ],
    },
    charges: {
      lead: 'Внески до ОСББ (comunidad) і плата за інші послуги переходять на орендаря, лише якщо ви домовилися про це письмово із зазначенням їхньої річної суми. А їхнє підвищення має граничний рівень.',
      faq: [
        {
          question: 'Які витрати, крім орендної плати, може стягувати з мене орендодавець?',
          answer:
            'Витрати, які договір покладає на орендаря, лише якщо ви домовилися про це письмово і з їхньою річною сумою на дату договору (art. 20 LAU).',
        },
        {
          question: 'Наскільки можуть зрости ці витрати?',
          answer:
            'Протягом перших п’яти років договору, або семи, якщо орендодавець — компанія, ці витрати, крім податків і зборів, можуть зростати лише раз на рік, за домовленістю, і ніколи не більше ніж удвічі від того, на скільки може зрости орендна плата (art. 20 LAU).',
        },
        {
          question: 'Чи може орендодавець стягувати з мене IBI?',
          answer: `Залежить від того, коли ви підписали договір. ${decreed('rental.page.decree.taxes')} ${t('uk', 'rental.guide.charges.taxes_before', { desde: formatLongDay(norms.rdl29_2026.inForceSince, 'uk') })}`,
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
      status: t('uk', STATUS_KEY[s.status], {
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
  const tx = (key: Key, vars?: Record<string, string>) => t('uk', key, vars);
  const decree = norms.rdl29_2026;
  const decreeEve = formatLongDay(toIso(addDays(parseDate(decree.inForceSince), -1)), 'uk');
  const since = formatLongDay(decree.inForceSince, 'uk');
  const caps = capsCopy('uk', norms, {
    checkedOn,
    iravRate: ctx.irav,
    example: ctx.example,
  });
  const sentence = (key: Key, vars?: Record<string, string>) =>
    decreeSentence('uk', norms, key, 'rdl29_2026', checkedOn, vars);
  const sources = (rules: readonly RuleId[]) => pageSources(norms, rules);

  if (id === 'rise') {
    const { rent, anniversary } = RISE_EXAMPLE;
    const raise = (rate: number) => round2((rent * (100 + rate)) / 100);
    const capped = ctx.irav > DECREE_CAP;
    const exampleDecree = capped
      ? `Ви платите ${formatEuros(rent)} на місяць, і ще один рік вашого договору виповнюється ${formatLongDay(anniversary, 'uk')}. ` +
        `За останнім опублікованим IRAV (${formatRate(ctx.irav)}), якщо діє Real Decreto-ley 29/2026, граничний рівень без нової домовленості ` +
        `становить ${pct(DECREE_CAP)}, а не ${formatRate(ctx.irav)}: ваша орендна плата може зрости щонайбільше до ${formatEuros(raise(DECREE_CAP))}.`
      : `Ви платите ${formatEuros(rent)} на місяць, і ще один рік вашого договору виповнюється ${formatLongDay(anniversary, 'uk')}. ` +
        `Якщо діє Real Decreto-ley 29/2026, граничний рівень без нової домовленості — ${pct(DECREE_CAP)} або IRAV, залежно від того, що нижче: ` +
        `за останнім опублікованим IRAV (${formatRate(ctx.irav)}) ваша орендна плата може зрости щонайбільше до ${formatEuros(raise(ctx.irav))}.`;
    const exampleNoDecree =
      `Якби Конгрес скасував декрет, граничним рівнем у договорі, підписаному з 26 травня 2023 р., знову став би IRAV або IPC, залежно від того, що нижче. ` +
      `За останнім опублікованим IRAV (${formatRate(ctx.irav)}) це було б щонайбільше ${formatEuros(raise(ctx.irav))}, ` +
      `за умови, що IPC не нижчий. Враховується IRAV, останній опублікований на ${formatLongDay(anniversary, 'uk')}, а його ще немає.`;
    return {
      lead: 'Підвищення залежить від трьох речей: чи передбачене воно договором, від дня, коли виповнюється кожен рік договору, і від граничного рівня, установленого законом на цей день. Тут наведено граничні рівні, один за одним і зі статтею для кожного.',
      sections: [
        {
          id: 'topes',
          heading: 'Граничні рівні залежно від дня, коли виповнюється рік договору',
          paragraphs: [tx('rent_indices.caps_lead')],
          caps: caps.rows,
          status: caps.status,
          after: [...(caps.repealed ? [caps.repealed] : []), ...(caps.now ? [caps.now] : [])],
          folio: { article: '18', law: 'LAU' },
        },
        {
          id: 'sin-clausula',
          heading: 'Без умови в договорі підвищення немає',
          paragraphs: [tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause })],
          folio: { article: '18.1', law: 'LAU' },
        },
        {
          id: 'aviso',
          heading: 'Як вас мають повідомити',
          paragraphs: [tx('rental.guide.update.notice')],
          folio: { article: '18.2', law: 'LAU' },
        },
        {
          id: 'ejemplo',
          heading: 'Приклад розрахунку',
          paragraphs: [],
          example: [exampleDecree, exampleNoDecree],
          after: [
            'Поки декрет очікує затвердження Конгресом, можливі обидва розрахунки: перший, якщо Конгрес його затвердить, і другий, якщо скасує.',
          ],
          folio: { article: '18', law: 'LAU · RDL 29/2026' },
        },
      ],
      faq: [
        {
          anchor: 'faq-desde-cuando',
          question: 'З якого часу я маю сплачувати підвищену орендну плату?',
          answer: tx('rental.guide.update.notice'),
        },
        {
          anchor: 'faq-sin-clausula',
          question:
            'Чи можуть мені підвищити орендну плату, якщо в договорі про це нічого не сказано?',
          answer: tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause }),
        },
        {
          anchor: 'faq-pendiente',
          question: 'Що означає «очікує затвердження Конгресом» (pendiente de convalidación)?',
          answer: `${caps.status} До голосування підвищення на ${pct(DECREE_CAP)} і підвищення за IRAV або IPC — два можливі розрахунки.`,
        },
        {
          anchor: 'faq-irav-o-ipc',
          question: 'Що застосовується до мене: IRAV чи IPC?',
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
      standing ? tx(key, { ...vars, decreto: 'декрет' }) : sentence(key, vars);
    const status = caps.status;
    return {
      lead: `Real Decreto-ley 29/2026 діє з ${since}. Декрет-закон набирає чинності тоді, коли визначає він сам (цей — наступного дня після публікації), але втрачає чинність, якщо Конгрес не затвердить його протягом 30 днів: тому завжди треба дивитися, який його статус.`,
      sections: [
        {
          id: 'estado',
          heading: 'Який статус декрету',
          paragraphs: [],
          status,
          after: caps.repealed ? [caps.repealed] : [],
          folio: { article: '86.2', law: 'CE' },
        },
        {
          id: 'que-cambia',
          heading: 'Що змінюється для орендаря',
          paragraphs: [
            standing
              ? `Основне, що змінює ${decreeClause('uk', norms, 'rdl29_2026', checkedOn)} з нормою для кожного пункту:`
              : 'Основне, з нормою для кожного пункту:',
          ],
          list: [
            `Підвищення орендної плати: ${point('rental.page.decree.rise')}`,
            `Зони напруженого ринку житла: ${point('rental.page.decree.zones')}`,
            `Винагорода агентства: ${point('rental.page.decree.fees', { desde: since })}`,
            `Страхування від несплати орендної плати: ${point('rental.page.decree.insurance')}`,
            `Податки і збори, як-от IBI: ${point('rental.page.decree.taxes')}`,
            `Внески до ОСББ: ${point('rental.page.charges.community')}`,
            `Документ про завершення договору: ${point('rental.page.decree.closing')}`,
          ],
          links: (['rise', 'fees', 'deposit', 'charges', 'deposit_return'] as const).map((to) => ({
            label: RENTAL_PAGES[to].name,
            path: RENTAL_PAGES[to].path,
          })),
          folio: { law: 'RDL 29/2026' },
        },
        {
          id: 'contexto',
          heading: 'Зони напруженого ринку житла, великі власники житла і продовження',
          paragraphs: [
            'Зони напруженого ринку житла (zonas de mercado tensionado), великі власники житла (grandes tenedores) і продовження договору мають власні правила, які можуть змінити те, що застосовується до вас. Тут ми їх не розраховуємо: вони залежать від того, де розташоване ваше житло, хто ваш орендодавець і які дати вашого договору.',
            'Перевірка запитує вас про зону і про орендодавця та наводить дати вашого договору.',
          ],
        },
      ],
      faq: [
        {
          anchor: 'faq-vigor',
          question: 'Чи діє декрет?',
          answer: status,
        },
        {
          anchor: 'faq-derogado',
          question: 'Що буде, якщо Конгрес його не затвердить?',
          answer: `Його скасовано, і він перестає застосовуватися з цього дня; те, що відбувалося, поки він діяв, — неоднозначний випадок. ${tx('rental.guide.update.doubtful')}`,
        },
        {
          anchor: 'faq-anteriores',
          question: 'Які попередні декрети втратили чинність?',
          answer: caps.repealed ?? 'Жоден.',
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
      : `, а якщо ви підписали договір з ${since}, згідно з Real Decreto-ley 29/2026 (${tx(`rent_indices.status_short.${decree.status}`)}), він не може перекласти їх на вас і під іншою назвою`;
  return {
    lead: 'Хто оплачує витрати на послуги з нерухомості та на оформлення договору, залежить від дати, коли ви підписали договір. Ось правила, зі статтею для кожного.',
    sections: [
      {
        id: 'regla',
        heading: 'Хто платить залежно від того, коли ви підписали договір',
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
        heading: 'Приклад розрахунку',
        paragraphs: [],
        example: [
          `Агентство нерухомості стягує з вас суму місячної орендної плати ${formatEuros(rent)} плюс ${pct(vat)} IVA (ПДВ): ${formatEuros(rent)} + ${formatEuros(round2(charge - rent))} = ${formatEuros(charge)}.`,
          `Якщо ви підписали договір з 26 травня 2023 р., це витрати орендодавця${from2026}. Якщо ви їх оплатили, це ${formatEuros(charge)} переплати.`,
        ],
        links: [{ label: REVIEW.name, path: REVIEW.path }],
        folio: { article: '20', law: 'LAU' },
      },
    ],
    faq: [
      {
        anchor: 'faq-honorarios',
        question: 'Чи можуть стягувати з мене винагороду агентства?',
        answer: `${tx('rental.guide.fees.2019')} ${tx('rental.guide.fees.2023_open')}`,
      },
      {
        anchor: 'faq-otro-nombre',
        question:
          'А якщо це називають «estudio de solvencia» (перевірка платоспроможності) чи «reserva» (бронювання)?',
        answer: otherNames,
      },
      {
        anchor: 'faq-persona',
        question: 'Орендодавець був фізичною особою, а договір підписано у 2020 р.: хто платить?',
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
  return capitalized(decreeSentence('uk', NORMS, key, 'rdl29_2026', checkedOn));
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
