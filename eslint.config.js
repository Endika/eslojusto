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
// src/engine/rental reaches the rest of the engine one level up, and only its edges (data/, where
// the norm and index tables live) hold data: the rules take those tables as arguments.
const rentalOnly = {
  regex: `^(?!\\.\\.?/)|${climbsBack}`,
  message: 'src/engine/rental imports only from src/engine.',
};
const noRentalData = {
  regex: '(^|/)data(/|$)',
  message: 'Rental rules take the norm and index tables as arguments; they never import them.',
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
    ignores: ['src/engine/rental/**'],
    rules: engineGlobals,
  }),
  boundary(['src/engine/rental/**'], [rentalOnly, noRentalData], {
    ignores: ['src/engine/rental/data/**'],
    rules: engineGlobals,
  }),
  boundary(['src/engine/rental/data/**'], [rentalOnly], { rules: engineGlobals }),
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
