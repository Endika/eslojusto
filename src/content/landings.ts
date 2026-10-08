import type { Cause } from '../engine/types';

// The case pages: one search intent each, the same calculator with the case already marked.
// Their prose is Spanish legal text, like the guide of /finiquito/, so they exist only in Spanish
// and their copy lives here and in each page rather than in the dictionary.

export type Hub = 'finiquito' | 'paro';

export interface Question {
  readonly question: string;
  readonly answer: string;
}

export interface Landing {
  // From the site root, with its trailing slash.
  readonly path: string;
  readonly hub: Hub;
  // The page's name in the breadcrumb and in links from other pages.
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly lead: string;
  // The heading of the explanation under the calculator, with the words of the search.
  readonly guideTitle: string;
  readonly cause?: Cause;
  readonly benefitFirst: boolean;
  readonly faq: readonly Question[];
  // Other pages it points to, by id, always with their own name as the anchor.
  readonly related: readonly LandingId[];
}

// `name` is the hub's crumb; `anchor`, the text of every link to it.
export const HUBS: Record<
  Hub,
  { readonly path: string; readonly name: string; readonly anchor: string }
> = {
  finiquito: { path: '/finiquito/', name: 'Finiquito', anchor: 'Calcula tu finiquito' },
  paro: { path: '/paro/', name: 'Paro', anchor: 'Calcula cuánto paro vas a cobrar' },
};

export type LandingId =
  | 'resignation'
  | 'unfair_dismissal'
  | 'fixed_term_end'
  | 'not_agreed'
  | 'benefit'
  | 'benefit_duration'
  | 'benefit_resignation'
  | 'objective_dismissal'
  | 'benefit_disciplinary';

export const LANDINGS: Record<LandingId, Landing> = {
  resignation: {
    path: '/finiquito/baja-voluntaria/',
    hub: 'finiquito',
    name: 'Finiquito por baja voluntaria',
    title: 'Finiquito por baja voluntaria 2026: calcúlalo y compáralo',
    description:
      'En la baja voluntaria no hay indemnización, pero sí vacaciones, pagas y salario pendiente. Calcula tu finiquito y compáralo con lo que te ofrecen.',
    h1: 'Finiquito por baja voluntaria: cuánto te corresponde',
    lead: 'Si te vas por decisión propia, la empresa te debe lo que ya has ganado. Calcula el mínimo legal de tu finiquito por baja voluntaria y compáralo con lo que te ofrecen.',
    guideTitle: 'Qué lleva el finiquito por baja voluntaria',
    cause: 'resignation',
    benefitFirst: false,
    faq: [
      {
        question: '¿Tengo derecho a finiquito si me voy de la empresa?',
        answer:
          'Sí. El finiquito es lo que ya has ganado y aún no has cobrado: el salario de los días trabajados del último mes, las vacaciones no disfrutadas y la parte generada de las pagas extra si no van prorrateadas. Te corresponde igual si te vas tú (art. 49.2 ET).',
      },
      {
        question: '¿Hay indemnización en la baja voluntaria?',
        answer:
          'No. La dimisión no genera indemnización (art. 49.1.d ET). La excepción son las salidas que la ley trata como un despido, como la del art. 50 ET por un incumplimiento grave de la empresa, que suele declarar un juzgado.',
      },
      {
        question: '¿Me pueden descontar el preaviso si no lo doy?',
        answer:
          'El preaviso de una dimisión lo fija tu convenio o la costumbre del lugar (art. 49.1.d ET). Si tu convenio lo prevé y no lo das, la empresa puede descontar del finiquito los días que falten, a razón de tu salario diario. Si no sabes cuántos días fija tu convenio, la revisión no puede calcular ese descuento y lo marca como «no se puede comprobar».',
      },
      {
        question: '¿Tengo paro si pido la baja voluntaria?',
        answer:
          'Por regla general, no: dejar el trabajo por decisión propia no es situación legal de desempleo (art. 267.2.a LGSS). Hay excepciones, como un traslado, una modificación sustancial de tus condiciones que te perjudique (art. 41.3 ET), impagos graves o la violencia de género o sexual (art. 267.1.a.5.º LGSS).',
      },
      {
        question: '¿Qué plazo hay para pedir lo que falta en el finiquito?',
        answer:
          'Para cantidades como el salario pendiente, las vacaciones o las pagas extra, un año desde el fin del contrato (art. 59.1 ET).',
      },
    ],
    related: ['benefit_resignation', 'not_agreed'],
  },
  unfair_dismissal: {
    path: '/finiquito/despido-improcedente/',
    hub: 'finiquito',
    name: 'Despido improcedente',
    title: 'Despido improcedente: indemnización y finiquito, al céntimo',
    description:
      '33 días por año con un tope de 720, o 45 hasta 2012 si empezaste antes. Calcula tu indemnización y tu finiquito con el artículo de cada cifra.',
    h1: 'Despido improcedente: indemnización y finiquito',
    lead: 'La indemnización por despido improcedente se calcula en días de salario por mes trabajado. Calcula la tuya con tus fechas, junto con el resto del finiquito, y compárala con lo que te ofrecen.',
    guideTitle: 'Cómo se calcula la indemnización por despido improcedente',
    cause: 'unfair_dismissal',
    benefitFirst: false,
    faq: [
      {
        question: '¿Cuántos días por año se pagan en un despido improcedente?',
        answer:
          '33 días de salario por año trabajado, con un tope de 24 mensualidades, que son 720 días (art. 56.1 ET). El tiempo se cuenta en meses, y una fracción de mes cuenta como un mes entero, como hace la guía del CGPJ.',
      },
      {
        question: '¿Y si empecé a trabajar antes de 2012?',
        answer:
          'El tiempo hasta el 11 de febrero de 2012 se paga a 45 días por año y el de después a 33 (disposición transitoria 11.ª ET). El total no puede pasar de 720 días, salvo que el primer tramo ya los supere; en ese caso cuenta ese tramo, con un máximo de 42 mensualidades (1.260 días).',
      },
      {
        question: '¿Readmisión o indemnización? ¿Quién decide?',
        answer:
          'Cuando un despido se declara improcedente, la empresa elige en cinco días entre readmitirte o pagarte la indemnización (art. 56.1 ET). Si te readmite, también te debe los salarios de tramitación (art. 56.2 ET). Si eres representante legal de la plantilla, la elección es tuya (art. 56.4 ET).',
      },
      {
        question: '¿El despido improcedente da paro?',
        answer:
          'Sí. Cualquier despido es situación legal de desempleo (art. 267.1.a.3.º LGSS). Además hacen falta 360 días cotizados en los últimos 6 años, entre otros requisitos.',
      },
      {
        question: '¿Qué plazo hay para impugnar un despido?',
        answer:
          '20 días hábiles desde el despido (art. 59.3 ET). Es corto, y un despacho laboralista, un despacho de graduado social o un sindicato pueden decirte cómo se aplica a tu caso.',
      },
    ],
    related: ['objective_dismissal', 'benefit_disciplinary', 'not_agreed'],
  },
  fixed_term_end: {
    path: '/finiquito/fin-de-contrato/',
    hub: 'finiquito',
    name: 'Finiquito por fin de contrato temporal',
    title: 'Finiquito por fin de contrato 2026: calcúlalo y compáralo',
    description:
      '12 días por año de indemnización, salvo en sustitución y formación, más vacaciones y pagas. Calcula tu finiquito y compáralo con lo que te ofrecen.',
    h1: 'Finiquito por fin de contrato temporal',
    lead: 'Cuando llega la fecha de fin de tu contrato temporal, te deben el finiquito y, según el tipo de contrato, una indemnización. Calcula las dos cosas con tus fechas y compáralas con lo que te ofrecen.',
    guideTitle: 'Qué te deben al acabar un contrato temporal',
    cause: 'fixed_term_end',
    benefitFirst: false,
    faq: [
      {
        question: '¿Tengo derecho a finiquito si se me acaba el contrato?',
        answer:
          'Sí. Al acabar cualquier contrato te deben el salario de los días trabajados del último mes, las vacaciones no disfrutadas y la parte generada de las pagas extra que no vayan prorrateadas (art. 49.2 ET).',
      },
      {
        question: '¿Cuánta indemnización hay al acabar un contrato temporal?',
        answer:
          '12 días de salario por año, en proporción a los días trabajados (art. 49.1.c ET). Si el contrato empezó en 2011 o antes son 8 días; en 2012, 9; en 2013, 10; y en 2014, 11 (disposición transitoria 8.ª ET). Los contratos de sustitución y los formativos no tienen indemnización, ni los firmados antes del 4 de marzo de 2001 (disposición transitoria 8.ª.2 ET).',
      },
      {
        question: '¿Me tienen que avisar de que se acaba el contrato?',
        answer:
          'Si el contrato duró más de un año, la empresa tiene que avisarte con 15 días de antelación (art. 49.1.c ET). La revisión cuenta como pendientes de pago los días de ese preaviso que no te dieron.',
      },
      {
        question: '¿Y si se me acaba el contrato estando de baja médica?',
        answer:
          'La revisión calcula el finiquito con las fechas, el salario y los días de vacaciones que indiques. No tiene en cuenta la baja médica ni lo que pasa con su prestación al acabar el contrato: eso no lo comprobamos.',
      },
      {
        question: '¿El fin de contrato da paro?',
        answer:
          'Sí, salvo que el contrato lo terminaras tú (art. 267.1.a.6.º LGSS). Además hacen falta 360 días cotizados en los últimos 6 años, que pueden venir de varios contratos.',
      },
    ],
    related: ['benefit_duration', 'not_agreed'],
  },
  not_agreed: {
    path: '/finiquito/firmar-no-conforme/',
    hub: 'finiquito',
    name: 'Firmar el finiquito como «no conforme»',
    title: 'Firmar el finiquito como «no conforme»: qué significa',
    description:
      'Qué significa poner «no conforme» al recibir el finiquito, qué cambia y qué no, y los plazos. Antes, compara lo que te ofrecen con el mínimo legal.',
    h1: 'Firmar el finiquito como «no conforme»',
    lead: 'Antes de firmar el finiquito, puedes comparar partida por partida lo que te ofrecen con el mínimo legal. Elige cómo terminó tu contrato y escribe las cifras de la propuesta.',
    guideTitle: 'Qué significa firmar «no conforme»',
    benefitFirst: false,
    faq: [
      {
        question: '¿Qué pasa si firmo el finiquito como «no conforme»?',
        answer:
          'Añadir «recibí no conforme» o «no conforme» no cambia lo que te paga la empresa: deja escrito que no estás de acuerdo con alguna cantidad. Lo contamos solo como información: qué hacer en tu caso puede valorarlo un despacho laboralista, un despacho de graduado social o un sindicato.',
      },
      {
        question: '¿Es obligatorio firmar el finiquito?',
        answer:
          'El art. 49.2 ET no dice que tengas que firmarlo. Lo que regula es que la empresa entregue una propuesta del documento de liquidación con lo que te debe y que puedas pedir que esté presente alguien de la representación legal de la plantilla al firmar.',
      },
      {
        question: '¿Puedo pedir que esté presente alguien de la plantilla?',
        answer:
          'Sí. La persona trabajadora puede pedir la presencia de un representante legal de la plantilla en el momento de firmar el finiquito, y si no lo pide, el documento lo hace constar (art. 49.2 ET).',
      },
      {
        question: '¿Qué plazo hay si una cantidad no cuadra?',
        answer:
          'Para el salario pendiente, las vacaciones, las pagas extra o la indemnización por fin de contrato temporal, un año (art. 59.1 ET). En un despido, el plazo para impugnarlo es de 20 días hábiles (art. 59.3 ET).',
      },
    ],
    related: ['resignation', 'unfair_dismissal', 'fixed_term_end'],
  },
  benefit: {
    path: '/paro/',
    hub: 'paro',
    name: 'Calcula cuánto paro vas a cobrar',
    title: 'Calcular el paro 2026: cuánto cobrarás cada mes',
    description:
      'El 70 % de tu base los primeros 180 días y el 60 % después, entre 560 € y 1.575 € al mes en 2026. Calcula tu paro con tus fechas y tu salario.',
    h1: 'Calcula cuánto paro vas a cobrar',
    lead: 'Con las fechas de tu contrato, tu salario y tus hijos o hijas a cargo, estima cuánto paro cobrarías al mes y durante cuánto tiempo. Al final verás también tu finiquito.',
    guideTitle: 'Cómo se calcula el paro',
    benefitFirst: true,
    faq: [
      {
        question: '¿Cuánto paro me corresponde?',
        answer:
          'El 70 % de tu base reguladora los primeros 180 días y el 60 % después (art. 270.2 LGSS). La base es la media de lo cotizado por desempleo en los últimos 180 días, sin horas extra (art. 270.1 LGSS). En 2026 cada mes queda entre 560 € y 1.575 € brutos, según tus hijos o hijas a cargo.',
      },
      {
        question: '¿El paro se calcula en bruto o en neto?',
        answer:
          'Las cifras son brutas. De ellas se descuenta un 4,85 % de la base para la Seguridad Social (Orden PJC/297/2026) y el IRPF que corresponda. Esta calculadora no da una cifra neta.',
      },
      {
        question: '¿Cuánto es el paro máximo en 2026?',
        answer:
          'Con el IPREM en 600 €, el máximo es de 1.225 € al mes sin hijos o hijas a cargo, 1.400 € con uno y 1.575 € con dos o más; el mínimo, 560 € sin hijos o hijas y 749 € con alguno (art. 270.3 LGSS y cuantías del SEPE).',
      },
      {
        question: '¿Qué ceses dan derecho a paro?',
        answer:
          'Cualquier despido y el fin de un contrato temporal que no terminaste tú son situación legal de desempleo; la baja voluntaria no, salvo excepciones (art. 267 LGSS).',
      },
      {
        question: '¿En qué plazo se pide el paro?',
        answer:
          'En los 15 días hábiles siguientes al fin del contrato, o al fin de las vacaciones no disfrutadas que te pague el finiquito, y antes tienes que inscribirte como demandante de empleo. Pedirlo más tarde resta días de paro (arts. 266 y 268 LGSS).',
      },
    ],
    related: ['benefit_duration', 'benefit_resignation', 'benefit_disciplinary'],
  },
  benefit_duration: {
    path: '/paro/por-tiempo-trabajado/',
    hub: 'paro',
    name: 'Cuánto paro te corresponde según el tiempo trabajado',
    title: 'Cuánto paro te toca según el tiempo trabajado',
    description:
      'Con 360 días cotizados en 6 años tienes 120 días de paro, y cada 180 más suman 60, hasta 720. La escala completa y tu cálculo con tus fechas.',
    h1: 'Cuánto paro te corresponde según el tiempo trabajado',
    lead: 'La duración del paro sale de los días cotizados en los últimos 6 años. Escribe las fechas de tu contrato y, si quieres, las de otros trabajos, y verás cuántos días te corresponden.',
    guideTitle: 'La escala del paro por tiempo trabajado',
    benefitFirst: true,
    faq: [
      {
        question: '¿Cuántos días cotizados hacen falta para cobrar el paro?',
        answer:
          'Al menos 360 días cotizados por desempleo en los 6 años anteriores, que no hayas usado ya para otro paro (arts. 266 y 269.1 LGSS). Pueden venir de varios trabajos.',
      },
      {
        question: '¿Cuánto paro me corresponde por 6 meses trabajados?',
        answer:
          'Con seis meses no se llega a los 360 días que exige la prestación contributiva. Si en los últimos 6 años trabajaste en otros sitios, esos días pueden sumar hasta llegar (art. 269.1 LGSS).',
      },
      {
        question: '¿Cuánto paro se acumula por año trabajado?',
        answer:
          'Un año cotizado (de 360 a 539 días) da 120 días de paro. Desde ahí, cada 180 días cotizados más suman 60 días de paro, hasta el máximo de 720 días con 2.160 cotizados (art. 269.1 LGSS).',
      },
      {
        question: '¿Cuentan las vacaciones no disfrutadas?',
        answer:
          'Sí. Las vacaciones pagadas en el finiquito y no disfrutadas cuentan como días cotizados (art. 269.4 LGSS), así que pueden sumar algo al total.',
      },
    ],
    related: ['benefit', 'fixed_term_end'],
  },
  benefit_resignation: {
    path: '/paro/baja-voluntaria/',
    hub: 'paro',
    name: '¿Hay paro si pides la baja voluntaria?',
    title: '¿Hay paro si pides la baja voluntaria?',
    description:
      'Dejar el trabajo por decisión propia no da paro, salvo un traslado, un cambio sustancial que te perjudique, impagos graves o violencia de género o sexual.',
    h1: '¿Hay paro si pides la baja voluntaria?',
    lead: 'Por regla general, no, pero hay excepciones. Aquí tienes la regla, los casos en los que irte sí da paro y la revisión de tu finiquito por baja voluntaria.',
    guideTitle: 'La baja voluntaria y el paro',
    cause: 'resignation',
    benefitFirst: true,
    faq: [
      {
        question: '¿Tengo derecho a paro si me voy de la empresa?',
        answer:
          'Por regla general, no: cesar voluntariamente no es situación legal de desempleo (art. 267.2.a LGSS). Las excepciones son irte por un traslado, por una modificación sustancial de tus condiciones que te perjudique (art. 41.3 ET), por un incumplimiento grave de la empresa o por violencia de género o sexual (art. 267.1.a.5.º LGSS).',
      },
      {
        question: '¿Y si después de la baja voluntaria empiezo otro trabajo?',
        answer:
          'Lo que se mira es cómo termina ese nuevo contrato: si acaba por despido o por fin de contrato temporal, es situación legal de desempleo (art. 267.1.a LGSS). Si la nueva empresa lo termina durante el periodo de prueba, cuenta solo si han pasado tres meses desde tu baja voluntaria (art. 267.1.a.7.º LGSS).',
      },
      {
        question: '¿Puedo irme por impagos y cobrar el paro?',
        answer:
          'La ley lo prevé cuando la empresa incumple de forma grave, como no pagarte o pagarte tarde una y otra vez (art. 50 ET y art. 267.1.a.5.º LGSS). Esa salida la suele declarar un juzgado.',
      },
      {
        question: '¿Hay finiquito en la baja voluntaria?',
        answer:
          'Sí. Aunque no haya paro ni indemnización, te deben el salario pendiente, las vacaciones no disfrutadas y la parte generada de las pagas extra (art. 49.2 ET).',
      },
    ],
    related: ['resignation', 'benefit'],
  },
  objective_dismissal: {
    path: '/finiquito/despido-objetivo/',
    hub: 'finiquito',
    name: 'Finiquito por despido objetivo',
    title: 'Finiquito por despido objetivo 2026: calcúlalo y compáralo',
    description:
      '20 días por año con un tope de 12 mensualidades y 15 días de preaviso, o su pago. Calcula tu finiquito y compáralo con el despido improcedente.',
    h1: 'Finiquito por despido objetivo: 20 días y preaviso',
    lead: 'En un despido objetivo te deben una indemnización de 20 días por año y 15 días de preaviso. Calcula las dos con tus fechas, junto con el resto del finiquito, y compáralas con lo que te ofrecen.',
    guideTitle: 'Cómo se calcula el despido objetivo',
    cause: 'objective_dismissal',
    benefitFirst: false,
    faq: [
      {
        question: '¿Cuánto es la indemnización por despido objetivo?',
        answer:
          '20 días de salario por año trabajado, con un tope de 12 mensualidades (art. 53.1.b ET). La guía del CGPJ, tras la STS 651/2026, cuenta ese tope como 360 días. El tiempo se cuenta en meses, y una fracción de mes cuenta como un mes entero.',
      },
      {
        question: '¿Me tienen que dar preaviso en un despido objetivo?',
        answer:
          'Sí, 15 días desde la comunicación del despido hasta que surte efecto. Si la empresa no lo da, los días que falten se pagan (art. 53.1.c ET).',
      },
      {
        question: '¿Qué diferencia hay con el despido improcedente?',
        answer:
          'El improcedente se paga a 33 días por año, con un tope de 720 días (art. 56.1 ET). Si un despido objetivo se declara improcedente, la indemnización pasa a calcularse así. La revisión te enseña las dos cifras.',
      },
      {
        question: '¿El despido objetivo da paro?',
        answer:
          'Sí. La extinción por causas objetivas es situación legal de desempleo (art. 267.1.a.4.º LGSS).',
      },
    ],
    related: ['unfair_dismissal', 'not_agreed'],
  },
  benefit_disciplinary: {
    path: '/paro/despido-disciplinario/',
    hub: 'paro',
    name: 'Paro después de un despido disciplinario',
    title: 'Paro después de un despido disciplinario',
    description:
      'Un despido disciplinario da paro, aunque sea procedente o no lo impugnes (art. 268.4 LGSS). Qué ceses dan paro y cuánto cobrarías con tus datos.',
    h1: 'Paro después de un despido disciplinario',
    lead: 'Un despido disciplinario también da derecho a paro si cumples el resto de requisitos. Escribe tus datos y verás cuánto cobrarías y durante cuánto tiempo.',
    guideTitle: 'El despido disciplinario y el paro',
    cause: 'disciplinary_dismissal',
    benefitFirst: true,
    faq: [
      {
        question: '¿Tengo paro con un despido disciplinario?',
        answer:
          'Sí. El despido es situación legal de desempleo (art. 267.1.a.3.º LGSS), y la ley añade que no hace falta impugnarlo para cobrar el paro (art. 268.4 LGSS).',
      },
      {
        question: '¿Me pueden denegar el paro por un despido disciplinario?',
        answer:
          'No por el tipo de despido. Lo que sí se exige son los requisitos de siempre: 360 días cotizados en los últimos 6 años, inscribirte como demandante de empleo y suscribir el acuerdo de actividad, entre otros (art. 266 LGSS).',
      },
      {
        question: '¿Qué ceses no dan derecho a paro?',
        answer:
          'Dejar el trabajo por decisión propia, salvo excepciones como un traslado o impagos graves de la empresa (art. 267.2.a y 267.1.a.5.º LGSS), y el fin de un contrato temporal que terminaste tú (art. 267.1.a.6.º LGSS).',
      },
      {
        question: '¿Hay indemnización en un despido disciplinario?',
        answer:
          'Si se declara procedente, no (art. 55.7 ET). Si se declara improcedente, se calcula como un despido improcedente, a 33 días por año (art. 56 ET). El finiquito te corresponde en cualquier caso.',
      },
    ],
    related: ['benefit', 'unfair_dismissal'],
  },
};

export const LANDING_IDS = Object.keys(LANDINGS) as LandingId[];
