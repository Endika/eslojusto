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
// fees, and the deposit, its return and the charges, in Basque, with the shape, paths and
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

export const REVIEW = { path: '/alquiler/', name: 'Berrikusi zure alokairua' } as const;
const INDICES = { path: '/alquiler/irav-ipc/', name: 'Hilabete bakoitzeko IRAV eta IPC' } as const;

export const RENTAL_PAGES: Record<RentalPageId, PageMeta> = {
  rise: {
    path: '/alquiler/subida/',
    slug: 'subida',
    name: 'Zenbat igo diezazuketen alokairua',
    crumb: 'Alokairuaren igoera',
    title: 'Zenbat igo diezazuketen alokairua 2026an',
    description:
      'Alokairuaren igoeraren mugak, kontratuaren urtea betetzen den egunaren arabera, muga bakoitzaren arauarekin eta zifrekin egindako adibide batekin.',
    h1: 'Zenbat igo diezazuketen alokairua 2026an',
  },
  decree: {
    path: '/alquiler/decreto-2026/',
    slug: 'decreto-2026',
    name: '2026ko alokairu-dekretua',
    crumb: '2026ko alokairu-dekretua',
    title: '2026ko alokairu-dekretua: zer aldatzen den eta egoera',
    description:
      'Zer aldatzen den maizterrarentzat Real Decreto-ley 29/2026 arauarekin eta zer egoeratan dagoen: indarrean urriaren 8tik aurrera, baliozkotzeko zain.',
    h1: '2026ko alokairu-dekretua: zer aldatzen den eta zer egoeratan dagoen',
  },
  fees: {
    path: '/alquiler/honorarios-inmobiliaria/',
    slug: 'honorarios-inmobiliaria',
    name: 'Higiezinen agentziaren ordainsariak',
    crumb: 'Higiezinen agentziaren ordainsariak',
    title: 'Zuri kobra diezazuke higiezinen agentziak? Ordainsariak',
    description:
      'Nork ordaintzen dituen higiezinen agentziaren ordainsariak alokairuan, kontratua sinatu zenuen dataren arabera, kasu bakoitzeko LAUren artikuluarekin.',
    h1: 'Zuri kobra diezazuke higiezinen agentziak? Ordainsariak alokairuan',
  },
  deposit: {
    path: '/alquiler/fianza/',
    slug: 'fianza',
    name: 'Zenbat fidantza eska diezazuketen',
    crumb: 'Zenbat fidantza eska diezazuketen',
    title: 'Fidantza: zenbat eska diezazuketen alokairuan (art. 36 LAU)',
    description:
      'Fidantza: errenta-hileko bat; berme osagarria: beste bi, gehienez; aurretiko ordainketa: bat. Egiaztatu zenbat eskatu dizuten, mugen artikuluekin.',
    h1: 'Alokairuaren fidantza: zenbat eska diezazuketen',
  },
  deposit_return: {
    path: '/alquiler/devolucion-fianza/',
    slug: 'devolucion-fianza',
    name: 'Fidantzaren itzulketa',
    crumb: 'Fidantzaren itzulketa',
    title: 'Alokairuaren fidantzaren itzulketa: epea eta interesak',
    description:
      'Jabeak hilabete du fidantza itzultzeko, giltzak ematen dituzunetik; gero, legezko interesak (art. 36.4 LAU). Zifrekin egindako adibide batekin.',
    h1: 'Jabeak ez dizu fidantza itzultzen: epea eta interesak',
  },
  charges: {
    path: '/alquiler/gastos/',
    slug: 'gastos',
    name: 'Jabeak kobra diezazkizukeen gastuak',
    crumb: 'Jabeak kobra diezazkizukeen gastuak',
    title: 'IBIa, komunitatea eta zaborra alokairuan: zer kobra dakizuke',
    description:
      'Jabeak idatziz itundu baduzue bakarrik pasa diezazkizuke gastuak, urteko zenbatekoarekin, eta igoera mugatuta lehen urteetan. Zer dio art. 20 LAU arauak.',
    h1: 'IBIa, komunitatea eta zaborra: zer kobra diezazukeen jabeak',
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
    capitalized(decreeSentence('eu', norms, key, 'rdl29_2026', checkedOn));
  return {
    deposit: {
      lead: 'Etxebizitza-alokairu batean, fidantza errenta-hileko batekoa da. Kontratuak beste berme batzuk ere eska ditzake, baina legeak muga jartzen die.',
      faq: [
        {
          question: 'Zenbat fidantza eska diezadakete etxebizitza-alokairu batean?',
          answer: 'Errenta-hileko bat, eskudirutan (art. 36.1 LAU).',
        },
        {
          question: 'Fidantzaz gain, beste berme batzuk eska diezazkidakete?',
          answer:
            'Bai, baina 2019ko martxoaren 6tik aurrera sinatutako bost urtera arteko kontratuetan, edo zazpi urtera artekoetan jabea enpresa bat bada, berme osagarri horrek ezin ditu bi errenta-hileko gainditu (art. 36.5 LAU).',
        },
        {
          question: 'Zenbat eska diezadakete aurretiko ordainketa gisa?',
          answer: 'Ez errenta-hileko bat baino gehiago, aurretiko ordainketa gisa (art. 17 LAU).',
        },
        {
          question: 'Errenta ez ordaintzearen aurkako aseguru bat kontratatzera behartu nazakete?',
          answer: decreed('rental.page.decree.insurance'),
        },
      ],
    },
    deposit_return: {
      lead: 'Giltzak ematen dituzunean, jabeak hilabete du fidantza itzultzeko. Hilabete hori igarota, itzultzeko falta denak diruaren legezko interesa sortzen du.',
      faq: [
        {
          question: 'Zenbat denbora du jabeak fidantza itzultzeko?',
          answer:
            'Hilabete bat, giltzak ematen dituzunetik. Hilabete hori igarota, itzultzeko falta denak diruaren legezko interesa sortzen du (art. 36.4 LAU).',
        },
        {
          question: 'Zer egunetatik aurrera sortzen da interesa?',
          answer:
            'Hilabetea betetzen den egunaren biharamunetik, datatik datara zenbatuta, dirua itzultzen dizuten egunera arte; egun hori ez da zenbatzen (art. 36.4 LAU).',
        },
        {
          question: 'Zer interes aplikatzen da?',
          answer:
            'Diruaren legezko interesa, urtero Ley de Presupuestos Generales del Estado legeak finkatzen duena. Berrikuspenak urte natural bakoitzeko tasa erabiltzen du, Banco de España erakundearen taulakoa, urte horretako egunetarako (art. 36.4 LAU).',
        },
        {
          question: 'Kalteengatik zerbait deskonta diezadake fidantzatik?',
          answer:
            'Berrikuspen honek ez du baloratzen kalteengatiko, garbiketagatiko edo beste kontzeptu batengatiko deskontu bat bidezkoa den: eman zizuten bezala jasotzen du, eta ez du sartzen dagokizun zenbatekoan.',
        },
      ],
    },
    charges: {
      lead: 'Komunitatearen eta beste zerbitzu batzuen gastuak maizterraren kontura dira, idatziz itundu baduzue bakarrik, urteko zenbatekoarekin. Eta haien igoerak muga bat du.',
      faq: [
        {
          question: 'Errentaz gain, zer gastu kobra diezazkidake jabeak?',
          answer:
            'Kontratuak maizterraren kontura jartzen dituen gastuak, idatziz itundu bazenuten bakarrik eta kontratuaren datako urteko zenbatekoarekin (art. 20 LAU).',
        },
        {
          question: 'Zenbat igo daitezke gastu horiek?',
          answer:
            'Kontratuaren lehen bost urteetan, edo zazpietan jabea enpresa bat bada, gastu horiek, zergak izan ezik, urtean behin bakarrik igo daitezke, akordioz, eta inoiz ez errenta igo daitekeenaren bikoitza baino gehiago (art. 20 LAU).',
        },
        {
          question: 'IBIa kobra diezadake?',
          answer: `Noiz sinatu zenuen, horren araberakoa da. ${decreed('rental.page.decree.taxes')} ${t('eu', 'rental.guide.charges.taxes_before', { desde: formatLongDay(norms.rdl29_2026.inForceSince, 'eu') })}`,
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
      status: t('eu', STATUS_KEY[s.status], {
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
  const tx = (key: Key, vars?: Record<string, string>) => t('eu', key, vars);
  const decree = norms.rdl29_2026;
  const decreeEve = formatLongDay(toIso(addDays(parseDate(decree.inForceSince), -1)), 'eu');
  const since = formatLongDay(decree.inForceSince, 'eu');
  const caps = capsCopy('eu', norms, {
    checkedOn,
    iravRate: ctx.irav,
    example: ctx.example,
  });
  const sentence = (key: Key, vars?: Record<string, string>) =>
    decreeSentence('eu', norms, key, 'rdl29_2026', checkedOn, vars);
  const sources = (rules: readonly RuleId[]) => pageSources(norms, rules);

  if (id === 'rise') {
    const { rent, anniversary } = RISE_EXAMPLE;
    const raise = (rate: number) => round2((rent * (100 + rate)) / 100);
    const capped = ctx.irav > DECREE_CAP;
    const exampleDecree = capped
      ? `Hilean ${formatEuros(rent)} ordaintzen dituzu, eta zure kontratuak beste urte bat betetzen du ${formatLongDay(anniversary, 'eu')} datan. ` +
        `Argitaratutako azken IRAVarekin (${formatRate(ctx.irav)}), Real Decreto-ley 29/2026 araua aplikatzen bada, itun berririk gabeko muga ` +
        `${pct(DECREE_CAP)} da, ez ${formatRate(ctx.irav)}: zure errenta gehienez ${formatEuros(raise(DECREE_CAP))} izan daiteke.`
      : `Hilean ${formatEuros(rent)} ordaintzen dituzu, eta zure kontratuak beste urte bat betetzen du ${formatLongDay(anniversary, 'eu')} datan. ` +
        `Real Decreto-ley 29/2026 araua aplikatzen bada, itun berririk gabeko muga ${pct(DECREE_CAP)} edo IRAV da, txikiena: ` +
        `argitaratutako azken IRAVarekin (${formatRate(ctx.irav)}), zure errenta gehienez ${formatEuros(raise(ctx.irav))} izan daiteke.`;
    const exampleNoDecree =
      `Kongresuak dekretua indargabetuko balu, 2023ko maiatzaren 26tik aurrera sinatutako kontratu batean muga IRAV edo IPC izango litzateke berriro, txikiena. ` +
      `Argitaratutako azken IRAVarekin (${formatRate(ctx.irav)}), gehienez ${formatEuros(raise(ctx.irav))} izango lirateke, ` +
      `IPC txikiagoa ez balitz. Kontuan hartzen den IRAV ${formatLongDay(anniversary, 'eu')} datan argitaratuta dagoen azkena da, eta oraindik ez dago.`;
    return {
      lead: 'Igoera hiru gauzaren araberakoa da: kontratuak hala itundu izana, kontratuaren urte bakoitza betetzen den eguna eta egun horretako legezko muga. Hemen dituzu mugak, banan-banan eta bakoitza bere artikuluarekin.',
      sections: [
        {
          id: 'topes',
          heading: 'Mugak, urtea betetzen den egunaren arabera',
          paragraphs: [tx('rent_indices.caps_lead')],
          caps: caps.rows,
          status: caps.status,
          after: [...(caps.repealed ? [caps.repealed] : []), ...(caps.now ? [caps.now] : [])],
          folio: { article: '18', law: 'LAU' },
        },
        {
          id: 'sin-clausula',
          heading: 'Klausularik gabe, ez dago igoerarik',
          paragraphs: [tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause })],
          folio: { article: '18.1', law: 'LAU' },
        },
        {
          id: 'aviso',
          heading: 'Nola abisatu behar dizuten',
          paragraphs: [tx('rental.guide.update.notice')],
          folio: { article: '18.2', law: 'LAU' },
        },
        {
          id: 'ejemplo',
          heading: 'Adibide ebatzia',
          paragraphs: [],
          example: [exampleDecree, exampleNoDecree],
          after: [
            'Dekretua baliozkotzeko zain dagoen bitartean, bi kalkuluak dira posible: lehena, Kongresuak baliozkotzen badu, eta bigarrena, indargabetzen badu.',
          ],
          folio: { article: '18', law: 'LAU · RDL 29/2026' },
        },
      ],
      faq: [
        {
          anchor: 'faq-desde-cuando',
          question: 'Noiztik ordaindu behar dut igotako errenta?',
          answer: tx('rental.guide.update.notice'),
        },
        {
          anchor: 'faq-sin-clausula',
          question: 'Alokairua igo diezadakete kontratuak ezer esaten ez badu?',
          answer: tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause }),
        },
        {
          anchor: 'faq-pendiente',
          question: 'Zer esan nahi du «baliozkotzeko zain» egoteak?',
          answer: `${caps.status} Kongresuak bozkatu arte, bi interpretazio daude: gehienez ${pct(DECREE_CAP)} igotzea, edo IRAVaren edo IPCaren arabera igotzea.`,
        },
        {
          anchor: 'faq-irav-o-ipc',
          question: 'IRAV ala IPC dagokit?',
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
      standing ? tx(key, { ...vars, decreto: 'dekretu horren' }) : sentence(key, vars);
    const status = caps.status;
    return {
      lead: `Real Decreto-ley 29/2026 araua ${since} datatik aurrera dago indarrean. Errege lege-dekretu bat berak dioenean sartzen da indarrean (hau, argitaratu eta hurrengo egunean), baina indarra galtzen du Kongresuak 30 egunetan baliozkotzen ez badu: horregatik, beti begiratu behar da zer egoeratan dagoen.`,
      sections: [
        {
          id: 'estado',
          heading: 'Zer egoeratan dagoen dekretua',
          paragraphs: [],
          status,
          after: caps.repealed ? [caps.repealed] : [],
          folio: { article: '86.2', law: 'CE' },
        },
        {
          id: 'que-cambia',
          heading: 'Zer aldatzen den maizterrarentzat',
          paragraphs: [
            standing
              ? `${decreeClause('eu', norms, 'rdl29_2026', checkedOn)} arauak dakartzan aldaketa nagusiak, puntu bakoitzaren arauarekin:`
              : 'Aldaketa nagusiak, puntu bakoitzaren arauarekin:',
          ],
          list: [
            `Errentaren igoera: ${point('rental.page.decree.rise')}`,
            `Tentsionatutako eremuak: ${point('rental.page.decree.zones')}`,
            `Agentziaren ordainsariak: ${point('rental.page.decree.fees', { desde: since })}`,
            `Errenta ez ordaintzearen aurkako asegurua: ${point('rental.page.decree.insurance')}`,
            `Zergak, IBI adibidez: ${point('rental.page.decree.taxes')}`,
            `Komunitatearen gastuak: ${point('rental.page.charges.community')}`,
            `Kontratua amaitzeko agiria: ${point('rental.page.decree.closing')}`,
          ],
          links: (['rise', 'fees', 'deposit', 'charges', 'deposit_return'] as const).map((to) => ({
            label: RENTAL_PAGES[to].name,
            path: RENTAL_PAGES[to].path,
          })),
          folio: { law: 'RDL 29/2026' },
        },
        {
          id: 'contexto',
          heading: 'Tentsionatutako eremuak, etxebizitza-edukitzaile handiak eta luzapenak',
          paragraphs: [
            'Merkatu tentsionatuko eremuek, etxebizitza-edukitzaile handiek eta kontratuaren luzapenek beren arauak dituzte, eta dagokizuna alda dezakete. Hemen ez ditugu kalkulatzen: zure etxebizitza non dagoen, zure jabea nor den eta zure kontratuaren datak zein diren, horren araberakoak dira.',
            'Berrikuspenak eremuari eta jabeari buruz galdetzen dizu, eta zure kontratuaren datak ematen dizkizu.',
          ],
        },
      ],
      faq: [
        {
          anchor: 'faq-vigor',
          question: 'Dekretua indarrean dago?',
          answer: status,
        },
        {
          anchor: 'faq-derogado',
          question: 'Zer gertatzen da Kongresuak baliozkotzen ez badu?',
          answer: `Indargabetuta geratzen da, eta egun horretatik aurrera ez da aplikatzen; indarrean egon zen bitartean gertatutakoa kasu zalantzazkoa da. ${tx('rental.guide.update.doubtful')}`,
        },
        {
          anchor: 'faq-anteriores',
          question: 'Aurreko zer dekretu erori ziren?',
          answer: caps.repealed ?? 'Bat ere ez.',
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
      : `, eta ${since} datatik aurrera sinatu bazenuen, Real Decreto-ley 29/2026 arauaren arabera (${tx(`rent_indices.status_short.${decree.status}`)}), ezin dizu beste izen batekin ere kobratu`;
  return {
    lead: 'Higiezinen kudeaketako eta kontratua formalizatzeko gastuak nork ordaintzen dituen, kontratua sinatu zenuen dataren araberakoa da. Hauek dira arauak, bakoitza bere artikuluarekin.',
    sections: [
      {
        id: 'regla',
        heading: 'Nork ordaintzen duen, kontratua noiz sinatu zenuen kontuan hartuta',
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
        heading: 'Adibide ebatzia',
        paragraphs: [],
        example: [
          `Errenta ${formatEuros(rent)} izanik, higiezinen agentziak errenta-hileko bat kobratzen dizu, gehi IVA (${pct(vat)}): ${formatEuros(rent)} + ${formatEuros(round2(charge - rent))} = ${formatEuros(charge)}.`,
          `2023ko maiatzaren 26tik aurrera sinatu bazenuen, jabearen gastua da${from2026}. Ordaindu bazenuen, ${formatEuros(charge)} gehiegi ordaindu zenituen.`,
        ],
        links: [{ label: REVIEW.name, path: REVIEW.path }],
        folio: { article: '20', law: 'LAU' },
      },
    ],
    faq: [
      {
        anchor: 'faq-honorarios',
        question: 'Agentziaren ordainsariak kobra diezazkidakete?',
        answer: `${tx('rental.guide.fees.2019')} ${tx('rental.guide.fees.2023_open')}`,
      },
      {
        anchor: 'faq-otro-nombre',
        question: 'Eta «kaudimen-azterketa» edo «erreserba» deitzen badiote?',
        answer: otherNames,
      },
      {
        anchor: 'faq-persona',
        question: 'Nire jabea pertsona bat zen, eta 2020an sinatu nuen: nork ordaintzen du?',
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
  return capitalized(decreeSentence('eu', NORMS, key, 'rdl29_2026', checkedOn));
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
