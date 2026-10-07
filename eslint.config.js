import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

// Import boundaries: the engine is the core and depends on nothing; the UI reaches analytics only
// through the calculator ports, which the composition root (src/scripts) wires to PostHog.
// A `..` segment after the leading one (`./../x`, `../a/../../x`) would climb out unseen.
const climbsBack = '^\\.\\.?/(.*/)?\\.\\.(/|$)';
const localOnly = (dir) => ({
  regex: `^(?!\\./)|${climbsBack}`,
  message: `src/${dir} imports only from src/${dir}.`,
});
// Each section of the engine (src/engine/<section>) reaches the rest of the engine one level up,
// never another section, and only its edges (data/, where its tables live) hold data: its rules take
// those tables as arguments. Sections share the norm model through src/engine/law.
const SECTIONS = ['rental', 'employment'];
const sectionOnly = (name) => ({
  regex: `^(?!\\.\\.?/)|${climbsBack}`,
  message: `src/engine/${name} imports only from src/engine.`,
});
const noSectionData = (name) => ({
  regex: '(^|/)data(/|$)',
  message: `src/engine/${name} takes its tables as arguments; only its data/ holds them.`,
});
const noOtherSection = (name) => ({
  regex: `^\\.\\./(${SECTIONS.filter((s) => s !== name).join('|')})(/|$)`,
  message: `src/engine/${name} shares with other sections only through src/engine/law.`,
});
const lawOnly = {
  regex: `^(?!\\./|\\.\\./(date|money|sources)$)|${climbsBack}`,
  message: 'src/engine/law imports only from itself and src/engine/{date,money,sources}.',
};
const noAnalytics = {
  regex: '(^|/)analytics/',
  message: 'Only src/analytics and the composition root (src/scripts) import src/analytics.',
};
const noRoot = {
  regex: '(^|/)scripts/',
  message: 'Only a page loads the composition root (src/scripts).',
};
const noPosthogSdk = {
  regex: '^posthog-js',
  message: 'Only src/analytics talks to posthog-js.',
};
const noPosthogAdapter = {
  regex: '(^|/)posthog$',
  message: 'Only the composition root (src/scripts) imports the PostHog adapter.',
};
const analyticsReach = {
  regex:
    '^\\.\\./(?!engine/|content/faq-topics$|i18n/client$|calculator/ports$|documents/ports$|documents/config$)',
  message:
    'src/analytics reaches only the engine, the help topics, the translator type, the calculator and documents ports and the documents switch.',
};
const noDynamicImport = {
  selector: 'ImportExpression',
  message: 'Dynamic imports would slip past the import boundaries.',
};
const boundary = (files, patterns, { ignores, rules } = {}) => ({
  files,
  ...(ignores ? { ignores } : {}),
  rules: {
    'no-restricted-imports': ['error', { patterns }],
    'no-restricted-syntax': ['error', noDynamicImport],
    ...rules,
  },
});
const engineGlobals = {
  'no-restricted-globals': [
    'error',
    ...['Date', 'performance'].map((name) => ({
      name,
      message: 'The engine never reads the clock: take today as a parameter.',
    })),
    ...['window', 'document', 'navigator', 'location', 'history', 'localStorage'].map((name) => ({
      name,
      message: 'The engine runs without a browser.',
    })),
  ],
  'no-restricted-properties': [
    'error',
    ...['globalThis', 'self'].flatMap((object) =>
      ['Date', 'performance'].map((property) => ({
        object,
        property,
        message: 'The engine never reads the clock: take today as a parameter.',
      })),
    ),
  ],
};
const AREAS = [
  'src/engine/**',
  'src/i18n/**',
  'src/analytics/**',
  'src/scripts/**',
  'src/layouts/csp.ts',
  'src/**/*.astro/**',
];

export default tseslint.config(
  {
    ignores: [
      'dist',
      '.astro',
      'node_modules',
      'playwright-report',
      'test-results',
      '.superpowers',
      'api',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...astro.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  boundary(['src/engine/**'], [localOnly('engine')], {
    ignores: ['src/engine/law/**', ...SECTIONS.map((name) => `src/engine/${name}/**`)],
    rules: engineGlobals,
  }),
  boundary(['src/engine/law/**'], [lawOnly], { rules: engineGlobals }),
  ...SECTIONS.flatMap((name) => [
    boundary(
      [`src/engine/${name}/**`],
      [sectionOnly(name), noSectionData(name), noOtherSection(name)],
      { ignores: [`src/engine/${name}/data/**`], rules: engineGlobals },
    ),
    boundary([`src/engine/${name}/data/**`], [sectionOnly(name)], { rules: engineGlobals }),
  ]),
  boundary(['src/i18n/**'], [localOnly('i18n')]),
  boundary(['src/analytics/**'], [analyticsReach, noPosthogAdapter], {
    ignores: ['src/analytics/posthog.ts'],
  }),
  {
    files: ['src/analytics/posthog.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [analyticsReach] }] },
  },
  boundary(
    ['src/layouts/csp.ts'],
    [{ ...noAnalytics, regex: '(^|/)analytics/(?!config$)' }, noRoot, noPosthogSdk],
  ),
  boundary(['src/**/*.ts'], [noAnalytics, noRoot, noPosthogSdk], { ignores: AREAS }),
  boundary(['src/**/*.astro', 'src/**/*.astro/**'], [noAnalytics, noPosthogSdk]),
);
