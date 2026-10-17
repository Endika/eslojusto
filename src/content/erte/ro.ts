// source: cbf3c50ce7b9
import type { Range } from '../../engine/money';
import {
  belowFullTimeMinimum,
  RED_MONTHLY_CAP,
  type ErteEstimate,
  type ErteInput,
  type ErteRegime,
} from '../../engine/erte';
import { BENEFIT_2026 } from '../../engine/unemployment';
import { euros, wholeEuros } from '../format';

import type { ErteBlock, ErteCopy, ErteView } from './copy';
import { MAX_REDUCTION_PERCENT, MIN_REDUCTION_PERCENT } from '../../engine/erte';

// The ERTE benefit page in Romanian, with the same shape as es.ts (./copy.ts).

export const ERTE_PAGE = {
  title: 'Indemnizația de șomaj în timpul unui ERTE: cât ai primi pe lună',
  description:
    'Cu tipul de ERTE (șomaj tehnic temporar) din comunicarea ta, dacă suspendă contractul sau reduce programul și cu baza ta, estimează indemnizația de șomaj pe lună și dacă îți consumă șomajul viitor.',
  h1: 'Indemnizația de șomaj în timpul unui ERTE',
  lead: 'Un ERTE (șomaj tehnic temporar) poate da dreptul la indemnizația de șomaj (paro) cât timp durează. Cât primești și dacă îți consumă indemnizația de șomaj rămasă pentru mai târziu depind de tipul de ERTE.',
  beta: 'Beta',
  betaNote:
    'Estimare aproximativă cu datele pe care le scrii tu; nu înlocuiește ce îți recunoaște SEPE.',
  noJs: 'Această estimare are nevoie de JavaScript.',
  button: 'Calculează',
  restart: 'Ia-o de la capăt',
} as const;

// The paragraphs of the legal notice about the page.
export const ERTE_LEGAL = {
  title: 'Estimarea indemnizației de șomaj în timpul unui ERTE',
  does: 'Estimează indemnizația de șomaj (paro) brută pe lună în timpul unui ERTE (șomaj tehnic temporar) din motive economice, tehnice, organizatorice sau de producție, din cauză de forță majoră sau din mecanismul RED (mecanismo RED), cu baza de calcul (base reguladora) și datele pe care le scrii tu: suma cu limitele ei, dacă este șomaj total sau parțial, dacă îți consumă indemnizația de șomaj rămasă pentru mai târziu și contribuțiile necesare. Fiecare bloc indică articolul din Ley General de la Seguridad Social din care provine, inclusiv din dispozițiile ei adiționale 41.ª și 46.ª.',
  doesNot:
    'Nu calculează baza ta de calcul și nici ce primești net, nu verifică dacă îndeplinești condițiile sau dacă ERTE-ul este valid și nu înlocuiește ce îți recunoaște SEPE. Informează despre lege și nu este consultanță juridică.',
  beta: 'Este o secțiune în testare: poate avea erori cât timp este verificată cu cazuri reale. Dacă vezi o cifră care nu se potrivește cu legea, poți scrie la',
} as const;

export const ERTE_QUESTIONS = {
  regime: {
    question: 'Ce tip de ERTE ai?',
    help: 'Scrie în comunicarea pe care ți-a trimis-o firma.',
    options: [
      ['etop', 'Din motive economice, tehnice, organizatorice sau de producție'],
      ['force_majeure', 'Din cauză de forță majoră'],
      ['red', 'Mecanismul RED'],
      ['unknown', 'Nu știu'],
    ],
  },
  measure: {
    question: 'ERTE-ul tău suspendă contractul sau reduce programul?',
    options: [
      ['suspension', 'Suspendă contractul'],
      ['reduction', 'Reduce programul'],
    ],
  },
  percent: {
    label: 'Procentul de reducere a programului',
    hint: 'Între 10 și 70. De exemplu, 40 dacă lucrezi cu 40\u00a0% mai puține ore.',
  },
  base: {
    question: 'Care este baza ta de calcul (base reguladora)?',
    label: 'Baza de calcul pe lună',
    hint: 'Brut, în euro pe lună: media contribuțiilor pentru șomaj din ultimele 180 de zile, fără ore suplimentare.',
    hintRed:
      'Brut, în euro pe lună: media bazelor de contribuție pentru accidente de muncă și boli profesionale la acea firmă în cele 180 de zile dinaintea măsurii, sau în cele pe care le ai, dacă sunt mai puține, fără ore suplimentare.',
  },
  children: {
    question: 'Câți copii ai în întreținere?',
    help: 'Schimbă minimul și maximul indemnizației tale de șomaj.',
    options: [
      ['0', 'Niciunul'],
      ['1', '1'],
      ['2', '2 sau mai mulți'],
      ['not_said', 'Prefer să nu spun'],
    ],
  },
} as const;

const LEAD =
  'O estimare brută cu datele pe care le-ai scris. Cifra care contează este cea pe care o recunoaște SEPE.';

// «aproximativ 1.225 €», or «între 560 € și 1.225 €» when the readings differ by more than a euro.
function amount(r: Range): string {
  const lo = Math.round(r.min);
  const hi = Math.round(r.max);
  return lo === hi
    ? `aproximativ ${wholeEuros(lo)}`
    : `între ${wholeEuros(lo)} și ${wholeEuros(hi)}`;
}

// A cap reads to the euro when it is whole, never rounded past the law.
const capText = (n: number): string => (Number.isInteger(n) ? wholeEuros(n) : euros(n));

const percentText = (n: number): string => `${Number(n.toFixed(2)).toLocaleString('es-ES')}\u00a0%`;

const REGIME_SOURCE = {
  etop: 'Art. 269 și 270 LGSS',
  force_majeure: 'DA 46.ª LGSS',
  red: 'DA 41.ª LGSS',
} as const;

// The monthly floor and ceiling for the answer on children; the full span only without an answer.
function capCopy(children: ErteInput['children']): string {
  const { minCap, maxCap } = BENEFIT_2026;
  const [lo, hi] =
    children === null
      ? [minCap[0], maxCap[2]]
      : [minCap[Math.min(children, 1) as 0 | 1], maxCap[children]];
  return `între ${wholeEuros(lo)} și ${wholeEuros(hi)}`;
}

function amountBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const reduction = input.measure.kind === 'reduction' ? input.measure : null;
  const rate =
    input.regime === 'etop'
      ? `Este 70\u00a0% din baza ta în primele 180 de zile de prestație și 60\u00a0% din ziua 181 (art. 270.2 LGSS).`
      : `Este 70\u00a0% din baza ta pe toată durata ERTE-ului (${input.regime === 'red' ? 'DA 41.ª.4' : 'DA 46.ª'} LGSS).`;
  const first = amount(e.firstStretch);
  const second = e.secondStretch === null ? null : amount(e.secondStretch);
  const figure = belowFullTimeMinimum(input)
    ? `Cu o bază sub minimul pentru normă întreagă (${euros(BENEFIT_2026.minBaseAtep)}), programul este cu normă parțială, iar atunci minimul și maximul scad proporțional cu orele tale (art. 270.3 LGSS). Fără orele tale, această estimare nu dă o cifră.`
    : second === null
      ? `${capitalise(first)} pe lună.`
      : second === first
        ? `${capitalise(first)} pe lună, înainte și după ziua 181.`
        : `${capitalise(first)} pe lună în primele 180 de zile de prestație și ${second} din ziua 181.`;
  const limit =
    input.regime === 'red'
      ? `Cu un plafon de ${capText(RED_MONTHLY_CAP)} pe lună, 225\u00a0% din IPREM plus o șesime, și fără un minim propriu (DA 41.ª.4 LGSS).`
      : belowFullTimeMinimum(input)
        ? ''
        : `Cu minimul și maximul în funcție de copiii pe care îi ai în întreținere (art. 270.3 LGSS): ${capCopy(input.children)} pe lună cu normă întreagă.`;
  const proportion = reduction
    ? input.regime === 'red'
      ? ` Pentru că ERTE-ul îți reduce programul cu ${percentText(reduction.percent)}, verificarea ia prestația proporțional cu această reducere, ca la șomajul pentru reducerea programului (art. 270.5 LGSS). Dispoziția adițională 41.ª nu spune cum se calculează în mecanismul RED: este un criteriu al verificării.`
      : ` Pentru că ERTE-ul îți reduce programul cu ${percentText(reduction.percent)}, prestația este proporțională cu această reducere (art. 270.5 LGSS); se ia în calcul doar reducerea temporară din art. 47 ET.`
    : '';
  return {
    title: 'Cât ai primi',
    text: [figure, rate, limit].filter(Boolean).join(' ') + proportion,
    source:
      input.regime === 'etop' ? 'Art. 270.2, 270.3 și 270.5 LGSS' : REGIME_SOURCE[input.regime],
  };
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function unemploymentBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (regime === 'red')
    return {
      title: 'Ce prestație este',
      text: 'În mecanismul RED se primește o prestație proprie, fie că suspendă contractul, fie că reduce programul, și nu prestația generală de șomaj.',
      source: 'DA 41.ª.1 LGSS',
    };
  return e.unemployment === 'total'
    ? {
        title: 'Ce tip de șomaj este',
        text: 'Un ERTE care îți suspendă contractul este o situație legală de șomaj total.',
        source: 'Art. 262.2 și 267.1.b.1.º LGSS',
      }
    : {
        title: 'Ce tip de șomaj este',
        text: 'Un ERTE care îți reduce programul este o situație legală de șomaj parțial. Dacă reducerea se aplică în zile întregi, acele zile sunt șomaj total.',
        source: 'Art. 262.2, 262.3 și 267.1.c LGSS',
      };
}

function consumptionBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const title = 'Îți consumă șomajul viitor?';
  if (!e.consumption.consumes)
    return {
      title,
      text:
        input.regime === 'red'
          ? 'Nu. Timpul în care primești prestația din mecanismul RED nu se consideră consumat.'
          : 'Dacă o primești, nu consumi contribuțiile pe care le aveai deja: «el acceso a esta prestación no implicará el consumo de las cotizaciones previamente efectuadas a ningún efecto» (accesul la această prestație nu va implica, în niciun scop, consumarea contribuțiilor plătite anterior).',
      source: input.regime === 'red' ? 'DA 41.ª.8 LGSS' : 'DA 46.ª.b LGSS',
    };
  if (input.measure.kind === 'reduction')
    return {
      title,
      text: `Da. Cu o reducere a programului se consumă pe ore, în același procent ca reducerea: ${percentText(input.measure.percent)} dintr-o zi de șomaj pentru fiecare zi de ERTE.`,
      source: 'Art. 269.5 LGSS',
    };
  return {
    title,
    text: 'Da. Fiecare zi de ERTE cu contractul suspendat consumă o zi din indemnizația de șomaj rămasă pentru mai târziu.',
    source: 'Art. 269 LGSS',
  };
}

function contributionBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (e.contribution.kind === 'minimum')
    return {
      title: 'Cât trebuie să fi contribuit',
      text: `Ai nevoie de ${e.contribution.days} zile de contribuție (días cotizados) în ultimii 6 ani, pe care să nu le fi folosit pentru o altă indemnizație de șomaj.`,
      source: 'Art. 266.b și 269 LGSS',
    };
  return {
    title: 'Cât trebuie să fi contribuit',
    text: 'Nu este nevoie de o perioadă minimă de contribuție.',
    source: regime === 'red' ? 'DA 41.ª.1 LGSS' : 'DA 46.ª LGSS',
  };
}

export function ertePositiveView(input: ErteInput, e: ErteEstimate): ErteView {
  return {
    title: 'Indemnizația ta de șomaj în timpul ERTE-ului (estimare)',
    lead: LEAD,
    blocks: [
      amountBlock(input, e),
      unemploymentBlock(input.regime, e),
      consumptionBlock(input, e),
      contributionBlock(input.regime, e),
      ...(e.jobSeekerRegistration
        ? [
            {
              title: 'Cum se cere',
              text: 'Cererea o depune firma în numele tău, în termen de o lună de când autoritatea de muncă autorizează măsura. Ca să o primești, trebuie să fii înscris ca persoană în căutarea unui loc de muncă (demandante de empleo).',
              source: 'DA 41.ª.2 LGSS',
            },
          ]
        : []),
    ],
  };
}

export const erteUnknownView = (): ErteView => ({
  title: 'Fără tipul de ERTE nu există o singură cifră',
  lead: 'Comunicarea firmei spune ce tip este. Între timp, așa se schimbă regulile.',
  blocks: [
    {
      title: 'Motive economice, tehnice, organizatorice sau de producție',
      text: '70\u00a0% din baza ta în primele 180 de zile de prestație și 60\u00a0% după aceea, între minimele și maximele în funcție de copii. Îți consumă șomajul viitor și ai nevoie de 360 de zile de contribuție în ultimii 6 ani, pe care să nu le fi folosit pentru o altă indemnizație de șomaj.',
      source: 'Art. 266.b, 269 și 270 LGSS',
    },
    {
      title: 'Forță majoră',
      text: '70\u00a0% din baza ta pe toată durata ERTE-ului, între minimele și maximele în funcție de copii. Nu consumă contribuțiile pe care le aveai deja și nu este nevoie de o perioadă minimă de contribuție.',
      source: 'DA 46.ª LGSS',
    },
    {
      title: 'Mecanismul RED',
      text: `70\u00a0% din baza ta pe toată durata ERTE-ului, cu un plafon de ${capText(RED_MONTHLY_CAP)} pe lună, 225\u00a0% din IPREM plus o șesime. Timpul în care primești prestația nu se consideră consumat, nu este nevoie de o perioadă minimă de contribuție și trebuie să fii înscris ca persoană în căutarea unui loc de muncă.`,
      source: 'DA 41.ª LGSS',
    },
  ],
});

export const ERTE_GUIDE = {
  title: 'Cum se calculează indemnizația de șomaj în timpul unui ERTE',
  sheetTitle: 'Cele trei tipuri de ERTE',
  sheetLead:
    'Ce se schimbă la indemnizația de șomaj cu fiecare: suma, dacă îți consumă șomajul viitor și contribuțiile.',
  nextTitle: 'Citește mai departe',
  nextHub: 'Șomaj',
  hubPath: 'paro/',
} as const;

export const ERTE_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: 'Primesc indemnizație de șomaj dacă ERTE-ul meu reduce programul?',
    answer:
      'Da, dacă îndeplinești condițiile tipului tău de ERTE, ca șomaj parțial atunci când reducerea temporară a programului tău zilnic obișnuit este între 10 și 70\u00a0% (art. 262.3 LGSS și 47.7.a ET). Prestația este proporțională cu această reducere (art. 270.5 LGSS).',
  },
  {
    question: 'Un ERTE îmi consumă indemnizația de șomaj pentru mai târziu?',
    answer:
      'Depinde de tip. În ERTE-ul din motive economice, tehnice, organizatorice sau de producție, da: fiecare zi consumă șomaj, iar la o reducere a programului se consumă pe ore (art. 269.5 LGSS). În cel din cauză de forță majoră nu se consumă contribuțiile pe care le aveai deja (DA 46.ª LGSS), iar în mecanismul RED timpul în care primești prestația nu se consideră consumat (DA 41.ª.8 LGSS).',
  },
  {
    question: 'Trebuie să fi contribuit un minim ca să primesc indemnizație de șomaj într-un ERTE?',
    answer:
      'În ERTE-ul din motive economice, tehnice, organizatorice sau de producție ai nevoie de 360 de zile de contribuție în ultimii 6 ani, pe care să nu le fi folosit pentru o altă indemnizație de șomaj (art. 266.b și 269 LGSS). În cel din cauză de forță majoră și în mecanismul RED nu este nevoie de o perioadă minimă de contribuție (DA 46.ª și DA 41.ª.1 LGSS).',
  },
  {
    question: 'Ce fac dacă nu știu ce tip este ERTE-ul meu?',
    answer:
      'Comunicarea pe care ți-a trimis-o firma spune ce tip este. Între timp, alege „Nu știu” în formular și vei vedea cum se schimbă regulile la fiecare tip, fără o singură cifră.',
  },
];

export const ERTE_ERRORS = {
  regime: 'Alege o opțiune; „Nu știu” este și ea valabilă',
  measure: 'Alege o opțiune',
  percent: `Scrie un procent între ${MIN_REDUCTION_PERCENT} și ${MAX_REDUCTION_PERCENT}`,
  base: 'Scrie baza în euro pe lună, de exemplu 1.500,00',
  children: 'Alege o opțiune; „Prefer să nu spun” este și ea valabilă',
} as const;

export const ERTE: ErteCopy = {
  page: ERTE_PAGE,
  crumb: 'Indemnizația de șomaj în timpul unui ERTE',
  legal: ERTE_LEGAL,
  questions: ERTE_QUESTIONS,
  errors: ERTE_ERRORS,
  guide: ERTE_GUIDE,
  faq: ERTE_FAQ,
  positiveView: ertePositiveView,
  unknownView: erteUnknownView,
};
