import { parseDate } from '../engine/date';
import { checkDepositReturn } from '../engine/rental/deposit-return';
import { checkCharges } from '../engine/rental/charges';
import { checkGuarantees } from '../engine/rental/guarantees';
import type { ItemReading, ItemResult } from '../engine/rental/item';
import type { Norm } from '../engine/rental/norms';
import { RENTAL_TABLES } from '../engine/rental/data/tables';
import { NORMS } from '../engine/rental/data/norms';
import type { RentalFigure, RentalPhrase } from '../engine/rental/calculation';
import type { RentalInput } from '../engine/rental/types';

// The three pages on the deposit and the charges of a rental. Spanish only, like the case pages:
// the prose lives in each view, the search metadata and the worked examples here. Every figure
// of an example comes out of the rental engine.

export type RentalPageId = 'deposit_return' | 'deposit' | 'charges';

export interface Question {
  readonly question: string;
  readonly answer: string;
}

export interface RentalPage {
  // From the site root, with its trailing slash.
  readonly path: string;
  // The last segment of the path.
  readonly slug: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly lead: string;
  readonly faq: readonly Question[];
  // Other pages it points to, always with their own name as the anchor.
  readonly related: readonly RentalPageId[];
}

export const REVIEW = { path: '/alquiler/', name: 'Revisa tu alquiler' } as const;

const RDL29 = 'el Real Decreto-ley 29/2026';

export const RENTAL_PAGES: Record<RentalPageId, RentalPage> = {
  deposit_return: {
    path: '/alquiler/devolucion-fianza/',
    slug: 'devolucion-fianza',
    name: 'Devolución de la fianza',
    title: 'Devolución de la fianza del alquiler: plazo e intereses',
    description:
      'El casero tiene un mes desde que entregas las llaves para devolver la fianza; después, intereses legales (art. 36.4 LAU). Con un ejemplo con cifras.',
    h1: 'Tu casero no te devuelve la fianza: plazo e intereses',
    lead: 'Cuando entregas las llaves, tu casero tiene un mes para devolverte la fianza. Pasado ese mes, lo que falte por devolver genera el interés legal del dinero.',
    faq: [
      {
        question: '¿Cuánto tiempo tiene el casero para devolver la fianza?',
        answer:
          'Un mes desde que entregas las llaves. Pasado ese mes, lo que falte por devolver genera el interés legal del dinero, sin que tengas que pedirlo (art. 36.4 LAU).',
      },
      {
        question: '¿Desde qué día corre el interés?',
        answer:
          'Desde el día siguiente a que se cumple el mes contado de fecha a fecha, y hasta el día en que te devuelven el dinero, que ya no cuenta. La revisión cuenta así el mes (art. 36.4 LAU y art. 5.1 del Código Civil).',
      },
      {
        question: '¿Qué interés se aplica?',
        answer:
          'El interés legal del dinero, que fija cada año la Ley de Presupuestos Generales del Estado. La revisión usa el tipo de cada año natural, de la tabla del Banco de España, para los días de ese año (art. 36.4 LAU).',
      },
      {
        question: '¿Puede descontarme algo de la fianza por desperfectos?',
        answer:
          'Esta revisión no valora si un descuento por desperfectos, limpieza u otro concepto está justificado: lo anota como te lo dieron y no lo incluye en lo que te deben. Solo información, no asesoramiento.',
      },
      {
        question: '¿Genera interés todo lo que pagué de más de una mensualidad?',
        answer:
          'No. Solo genera interés la fianza, que es una mensualidad (art. 36.1 y 36.4 LAU). Lo que pasa de ahí es otra garantía y la revisión no le calcula interés.',
      },
    ],
    related: ['deposit', 'charges'],
  },
  deposit: {
    path: '/alquiler/fianza/',
    slug: 'fianza',
    name: 'Cuánta fianza pueden pedirte',
    title: 'Fianza del alquiler: cuánto pueden pedirte (art. 36 LAU)',
    description:
      'Una mensualidad de fianza, hasta dos más de garantía adicional y una de pago por adelantado. Comprueba cuánto te han pedido con el artículo de cada tope.',
    h1: 'Fianza del alquiler: cuánto pueden pedirte',
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
        answer: 'No más de una mensualidad de renta por adelantado (art. 17.2 LAU).',
      },
      {
        question: '¿Pueden obligarme a contratar un seguro de impago?',
        answer: `No, según ${RDL29}, en vigor desde el 8 de octubre de 2026 y pendiente de que el Congreso lo convalide: no se puede exigir al inquilino un seguro de impago de la renta (art. 3.Diecisiete, que reforma el art. 36.5 LAU). Antes de esa fecha, la revisión no da por resuelto si un seguro cuenta dentro del tope.`,
      },
      {
        question: '¿Qué pasa con un aval bancario?',
        answer:
          'Un aval o un seguro no es dinero entregado: esta revisión los señala para que los mires, sin cifra, y solo compara con el tope el dinero que pagaste.',
      },
    ],
    related: ['deposit_return', 'charges'],
  },
  charges: {
    path: '/alquiler/gastos/',
    slug: 'gastos',
    name: 'Gastos que te puede cobrar el casero',
    title: 'IBI, comunidad y basura en el alquiler: qué te pueden cobrar',
    description:
      'El casero solo puede pasarte gastos si lo pactáis por escrito con su importe anual, y sin subirlos más del doble que la renta. Qué dice el art. 20 LAU.',
    h1: 'IBI, comunidad y basura: qué puede cobrarte tu casero',
    lead: 'Los gastos de la comunidad, los tributos y los servicios sin contador solo pasan al inquilino si el contrato lo dice con su importe anual. Y su subida tiene un tope.',
    faq: [
      {
        question: '¿Qué gastos puede cobrarme el casero aparte de la renta?',
        answer:
          'Los gastos generales del edificio, los tributos y los servicios sin contador, solo si lo pactasteis por escrito y con su importe anual a la fecha del contrato (art. 20.1 LAU, en su redacción anterior al Real Decreto-ley 29/2026).',
      },
      {
        question: '¿Cuánto pueden subir esos gastos?',
        answer:
          'En los cinco primeros años de contrato, o siete si el casero es una empresa, esos gastos, salvo los tributos, solo pueden subir una vez al año, por acuerdo, y nunca más del doble de lo que puede subir la renta (art. 20.2 LAU, que el Real Decreto-ley 29/2026 numera como 20.3).',
      },
      {
        question: '¿Puede cobrarme el IBI?',
        answer: `Depende de cuándo firmaste. Según ${RDL29}, en vigor desde el 8 de octubre de 2026 y pendiente de que el Congreso lo convalide, los tributos de la vivienda no pueden cargarse al inquilino, salvo que sea el inquilino quien tiene que pagarlos (art. 3.Doce, que reforma el art. 20.1 LAU). La revisión lo aplica a los contratos firmados desde esa fecha; en los anteriores, lo da como información.`,
      },
      {
        question: '¿Quién paga el agua y la luz?',
        answer:
          'Lo que se mide con un contador propio de la vivienda lo pagas tú (art. 20.3 LAU, que el Real Decreto-ley 29/2026 numera como 20.4).',
      },
      {
        question: '¿Y la tasa de basuras?',
        answer:
          'En la mayoría de municipios es un tributo, así que cae en lo del IBI y queda fuera del límite de subida de los gastos. Como no en todos lo es, la revisión la señala para que la mires.',
      },
    ],
    related: ['deposit', 'deposit_return'],
  },
};

export const RENTAL_PAGE_IDS = Object.keys(RENTAL_PAGES) as RentalPageId[];

// How RDL 29/2026 stands today, in words: «en vigor desde el 8 de octubre de 2026 y pendiente de
// convalidación».
export const decreeStatus = (norm: Norm = NORMS.rdl29_2026): string =>
  norm.status === 'pending_validation'
    ? 'pendiente de convalidación'
    : norm.status === 'repealed'
      ? 'derogado por el Congreso'
      : 'convalidado por el Congreso';

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
