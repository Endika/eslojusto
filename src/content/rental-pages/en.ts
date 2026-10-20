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
// fees, and the deposit, its return and the charges, in English, with the shape, paths and
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

export const REVIEW = { path: '/alquiler/', name: 'Review your rental' } as const;
const INDICES = { path: '/alquiler/irav-ipc/', name: 'IRAV and IPC for each month' } as const;

export const RENTAL_PAGES: Record<RentalPageId, PageMeta> = {
  rise: {
    path: '/alquiler/subida/',
    slug: 'subida',
    name: 'How much your rent can go up',
    crumb: 'Rent increase',
    title: 'How much your rent can go up in 2026',
    description:
      'Caps on rent increases according to the day each year of the agreement is completed, with the law behind each one and a worked example with figures.',
    h1: 'How much your rent can go up in 2026',
  },
  decree: {
    path: '/alquiler/decreto-2026/',
    slug: 'decreto-2026',
    name: '2026 rental decree',
    crumb: '2026 rental decree',
    title: 'Real Decreto-ley 29/2026 on rentals: what changes',
    description:
      'What Real Decreto-ley 29/2026 changes for tenants and where it stands: in force since 8 October, awaiting validation by Congress.',
    h1: 'Real Decreto-ley 29/2026 on rentals: what changes and where it stands',
  },
  fees: {
    path: '/alquiler/honorarios-inmobiliaria/',
    slug: 'honorarios-inmobiliaria',
    name: 'Letting agency fees',
    crumb: 'Letting agency fees',
    title: 'Can the letting agency charge you? Agency fees',
    description:
      'Who pays the letting agency fees on a rental according to the date you signed the agreement, with the LAU article for each case.',
    h1: 'Can the letting agency charge you? Agency fees on a rental',
  },
  deposit: {
    path: '/alquiler/fianza/',
    slug: 'fianza',
    name: 'How much deposit you can be asked for',
    crumb: 'How much deposit you can be asked for',
    title: 'Rental deposit: how much you can be asked for (art. 36 LAU)',
    description:
      "One month's deposit, up to two more of additional guarantee and one paid in advance. Check what you were asked for, with the article for each cap.",
    h1: 'Rental deposit: how much you can be asked for',
  },
  deposit_return: {
    path: '/alquiler/devolucion-fianza/',
    slug: 'devolucion-fianza',
    name: 'Return of the deposit',
    crumb: 'Return of the deposit',
    title: 'Return of the rental deposit: time limit and interest',
    description:
      'The landlord has a month from when you hand over the keys to return the deposit; after that, statutory interest (art. 36.4 LAU). With a worked example.',
    h1: 'Your landlord has not returned your deposit: time limit and interest',
  },
  charges: {
    path: '/alquiler/gastos/',
    slug: 'gastos',
    name: 'Charges your landlord can pass on to you',
    crumb: 'Charges your landlord can pass on to you',
    title: 'IBI, community fees and waste: what a tenant can be charged',
    description:
      'The landlord can only pass charges on to you if you agree it in writing with their annual amount, and their rise is capped at first. What art. 20 LAU says.',
    h1: 'IBI, community fees and waste: what your landlord can charge you',
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
    capitalized(decreeSentence('en', norms, key, 'rdl29_2026', checkedOn));
  return {
    deposit: {
      lead: "In a housing rental the deposit (fianza) is one month's rent. The agreement can also require other guarantees, but the law caps them.",
      faq: [
        {
          question: 'How much deposit can I be asked for in a housing rental?',
          answer: "One month's rent, in cash (art. 36.1 LAU).",
        },
        {
          question: 'Can I be asked for other guarantees apart from the deposit?',
          answer:
            "Yes, but in agreements signed on or after 6 March 2019 for up to five years, or up to seven if the landlord is a company, that additional guarantee cannot exceed two months' rent (art. 36.5 LAU).",
        },
        {
          question: 'How much can I be asked to pay in advance?',
          answer: "No more than one month's rent in advance (art. 17 LAU).",
        },
        {
          question: 'Can I be required to take out rent default insurance?',
          answer: decreed('rental.page.decree.insurance'),
        },
      ],
    },
    deposit_return: {
      lead: 'When you hand over the keys, your landlord has one month to return the deposit to you. After that month, whatever remains to be returned accrues statutory interest (interés legal del dinero).',
      faq: [
        {
          question: 'How long does the landlord have to return the deposit?',
          answer:
            'One month from when you hand over the keys. After that month, whatever remains to be returned accrues statutory interest (art. 36.4 LAU).',
        },
        {
          question: 'From what day does the interest run?',
          answer:
            'From the day after the month is completed, counted from date to date, until the day the money is returned to you, which no longer counts (art. 36.4 LAU).',
        },
        {
          question: 'What interest applies?',
          answer:
            "Statutory interest (interés legal del dinero), set each year by the Ley de Presupuestos Generales del Estado (State Budget Act). The review uses the rate for each calendar year, from the Banco de España's table, for the days in that year (art. 36.4 LAU).",
        },
        {
          question: 'Can something be deducted from my deposit for damage?',
          answer:
            'This review does not assess whether a deduction for damage, cleaning or anything else is justified: it records it as it was given to you and does not include it in what remains to be returned.',
        },
      ],
    },
    charges: {
      lead: 'Community fees and other services are only passed on to the tenant if you agree it in writing with their annual amount. And their increase is capped.',
      faq: [
        {
          question: 'What charges can the landlord make me pay apart from the rent?',
          answer:
            'The charges that the agreement passes on to the tenant, only if you agreed it in writing and with their annual amount as at the date of the agreement (art. 20 LAU).',
        },
        {
          question: 'How much can those charges go up?',
          answer:
            'In the first five years of the agreement, or seven if the landlord is a company, those charges, except taxes, can only go up once a year, by agreement, and never by more than double what the rent can go up by (art. 20 LAU).',
        },
        {
          question: 'Can I be charged the IBI?',
          answer: `It depends on when you signed. ${decreed('rental.page.decree.taxes')} ${t('en', 'rental.guide.charges.taxes_before', { desde: formatLongDay(norms.rdl29_2026.inForceSince, 'en') })}`,
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
      status: t('en', STATUS_KEY[s.status], {
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
  const tx = (key: Key, vars?: Record<string, string>) => t('en', key, vars);
  const decree = norms.rdl29_2026;
  const decreeEve = formatLongDay(toIso(addDays(parseDate(decree.inForceSince), -1)), 'en');
  const since = formatLongDay(decree.inForceSince, 'en');
  const caps = capsCopy('en', norms, {
    checkedOn,
    iravRate: ctx.irav,
    example: ctx.example,
  });
  const sentence = (key: Key, vars?: Record<string, string>) =>
    decreeSentence('en', norms, key, 'rdl29_2026', checkedOn, vars);
  const sources = (rules: readonly RuleId[]) => pageSources(norms, rules);

  if (id === 'rise') {
    const { rent, anniversary } = RISE_EXAMPLE;
    const raise = (rate: number) => round2((rent * (100 + rate)) / 100);
    const capped = ctx.irav > DECREE_CAP;
    const exampleDecree = capped
      ? `You pay ${formatEuros(rent)} a month and your agreement completes another year on ${formatLongDay(anniversary, 'en')}. ` +
        `With the latest IRAV published (${formatRate(ctx.irav)}), if Real Decreto-ley 29/2026 applies, the cap without a new agreement ` +
        `is ${pct(DECREE_CAP)}, not ${formatRate(ctx.irav)}: your rent can go up to ${formatEuros(raise(DECREE_CAP))} at most.`
      : `You pay ${formatEuros(rent)} a month and your agreement completes another year on ${formatLongDay(anniversary, 'en')}. ` +
        `If Real Decreto-ley 29/2026 applies, the cap without a new agreement is ${pct(DECREE_CAP)} or the IRAV, whichever is lower: ` +
        `with the latest IRAV published (${formatRate(ctx.irav)}), your rent can go up to ${formatEuros(raise(ctx.irav))} at most.`;
    const exampleNoDecree =
      `If Congress repealed the decree, the cap in an agreement signed on or after 26 May 2023 would again be the IRAV or the IPC, whichever is lower. ` +
      `With the latest IRAV published (${formatRate(ctx.irav)}), that would be ${formatEuros(raise(ctx.irav))} at most, ` +
      `provided the IPC was not lower. The IRAV that counts is the latest one published on ${formatLongDay(anniversary, 'en')}, which does not exist yet.`;
    return {
      lead: 'The increase depends on three things: that the agreement provides for it, the day each year of the agreement is completed and the legal cap on that day. Here are the caps, one by one and with their article.',
      sections: [
        {
          id: 'topes',
          heading: 'The caps, according to the day the year is completed',
          paragraphs: [tx('rent_indices.caps_lead')],
          caps: caps.rows,
          status: caps.status,
          after: [...(caps.repealed ? [caps.repealed] : []), ...(caps.now ? [caps.now] : [])],
          folio: { article: '18', law: 'LAU' },
        },
        {
          id: 'sin-clausula',
          heading: 'No clause, no increase',
          paragraphs: [tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause })],
          folio: { article: '18.1', law: 'LAU' },
        },
        {
          id: 'aviso',
          heading: 'How you have to be notified',
          paragraphs: [tx('rental.guide.update.notice')],
          folio: { article: '18.2', law: 'LAU' },
        },
        {
          id: 'ejemplo',
          heading: 'Worked example',
          paragraphs: [],
          example: [exampleDecree, exampleNoDecree],
          after: [
            'While the decree is awaiting validation by Congress, both calculations are possible: the first if Congress validates it and the second if it repeals it.',
          ],
          folio: { article: '18', law: 'LAU · RDL 29/2026' },
        },
      ],
      faq: [
        {
          anchor: 'faq-desde-cuando',
          question: 'From when do I have to pay the increased rent?',
          answer: tx('rental.guide.update.notice'),
        },
        {
          anchor: 'faq-sin-clausula',
          question: 'Can my rent be raised if the agreement says nothing?',
          answer: tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause }),
        },
        {
          anchor: 'faq-pendiente',
          question:
            'What does “awaiting validation by Congress” (pendiente de convalidación) mean?',
          answer: `${caps.status} Until Congress votes, the ${pct(DECREE_CAP)} increase and the IRAV or IPC increase are the two possible readings.`,
        },
        {
          anchor: 'faq-irav-o-ipc',
          question: 'Does the IRAV or the IPC apply to me?',
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
      standing ? tx(key, { ...vars, decreto: 'the decree' }) : sentence(key, vars);
    const status = caps.status;
    return {
      lead: `Real Decreto-ley 29/2026 has applied since ${since}. A decree-law comes into force when it says so itself (this one, the day after its publication), but it lapses if Congress does not validate it within 30 days: that is why its status always needs checking.`,
      sections: [
        {
          id: 'estado',
          heading: 'Where the decree stands',
          paragraphs: [],
          status,
          after: caps.repealed ? [caps.repealed] : [],
          folio: { article: '86.2', law: 'CE' },
        },
        {
          id: 'que-cambia',
          heading: 'What changes for tenants',
          paragraphs: [
            standing
              ? `The main changes made by ${decreeClause('en', norms, 'rdl29_2026', checkedOn)} with the law behind each point:`
              : 'The main points, with the law behind each one:',
          ],
          list: [
            `Rent increase: ${point('rental.page.decree.rise')}`,
            `Stressed housing areas: ${point('rental.page.decree.zones')}`,
            `Agency fees: ${point('rental.page.decree.fees', { desde: since })}`,
            `Rent default insurance: ${point('rental.page.decree.insurance')}`,
            `Taxes such as the IBI: ${point('rental.page.decree.taxes')}`,
            `Community fees: ${point('rental.page.charges.community')}`,
            `End-of-tenancy document: ${point('rental.page.decree.closing')}`,
          ],
          links: (['rise', 'fees', 'deposit', 'charges', 'deposit_return'] as const).map((to) => ({
            label: RENTAL_PAGES[to].name,
            path: RENTAL_PAGES[to].path,
          })),
          folio: { law: 'RDL 29/2026' },
        },
        {
          id: 'contexto',
          heading: 'Stressed housing areas, large landlords and extensions',
          paragraphs: [
            'Stressed residential market areas (zonas de mercado tensionado), large landlords (grandes tenedores) and extensions of the agreement have rules of their own that can change what applies to you. They are not calculated here: they depend on where your home is, who your landlord is and the dates of your agreement.',
            'The review asks you about the area and the landlord, and gives you the dates of your agreement.',
          ],
        },
      ],
      faq: [
        {
          anchor: 'faq-vigor',
          question: 'Is the decree in force?',
          answer: status,
        },
        {
          anchor: 'faq-derogado',
          question: 'What happens if Congress does not validate it?',
          answer: `It is repealed and stops applying from that day; what happened while it applied is a doubtful case. ${tx('rental.guide.update.doubtful')}`,
        },
        {
          anchor: 'faq-anteriores',
          question: 'Which earlier decrees were repealed?',
          answer: caps.repealed ?? 'None.',
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
      : `, and if you signed on or after ${since}, under Real Decreto-ley 29/2026, ${tx(`rent_indices.status_short.${decree.status}`)}, it cannot be passed on to you under another name either`;
  return {
    lead: 'Who pays property management and contract formalisation costs depends on the date you signed. These are the rules, with their article.',
    sections: [
      {
        id: 'regla',
        heading: 'Who pays, according to when you signed the agreement',
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
        heading: 'Worked example',
        paragraphs: [],
        example: [
          `The letting agency charges you one month of a ${formatEuros(rent)} rent plus ${pct(vat)} IVA (VAT): ${formatEuros(rent)} + ${formatEuros(round2(charge - rent))} = ${formatEuros(charge)}.`,
          `If you signed on or after 26 May 2023 it is a cost borne by the landlord${from2026}. If you paid it, that is ${formatEuros(charge)} paid too much.`,
        ],
        links: [{ label: REVIEW.name, path: REVIEW.path }],
        folio: { article: '20', law: 'LAU' },
      },
    ],
    faq: [
      {
        anchor: 'faq-honorarios',
        question: 'Can I be charged agency fees?',
        answer: `${tx('rental.guide.fees.2019')} ${tx('rental.guide.fees.2023_open')}`,
      },
      {
        anchor: 'faq-otro-nombre',
        question:
          'What if they call it a “credit check” (estudio de solvencia) or a “reservation” (reserva)?',
        answer: otherNames,
      },
      {
        anchor: 'faq-persona',
        question: 'My landlord was an individual and I signed in 2020: who pays?',
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
  return capitalized(decreeSentence('en', NORMS, key, 'rdl29_2026', checkedOn));
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
