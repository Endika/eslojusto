// source: 2c557a5eacec
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

const NBSP = ' ';

// The six pages on a rental that sit under /alquiler/: the rise, the 2026 decree and the agency
// fees, and the deposit, its return and the charges, in French, with the shape, paths and
// examples of es.ts. They exist only in a PUBLIC_RENTAL=1 build. Only the loader imports this file.

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

export const REVIEW = { path: '/alquiler/', name: 'Vérifiez votre location' } as const;
const INDICES = { path: '/alquiler/irav-ipc/', name: 'IRAV et IPC de chaque mois' } as const;

export const RENTAL_PAGES: Record<RentalPageId, PageMeta> = {
  rise: {
    path: '/alquiler/subida/',
    slug: 'subida',
    name: 'De combien votre loyer peut augmenter',
    crumb: 'Augmentation du loyer',
    title: 'De combien votre loyer peut augmenter en 2026',
    description:
      "Les plafonds de l'augmentation du loyer selon le jour où le bail atteint sa nouvelle année, avec le texte de loi de chacun et un exemple chiffré.",
    h1: 'De combien votre loyer peut augmenter en 2026',
  },
  decree: {
    path: '/alquiler/decreto-2026/',
    slug: 'decreto-2026',
    name: 'Décret sur la location de 2026',
    crumb: 'Décret sur la location de 2026',
    title: 'Décret sur la location de 2026 : ce qui change et sa situation',
    description:
      'Ce qui change pour le locataire avec le Real Decreto-ley 29/2026 et où il en est : en vigueur depuis le 8 octobre, en attente de validation par le Congrès.',
    h1: 'Décret sur la location de 2026 : ce qui change et où il en est',
  },
  fees: {
    path: '/alquiler/honorarios-inmobiliaria/',
    slug: 'honorarios-inmobiliaria',
    name: "Honoraires de l'agence immobilière",
    crumb: "Honoraires de l'agence immobilière",
    title: "Honoraires d'agence : peuvent-ils vous être facturés ?",
    description:
      "Qui paie les honoraires de l'agence immobilière dans une location selon la date de signature de votre bail, avec l'article de la LAU applicable à chaque cas.",
    h1: "L'agence immobilière peut-elle vous facturer ses honoraires ? Les honoraires dans la location",
  },
  deposit: {
    path: '/alquiler/fianza/',
    slug: 'fianza',
    name: 'Quel dépôt de garantie peut vous être demandé',
    crumb: 'Quel dépôt de garantie peut vous être demandé',
    title: "Dépôt de garantie d'une location : ce qui peut vous être demandé (art. 36 LAU)",
    description:
      "Un mois de loyer de dépôt de garantie, jusqu'à deux de plus de garantie supplémentaire et un de paiement d'avance. Vérifiez ce qui vous a été demandé, avec l'article de chaque plafond.",
    h1: "Dépôt de garantie d'une location : ce qui peut vous être demandé",
  },
  deposit_return: {
    path: '/alquiler/devolucion-fianza/',
    slug: 'devolucion-fianza',
    name: 'Restitution du dépôt de garantie',
    crumb: 'Restitution du dépôt de garantie',
    title: "Restitution du dépôt de garantie d'une location : délai et intérêts",
    description:
      "Le propriétaire dispose d'un mois à compter de la remise des clés pour restituer le dépôt de garantie ; ensuite, des intérêts au taux légal (art. 36.4 LAU). Avec un exemple chiffré.",
    h1: 'Votre propriétaire ne vous restitue pas le dépôt de garantie : délai et intérêts',
  },
  charges: {
    path: '/alquiler/gastos/',
    slug: 'gastos',
    name: 'Les charges que le propriétaire peut vous facturer',
    crumb: 'Les charges que le propriétaire peut vous facturer',
    title:
      'IBI, copropriété et ordures ménagères dans une location : ce qui peut vous être facturé',
    description:
      "Le propriétaire ne peut vous répercuter des charges que si vous en convenez par écrit avec leur montant annuel, et leur augmentation est limitée les premières années. Ce que dit l'art. 20 LAU.",
    h1: 'IBI, copropriété et ordures ménagères : ce que votre propriétaire peut vous facturer',
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
    capitalized(decreeSentence('fr', norms, key, 'rdl29_2026', checkedOn));
  return {
    deposit: {
      lead: "Dans la location d'un logement, le dépôt de garantie (fianza) correspond à un mois de loyer. Le bail peut en outre exiger d'autres garanties, mais la loi les plafonne.",
      faq: [
        {
          question: "Quel dépôt de garantie peut m'être demandé pour la location d'un logement ?",
          answer: 'Un mois de loyer, en espèces (art. 36.1 LAU).',
        },
        {
          question:
            "D'autres garanties peuvent-elles m'être demandées en plus du dépôt de garantie ?",
          answer:
            'Oui, mais dans les baux signés depuis le 6 mars 2019 pour cinq ans au plus, ou sept au plus si le propriétaire est une entreprise, cette garantie supplémentaire ne peut pas dépasser deux mois de loyer (art. 36.5 LAU).',
        },
        {
          question: "Combien peut-on me demander d'avance ?",
          answer: "Pas plus d'un mois de loyer d'avance (art. 17 LAU).",
        },
        {
          question: "Peut-on m'obliger à souscrire une assurance loyers impayés ?",
          answer: decreed('rental.page.decree.insurance'),
        },
      ],
    },
    deposit_return: {
      lead: "Quand vous rendez les clés, votre propriétaire dispose d'un mois pour vous restituer le dépôt de garantie. Passé ce mois, ce qui reste à restituer produit des intérêts au taux d'intérêt légal (interés legal del dinero).",
      faq: [
        {
          question:
            'De combien de temps le propriétaire dispose-t-il pour restituer le dépôt de garantie ?',
          answer:
            "Un mois à compter de la remise des clés. Passé ce mois, ce qui reste à restituer produit des intérêts au taux d'intérêt légal (art. 36.4 LAU).",
        },
        {
          question: 'À partir de quel jour les intérêts courent-ils ?',
          answer:
            "À partir du lendemain du jour où le mois prend fin, compté de date à date, et jusqu'au jour où l'argent vous est restitué, qui n'est plus compté (art. 36.4 LAU).",
        },
        {
          question: "Quel taux s'applique ?",
          answer:
            "Le taux d'intérêt légal, fixé chaque année par la Ley de Presupuestos Generales del Estado (loi de finances). La vérification applique le taux de chaque année civile, selon le tableau du Banco de España, aux jours de cette année (art. 36.4 LAU).",
        },
        {
          question:
            'Le propriétaire peut-il retenir une partie du dépôt de garantie pour des dégradations ?',
          answer:
            "Cette vérification n'évalue pas si une retenue pour dégradations, nettoyage ou autre motif est fondée : elle la note telle qu'elle vous a été indiquée et ne l'inclut pas dans ce qui vous revient.",
        },
      ],
    },
    charges: {
      lead: "Les charges de copropriété et d'autres services ne sont à la charge du locataire que si vous en convenez par écrit avec leur montant annuel. Et leur augmentation est plafonnée.",
      faq: [
        {
          question: 'Quelles charges le propriétaire peut-il me facturer en plus du loyer ?',
          answer:
            'Les charges que le bail met à la charge du locataire, seulement si vous en êtes convenus par écrit et avec leur montant annuel à la date du bail (art. 20 LAU).',
        },
        {
          question: 'De combien ces charges peuvent-elles augmenter ?',
          answer:
            "Pendant les cinq premières années du bail, ou sept si le propriétaire est une entreprise, ces charges, hors impôts et taxes, ne peuvent augmenter qu'une fois par an, d'un commun accord, et jamais de plus du double de ce dont le loyer peut augmenter (art. 20 LAU).",
        },
        {
          question: "Le propriétaire peut-il me facturer l'IBI ?",
          answer: `Cela dépend de la date de signature de votre bail. ${decreed('rental.page.decree.taxes')} ${t('fr', 'rental.guide.charges.taxes_before', { desde: formatLongDay(norms.rdl29_2026.inForceSince, 'fr') })}`,
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
      status: t('fr', STATUS_KEY[s.status], {
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
  const tx = (key: Key, vars?: Record<string, string>) => t('fr', key, vars);
  const decree = norms.rdl29_2026;
  const decreeEve = formatLongDay(toIso(addDays(parseDate(decree.inForceSince), -1)), 'fr');
  const since = formatLongDay(decree.inForceSince, 'fr');
  const caps = capsCopy('fr', norms, {
    checkedOn,
    iravRate: ctx.irav,
    example: ctx.example,
  });
  const sentence = (key: Key, vars?: Record<string, string>) =>
    decreeSentence('fr', norms, key, 'rdl29_2026', checkedOn, vars);
  const sources = (rules: readonly RuleId[]) => pageSources(norms, rules);

  if (id === 'rise') {
    const { rent, anniversary } = RISE_EXAMPLE;
    const raise = (rate: number) => round2((rent * (100 + rate)) / 100);
    const capped = ctx.irav > DECREE_CAP;
    const exampleDecree = capped
      ? `Vous payez ${formatEuros(rent)} par mois et votre bail atteint une nouvelle année le ${formatLongDay(anniversary, 'fr')}. ` +
        `Avec le dernier IRAV publié (${formatRate(ctx.irav)}), si le Real Decreto-ley 29/2026 s'applique, le plafond sans nouvel accord ` +
        `est de ${pct(DECREE_CAP)}, et non de ${formatRate(ctx.irav)}${NBSP}: votre loyer peut passer à ${formatEuros(raise(DECREE_CAP))} au maximum.`
      : `Vous payez ${formatEuros(rent)} par mois et votre bail atteint une nouvelle année le ${formatLongDay(anniversary, 'fr')}. ` +
        `Si le Real Decreto-ley 29/2026 s'applique, le plafond sans nouvel accord est de ${pct(DECREE_CAP)} ou l'IRAV, le plus bas des deux${NBSP}: ` +
        `avec le dernier IRAV publié (${formatRate(ctx.irav)}), votre loyer peut passer à ${formatEuros(raise(ctx.irav))} au maximum.`;
    const exampleNoDecree =
      `Si le Congrès abrogeait le décret, le plafond dans un bail signé depuis le 26 mai 2023 redeviendrait l'IRAV ou l'IPC, le plus bas des deux. ` +
      `Avec le dernier IRAV publié (${formatRate(ctx.irav)}), ce serait ${formatEuros(raise(ctx.irav))} au maximum, ` +
      `à condition que l'IPC ne soit pas plus bas. L'IRAV qui compte est le dernier publié le ${formatLongDay(anniversary, 'fr')}, qui n'existe pas encore.`;
    return {
      lead: "L'augmentation dépend de trois choses : que le bail la prévoie, le jour où le bail atteint chaque nouvelle année et le plafond légal de ce jour-là. Voici les plafonds, un par un et avec leur article.",
      sections: [
        {
          id: 'topes',
          heading: 'Les plafonds, selon le jour où le bail atteint sa nouvelle année',
          paragraphs: [tx('rent_indices.caps_lead')],
          caps: caps.rows,
          status: caps.status,
          after: [...(caps.repealed ? [caps.repealed] : []), ...(caps.now ? [caps.now] : [])],
          folio: { article: '18', law: 'LAU' },
        },
        {
          id: 'sin-clausula',
          heading: "Sans clause, pas d'augmentation",
          paragraphs: [tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause })],
          folio: { article: '18.1', law: 'LAU' },
        },
        {
          id: 'aviso',
          heading: "Comment l'augmentation doit vous être notifiée",
          paragraphs: [tx('rental.guide.update.notice')],
          folio: { article: '18.2', law: 'LAU' },
        },
        {
          id: 'ejemplo',
          heading: 'Exemple détaillé',
          paragraphs: [],
          example: [exampleDecree, exampleNoDecree],
          after: [
            "Tant que le décret est en attente de validation, les deux calculs sont possibles : le premier si le Congrès le valide, le second s'il l'abroge.",
          ],
          folio: { article: '18', law: 'LAU · RDL 29/2026' },
        },
      ],
      faq: [
        {
          anchor: 'faq-desde-cuando',
          question: 'À partir de quand dois-je payer le loyer augmenté ?',
          answer: tx('rental.guide.update.notice'),
        },
        {
          anchor: 'faq-sin-clausula',
          question: 'Mon loyer peut-il augmenter si le bail ne prévoit rien ?',
          answer: tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause }),
        },
        {
          anchor: 'faq-pendiente',
          question: 'Que signifie « en attente de validation » (pendiente de convalidación) ?',
          answer: `${caps.status} Jusqu'au vote du Congrès, l'augmentation de ${pct(DECREE_CAP)} et celle selon l'IRAV ou l'IPC sont les deux calculs possibles.`,
        },
        {
          anchor: 'faq-irav-o-ipc',
          question: "Est-ce l'IRAV ou l'IPC qui s'applique à mon bail ?",
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
      standing ? tx(key, { ...vars, decreto: 'le décret' }) : sentence(key, vars);
    const status = caps.status;
    return {
      lead: `Le Real Decreto-ley 29/2026 s'applique depuis le ${since}. Un décret-loi entre en vigueur à la date qu'il fixe lui-même (celui-ci, le lendemain de sa publication), mais il devient caduc si le Congrès ne le valide pas dans les 30 jours${NBSP}: c'est pourquoi il faut toujours vérifier où il en est.`,
      sections: [
        {
          id: 'estado',
          heading: 'Où en est le décret',
          paragraphs: [],
          status,
          after: caps.repealed ? [caps.repealed] : [],
          folio: { article: '86.2', law: 'CE' },
        },
        {
          id: 'que-cambia',
          heading: 'Ce qui change pour le locataire',
          paragraphs: [
            standing
              ? `Les principaux changements qu'apporte ${decreeClause('fr', norms, 'rdl29_2026', checkedOn)} avec le texte de loi de chaque point${NBSP}:`
              : 'Les principaux changements, avec le texte de loi de chaque point :',
          ],
          list: [
            `Augmentation du loyer${NBSP}: ${point('rental.page.decree.rise')}`,
            `Zones tendues${NBSP}: ${point('rental.page.decree.zones')}`,
            `Honoraires de l'agence${NBSP}: ${point('rental.page.decree.fees', { desde: since })}`,
            `Assurance loyers impayés${NBSP}: ${point('rental.page.decree.insurance')}`,
            `Impôts et taxes comme l'IBI${NBSP}: ${point('rental.page.decree.taxes')}`,
            `Charges de copropriété${NBSP}: ${point('rental.page.charges.community')}`,
            `Document de fin de bail${NBSP}: ${point('rental.page.decree.closing')}`,
          ],
          links: (['rise', 'fees', 'deposit', 'charges', 'deposit_return'] as const).map((to) => ({
            label: RENTAL_PAGES[to].name,
            path: RENTAL_PAGES[to].path,
          })),
          folio: { law: 'RDL 29/2026' },
        },
        {
          id: 'contexto',
          heading: 'Zones tendues, grands propriétaires et prorogations',
          paragraphs: [
            "Les zones de marché tendu (zonas de mercado tensionado), les grands propriétaires (grandes tenedores) et les prorogations du bail ont leurs propres règles, qui peuvent changer ce qui s'applique à vous. Nous ne les calculons pas ici : elles dépendent de l'emplacement de votre logement, de qui est votre propriétaire et des dates de votre bail.",
            'La vérification vous interroge sur la zone et sur le propriétaire, et vous donne les dates de votre bail.',
          ],
        },
      ],
      faq: [
        {
          anchor: 'faq-vigor',
          question: 'Le décret est-il en vigueur ?',
          answer: status,
        },
        {
          anchor: 'faq-derogado',
          question: 'Que se passe-t-il si le Congrès ne le valide pas ?',
          answer: `Il est abrogé et cesse de s'appliquer à partir de ce jour${NBSP}; ce qui s'est passé pendant qu'il s'appliquait est un cas douteux. ${tx('rental.guide.update.doubtful')}`,
        },
        {
          anchor: 'faq-anteriores',
          question: 'Quels décrets antérieurs ont été abrogés ?',
          answer: caps.repealed ?? 'Aucun.',
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
      : `, et si vous avez signé depuis le ${since}, selon le Real Decreto-ley 29/2026, ${tx(`rent_indices.status_short.${decree.status}`)}, il ne peut pas non plus vous les facturer sous un autre nom`;
  return {
    lead: 'Qui paie les frais de gestion immobilière et de formalisation du bail dépend de la date de signature de votre bail. Voici les règles, avec leur article.',
    sections: [
      {
        id: 'regla',
        heading: 'Qui paie, selon la date de signature du bail',
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
        heading: 'Exemple détaillé',
        paragraphs: [],
        example: [
          `L'agence immobilière vous facture un mois de loyer, pour un loyer de ${formatEuros(rent)}, plus ${pct(vat)} de TVA (IVA)${NBSP}: ${formatEuros(rent)} + ${formatEuros(round2(charge - rent))} = ${formatEuros(charge)}.`,
          `Si vous avez signé depuis le 26 mai 2023, ces frais sont à la charge du propriétaire${from2026}. Si vous les avez payés, ce sont ${formatEuros(charge)} payés en trop.`,
        ],
        links: [{ label: REVIEW.name, path: REVIEW.path }],
        folio: { article: '20', law: 'LAU' },
      },
    ],
    faq: [
      {
        anchor: 'faq-honorarios',
        question: "Des honoraires d'agence peuvent-ils m'être facturés ?",
        answer: `${tx('rental.guide.fees.2019')} ${tx('rental.guide.fees.2023_open')}`,
      },
      {
        anchor: 'faq-otro-nombre',
        question:
          "Et si ces frais s'appellent « étude de solvabilité » (estudio de solvencia) ou « réservation » (reserva) ?",
        answer: otherNames,
      },
      {
        anchor: 'faq-persona',
        question: "Mon propriétaire était un particulier et j'ai signé en 2020 : qui paie ?",
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
  return capitalized(decreeSentence('fr', NORMS, key, 'rdl29_2026', checkedOn));
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
