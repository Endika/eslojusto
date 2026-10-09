import { addDays, parseDate, toIso } from '../engine/date';
import { round2 } from '../engine/money';
import { checkDepositReturn } from '../engine/rental/deposit-return';
import { checkCharges } from '../engine/rental/charges';
import { checkGuarantees } from '../engine/rental/guarantees';
import type { ItemReading, ItemResult } from '../engine/rental/item';
import type { NormTable } from '../engine/rental/norms';
import { ruleSource, type RuleId } from '../engine/rental/rules';
import { RENTAL_TABLES } from '../engine/rental/data/tables';
import { NORMS } from '../engine/rental/data/norms';
import type { RentalFigure, RentalPhrase } from '../engine/rental/calculation';
import type { RentalInput } from '../engine/rental/types';
import { t, type Key } from '../i18n';
import { capsCopy, type CapRow, type Source } from './rent-caps';
import { decreeClause, decreeSentence } from './rental-guide';
import { DECREE_CAP, formatDay, formatEuros, formatLongDay, formatRate } from './rent-indices';
import type { Example } from './rent-indices';
import { LAST_UPDATED } from './updated';

// The six pages on a rental that sit under /alquiler/: the rise, the 2026 decree and the agency
// fees, and the deposit, its return and the charges. Spanish only, like the case pages, and they
// exist only in a PUBLIC_RENTAL=1 build. The deposit pages keep their prose in a section component
// each and the others are built here from the engine's norm table and rule list, so a validation
// or a repeal changes them without touching the copy. Every figure of a worked example comes out
// of the rental engine or the norm table.

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

export const REVIEW = { path: '/alquiler/', name: 'Revisa tu alquiler' } as const;
export const INDICES = { path: '/alquiler/irav-ipc/', name: 'IRAV e IPC de cada mes' } as const;

export const RENTAL_PAGES: Record<RentalPageId, PageMeta> = {
  rise: {
    path: '/alquiler/subida/',
    slug: 'subida',
    name: 'Cuánto te pueden subir el alquiler',
    crumb: 'Subida del alquiler',
    title: 'Cuánto te pueden subir el alquiler en 2026',
    description:
      'Topes de la subida del alquiler según el día en que se cumple el año de contrato, con la norma de cada uno y un ejemplo con cifras.',
    h1: 'Cuánto te pueden subir el alquiler en 2026',
  },
  decree: {
    path: '/alquiler/decreto-2026/',
    slug: 'decreto-2026',
    name: 'Decreto del alquiler 2026',
    crumb: 'Decreto del alquiler 2026',
    title: 'Decreto del alquiler 2026: qué cambia y su estado',
    description:
      'Qué cambia para el inquilino con el Real Decreto-ley 29/2026 y en qué estado está: en vigor desde el 8 de octubre, pendiente de convalidación.',
    h1: 'Decreto del alquiler 2026: qué cambia y en qué estado está',
  },
  fees: {
    path: '/alquiler/honorarios-inmobiliaria/',
    slug: 'honorarios-inmobiliaria',
    name: 'Honorarios de la inmobiliaria',
    crumb: 'Honorarios de la inmobiliaria',
    title: '¿Puede la inmobiliaria cobrarte a ti? Honorarios',
    description:
      'Quién paga los honorarios de la inmobiliaria en el alquiler según la fecha en que firmaste el contrato, con el artículo de la LAU de cada caso.',
    h1: '¿Puede la inmobiliaria cobrarte a ti? Honorarios en el alquiler',
  },
  deposit: {
    path: '/alquiler/fianza/',
    slug: 'fianza',
    name: 'Cuánta fianza pueden pedirte',
    crumb: 'Cuánta fianza pueden pedirte',
    title: 'Fianza del alquiler: cuánto pueden pedirte (art. 36 LAU)',
    description:
      'Una mensualidad de fianza, hasta dos más de garantía adicional y una de pago por adelantado. Comprueba cuánto te han pedido con el artículo de cada tope.',
    h1: 'Fianza del alquiler: cuánto pueden pedirte',
  },
  deposit_return: {
    path: '/alquiler/devolucion-fianza/',
    slug: 'devolucion-fianza',
    name: 'Devolución de la fianza',
    crumb: 'Devolución de la fianza',
    title: 'Devolución de la fianza del alquiler: plazo e intereses',
    description:
      'El casero tiene un mes desde que entregas las llaves para devolver la fianza; después, intereses legales (art. 36.4 LAU). Con un ejemplo con cifras.',
    h1: 'Tu casero no te devuelve la fianza: plazo e intereses',
  },
  charges: {
    path: '/alquiler/gastos/',
    slug: 'gastos',
    name: 'Gastos que te puede cobrar el casero',
    crumb: 'Gastos que te puede cobrar el casero',
    title: 'IBI, comunidad y basura en el alquiler: qué te pueden cobrar',
    description:
      'El casero solo puede pasarte gastos si lo pactáis por escrito con su importe anual, y con su subida limitada los primeros años. Qué dice el art. 20 LAU.',
    h1: 'IBI, comunidad y basura: qué puede cobrarte tu casero',
  },
};

// The pages whose prose lives in a section component of its own.
export type StaticPageId = 'deposit' | 'deposit_return' | 'charges';

export const STATIC_PAGE_IDS: readonly StaticPageId[] = ['deposit', 'deposit_return', 'charges'];

// Built on demand: their answers on the decree read its status from the norm table.
const staticPages = (
  norms: NormTable,
  checkedOn: string,
): Record<StaticPageId, { readonly lead: string; readonly faq: readonly Question[] }> => {
  const decreed = (key: Key) =>
    capitalized(decreeSentence('es', norms, key, 'rdl29_2026', checkedOn));
  return {
    deposit: {
      lead: 'En un alquiler de vivienda la fianza es de una mensualidad. El contrato puede pedir además otras garantías, pero la ley les pone un tope.',
      faq: [
        {
          question: '¿Cuánta fianza me pueden pedir en un alquiler de vivienda?',
          answer: 'Una mensualidad de renta, en metálico (art. 36.1 LAU).',
        },
        {
          question: '¿Pueden pedirme más garantías aparte de la fianza?',
          answer:
            'Sí, pero en los contratos firmados desde el 6 de marzo de 2019 de hasta cinco años, o hasta siete si el casero es una empresa, esa garantía adicional no puede pasar de dos mensualidades de renta (art. 36.5 LAU).',
        },
        {
          question: '¿Cuánto me pueden pedir por adelantado?',
          answer: 'No más de una mensualidad de renta por adelantado (art. 17 LAU).',
        },
        {
          question: '¿Pueden obligarme a contratar un seguro de impago?',
          answer: decreed('rental.page.decree.insurance'),
        },
      ],
    },
    deposit_return: {
      lead: 'Cuando entregas las llaves, tu casero tiene un mes para devolverte la fianza. Pasado ese mes, lo que falte por devolver genera el interés legal del dinero.',
      faq: [
        {
          question: '¿Cuánto tiempo tiene el casero para devolver la fianza?',
          answer:
            'Un mes desde que entregas las llaves. Pasado ese mes, lo que falte por devolver genera el interés legal del dinero (art. 36.4 LAU).',
        },
        {
          question: '¿Desde qué día corre el interés?',
          answer:
            'Desde el día siguiente a que se cumple el mes, contado de fecha a fecha, y hasta el día en que te devuelven el dinero, que ya no cuenta (art. 36.4 LAU).',
        },
        {
          question: '¿Qué interés se aplica?',
          answer:
            'El interés legal del dinero, que fija cada año la Ley de Presupuestos Generales del Estado. La revisión usa el tipo de cada año natural, de la tabla del Banco de España, para los días de ese año (art. 36.4 LAU).',
        },
        {
          question: '¿Puede descontarme algo de la fianza por desperfectos?',
          answer:
            'Esta revisión no valora si un descuento por desperfectos, limpieza u otro concepto está justificado: lo anota como te lo dieron y no lo incluye en lo que te deben.',
        },
      ],
    },
    charges: {
      lead: 'Los gastos de la comunidad y otros servicios solo pasan al inquilino si lo pactáis por escrito con su importe anual. Y su subida tiene un tope.',
      faq: [
        {
          question: '¿Qué gastos puede cobrarme el casero aparte de la renta?',
          answer:
            'Los gastos que el contrato pase al inquilino, solo si lo pactasteis por escrito y con su importe anual a la fecha del contrato (art. 20 LAU).',
        },
        {
          question: '¿Cuánto pueden subir esos gastos?',
          answer:
            'En los cinco primeros años de contrato, o siete si el casero es una empresa, esos gastos, salvo los tributos, solo pueden subir una vez al año, por acuerdo, y nunca más del doble de lo que puede subir la renta (art. 20 LAU).',
        },
        {
          question: '¿Puede cobrarme el IBI?',
          answer: `Depende de cuándo firmaste. ${decreed('rental.page.decree.taxes')} ${t('es', 'rental.guide.charges.taxes_before', { desde: formatLongDay(norms.rdl29_2026.inForceSince) })}`,
        },
      ],
    },
  };
};

// RDL 29/2026 was promulgated on 06-10-2026; the Congress has 30 days to vote on it.
const DECREE_PROMULGATED = '2026-10-06';
const VOTE_DAYS = 30;

// The worked examples are on made-up figures.
export const RISE_EXAMPLE = { rent: 900, anniversary: '2026-11-01' } as const;
export const FEE_EXAMPLE = { rent: 900, vat: 21 } as const;

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
      status: t('es', STATUS_KEY[s.status], {
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
  const tx = (key: Key, vars?: Record<string, string>) => t('es', key, vars);
  const decree = norms.rdl29_2026;
  const decreeEve = formatLongDay(toIso(addDays(parseDate(decree.inForceSince), -1)));
  const since = formatLongDay(decree.inForceSince);
  const caps = capsCopy('es', norms, {
    checkedOn,
    iravRate: ctx.irav,
    example: ctx.example,
  });
  const sentence = (key: Key, vars?: Record<string, string>) =>
    decreeSentence('es', norms, key, 'rdl29_2026', checkedOn, vars);
  const sources = (rules: readonly RuleId[]) => pageSources(norms, rules);

  if (id === 'rise') {
    const { rent, anniversary } = RISE_EXAMPLE;
    const raise = (rate: number) => round2((rent * (100 + rate)) / 100);
    const capped = ctx.irav > DECREE_CAP;
    const exampleDecree = capped
      ? `Pagas ${formatEuros(rent)} al mes y tu contrato cumple un año más el ${formatLongDay(anniversary)}. ` +
        `Con el último IRAV publicado (${formatRate(ctx.irav)}), si rige el Real Decreto-ley 29/2026, el tope sin nuevo pacto ` +
        `es el ${pct(DECREE_CAP)}, no el ${formatRate(ctx.irav)}: tu renta puede pasar a ${formatEuros(raise(DECREE_CAP))} como mucho.`
      : `Pagas ${formatEuros(rent)} al mes y tu contrato cumple un año más el ${formatLongDay(anniversary)}. ` +
        `Si rige el Real Decreto-ley 29/2026, el tope sin nuevo pacto es el ${pct(DECREE_CAP)} o el IRAV, el más bajo: ` +
        `con el último IRAV publicado (${formatRate(ctx.irav)}), tu renta puede pasar a ${formatEuros(raise(ctx.irav))} como mucho.`;
    const exampleNoDecree =
      `Si el Congreso derogara el decreto, el tope en un contrato firmado desde el 26 de mayo de 2023 volvería a ser el IRAV o el IPC, el más bajo. ` +
      `Con el último IRAV publicado (${formatRate(ctx.irav)}), serían ${formatEuros(raise(ctx.irav))} como mucho, ` +
      `siempre que el IPC no fuera más bajo. El IRAV que cuenta es el último publicado el ${formatLongDay(anniversary)}, que aún no existe.`;
    return {
      lead: 'La subida depende de tres cosas: que el contrato la pacte, el día en que se cumple cada año de contrato y el tope legal de ese día. Aquí están los topes, uno por uno y con su artículo.',
      sections: [
        {
          id: 'topes',
          heading: 'Los topes, según el día en que se cumple el año',
          paragraphs: [tx('rent_indices.caps_lead')],
          caps: caps.rows,
          status: caps.status,
          after: [...(caps.repealed ? [caps.repealed] : []), ...(caps.now ? [caps.now] : [])],
          folio: { article: '18', law: 'LAU' },
        },
        {
          id: 'sin-clausula',
          heading: 'Sin cláusula, no hay subida',
          paragraphs: [tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause })],
          folio: { article: '18.1', law: 'LAU' },
        },
        {
          id: 'aviso',
          heading: 'Cómo te tienen que avisar',
          paragraphs: [tx('rental.guide.update.notice')],
          folio: { article: '18.2', law: 'LAU' },
        },
        {
          id: 'ejemplo',
          heading: 'Ejemplo resuelto',
          paragraphs: [],
          example: [exampleDecree, exampleNoDecree],
          after: [
            'Mientras el decreto esté pendiente de convalidación, las dos cuentas son posibles: la primera si el Congreso lo convalida y la segunda si lo deroga.',
          ],
          folio: { article: '18', law: 'LAU · RDL 29/2026' },
        },
      ],
      faq: [
        {
          anchor: 'faq-desde-cuando',
          question: '¿Desde cuándo tengo que pagar la renta subida?',
          answer: tx('rental.guide.update.notice'),
        },
        {
          anchor: 'faq-sin-clausula',
          question: '¿Me pueden subir el alquiler si el contrato no dice nada?',
          answer: tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause }),
        },
        {
          anchor: 'faq-pendiente',
          question: '¿Qué significa «pendiente de convalidación»?',
          answer: `${caps.status} Hasta que vote, la subida del ${pct(DECREE_CAP)} y la del IRAV o el IPC son las dos lecturas posibles.`,
        },
        {
          anchor: 'faq-irav-o-ipc',
          question: '¿Me toca el IRAV o el IPC?',
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
    const deadline = toIso(addDays(parseDate(DECREE_PROMULGATED), VOTE_DAYS));
    // The list gives the decree's status once, in its opening line, while it stands.
    const standing = decree.status !== 'repealed';
    const point = (key: Key, vars?: Record<string, string>) =>
      standing ? tx(key, { ...vars, decreto: 'el decreto' }) : sentence(key, vars);
    const status = `${caps.status} El plazo de ${VOTE_DAYS} días para votarlo termina en torno al ${formatLongDay(deadline)}.`;
    return {
      lead: `El Real Decreto-ley 29/2026 rige desde el ${since}. Un decreto-ley entra en vigor cuando él mismo lo dice (este, el día siguiente a publicarse), pero decae si el Congreso no lo convalida en 30 días: por eso hay que mirar siempre en qué estado está.`,
      sections: [
        {
          id: 'estado',
          heading: 'En qué estado está el decreto',
          paragraphs: [],
          status,
          after: caps.repealed ? [caps.repealed] : [],
          folio: { article: '86.2', law: 'CE' },
        },
        {
          id: 'que-cambia',
          heading: 'Qué cambia para el inquilino',
          paragraphs: [
            standing
              ? `Lo principal que cambia ${decreeClause('es', norms, 'rdl29_2026', checkedOn)} con la norma de cada punto:`
              : 'Lo principal, con la norma de cada punto:',
          ],
          list: [
            `Subida de la renta: ${point('rental.page.decree.rise')}`,
            `Zonas tensionadas: ${point('rental.page.decree.zones')}`,
            `Honorarios de la agencia: ${point('rental.page.decree.fees', { desde: since })}`,
            `Seguro de impago: ${point('rental.page.decree.insurance')}`,
            `Tributos como el IBI: ${point('rental.page.decree.taxes')}`,
            `Gastos de comunidad: ${point('rental.page.charges.community')}`,
            `Documento de fin de contrato: ${point('rental.page.decree.closing')}`,
          ],
          links: (['rise', 'fees', 'deposit', 'charges', 'deposit_return'] as const).map((to) => ({
            label: RENTAL_PAGES[to].name,
            path: RENTAL_PAGES[to].path,
          })),
          folio: { law: 'RDL 29/2026' },
        },
        {
          id: 'contexto',
          heading: 'Zonas tensionadas, grandes tenedores y prórrogas',
          paragraphs: [
            'Las zonas de mercado tensionado, los grandes tenedores y las prórrogas del contrato tienen reglas propias que pueden cambiar lo que te toca. Aquí no las calculamos: dependen de dónde está tu vivienda, de quién es tu casero y de las fechas de tu contrato.',
            'La revisión te pregunta por la zona y por el casero, y te da las fechas de tu contrato.',
          ],
        },
      ],
      faq: [
        {
          anchor: 'faq-vigor',
          question: '¿El decreto está en vigor?',
          answer: status,
        },
        {
          anchor: 'faq-derogado',
          question: '¿Qué pasa si el Congreso no lo convalida?',
          answer: `Queda derogado y deja de aplicarse desde ese día; lo que pasó mientras rigió es un caso dudoso. ${tx('rental.guide.update.doubtful')}`,
        },
        {
          anchor: 'faq-anteriores',
          question: '¿Qué decretos anteriores cayeron?',
          answer: caps.repealed ?? 'Ninguno.',
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
      : `, y si firmaste desde el ${since}, según el Real Decreto-ley 29/2026, ${tx(`rent_indices.status_short.${decree.status}`)}, tampoco puede pasártelo con otro nombre`;
  return {
    lead: 'Quién paga los gastos de gestión inmobiliaria y de formalización del contrato depende de la fecha en que firmaste. Estas son las reglas, con su artículo.',
    sections: [
      {
        id: 'regla',
        heading: 'Quién paga, según cuándo firmaste el contrato',
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
        heading: 'Ejemplo resuelto',
        paragraphs: [],
        example: [
          `La inmobiliaria te cobra una mensualidad de una renta de ${formatEuros(rent)} más el ${pct(vat)} de IVA: ${formatEuros(rent)} + ${formatEuros(round2(charge - rent))} = ${formatEuros(charge)}.`,
          `Si firmaste desde el 26 de mayo de 2023 es un gasto del casero${from2026}. Si lo pagaste, son ${formatEuros(charge)} pagados de más.`,
        ],
        links: [{ label: REVIEW.name, path: REVIEW.path }],
        folio: { article: '20', law: 'LAU' },
      },
    ],
    faq: [
      {
        anchor: 'faq-honorarios',
        question: '¿Me pueden cobrar honorarios de agencia?',
        answer: `${tx('rental.guide.fees.2019')} ${tx('rental.guide.fees.2023_open')}`,
      },
      {
        anchor: 'faq-otro-nombre',
        question: '¿Y si lo llaman «estudio de solvencia» o «reserva»?',
        answer: otherNames,
      },
      {
        anchor: 'faq-persona',
        question: 'Mi casero era una persona y firmé en 2020: ¿quién paga?',
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
  return capitalized(decreeSentence('es', NORMS, key, 'rdl29_2026', checkedOn));
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

export const DEPOSIT_RETURN_EXAMPLE = {
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

export const DEPOSIT_EXAMPLE = { asked: 3600 } as const;

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

export const CHARGES_EXAMPLE = { agreed: 600, charged: 720, year: 2022 } as const;

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
