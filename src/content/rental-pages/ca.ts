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
// fees, and the deposit, its return and the charges, in Catalan, with the shape, paths and
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

export const REVIEW = { path: '/alquiler/', name: 'Revisa el teu lloguer' } as const;
const INDICES = { path: '/alquiler/irav-ipc/', name: 'IRAV i IPC de cada mes' } as const;

export const RENTAL_PAGES: Record<RentalPageId, PageMeta> = {
  rise: {
    path: '/alquiler/subida/',
    slug: 'subida',
    name: 'Quant et poden apujar el lloguer',
    crumb: 'Pujada del lloguer',
    title: 'Quant et poden apujar el lloguer el 2026',
    description:
      'Límits de la pujada del lloguer segons el dia en què es compleix l’any de contracte, amb la norma de cada un i un exemple amb xifres.',
    h1: 'Quant et poden apujar el lloguer el 2026',
  },
  decree: {
    path: '/alquiler/decreto-2026/',
    slug: 'decreto-2026',
    name: 'Decret del lloguer 2026',
    crumb: 'Decret del lloguer 2026',
    title: 'Decret del lloguer 2026: què canvia i el seu estat',
    description:
      'Què canvia per al llogater amb el Real Decreto-ley 29/2026 i en quin estat és: en vigor des del 8 d’octubre, pendent de convalidació.',
    h1: 'Decret del lloguer 2026: què canvia i en quin estat és',
  },
  fees: {
    path: '/alquiler/honorarios-inmobiliaria/',
    slug: 'honorarios-inmobiliaria',
    name: 'Honoraris de la immobiliària',
    crumb: 'Honoraris de la immobiliària',
    title: 'Et pot cobrar la immobiliària a tu? Honoraris',
    description:
      'Qui paga els honoraris de la immobiliària en el lloguer segons la data en què vas signar el contracte, amb l’article de la LAU de cada cas.',
    h1: 'Et pot cobrar la immobiliària a tu? Honoraris en el lloguer',
  },
  deposit: {
    path: '/alquiler/fianza/',
    slug: 'fianza',
    name: 'Quanta fiança et poden demanar',
    crumb: 'Quanta fiança et poden demanar',
    title: 'Fiança del lloguer: quanta et poden demanar (art. 36 LAU)',
    description:
      'Una mensualitat de fiança, fins a dues més de garantia addicional i una de pagament per avançat. Comprova quant t’han demanat amb l’article de cada límit.',
    h1: 'Fiança del lloguer: quanta et poden demanar',
  },
  deposit_return: {
    path: '/alquiler/devolucion-fianza/',
    slug: 'devolucion-fianza',
    name: 'Devolució de la fiança',
    crumb: 'Devolució de la fiança',
    title: 'Devolució de la fiança del lloguer: termini i interessos',
    description:
      'El propietari té un mes des que lliures les claus per retornar la fiança; després, interessos legals (art. 36.4 LAU). Amb un exemple amb xifres.',
    h1: 'El propietari no et retorna la fiança: termini i interessos',
  },
  charges: {
    path: '/alquiler/gastos/',
    slug: 'gastos',
    name: 'Despeses que et pot cobrar el propietari',
    crumb: 'Despeses que et pot cobrar el propietari',
    title: 'IBI, comunitat i escombraries en el lloguer: què et poden cobrar',
    description:
      'El propietari només et pot passar despeses si ho pacteu per escrit amb el seu import anual, i amb la pujada limitada els primers anys. Què diu l’art. 20 LAU.',
    h1: 'IBI, comunitat i escombraries: què et pot cobrar el propietari',
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
    capitalized(decreeSentence('ca', norms, key, 'rdl29_2026', checkedOn));
  return {
    deposit: {
      lead: 'En un lloguer d’habitatge la fiança és d’una mensualitat. El contracte pot demanar, a més, altres garanties, però la llei els posa un límit.',
      faq: [
        {
          question: 'Quanta fiança em poden demanar en un lloguer d’habitatge?',
          answer: 'Una mensualitat de renda, en metàl·lic (art. 36.1 LAU).',
        },
        {
          question: 'Em poden demanar més garanties a banda de la fiança?',
          answer:
            'Sí, però en els contractes signats des del 6 de març de 2019 de fins a cinc anys, o fins a set si el propietari és una empresa, aquesta garantia addicional no pot superar dues mensualitats de renda (art. 36.5 LAU).',
        },
        {
          question: 'Quant em poden demanar per avançat?',
          answer: 'No més d’una mensualitat de renda per avançat (art. 17 LAU).',
        },
        {
          question: 'Em poden obligar a contractar una assegurança d’impagament?',
          answer: decreed('rental.page.decree.insurance'),
        },
      ],
    },
    deposit_return: {
      lead: 'Quan lliures les claus, el propietari té un mes per retornar-te la fiança. Passat aquest mes, el que falti per retornar genera l’interès legal del diner.',
      faq: [
        {
          question: 'Quant de temps té el propietari per retornar la fiança?',
          answer:
            'Un mes des que lliures les claus. Passat aquest mes, el que falti per retornar genera l’interès legal del diner (art. 36.4 LAU).',
        },
        {
          question: 'Des de quin dia corre l’interès?',
          answer:
            'Des de l’endemà del dia en què es compleix el mes, comptat de data a data, i fins al dia en què et retornen els diners, que ja no compta (art. 36.4 LAU).',
        },
        {
          question: 'Quin interès s’aplica?',
          answer:
            'L’interès legal del diner, que fixa cada any la Ley de Presupuestos Generales del Estado. La revisió fa servir el tipus de cada any natural, de la taula del Banco de España, per als dies d’aquell any (art. 36.4 LAU).',
        },
        {
          question: 'Em pot descomptar alguna cosa de la fiança per desperfectes?',
          answer:
            'Aquesta revisió no valora si un descompte per desperfectes, neteja o un altre concepte està justificat: l’anota tal com te’l van donar i no l’inclou en el que t’han de retornar.',
        },
      ],
    },
    charges: {
      lead: 'Les despeses de la comunitat i d’altres serveis només passen al llogater si ho pacteu per escrit amb el seu import anual. I la seva pujada té un límit.',
      faq: [
        {
          question: 'Quines despeses em pot cobrar el propietari a banda de la renda?',
          answer:
            'Les despeses que el contracte passi al llogater, només si ho vau pactar per escrit i amb el seu import anual a la data del contracte (art. 20 LAU).',
        },
        {
          question: 'Quant poden pujar aquestes despeses?',
          answer:
            'En els cinc primers anys de contracte, o set si el propietari és una empresa, aquestes despeses, tret dels tributs, només poden pujar una vegada l’any, per acord, i mai més del doble del que pot pujar la renda (art. 20 LAU).',
        },
        {
          question: 'Em pot cobrar l’IBI?',
          answer: `Depèn de quan vas signar. ${decreed('rental.page.decree.taxes')} ${t('ca', 'rental.guide.charges.taxes_before', { desde: formatLongDay(norms.rdl29_2026.inForceSince, 'ca') })}`,
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
      status: t('ca', STATUS_KEY[s.status], {
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
  const tx = (key: Key, vars?: Record<string, string>) => t('ca', key, vars);
  const decree = norms.rdl29_2026;
  const decreeEve = formatLongDay(toIso(addDays(parseDate(decree.inForceSince), -1)), 'ca');
  const since = formatLongDay(decree.inForceSince, 'ca');
  const caps = capsCopy('ca', norms, {
    checkedOn,
    iravRate: ctx.irav,
    example: ctx.example,
  });
  const sentence = (key: Key, vars?: Record<string, string>) =>
    decreeSentence('ca', norms, key, 'rdl29_2026', checkedOn, vars);
  const sources = (rules: readonly RuleId[]) => pageSources(norms, rules);

  if (id === 'rise') {
    const { rent, anniversary } = RISE_EXAMPLE;
    const raise = (rate: number) => round2((rent * (100 + rate)) / 100);
    const capped = ctx.irav > DECREE_CAP;
    const exampleDecree = capped
      ? `Pagues ${formatEuros(rent)} al mes i el teu contracte compleix un any més el dia ${formatLongDay(anniversary, 'ca')}. ` +
        `Amb l’últim IRAV publicat (${formatRate(ctx.irav)}), si regeix el Real Decreto-ley 29/2026, el límit sense un nou pacte ` +
        `és un ${pct(DECREE_CAP)}, no un ${formatRate(ctx.irav)}: la teva renda pot passar a ${formatEuros(raise(DECREE_CAP))} com a màxim.`
      : `Pagues ${formatEuros(rent)} al mes i el teu contracte compleix un any més el dia ${formatLongDay(anniversary, 'ca')}. ` +
        `Si regeix el Real Decreto-ley 29/2026, el límit sense un nou pacte és un ${pct(DECREE_CAP)} o l’IRAV, el més baix: ` +
        `amb l’últim IRAV publicat (${formatRate(ctx.irav)}), la teva renda pot passar a ${formatEuros(raise(ctx.irav))} com a màxim.`;
    const exampleNoDecree =
      `Si el Congrés derogués el decret, el límit en un contracte signat des del 26 de maig de 2023 tornaria a ser l’IRAV o l’IPC, el més baix. ` +
      `Amb l’últim IRAV publicat (${formatRate(ctx.irav)}), serien ${formatEuros(raise(ctx.irav))} com a màxim, ` +
      `sempre que l’IPC no fos més baix. L’IRAV que compta és l’últim publicat en data ${formatLongDay(anniversary, 'ca')}, que encara no existeix.`;
    return {
      lead: 'La pujada depèn de tres coses: que el contracte la pacti, el dia en què es compleix cada any de contracte i el límit legal d’aquell dia. Aquí tens els límits, un per un i amb el seu article.',
      sections: [
        {
          id: 'topes',
          heading: 'Els límits, segons el dia en què es compleix l’any',
          paragraphs: [tx('rent_indices.caps_lead')],
          caps: caps.rows,
          status: caps.status,
          after: [...(caps.repealed ? [caps.repealed] : []), ...(caps.now ? [caps.now] : [])],
          folio: { article: '18', law: 'LAU' },
        },
        {
          id: 'sin-clausula',
          heading: 'Sense clàusula, no hi ha pujada',
          paragraphs: [tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause })],
          folio: { article: '18.1', law: 'LAU' },
        },
        {
          id: 'aviso',
          heading: 'Com t’han d’avisar',
          paragraphs: [tx('rental.guide.update.notice')],
          folio: { article: '18.2', law: 'LAU' },
        },
        {
          id: 'ejemplo',
          heading: 'Exemple resolt',
          paragraphs: [],
          example: [exampleDecree, exampleNoDecree],
          after: [
            'Mentre el decret estigui pendent de convalidació, tots dos càlculs són possibles: el primer si el Congrés el convalida i el segon si el deroga.',
          ],
          folio: { article: '18', law: 'LAU · RDL 29/2026' },
        },
      ],
      faq: [
        {
          anchor: 'faq-desde-cuando',
          question: 'Des de quan he de pagar la renda apujada?',
          answer: tx('rental.guide.update.notice'),
        },
        {
          anchor: 'faq-sin-clausula',
          question: 'Em poden apujar el lloguer si el contracte no diu res?',
          answer: tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause }),
        },
        {
          anchor: 'faq-pendiente',
          question: 'Què vol dir «pendent de convalidació»?',
          answer: `${caps.status} Fins que el Congrés voti, una pujada d’un ${pct(DECREE_CAP)} i la de l’IRAV o l’IPC són els dos càlculs possibles.`,
        },
        {
          anchor: 'faq-irav-o-ipc',
          question: 'Em correspon l’IRAV o l’IPC?',
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
      standing ? tx(key, { ...vars, decreto: 'el decret' }) : sentence(key, vars);
    const status = caps.status;
    return {
      lead: `El Real Decreto-ley 29/2026 regeix des de ${since}. Un decret llei entra en vigor quan ell mateix ho diu (aquest, l’endemà de publicar-se), però decau si el Congrés no el convalida en 30 dies: per això cal mirar sempre en quin estat és.`,
      sections: [
        {
          id: 'estado',
          heading: 'En quin estat és el decret',
          paragraphs: [],
          status,
          after: caps.repealed ? [caps.repealed] : [],
          folio: { article: '86.2', law: 'CE' },
        },
        {
          id: 'que-cambia',
          heading: 'Què canvia per al llogater',
          paragraphs: [
            standing
              ? `Els principals canvis que introdueix ${decreeClause('ca', norms, 'rdl29_2026', checkedOn)} amb la norma de cada punt:`
              : 'Els principals canvis, amb la norma de cada punt:',
          ],
          list: [
            `Pujada de la renda: ${point('rental.page.decree.rise')}`,
            `Zones tensionades: ${point('rental.page.decree.zones')}`,
            `Honoraris de l’agència: ${point('rental.page.decree.fees', { desde: since })}`,
            `Assegurança d’impagament: ${point('rental.page.decree.insurance')}`,
            `Tributs com l’IBI: ${point('rental.page.decree.taxes')}`,
            `Despeses de comunitat: ${point('rental.page.charges.community')}`,
            `Document de finalització del contracte: ${point('rental.page.decree.closing')}`,
          ],
          links: (['rise', 'fees', 'deposit', 'charges', 'deposit_return'] as const).map((to) => ({
            label: RENTAL_PAGES[to].name,
            path: RENTAL_PAGES[to].path,
          })),
          folio: { law: 'RDL 29/2026' },
        },
        {
          id: 'contexto',
          heading: 'Zones tensionades, grans tenidors i pròrrogues',
          paragraphs: [
            'Les zones de mercat tensionat, els grans tenidors i les pròrrogues del contracte tenen regles pròpies que poden canviar el que et correspon. Aquí no les calculem: depenen d’on és el teu habitatge, de qui és el teu propietari i de les dates del teu contracte.',
            'La revisió et pregunta per la zona i pel propietari, i et dona les dates del teu contracte.',
          ],
        },
      ],
      faq: [
        {
          anchor: 'faq-vigor',
          question: 'El decret està en vigor?',
          answer: status,
        },
        {
          anchor: 'faq-derogado',
          question: 'Què passa si el Congrés no el convalida?',
          answer: `Queda derogat i deixa d’aplicar-se des d’aquell dia; el que va passar mentre va regir és un cas dubtós. ${tx('rental.guide.update.doubtful')}`,
        },
        {
          anchor: 'faq-anteriores',
          question: 'Quins decrets anteriors van caure?',
          answer: caps.repealed ?? 'Cap.',
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
      : `, i si vas signar des de ${since}, segons el Real Decreto-ley 29/2026, ${tx(`rent_indices.status_short.${decree.status}`)}, tampoc te la pot passar amb un altre nom`;
  return {
    lead: 'Qui paga les despeses de gestió immobiliària i de formalització del contracte depèn de la data en què vas signar. Aquestes són les regles, amb el seu article.',
    sections: [
      {
        id: 'regla',
        heading: 'Qui paga, segons quan vas signar el contracte',
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
        heading: 'Exemple resolt',
        paragraphs: [],
        example: [
          `La immobiliària et cobra una mensualitat d’una renda de ${formatEuros(rent)} més el ${pct(vat)} d’IVA: ${formatEuros(rent)} + ${formatEuros(round2(charge - rent))} = ${formatEuros(charge)}.`,
          `Si vas signar des del 26 de maig de 2023, és una despesa del propietari${from2026}. Si la vas pagar, són ${formatEuros(charge)} pagats de més.`,
        ],
        links: [{ label: REVIEW.name, path: REVIEW.path }],
        folio: { article: '20', law: 'LAU' },
      },
    ],
    faq: [
      {
        anchor: 'faq-honorarios',
        question: 'Em poden cobrar honoraris d’agència?',
        answer: `${tx('rental.guide.fees.2019')} ${tx('rental.guide.fees.2023_open')}`,
      },
      {
        anchor: 'faq-otro-nombre',
        question: 'I si en diuen «estudio de solvencia» o «reserva»?',
        answer: otherNames,
      },
      {
        anchor: 'faq-persona',
        question: 'El meu propietari era una persona i vaig signar el 2020: qui paga?',
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
  return capitalized(decreeSentence('ca', NORMS, key, 'rdl29_2026', checkedOn));
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
