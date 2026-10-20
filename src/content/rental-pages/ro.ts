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
// fees, and the deposit, its return and the charges, in Romanian, with the shape, paths and
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

export const REVIEW = { path: '/alquiler/', name: 'Verifică-ți închirierea' } as const;
const INDICES = { path: '/alquiler/irav-ipc/', name: 'IRAV și IPC pentru fiecare lună' } as const;

export const RENTAL_PAGES: Record<RentalPageId, PageMeta> = {
  rise: {
    path: '/alquiler/subida/',
    slug: 'subida',
    name: 'Cu cât ți se poate majora chiria',
    crumb: 'Majorarea chiriei',
    title: 'Cu cât ți se poate majora chiria în 2026',
    description:
      'Plafoanele majorării chiriei după ziua în care se împlinește anul de contract, cu norma fiecăruia și un exemplu cu cifre.',
    h1: 'Cu cât ți se poate majora chiria în 2026',
  },
  decree: {
    path: '/alquiler/decreto-2026/',
    slug: 'decreto-2026',
    name: 'Decretul privind chiriile din 2026',
    crumb: 'Decretul privind chiriile din 2026',
    title: 'Real Decreto-ley 29/2026 privind chiriile: ce se schimbă',
    description:
      'Ce se schimbă pentru chiriaș cu Real Decreto-ley 29/2026 și în ce situație se află: în vigoare din 8 octombrie, în așteptarea validării.',
    h1: 'Real Decreto-ley 29/2026 privind chiriile: ce se schimbă și în ce situație se află',
  },
  fees: {
    path: '/alquiler/honorarios-inmobiliaria/',
    slug: 'honorarios-inmobiliaria',
    name: 'Onorariile agenției imobiliare',
    crumb: 'Onorariile agenției imobiliare',
    title: 'Poate agenția imobiliară să îți ceară ție plata? Onorariile',
    description:
      'Cine plătește onorariile agenției imobiliare la închiriere, după data la care ai semnat contractul, cu articolul din LAU pentru fiecare caz.',
    h1: 'Poate agenția imobiliară să îți ceară ție plata? Onorariile la închiriere',
  },
  deposit: {
    path: '/alquiler/fianza/',
    slug: 'fianza',
    name: 'Câtă garanție ți se poate cere',
    crumb: 'Câtă garanție ți se poate cere',
    title: 'Garanția (fianza) la închiriere: cât ți se poate cere (art. 36 LAU)',
    description:
      'O chirie lunară de garanție, până la încă două de garanție suplimentară și una de plată în avans. Verifică cât ți s-a cerut, cu articolul fiecărui plafon.',
    h1: 'Garanția la închiriere: cât ți se poate cere',
  },
  deposit_return: {
    path: '/alquiler/devolucion-fianza/',
    slug: 'devolucion-fianza',
    name: 'Restituirea garanției',
    crumb: 'Restituirea garanției',
    title: 'Restituirea garanției la închiriere: termen și dobândă',
    description:
      'Proprietarul are o lună de la predarea cheilor ca să restituie garanția; după aceea, dobânda legală (art. 36.4 LAU). Cu un exemplu cu cifre.',
    h1: 'Proprietarul nu îți restituie garanția: termen și dobândă',
  },
  charges: {
    path: '/alquiler/gastos/',
    slug: 'gastos',
    name: 'Cheltuielile pe care ți le poate încasa proprietarul',
    crumb: 'Cheltuielile pe care ți le poate încasa proprietarul',
    title: 'IBI, asociația de proprietari și gunoiul la închiriere: ce ți se poate încasa',
    description:
      'Proprietarul poate trece cheltuieli în sarcina ta doar dacă le conveniți în scris, cu suma lor anuală, iar majorarea lor este limitată în primii ani. Ce spune art. 20 LAU.',
    h1: 'IBI, asociația de proprietari și gunoiul: ce îți poate încasa proprietarul',
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
    capitalized(decreeSentence('ro', norms, key, 'rdl29_2026', checkedOn));
  return {
    deposit: {
      lead: 'La închirierea unei locuințe, garanția (fianza) este de o chirie lunară. Contractul poate cere în plus alte garanții, dar legea le pune un plafon.',
      faq: [
        {
          question: 'Câtă garanție mi se poate cere la închirierea unei locuințe?',
          answer: 'O chirie lunară, în bani (art. 36.1 LAU).',
        },
        {
          question: 'Mi se pot cere și alte garanții în afară de garanția (fianza)?',
          answer:
            'Da, dar în contractele semnate din 6 martie 2019 pe cel mult cinci ani, sau pe cel mult șapte dacă proprietarul este o firmă, această garanție suplimentară nu poate depăși două chirii lunare (art. 36.5 LAU).',
        },
        {
          question: 'Cât mi se poate cere în avans?',
          answer: 'Nu mai mult de o chirie lunară în avans (art. 17 LAU).',
        },
        {
          question: 'Mi se poate impune să închei o asigurare împotriva neplății chiriei?',
          answer: decreed('rental.page.decree.insurance'),
        },
      ],
    },
    deposit_return: {
      lead: 'Când predai cheile, proprietarul are o lună ca să îți restituie garanția. După acea lună, ce a rămas de restituit produce dobânda legală (interés legal del dinero).',
      faq: [
        {
          question: 'Cât timp are proprietarul ca să restituie garanția?',
          answer:
            'O lună de la predarea cheilor. După acea lună, ce a rămas de restituit produce dobânda legală (art. 36.4 LAU).',
        },
        {
          question: 'Din ce zi curge dobânda?',
          answer:
            'Din ziua următoare celei în care se împlinește luna, socotită de la dată la dată, și până în ziua în care ți se restituie banii, zi care nu se mai socotește (art. 36.4 LAU).',
        },
        {
          question: 'Ce dobândă se aplică?',
          answer:
            'Dobânda legală (interés legal del dinero), pe care o stabilește în fiecare an Ley de Presupuestos Generales del Estado (legea bugetului de stat). Verificarea folosește rata fiecărui an calendaristic, din tabelul Banco de España, pentru zilele din acel an (art. 36.4 LAU).',
        },
        {
          question: 'Mi se poate reține ceva din garanție pentru deteriorări?',
          answer:
            'Această verificare nu evaluează dacă o reținere pentru deteriorări, curățenie sau alt motiv este întemeiată: o notează așa cum ți-a fost comunicată și nu o include în ce ți se cuvine.',
        },
      ],
    },
    charges: {
      lead: 'Cheltuielile asociației de proprietari și ale altor servicii trec în sarcina chiriașului doar dacă le conveniți în scris, cu suma lor anuală. Iar majorarea lor are un plafon.',
      faq: [
        {
          question: 'Ce cheltuieli îmi poate încasa proprietarul în afară de chirie?',
          answer:
            'Cheltuielile pe care contractul le trece în sarcina chiriașului, doar dacă le-ați convenit în scris și cu suma lor anuală la data contractului (art. 20 LAU).',
        },
        {
          question: 'Cât pot crește aceste cheltuieli?',
          answer:
            'În primii cinci ani de contract, sau șapte dacă proprietarul este o firmă, aceste cheltuieli, cu excepția impozitelor și taxelor, pot crește doar o dată pe an, prin acord, și niciodată mai mult decât dublul a cât poate crește chiria (art. 20 LAU).',
        },
        {
          question: 'Îmi poate încasa IBI?',
          answer: `Depinde de când ai semnat. ${decreed('rental.page.decree.taxes')} ${t('ro', 'rental.guide.charges.taxes_before', { desde: formatLongDay(norms.rdl29_2026.inForceSince, 'ro') })}`,
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
      status: t('ro', STATUS_KEY[s.status], {
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
  const tx = (key: Key, vars?: Record<string, string>) => t('ro', key, vars);
  const decree = norms.rdl29_2026;
  const decreeEve = formatLongDay(toIso(addDays(parseDate(decree.inForceSince), -1)), 'ro');
  const since = formatLongDay(decree.inForceSince, 'ro');
  const caps = capsCopy('ro', norms, {
    checkedOn,
    iravRate: ctx.irav,
    example: ctx.example,
  });
  const sentence = (key: Key, vars?: Record<string, string>) =>
    decreeSentence('ro', norms, key, 'rdl29_2026', checkedOn, vars);
  const sources = (rules: readonly RuleId[]) => pageSources(norms, rules);

  if (id === 'rise') {
    const { rent, anniversary } = RISE_EXAMPLE;
    const raise = (rate: number) => round2((rent * (100 + rate)) / 100);
    const capped = ctx.irav > DECREE_CAP;
    const exampleDecree = capped
      ? `Plătești ${formatEuros(rent)} pe lună, iar contractul tău împlinește încă un an pe ${formatLongDay(anniversary, 'ro')}. ` +
        `Cu ultimul IRAV publicat (${formatRate(ctx.irav)}), dacă se aplică Real Decreto-ley 29/2026, plafonul fără un nou acord ` +
        `este ${pct(DECREE_CAP)}, nu ${formatRate(ctx.irav)}: chiria ta poate ajunge la cel mult ${formatEuros(raise(DECREE_CAP))}.`
      : `Plătești ${formatEuros(rent)} pe lună, iar contractul tău împlinește încă un an pe ${formatLongDay(anniversary, 'ro')}. ` +
        `Dacă se aplică Real Decreto-ley 29/2026, plafonul fără un nou acord este ${pct(DECREE_CAP)} sau IRAV, oricare este mai mic: ` +
        `cu ultimul IRAV publicat (${formatRate(ctx.irav)}), chiria ta poate ajunge la cel mult ${formatEuros(raise(ctx.irav))}.`;
    const exampleNoDecree =
      `Dacă Congresul ar abroga decretul, plafonul într-un contract semnat din 26 mai 2023 ar redeveni IRAV sau IPC, oricare este mai mic. ` +
      `Cu ultimul IRAV publicat (${formatRate(ctx.irav)}), ar fi cel mult ${formatEuros(raise(ctx.irav))}, ` +
      `cu condiția ca IPC să nu fie mai mic. IRAV care contează este ultimul publicat pe ${formatLongDay(anniversary, 'ro')}, care încă nu există.`;
    return {
      lead: 'Majorarea depinde de trei lucruri: să fie prevăzută în contract, ziua în care se împlinește fiecare an de contract și plafonul legal din acea zi. Aici sunt plafoanele, unul câte unul și cu articolul lor.',
      sections: [
        {
          id: 'topes',
          heading: 'Plafoanele, după ziua în care se împlinește anul',
          paragraphs: [tx('rent_indices.caps_lead')],
          caps: caps.rows,
          status: caps.status,
          after: [...(caps.repealed ? [caps.repealed] : []), ...(caps.now ? [caps.now] : [])],
          folio: { article: '18', law: 'LAU' },
        },
        {
          id: 'sin-clausula',
          heading: 'Fără clauză, nu există majorare',
          paragraphs: [tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause })],
          folio: { article: '18.1', law: 'LAU' },
        },
        {
          id: 'aviso',
          heading: 'Cum trebuie să ți se comunice',
          paragraphs: [tx('rental.guide.update.notice')],
          folio: { article: '18.2', law: 'LAU' },
        },
        {
          id: 'ejemplo',
          heading: 'Exemplu rezolvat',
          paragraphs: [],
          example: [exampleDecree, exampleNoDecree],
          after: [
            'Cât timp decretul este în așteptarea validării, ambele calcule sunt posibile: primul dacă Congresul îl validează, iar al doilea dacă îl abrogă.',
          ],
          folio: { article: '18', law: 'LAU · RDL 29/2026' },
        },
      ],
      faq: [
        {
          anchor: 'faq-desde-cuando',
          question: 'De când trebuie să plătesc chiria majorată?',
          answer: tx('rental.guide.update.notice'),
        },
        {
          anchor: 'faq-sin-clausula',
          question: 'Mi se poate majora chiria dacă contractul nu spune nimic?',
          answer: tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause }),
        },
        {
          anchor: 'faq-pendiente',
          question: 'Ce înseamnă „în așteptarea validării” (pendiente de convalidación)?',
          answer: `${caps.status} Până la votul Congresului, majorarea de ${pct(DECREE_CAP)} și cea după IRAV sau IPC sunt cele două interpretări posibile.`,
        },
        {
          anchor: 'faq-irav-o-ipc',
          question: 'Mi se aplică IRAV sau IPC?',
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
      standing ? tx(key, { ...vars, decreto: 'decretul' }) : sentence(key, vars);
    const status = caps.status;
    return {
      lead: `Real Decreto-ley 29/2026 se aplică din ${since}. Un decret-lege intră în vigoare când o spune chiar el (acesta, a doua zi după publicare), dar își pierde efectele dacă nu este validat de Congres în 30 de zile: de aceea trebuie verificat întotdeauna în ce situație se află.`,
      sections: [
        {
          id: 'estado',
          heading: 'În ce situație se află decretul',
          paragraphs: [],
          status,
          after: caps.repealed ? [caps.repealed] : [],
          folio: { article: '86.2', law: 'CE' },
        },
        {
          id: 'que-cambia',
          heading: 'Ce se schimbă pentru chiriaș',
          paragraphs: [
            standing
              ? `Principalele schimbări aduse de ${decreeClause('ro', norms, 'rdl29_2026', checkedOn)} cu norma fiecărui punct:`
              : 'Principalele schimbări, cu norma fiecărui punct:',
          ],
          list: [
            `Majorarea chiriei: ${point('rental.page.decree.rise')}`,
            `Zonele cu piață locativă tensionată: ${point('rental.page.decree.zones')}`,
            `Onorariile agenției: ${point('rental.page.decree.fees', { desde: since })}`,
            `Asigurarea împotriva neplății chiriei: ${point('rental.page.decree.insurance')}`,
            `Impozitele și taxele, cum ar fi IBI: ${point('rental.page.decree.taxes')}`,
            `Cheltuielile asociației de proprietari: ${point('rental.page.charges.community')}`,
            `Documentul de încetare a contractului: ${point('rental.page.decree.closing')}`,
          ],
          links: (['rise', 'fees', 'deposit', 'charges', 'deposit_return'] as const).map((to) => ({
            label: RENTAL_PAGES[to].name,
            path: RENTAL_PAGES[to].path,
          })),
          folio: { law: 'RDL 29/2026' },
        },
        {
          id: 'contexto',
          heading: 'Zone tensionate, mari proprietari și prelungiri',
          paragraphs: [
            'Zonele cu piață locativă tensionată (zonas de mercado tensionado), marii proprietari (grandes tenedores) și prelungirile contractului au reguli proprii care pot schimba ce ți se aplică. Aici nu le calculăm: depind de unde se află locuința ta, de cine este proprietarul tău și de datele contractului tău.',
            'Verificarea te întreabă despre zonă și despre proprietar și îți dă datele contractului tău.',
          ],
        },
      ],
      faq: [
        {
          anchor: 'faq-vigor',
          question: 'Este decretul în vigoare?',
          answer: status,
        },
        {
          anchor: 'faq-derogado',
          question: 'Ce se întâmplă dacă Congresul nu îl validează?',
          answer: `Este abrogat și nu se mai aplică din acea zi; ce s-a întâmplat cât timp s-a aplicat este un caz incert. ${tx('rental.guide.update.doubtful')}`,
        },
        {
          anchor: 'faq-anteriores',
          question: 'Ce decrete anterioare au fost abrogate?',
          answer: caps.repealed ?? 'Niciunul.',
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
      : `, iar dacă ai semnat din ${since}, potrivit Real Decreto-ley 29/2026, ${tx(`rent_indices.status_short.${decree.status}`)}, nici nu ți-o poate trece în sarcină sub altă denumire`;
  return {
    lead: 'Cine plătește cheltuielile de intermediere imobiliară și de încheiere a contractului depinde de data la care ai semnat. Acestea sunt regulile, cu articolul lor.',
    sections: [
      {
        id: 'regla',
        heading: 'Cine plătește, după când ai semnat contractul',
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
        heading: 'Exemplu rezolvat',
        paragraphs: [],
        example: [
          `Agenția imobiliară îți încasează o chirie lunară, la o chirie de ${formatEuros(rent)}, plus TVA (IVA) de ${pct(vat)}: ${formatEuros(rent)} + ${formatEuros(round2(charge - rent))} = ${formatEuros(charge)}.`,
          `Dacă ai semnat din 26 mai 2023, este o cheltuială a proprietarului${from2026}. Dacă ai plătit-o, ai plătit ${formatEuros(charge)} în plus.`,
        ],
        links: [{ label: REVIEW.name, path: REVIEW.path }],
        folio: { article: '20', law: 'LAU' },
      },
    ],
    faq: [
      {
        anchor: 'faq-honorarios',
        question: 'Mi se pot cere onorarii de agenție?',
        answer: `${tx('rental.guide.fees.2019')} ${tx('rental.guide.fees.2023_open')}`,
      },
      {
        anchor: 'faq-otro-nombre',
        question:
          'Și dacă o numesc „studiu de solvabilitate” (estudio de solvencia) sau „rezervare” (reserva)?',
        answer: otherNames,
      },
      {
        anchor: 'faq-persona',
        question: 'Proprietarul meu era o persoană fizică și am semnat în 2020: cine plătește?',
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
  return capitalized(decreeSentence('ro', NORMS, key, 'rdl29_2026', checkedOn));
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
