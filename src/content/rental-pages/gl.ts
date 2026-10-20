// source: c1e410557cb4
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
// fees, and the deposit, its return and the charges, in Galician, with the shape, paths and
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

export const REVIEW = { path: '/alquiler/', name: 'Revisa o teu aluguer' } as const;
const INDICES = { path: '/alquiler/irav-ipc/', name: 'IRAV e IPC de cada mes' } as const;

export const RENTAL_PAGES: Record<RentalPageId, PageMeta> = {
  rise: {
    path: '/alquiler/subida/',
    slug: 'subida',
    name: 'Canto che poden subir o aluguer',
    crumb: 'Suba do aluguer',
    title: 'Canto che poden subir o aluguer en 2026',
    description:
      'Límites da suba do aluguer segundo o día en que se cumpre o ano de contrato, coa norma de cada un e un exemplo con cifras.',
    h1: 'Canto che poden subir o aluguer en 2026',
  },
  decree: {
    path: '/alquiler/decreto-2026/',
    slug: 'decreto-2026',
    name: 'Decreto do aluguer 2026',
    crumb: 'Decreto do aluguer 2026',
    title: 'Real Decreto-ley 29/2026 do aluguer: que cambia',
    description:
      'Que cambia para o inquilino co Real Decreto-ley 29/2026 e en que estado está: en vigor desde o 8 de outubro, pendente de convalidación.',
    h1: 'Real Decreto-ley 29/2026 do aluguer: que cambia e en que estado está',
  },
  fees: {
    path: '/alquiler/honorarios-inmobiliaria/',
    slug: 'honorarios-inmobiliaria',
    name: 'Honorarios da inmobiliaria',
    crumb: 'Honorarios da inmobiliaria',
    title: 'Pode a inmobiliaria cobrarche a ti? Honorarios',
    description:
      'Quen paga os honorarios da inmobiliaria no aluguer segundo a data en que asinaches o contrato, co artigo da LAU de cada caso.',
    h1: 'Pode a inmobiliaria cobrarche a ti? Honorarios no aluguer',
  },
  deposit: {
    path: '/alquiler/fianza/',
    slug: 'fianza',
    name: 'Canta fianza che poden pedir',
    crumb: 'Canta fianza che poden pedir',
    title: 'Fianza do aluguer: canto che poden pedir (art. 36 LAU)',
    description:
      'Unha mensualidade de fianza, ata dúas máis de garantía adicional e unha de pagamento por adiantado. Comproba canto che pediron co artigo de cada límite.',
    h1: 'Fianza do aluguer: canto che poden pedir',
  },
  deposit_return: {
    path: '/alquiler/devolucion-fianza/',
    slug: 'devolucion-fianza',
    name: 'Devolución da fianza',
    crumb: 'Devolución da fianza',
    title: 'Devolución da fianza do aluguer: prazo e xuros',
    description:
      'O propietario ten un mes desde que entregas as chaves para devolver a fianza; despois, xuros legais (art. 36.4 LAU). Cun exemplo con cifras.',
    h1: 'O teu propietario non che devolve a fianza: prazo e xuros',
  },
  charges: {
    path: '/alquiler/gastos/',
    slug: 'gastos',
    name: 'Gastos que che pode cobrar o propietario',
    crumb: 'Gastos que che pode cobrar o propietario',
    title: 'IBI, comunidade e lixo no aluguer: que che poden cobrar',
    description:
      'O propietario só pode pasarche gastos se o pactades por escrito co seu importe anual, e coa súa suba limitada os primeiros anos. Que di o art. 20 LAU.',
    h1: 'IBI, comunidade e lixo: que che pode cobrar o teu propietario',
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
    capitalized(decreeSentence('gl', norms, key, 'rdl29_2026', checkedOn));
  return {
    deposit: {
      lead: 'Nun aluguer de vivenda a fianza é dunha mensualidade. O contrato pode pedir ademais outras garantías, pero a lei ponlles un límite.',
      faq: [
        {
          question: 'Canta fianza me poden pedir nun aluguer de vivenda?',
          answer: 'Unha mensualidade de renda, en metálico (art. 36.1 LAU).',
        },
        {
          question: 'Pódenme pedir máis garantías á parte da fianza?',
          answer:
            'Si, pero nos contratos asinados desde o 6 de marzo de 2019 de ata cinco anos, ou ata sete se o propietario é unha empresa, esa garantía adicional non pode pasar de dúas mensualidades de renda (art. 36.5 LAU).',
        },
        {
          question: 'Canto me poden pedir por adiantado?',
          answer: 'Non máis dunha mensualidade de renda por adiantado (art. 17 LAU).',
        },
        {
          question: 'Pódenme obrigar a contratar un seguro de impagamento?',
          answer: decreed('rental.page.decree.insurance'),
        },
      ],
    },
    deposit_return: {
      lead: 'Cando entregas as chaves, o teu propietario ten un mes para devolverche a fianza. Pasado ese mes, o que falte por devolver xera o xuro legal do diñeiro.',
      faq: [
        {
          question: 'Canto tempo ten o propietario para devolver a fianza?',
          answer:
            'Un mes desde que entregas as chaves. Pasado ese mes, o que falte por devolver xera o xuro legal do diñeiro (art. 36.4 LAU).',
        },
        {
          question: 'Desde que día corre o xuro?',
          answer:
            'Desde o día seguinte a aquel en que se cumpre o mes, contado de data a data, e ata o día en que che devolven o diñeiro, que xa non conta (art. 36.4 LAU).',
        },
        {
          question: 'Que xuro se aplica?',
          answer:
            'O xuro legal do diñeiro, que fixa cada ano a Ley de Presupuestos Generales del Estado. A revisión usa o tipo de cada ano natural, da táboa do Banco de España, para os días dese ano (art. 36.4 LAU).',
        },
        {
          question: 'Pódeme descontar algo da fianza por desperfectos?',
          answer:
            'Esta revisión non valora se un desconto por desperfectos, limpeza ou outro concepto está xustificado: anótao como cho deron e non o inclúe no que che teñen que devolver.',
        },
      ],
    },
    charges: {
      lead: 'Os gastos da comunidade e doutros servizos só pasan ao inquilino se o pactades por escrito co seu importe anual. E a súa suba ten un límite.',
      faq: [
        {
          question: 'Que gastos me pode cobrar o propietario á parte da renda?',
          answer:
            'Os gastos que o contrato pase ao inquilino, só se o pactastes por escrito e co seu importe anual á data do contrato (art. 20 LAU).',
        },
        {
          question: 'Canto poden subir eses gastos?',
          answer:
            'Nos cinco primeiros anos de contrato, ou sete se o propietario é unha empresa, eses gastos, agás os tributos, só poden subir unha vez ao ano, por acordo, e nunca máis do dobre do que pode subir a renda (art. 20 LAU).',
        },
        {
          question: 'Pódeme cobrar o IBI?',
          answer: `Depende de cando asinaches. ${decreed('rental.page.decree.taxes')} ${t('gl', 'rental.guide.charges.taxes_before', { desde: formatLongDay(norms.rdl29_2026.inForceSince, 'gl') })}`,
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
      status: t('gl', STATUS_KEY[s.status], {
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
  const tx = (key: Key, vars?: Record<string, string>) => t('gl', key, vars);
  const decree = norms.rdl29_2026;
  const decreeEve = formatLongDay(toIso(addDays(parseDate(decree.inForceSince), -1)), 'gl');
  const since = formatLongDay(decree.inForceSince, 'gl');
  const caps = capsCopy('gl', norms, {
    checkedOn,
    iravRate: ctx.irav,
    example: ctx.example,
  });
  const sentence = (key: Key, vars?: Record<string, string>) =>
    decreeSentence('gl', norms, key, 'rdl29_2026', checkedOn, vars);
  const sources = (rules: readonly RuleId[]) => pageSources(norms, rules);

  if (id === 'rise') {
    const { rent, anniversary } = RISE_EXAMPLE;
    const raise = (rate: number) => round2((rent * (100 + rate)) / 100);
    const capped = ctx.irav > DECREE_CAP;
    const exampleDecree = capped
      ? `Pagas ${formatEuros(rent)} ao mes e o teu contrato cumpre un ano máis o ${formatLongDay(anniversary, 'gl')}. ` +
        `Co último IRAV publicado (${formatRate(ctx.irav)}), se rexe o Real Decreto-ley 29/2026, o límite sen un novo pacto ` +
        `é o ${pct(DECREE_CAP)}, non o ${formatRate(ctx.irav)}: a túa renda pode pasar a ${formatEuros(raise(DECREE_CAP))} como máximo.`
      : `Pagas ${formatEuros(rent)} ao mes e o teu contrato cumpre un ano máis o ${formatLongDay(anniversary, 'gl')}. ` +
        `Se rexe o Real Decreto-ley 29/2026, o límite sen un novo pacto é o ${pct(DECREE_CAP)} ou o IRAV, o máis baixo: ` +
        `co último IRAV publicado (${formatRate(ctx.irav)}), a túa renda pode pasar a ${formatEuros(raise(ctx.irav))} como máximo.`;
    const exampleNoDecree =
      `Se o Congreso derrogase o decreto, o límite nun contrato asinado desde o 26 de maio de 2023 volvería ser o IRAV ou o IPC, o máis baixo. ` +
      `Co último IRAV publicado (${formatRate(ctx.irav)}), serían ${formatEuros(raise(ctx.irav))} como máximo, ` +
      `sempre que o IPC non fose máis baixo. O IRAV que conta é o último publicado o ${formatLongDay(anniversary, 'gl')}, que aínda non existe.`;
    return {
      lead: 'A suba depende de tres cousas: que o contrato a pacte, o día en que se cumpre cada ano de contrato e o límite legal dese día. Aquí están os límites, un por un e co seu artigo.',
      sections: [
        {
          id: 'topes',
          heading: 'Os límites, segundo o día en que se cumpre o ano',
          paragraphs: [tx('rent_indices.caps_lead')],
          caps: caps.rows,
          status: caps.status,
          after: [...(caps.repealed ? [caps.repealed] : []), ...(caps.now ? [caps.now] : [])],
          folio: { article: '18', law: 'LAU' },
        },
        {
          id: 'sin-clausula',
          heading: 'Sen cláusula, non hai suba',
          paragraphs: [tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause })],
          folio: { article: '18.1', law: 'LAU' },
        },
        {
          id: 'aviso',
          heading: 'Como te teñen que avisar',
          paragraphs: [tx('rental.guide.update.notice')],
          folio: { article: '18.2', law: 'LAU' },
        },
        {
          id: 'ejemplo',
          heading: 'Exemplo resolto',
          paragraphs: [],
          example: [exampleDecree, exampleNoDecree],
          after: [
            'Mentres o decreto estea pendente de convalidación, os dous cálculos son posibles: o primeiro se o Congreso o convalida e o segundo se o derroga.',
          ],
          folio: { article: '18', law: 'LAU · RDL 29/2026' },
        },
      ],
      faq: [
        {
          anchor: 'faq-desde-cuando',
          question: 'Desde cando teño que pagar a renda subida?',
          answer: tx('rental.guide.update.notice'),
        },
        {
          anchor: 'faq-sin-clausula',
          question: 'Pódenme subir o aluguer se o contrato non di nada?',
          answer: tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause }),
        },
        {
          anchor: 'faq-pendiente',
          question: 'Que significa «pendente de convalidación»?',
          answer: `${caps.status} Ata que o Congreso vote, a suba do ${pct(DECREE_CAP)} e a do IRAV ou o IPC son as dúas interpretacións posibles.`,
        },
        {
          anchor: 'faq-irav-o-ipc',
          question: 'Tócame o IRAV ou o IPC?',
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
      standing ? tx(key, { ...vars, decreto: 'o decreto' }) : sentence(key, vars);
    const status = caps.status;
    return {
      lead: `O Real Decreto-ley 29/2026 rexe desde o ${since}. Un decreto-lei entra en vigor cando el mesmo o di (este, o día seguinte ao da súa publicación), pero decae se o Congreso non o convalida en 30 días: por iso hai que mirar sempre en que estado está.`,
      sections: [
        {
          id: 'estado',
          heading: 'En que estado está o decreto',
          paragraphs: [],
          status,
          after: caps.repealed ? [caps.repealed] : [],
          folio: { article: '86.2', law: 'CE' },
        },
        {
          id: 'que-cambia',
          heading: 'Que cambia para o inquilino',
          paragraphs: [
            standing
              ? `Os principais cambios que introduce a norma ${decreeClause('gl', norms, 'rdl29_2026', checkedOn)}, coa referencia de cada punto:`
              : 'Os principais cambios, coa referencia de cada punto:',
          ],
          list: [
            `Suba da renda: ${point('rental.page.decree.rise')}`,
            `Zonas tensionadas: ${point('rental.page.decree.zones')}`,
            `Honorarios da axencia: ${point('rental.page.decree.fees', { desde: since })}`,
            `Seguro de impagamento: ${point('rental.page.decree.insurance')}`,
            `Tributos como o IBI: ${point('rental.page.decree.taxes')}`,
            `Gastos de comunidade: ${point('rental.page.charges.community')}`,
            `Documento de finalización do contrato: ${point('rental.page.decree.closing')}`,
          ],
          links: (['rise', 'fees', 'deposit', 'charges', 'deposit_return'] as const).map((to) => ({
            label: RENTAL_PAGES[to].name,
            path: RENTAL_PAGES[to].path,
          })),
          folio: { law: 'RDL 29/2026' },
        },
        {
          id: 'contexto',
          heading: 'Zonas tensionadas, grandes tenedores e prórrogas',
          paragraphs: [
            'As zonas de mercado tensionado, os grandes tenedores e as prórrogas do contrato teñen regras propias que poden cambiar o que che toca. Aquí non as calculamos: dependen de onde está a túa vivenda, de quen é o teu propietario e das datas do teu contrato.',
            'A revisión pregúntache pola zona e polo propietario, e dáche as datas do teu contrato.',
          ],
        },
      ],
      faq: [
        {
          anchor: 'faq-vigor',
          question: 'O decreto está en vigor?',
          answer: status,
        },
        {
          anchor: 'faq-derogado',
          question: 'Que pasa se o Congreso non o convalida?',
          answer: `Queda derrogado e deixa de aplicarse desde ese día; o que pasou mentres rexeu é un caso dubidoso. ${tx('rental.guide.update.doubtful')}`,
        },
        {
          anchor: 'faq-anteriores',
          question: 'Que decretos anteriores caeron?',
          answer: caps.repealed ?? 'Ningún.',
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
      : `, e se asinaches desde o ${since}, segundo o Real Decreto-ley 29/2026, ${tx(`rent_indices.status_short.${decree.status}`)}, tampouco cho pode pasar con outro nome`;
  return {
    lead: 'Quen paga os gastos de xestión inmobiliaria e de formalización do contrato depende da data en que asinaches. Estas son as regras, co seu artigo.',
    sections: [
      {
        id: 'regla',
        heading: 'Quen paga, segundo cando asinaches o contrato',
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
        heading: 'Exemplo resolto',
        paragraphs: [],
        example: [
          `A inmobiliaria cóbrache unha mensualidade dunha renda de ${formatEuros(rent)} máis o ${pct(vat)} de IVA: ${formatEuros(rent)} + ${formatEuros(round2(charge - rent))} = ${formatEuros(charge)}.`,
          `Se asinaches desde o 26 de maio de 2023, é un gasto do propietario${from2026}. Se o pagaches, son ${formatEuros(charge)} pagados de máis.`,
        ],
        links: [{ label: REVIEW.name, path: REVIEW.path }],
        folio: { article: '20', law: 'LAU' },
      },
    ],
    faq: [
      {
        anchor: 'faq-honorarios',
        question: 'Pódenme cobrar honorarios de axencia?',
        answer: `${tx('rental.guide.fees.2019')} ${tx('rental.guide.fees.2023_open')}`,
      },
      {
        anchor: 'faq-otro-nombre',
        question: 'E se lle chaman «estudio de solvencia» ou «reserva»?',
        answer: otherNames,
      },
      {
        anchor: 'faq-persona',
        question: 'O meu propietario era unha persoa e asinei en 2020: quen paga?',
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
  return capitalized(decreeSentence('gl', NORMS, key, 'rdl29_2026', checkedOn));
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
