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

// The ERTE benefit page in Basque, with the same shape as es.ts (./copy.ts).

export const ERTE_PAGE = {
  title: 'Langabezia ERTE batean: zenbat kobratuko zenukeen hilean',
  description:
    'Zure jakinarazpeneko ERTE motarekin, kontratua eteten duen edo lanaldia murrizten duen jakinda eta zure oinarriarekin, hileko langabezia-prestazioa eta etorkizuneko prestazioa kontsumitzen duen ala ez kalkulatzen du.',
  h1: 'Langabezia ERTE batean',
  lead: 'ERTE batek (expediente de regulación temporal de empleo) langabezia-prestaziorako eskubidea eman dezake, irauten duen bitartean. Zenbat kobratzen duzun, eta geroko geratzen zaizun prestazioa kontsumitzen duen ala ez, ERTE motaren araberakoa da.',
  beta: 'Beta',
  betaNote:
    'Gutxi gorabeherako estimazioa, zuk idatzitako datuekin; ez du ordezten SEPEk aitortzen duena.',
  noJs: 'Estimazio honek JavaScript behar du.',
  button: 'Kalkulatu',
  restart: 'Hasi berriro',
} as const;

// The paragraphs of the legal notice about the page.
export const ERTE_LEGAL = {
  title: 'Langabezia-prestazioaren estimazioa ERTE batean',
  does: 'Hileko langabezia-prestazio gordina kalkulatzen du kausa ekonomiko, tekniko, antolakuntzako edo ekoizpenekoengatiko ERTE batean, ezinbesteko kasuagatiko ERTE batean edo RED mekanismoan, oinarri arautzailearekin eta zuk idatzitako datuekin: zenbatekoa bere mugekin, langabezia osoa edo partziala den, geroko geratzen zaizun prestazioa kontsumitzen duen ala ez, eta behar den kotizazioa. Bloke bakoitzak Ley General de la Seguridad Social legearen zein artikulutatik ateratzen den adierazten du, baita haren 41.ª eta 46.ª xedapen gehigarrietatik ere.',
  doesNot:
    'Ez du zure oinarri arautzailea kalkulatzen, ezta garbian kobratzen duzuna ere; ez du egiaztatzen baldintzak betetzen dituzun edo ERTEa baliozkoa den, eta ez du ordezten SEPEk aitortzen duena. Legeari buruzko informazioa ematen du, eta ez da aholkularitza juridikoa.',
  beta: 'Probetan dagoen atal bat da: akatsak izan ditzake kasu errealekin berrikusten den bitartean. Legearekin bat ez datorren zifraren bat ikusten baduzu, idatz dezakezu helbide honetara:',
} as const;

export const ERTE_QUESTIONS = {
  regime: {
    question: 'Zer ERTE mota duzu?',
    help: 'Enpresak bidali zizun jakinarazpenean dago.',
    options: [
      ['etop', 'Kausa ekonomiko, tekniko, antolakuntzako edo ekoizpenekoengatik'],
      ['force_majeure', 'Ezinbesteko kasuagatik'],
      ['red', 'RED mekanismoa'],
      ['unknown', 'Ez dakit'],
    ],
  },
  measure: {
    question: 'Zure ERTEak kontratua eteten du ala lanaldia murrizten du?',
    options: [
      ['suspension', 'Kontratua eteten du'],
      ['reduction', 'Lanaldia murrizten du'],
    ],
  },
  percent: {
    label: 'Lanaldiaren murrizketaren ehunekoa',
    hint: '10 eta 70 artean. Adibidez, 40, orduen 40\u00a0% gutxiago lan egiten baduzu.',
  },
  base: {
    question: 'Zein da zure oinarri arautzailea?',
    label: 'Hileko oinarri arautzailea',
    hint: 'Gordina, eurotan, hilean: azken 180 egunetan langabeziagatik kotizatutakoaren batez bestekoa, aparteko orduak kontuan hartu gabe.',
    hintRed:
      'Gordina, eurotan, hilean: enpresa horretan laneko istripuengatik eta gaixotasun profesionalengatik izandako kotizazio-oinarrien batez bestekoa, neurriaren aurreko 180 egunetan, edo gutxiago badira, daramatzazun egunetan, aparteko orduak kontuan hartu gabe.',
  },
  children: {
    question: 'Zenbat seme-alaba dituzu zure kargura?',
    help: 'Zure langabezia-prestazioaren gutxienekoa eta gehienekoa aldatzen ditu.',
    options: [
      ['0', 'Bat ere ez'],
      ['1', '1'],
      ['2', '2 edo gehiago'],
      ['not_said', 'Nahiago dut ez esan'],
    ],
  },
} as const;

const LEAD =
  'Estimazio gordin bat, idatzi dituzun datuekin. Balio duen zifra SEPEk aitortzen duena da.';

// «1.225 € inguru», or «560 € eta 1.225 € artean» when the readings differ by more than a euro.
function amount(r: Range): string {
  const lo = Math.round(r.min);
  const hi = Math.round(r.max);
  return lo === hi ? `${wholeEuros(lo)} inguru` : `${wholeEuros(lo)} eta ${wholeEuros(hi)} artean`;
}

// A cap reads to the euro when it is whole, never rounded past the law.
const capText = (n: number): string => (Number.isInteger(n) ? wholeEuros(n) : euros(n));

const percentText = (n: number): string => `${Number(n.toFixed(2)).toLocaleString('es-ES')}\u00a0%`;

const REGIME_SOURCE = {
  etop: 'Arts. 269 eta 270 LGSS',
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
  return `${wholeEuros(lo)} eta ${wholeEuros(hi)} artean`;
}

function amountBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const reduction = input.measure.kind === 'reduction' ? input.measure : null;
  const rate =
    input.regime === 'etop'
      ? `Zure oinarriaren 70\u00a0% da prestazioaren lehen 180 egunetan, eta 60\u00a0% 181. egunetik aurrera (art. 270.2 LGSS).`
      : `Zure oinarriaren 70\u00a0% da ERTE osoan (${input.regime === 'red' ? 'DA 41.ª.4' : 'DA 46.ª'} LGSS).`;
  const first = amount(e.firstStretch);
  const second = e.secondStretch === null ? null : amount(e.secondStretch);
  const figure = belowFullTimeMinimum(input)
    ? `Oinarria lanaldi osoko gutxienekoaren azpitik badago (${euros(BENEFIT_2026.minBaseAtep)}), lanaldia partziala da, eta orduan gutxienekoa eta gehienekoa zure orduen proportzioan jaisten dira (art. 270.3 LGSS). Zure orduak jakin gabe, estimazio honek ez du zifrarik ematen.`
    : second === null
      ? `${capitalise(first)} hilean.`
      : second === first
        ? `${capitalise(first)} hilean, 181. egunaren aurretik eta ondoren.`
        : `${capitalise(first)} hilean prestazioaren lehen 180 egunetan, eta ${second} 181. egunetik aurrera.`;
  const limit =
    input.regime === 'red'
      ? `Gehienez ${capText(RED_MONTHLY_CAP)} hilean (IPREMaren 225\u00a0% gehi seiren bat), eta gutxieneko berezirik gabe (DA 41.ª.4 LGSS).`
      : belowFullTimeMinimum(input)
        ? ''
        : `Gutxienekoa eta gehienekoa zure kargura dauden seme-alaben araberakoak dira (art. 270.3 LGSS): hilean ${capCopy(input.children)}, lanaldi osoarekin.`;
  const proportion = reduction
    ? input.regime === 'red'
      ? ` ERTEak zure lanaldia ${percentText(reduction.percent)} murrizten duenez, berrikuspenak prestazioa murrizketa horren proportzioan hartzen du, lanaldi-murrizketagatiko langabezian bezala (art. 270.5 LGSS). 41.ª xedapen gehigarriak ez du esaten nola kalkulatzen den RED mekanismoan: berrikuspenaren irizpide bat da.`
      : ` ERTEak zure lanaldia ${percentText(reduction.percent)} murrizten duenez, prestazioa murrizketa horren proportzionala da (art. 270.5 LGSS); aldi baterako murrizketa bakarrik zenbatzen da (art. 47 ET).`
    : '';
  return {
    title: 'Zenbat kobratuko zenukeen',
    text: [figure, rate, limit].filter(Boolean).join(' ') + proportion,
    source:
      input.regime === 'etop' ? 'Arts. 270.2, 270.3 eta 270.5 LGSS' : REGIME_SOURCE[input.regime],
  };
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function unemploymentBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (regime === 'red')
    return {
      title: 'Zer prestazio den',
      text: 'RED mekanismoan bere prestazio propioa kobratzen da, kontratua eteten duen zein lanaldia murrizten duen, eta ez langabezia-prestazio orokorra.',
      source: 'DA 41.ª.1 LGSS',
    };
  return e.unemployment === 'total'
    ? {
        title: 'Zer langabezia mota den',
        text: 'Zure kontratua eteten duen ERTE bat langabezia osoko legezko egoera da.',
        source: 'Arts. 262.2 eta 267.1.b.1.º LGSS',
      }
    : {
        title: 'Zer langabezia mota den',
        text: 'Zure lanaldia murrizten duen ERTE bat langabezia partzialeko legezko egoera da. Murrizketa egun osoetan aplikatzen bada, egun horiek langabezia osoa dira.',
        source: 'Arts. 262.2, 262.3 eta 267.1.c LGSS',
      };
}

function consumptionBlock(input: ErteInput, e: ErteEstimate): ErteBlock {
  const title = 'Etorkizuneko prestazioa kontsumitzen du?';
  if (!e.consumption.consumes)
    return {
      title,
      text:
        input.regime === 'red'
          ? 'Ez. RED mekanismoan kobratzen duzun denbora ez da kontsumitutzat hartzen.'
          : 'Hura kobratzeak ez ditu kontsumitzen lehendik zenituen kotizazioak: «el acceso a esta prestación no implicará el consumo de las cotizaciones previamente efectuadas a ningún efecto».',
      source: input.regime === 'red' ? 'DA 41.ª.8 LGSS' : 'DA 46.ª.b LGSS',
    };
  if (input.measure.kind === 'reduction')
    return {
      title,
      text: `Bai. Lanaldi-murrizketa batekin orduka kontsumitzen da, murrizketaren ehuneko berean: ERTEko egun bakoitzeko, langabezia-egun baten ${percentText(input.measure.percent)}.`,
      source: 'Art. 269.5 LGSS',
    };
  return {
    title,
    text: 'Bai. Kontratua etenda dagoen ERTEko egun bakoitzak geroko geratzen zaizun prestazioaren egun bat kontsumitzen du.',
    source: 'Art. 269 LGSS',
  };
}

function contributionBlock(regime: ErteRegime, e: ErteEstimate): ErteBlock {
  if (e.contribution.kind === 'minimum')
    return {
      title: 'Zenbat kotizatu behar den',
      text: `Azken 6 urteetan kotizatutako ${e.contribution.days} egun behar dira, beste langabezia-prestazio baterako erabili ez dituzunak.`,
      source: 'Arts. 266.b eta 269 LGSS',
    };
  return {
    title: 'Zenbat kotizatu behar den',
    text: 'Ez da gutxieneko kotizazio-aldirik behar.',
    source: regime === 'red' ? 'DA 41.ª.1 LGSS' : 'DA 46.ª LGSS',
  };
}

export function ertePositiveView(input: ErteInput, e: ErteEstimate): ErteView {
  return {
    title: 'Zure langabezia-prestazioa ERTEan (estimazioa)',
    lead: LEAD,
    blocks: [
      amountBlock(input, e),
      unemploymentBlock(input.regime, e),
      consumptionBlock(input, e),
      contributionBlock(input.regime, e),
      ...(e.jobSeekerRegistration
        ? [
            {
              title: 'Nola eskatu',
              text: 'Eskaera enpresak aurkezten du zure izenean, lan-agintaritzak neurria baimentzen duenetik hilabeteko epean. Hura kobratzeko, enplegu-eskatzaile gisa izena emanda egon behar duzu.',
              source: 'DA 41.ª.2 LGSS',
            },
          ]
        : []),
    ],
  };
}

export const erteUnknownView = (): ErteView => ({
  title: 'ERTE mota jakin gabe, ez dago zifra bakar bat',
  lead: 'Enpresaren jakinarazpenak dio zer motatakoa den. Bitartean, honela aldatzen dira arauak.',
  blocks: [
    {
      title: 'Kausa ekonomiko, tekniko, antolakuntzako edo ekoizpenekoak',
      text: 'Zure oinarriaren 70\u00a0% prestazioaren lehen 180 egunetan eta 60\u00a0% gero, seme-alaben araberako gutxienekoen eta gehienekoen barruan. Etorkizuneko prestazioa kontsumitzen du, eta azken 6 urteetan kotizatutako 360 egun behar dira, beste langabezia-prestazio baterako erabili ez dituzunak.',
      source: 'Arts. 266.b, 269 eta 270 LGSS',
    },
    {
      title: 'Ezinbesteko kasua',
      text: 'Zure oinarriaren 70\u00a0% ERTE osoan, seme-alaben araberako gutxienekoen eta gehienekoen barruan. Ez ditu kontsumitzen lehendik zenituen kotizazioak, eta ez da gutxieneko kotizazio-aldirik behar.',
      source: 'DA 46.ª LGSS',
    },
    {
      title: 'RED mekanismoa',
      text: `Zure oinarriaren 70\u00a0% ERTE osoan, gehienez ${capText(RED_MONTHLY_CAP)} hilean (IPREMaren 225\u00a0% gehi seiren bat). Kobratzen duzun denbora ez da kontsumitutzat hartzen, ez da gutxieneko kotizazio-aldirik behar, eta enplegu-eskatzaile gisa izena emanda egon behar duzu.`,
      source: 'DA 41.ª LGSS',
    },
  ],
});

export const ERTE_GUIDE = {
  title: 'Nola kalkulatzen den langabezia-prestazioa ERTE batean',
  sheetTitle: 'Hiru ERTE motak',
  sheetLead:
    'Bakoitzarekin langabezia-prestazioan aldatzen dena: zenbatekoa, etorkizuneko prestazioa kontsumitzen duen ala ez, eta kotizazioa.',
  nextTitle: 'Jarraitu irakurtzen',
  nextHub: 'Langabezia',
  hubPath: 'paro/',
} as const;

export const ERTE_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: 'Langabezia-prestazioa kobratzen dut nire ERTEak lanaldia murrizten badu?',
    answer:
      'Bai, zure ERTE motaren baldintzak betetzen badituzu, langabezia partzial gisa, zure eguneroko lanaldi arruntaren aldi baterako murrizketa 10 eta 70\u00a0% artekoa denean (arts. 262.3 LGSS eta 47.7.a ET). Prestazioa murrizketa horren proportzionala da (art. 270.5 LGSS).',
  },
  {
    question: 'ERTE batek geroko nire langabezia-prestazioa kontsumitzen du?',
    answer:
      'Motaren araberakoa da. Kausa ekonomiko, tekniko, antolakuntzako edo ekoizpenekoengatiko ERTEan, bai: egun bakoitzak prestazioa kontsumitzen du, eta lanaldi-murrizketa batean orduka kontsumitzen da (art. 269.5 LGSS). Ezinbesteko kasuagatikoan ez ditu kontsumitzen lehendik zenituen kotizazioak (DA 46.ª LGSS), eta RED mekanismoan kobratzen duzun denbora ez da kontsumitutzat hartzen (DA 41.ª.8 LGSS).',
  },
  {
    question: 'Gutxieneko bat kotizatu behar da ERTE batean langabezia-prestazioa kobratzeko?',
    answer:
      'Kausa ekonomiko, tekniko, antolakuntzako edo ekoizpenekoengatiko ERTEan, azken 6 urteetan kotizatutako 360 egun behar dira, beste langabezia-prestazio baterako erabili ez dituzunak (arts. 266.b eta 269 LGSS). Ezinbesteko kasuagatikoan eta RED mekanismoan ez da gutxieneko kotizazio-aldirik behar (DA 46.ª eta DA 41.ª.1 LGSS).',
  },
  {
    question: 'Zer gertatzen da ez badakit zer motatakoa den nire ERTEa?',
    answer:
      'Enpresak bidali zizun jakinarazpenak dio zer motatakoa den. Bitartean, aukeratu «Ez dakit» formularioan, eta mota bakoitzean arauak nola aldatzen diren ikusiko duzu, zifra bakar bat gabe.',
  },
];

export const ERTE_ERRORS = {
  regime: 'Aukeratu aukera bat; «Ez dakit» ere balio du',
  measure: 'Aukeratu aukera bat',
  percent: `Idatzi ehuneko bat, ${MIN_REDUCTION_PERCENT} eta ${MAX_REDUCTION_PERCENT} artean`,
  base: 'Idatzi oinarria eurotan, hilean; adibidez, 1.500,00',
  children: 'Aukeratu aukera bat; «Nahiago dut ez esan» ere balio du',
} as const;

export const ERTE: ErteCopy = {
  page: ERTE_PAGE,
  crumb: 'Langabezia ERTE batean',
  legal: ERTE_LEGAL,
  questions: ERTE_QUESTIONS,
  errors: ERTE_ERRORS,
  guide: ERTE_GUIDE,
  faq: ERTE_FAQ,
  positiveView: ertePositiveView,
  unknownView: erteUnknownView,
};
