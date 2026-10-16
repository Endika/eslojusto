import type { Cause } from '../engine/types';
import { t, type Key } from '../i18n';
import { langPaths, type Lang } from '../i18n/languages';

// The case pages: one search intent each, the same calculator with the case already marked. Their
// words live in the dictionary under `landing.<id>.`; their prose, in src/prose/.

export type Hub = 'finiquito' | 'paro';

export interface Question {
  readonly question: string;
  readonly answer: string;
}

export interface Landing {
  // From the site root, with its trailing slash.
  readonly path: string;
  readonly hub: Hub;
  readonly cause?: Cause;
  readonly benefitFirst: boolean;
  // How many questions its FAQ has, under `landing.<id>.faq.<n>.`.
  readonly faq: number;
  // Other pages it points to, by id, always with their own name as the anchor.
  readonly related: readonly LandingId[];
}

// A case page's words in a language.
export interface LandingCopy {
  // The page's name in the breadcrumb and in links from other pages.
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly lead: string;
  // The heading of the explanation under the calculator, with the words of the search.
  readonly guideTitle: string;
  readonly faq: readonly Question[];
}

export const HUBS: Record<Hub, { readonly path: string; readonly name: Key }> = {
  finiquito: { path: '/finiquito/', name: 'home.final_pay' },
  paro: { path: '/paro/', name: 'home.benefit' },
};

// `name` is the hub's crumb; `anchor`, the text of every link to it.
export const hubCopy = (lang: Lang, hub: Hub): { name: string; anchor: string } => ({
  name: t(lang, HUBS[hub].name),
  anchor: t(lang, `landing.hub.${hub}.anchor`),
});

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
    cause: 'resignation',
    benefitFirst: false,
    faq: 5,
    related: ['benefit_resignation', 'not_agreed'],
  },
  unfair_dismissal: {
    path: '/finiquito/despido-improcedente/',
    hub: 'finiquito',
    cause: 'unfair_dismissal',
    benefitFirst: false,
    faq: 5,
    related: ['objective_dismissal', 'benefit_disciplinary', 'not_agreed'],
  },
  fixed_term_end: {
    path: '/finiquito/fin-de-contrato/',
    hub: 'finiquito',
    cause: 'fixed_term_end',
    benefitFirst: false,
    faq: 5,
    related: ['benefit_duration', 'not_agreed'],
  },
  not_agreed: {
    path: '/finiquito/firmar-no-conforme/',
    hub: 'finiquito',
    benefitFirst: false,
    faq: 4,
    related: ['resignation', 'unfair_dismissal', 'fixed_term_end'],
  },
  benefit: {
    path: '/paro/',
    hub: 'paro',
    benefitFirst: true,
    faq: 5,
    related: ['benefit_duration', 'benefit_resignation', 'benefit_disciplinary'],
  },
  benefit_duration: {
    path: '/paro/por-tiempo-trabajado/',
    hub: 'paro',
    benefitFirst: true,
    faq: 4,
    related: ['benefit', 'fixed_term_end'],
  },
  benefit_resignation: {
    path: '/paro/baja-voluntaria/',
    hub: 'paro',
    cause: 'resignation',
    benefitFirst: true,
    faq: 4,
    related: ['resignation', 'benefit'],
  },
  objective_dismissal: {
    path: '/finiquito/despido-objetivo/',
    hub: 'finiquito',
    cause: 'objective_dismissal',
    benefitFirst: false,
    faq: 4,
    related: ['unfair_dismissal', 'not_agreed'],
  },
  benefit_disciplinary: {
    path: '/paro/despido-disciplinario/',
    hub: 'paro',
    cause: 'disciplinary_dismissal',
    benefitFirst: true,
    faq: 4,
    related: ['benefit', 'unfair_dismissal'],
  },
};

export const LANDING_IDS = Object.keys(LANDINGS) as LandingId[];

// The dictionary keys a case page's words come from; a test holds each one to the dictionary.
export const landingKeys = (id: LandingId): readonly Key[] => [
  ...(['name', 'title', 'description', 'h1', 'lead', 'guide_title'] as const).map(
    (field) => `landing.${id}.${field}` as Key,
  ),
  ...Array.from({ length: LANDINGS[id].faq }, (_, i) => [
    `landing.${id}.faq.${i + 1}.question` as Key,
    `landing.${id}.faq.${i + 1}.answer` as Key,
  ]).flat(),
];

export const landingCopy = (lang: Lang, id: LandingId): LandingCopy => {
  const word = (field: string) => t(lang, `landing.${id}.${field}` as Key);
  return {
    name: word('name'),
    title: word('title'),
    description: word('description'),
    h1: word('h1'),
    lead: word('lead'),
    guideTitle: word('guide_title'),
    faq: Array.from({ length: LANDINGS[id].faq }, (_, i) => ({
      question: word(`faq.${i + 1}.question`),
      answer: word(`faq.${i + 1}.answer`),
    })),
  };
};

// getStaticPaths for `[lang]/<hub>/[case]/`: each case page under that hub, in every built
// language but Spanish. The hub's own page has its own route.
export const casePaths = (hub: Hub) =>
  langPaths().flatMap(({ params }) =>
    LANDING_IDS.filter(
      (id) => LANDINGS[id].hub === hub && LANDINGS[id].path !== HUBS[hub].path,
    ).map((id) => ({
      params: { ...params, case: LANDINGS[id].path.split('/').at(-2) },
      props: { id },
    })),
  );
