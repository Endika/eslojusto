import { addDays, parseDate, toIso } from '../engine/date';
import { round2 } from '../engine/money';
import type { NormTable } from '../engine/rental/norms';
import { ruleSource, type RuleId } from '../engine/rental/rules';
import { t, type Key } from '../i18n';
import { capsCopy, type Source } from './rent-caps';
import { decreeSentence } from './rental-guide';
import { DECREE_CAP, formatDay, formatEuros, formatLongDay, formatRate } from './rent-indices';
import type { Example } from './rent-indices';

// The three guides on /alquiler/subida/, /alquiler/decreto-2026/ and /alquiler/honorarios-inmobiliaria/.
// They exist only in a PUBLIC_RENTAL=1 build. Every rule is read from the engine's norm table and
// rule list, so a validation or a repeal changes them without touching the copy.

export type TopicId = 'subida' | 'decreto' | 'honorarios';

export const TOPIC_IDS: readonly TopicId[] = ['subida', 'decreto', 'honorarios'];

export const TOPIC_PATH: Record<TopicId, string> = {
  subida: '/alquiler/subida/',
  decreto: '/alquiler/decreto-2026/',
  honorarios: '/alquiler/honorarios-inmobiliaria/',
};

export const isTopicId = (id: unknown): id is TopicId => TOPIC_IDS.includes(id as TopicId);

// The worked examples are on made-up figures.
export const RISE_EXAMPLE = { rent: 900, anniversary: '2026-11-01' } as const;
export const FEE_EXAMPLE = { rent: 900, vat: 21 } as const;

// RDL 29/2026 was promulgated on 06-10-2026; the Congress has 30 days to vote on it.
const DECREE_PROMULGATED = '2026-10-06';
const VOTE_DAYS = 30;

export interface TopicSource extends Source {
  readonly status: string;
  readonly statusCode: string;
}

export interface TopicTable {
  readonly caption: string;
  readonly head: readonly string[];
  readonly rows: readonly {
    readonly id: string;
    readonly cells: readonly string[];
    readonly sources: readonly Source[];
  }[];
}

export interface TopicSection {
  readonly id: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly list?: readonly string[];
  readonly table?: TopicTable;
  // A dated note about a norm's standing, set apart from the prose.
  readonly status?: string;
  // Text that follows the table or the list.
  readonly after?: readonly string[];
  readonly example?: readonly string[];
  readonly links?: readonly { readonly label: string; readonly path: string }[];
}

export interface TopicPage {
  readonly id: TopicId;
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly lead: string;
  readonly crumb: string;
  readonly sections: readonly TopicSection[];
  readonly faq: readonly {
    readonly anchor: string;
    readonly question: string;
    readonly answer: string;
  }[];
  readonly sources: readonly TopicSource[];
  readonly related: readonly { readonly label: string; readonly path: string }[];
}

export interface TopicContext {
  readonly norms: NormTable;
  // The day the page's rules were last checked, ISO.
  readonly checkedOn: string;
  readonly irav: number;
  readonly example: Example;
}

const HUB = { label: 'Revisa tu alquiler', path: '/alquiler/' } as const;
const INDICES = { label: 'IRAV e IPC de cada mes', path: '/alquiler/irav-ipc/' } as const;
const RELATED: Record<TopicId, { label: string; path: string }> = {
  subida: { label: 'Cuánto te pueden subir el alquiler', path: TOPIC_PATH.subida },
  decreto: { label: 'Decreto del alquiler 2026', path: TOPIC_PATH.decreto },
  honorarios: { label: 'Honorarios de la inmobiliaria', path: TOPIC_PATH.honorarios },
};

const STATUS_KEY = {
  in_force: 'client.rental.norm.in_force',
  pending_validation: 'client.rental.norm.pending_validation',
  repealed: 'client.rental.norm.repealed',
} as const satisfies Record<string, Key>;

const pct = (n: number) => `${n}\u00a0%`;

export function topicPage(id: TopicId, ctx: TopicContext): TopicPage {
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
  const sources = (rules: readonly RuleId[]): TopicSource[] =>
    rules.map((rule) => {
      const s = ruleSource(rule, norms);
      return {
        citation: s.citation,
        url: s.url,
        statusCode: s.status,
        status: tx(STATUS_KEY[s.status], { fecha: s.statusSince ? formatDay(s.statusSince) : '' }),
      };
    });
  const related = (...ids: TopicId[]) => [HUB, ...ids.map((other) => RELATED[other])];

  if (id === 'subida') {
    const { rent, anniversary } = RISE_EXAMPLE;
    const raise = (rate: number) => round2((rent * (100 + rate)) / 100);
    const capped = ctx.irav > DECREE_CAP;
    const exampleDecree = capped
      ? `Pagas ${formatEuros(rent)} al mes y tu contrato cumple un año más el ${formatLongDay(anniversary)}. ` +
        `Si rige el Real Decreto-ley 29/2026, el tope sin nuevo pacto es el ${pct(DECREE_CAP)}, no el ${formatRate(ctx.irav)} ` +
        `del último IRAV publicado: tu renta puede pasar a ${formatEuros(raise(DECREE_CAP))} como mucho.`
      : `Pagas ${formatEuros(rent)} al mes y tu contrato cumple un año más el ${formatLongDay(anniversary)}. ` +
        `Si rige el Real Decreto-ley 29/2026, el tope sin nuevo pacto es el ${pct(DECREE_CAP)} o el IRAV, el más bajo: ` +
        `con el último IRAV publicado (${formatRate(ctx.irav)}), tu renta puede pasar a ${formatEuros(raise(ctx.irav))} como mucho.`;
    const exampleNoDecree =
      `Si el Congreso derogara el decreto, el tope en un contrato firmado desde el 26 de mayo de 2023 volvería a ser el IRAV o el IPC, el más bajo. ` +
      `Con el último IRAV publicado (${formatRate(ctx.irav)}), serían ${formatEuros(raise(ctx.irav))} como mucho, ` +
      `siempre que el IPC no fuera más bajo. El IRAV que cuenta es el último publicado el ${formatLongDay(anniversary)}, que aún no existe.`;
    return {
      id,
      title: 'Cuánto te pueden subir el alquiler en 2026',
      description:
        'Topes de la subida del alquiler según el día en que se cumple el año de contrato, con la norma de cada uno y un ejemplo con cifras.',
      h1: 'Cuánto te pueden subir el alquiler en 2026',
      lead: 'La subida depende de tres cosas: que el contrato la pacte, el día en que se cumple cada año de contrato y el tope legal de ese día. Aquí están los topes, uno por uno y con su artículo.',
      crumb: 'Subida del alquiler',
      sections: [
        {
          id: 'topes',
          heading: 'Los topes, según el día en que se cumple el año',
          paragraphs: [tx('rent_indices.caps_lead')],
          table: {
            caption:
              'Tope de la subida anual del alquiler según la fecha del aniversario del contrato',
            head: ['Aniversario', 'Tope', 'Norma'],
            rows: caps.rows.map((row) => ({
              id: row.id,
              cells: [row.when, row.rule],
              sources: row.sources,
            })),
          },
          status: caps.status,
          after: [...(caps.repealed ? [caps.repealed] : []), ...(caps.now ? [caps.now] : [])],
        },
        {
          id: 'sin-clausula',
          heading: 'Sin cláusula, no hay subida',
          paragraphs: [tx('rent_indices.faq.no_clause_answer', { decretos: caps.faqNoClause })],
        },
        {
          id: 'aviso',
          heading: 'Cómo te tienen que avisar',
          paragraphs: [tx('rental.guide.update.notice')],
        },
        {
          id: 'ejemplo',
          heading: 'Un ejemplo con 900 euros',
          paragraphs: [],
          example: [exampleDecree, exampleNoDecree],
          after: [
            'Mientras el decreto esté pendiente de convalidación, las dos cuentas son posibles: la primera si el Congreso lo convalida y la segunda si lo deroga.',
          ],
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
      related: [INDICES, ...related('decreto', 'honorarios')],
    };
  }

  if (id === 'decreto') {
    const deadline = toIso(addDays(parseDate(DECREE_PROMULGATED), VOTE_DAYS));
    const status = `${caps.status} El plazo de ${VOTE_DAYS} días para votarlo termina en torno al ${formatLongDay(deadline)}.`;
    return {
      id,
      title: 'Decreto del alquiler 2026: qué cambia y su estado',
      description:
        'Qué cambia para el inquilino con el Real Decreto-ley 29/2026 y en qué estado está: en vigor desde el 8 de octubre, pendiente de convalidación.',
      h1: 'Decreto del alquiler 2026: qué cambia y en qué estado está',
      lead: `El Real Decreto-ley 29/2026 rige desde el ${since}. Un decreto-ley sale en vigor al publicarse, pero decae si el Congreso no lo convalida: por eso hay que mirar siempre en qué estado está.`,
      crumb: 'Decreto del alquiler 2026',
      sections: [
        {
          id: 'estado',
          heading: `Estado a ${formatLongDay(checkedOn)}`,
          paragraphs: [],
          status,
          after: caps.repealed ? [caps.repealed] : [],
        },
        {
          id: 'que-cambia',
          heading: 'Qué cambia para el inquilino',
          paragraphs: ['Lo principal, con la norma de cada punto:'],
          list: [
            `Subida de la renta: ${sentence('rental.guide.zones.rise')}`,
            `Honorarios de la agencia: ${sentence('rental.guide.fees.2026', { desde: since })}`,
            `Garantías: ${sentence('rental.guide.guarantees.insurance')}`,
            `Tributos como el IBI: ${sentence('rental.guide.charges.taxes')}`,
            `Documento de fin de contrato: ${sentence('rental.guide.return.closing')}`,
          ],
          links: [
            { label: RELATED.subida.label, path: TOPIC_PATH.subida },
            { label: RELATED.honorarios.label, path: TOPIC_PATH.honorarios },
            { label: 'Fianza y garantías', path: '/alquiler/#g-fianza' },
            { label: 'Gastos: comunidad, IBI y basura', path: '/alquiler/#g-gastos' },
            { label: 'Devolución de la fianza', path: '/alquiler/#g-devolucion' },
          ],
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
          answer: tx('rental.guide.update.doubtful'),
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
      related: related('subida', 'honorarios'),
    };
  }

  const { rent, vat } = FEE_EXAMPLE;
  const charge = round2((rent * (100 + vat)) / 100);
  return {
    id,
    title: '¿Puede la inmobiliaria cobrarte a ti? Honorarios',
    description:
      'Quién paga los honorarios de la inmobiliaria en el alquiler según la fecha en que firmaste el contrato, con el artículo de la LAU de cada caso.',
    h1: '¿Puede la inmobiliaria cobrarte a ti? Honorarios en el alquiler',
    lead: 'Quién paga los gastos de gestión inmobiliaria y de formalización del contrato depende de la fecha en que firmaste. Estas son las reglas, con su artículo.',
    crumb: 'Honorarios de la inmobiliaria',
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
        after: [
          decree.status === 'repealed'
            ? tx('rental.guide.fees.other_names_open')
            : tx('rental.guide.fees.other_names', { desde: since }),
        ],
      },
      {
        id: 'ejemplo',
        heading: 'Un ejemplo con 900 euros',
        paragraphs: [],
        example: [
          `La inmobiliaria te cobra una mensualidad de una renta de ${formatEuros(rent)} más el ${pct(vat)} de IVA: ${formatEuros(rent)} + ${formatEuros(round2(charge - rent))} = ${formatEuros(charge)}.`,
          `Si firmaste desde el 26 de mayo de 2023 es un gasto del casero, y si firmaste desde el ${since} tampoco puede pasártelo con otro nombre. Si lo pagaste, son ${formatEuros(charge)} pagados de más.`,
        ],
        links: [HUB],
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
        answer: tx('rental.guide.fees.other_names_open'),
      },
      {
        anchor: 'faq-persona',
        question: 'Mi casero era una persona y firmé en 2020: ¿quién paga?',
        answer: tx('rental.guide.fees.2019'),
      },
    ],
    sources: sources(['fees_2019', 'fees_2023', 'fees_2026']),
    related: related('subida', 'decreto'),
  };
}
