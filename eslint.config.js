import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

// Import boundaries: the engine is the core and depends on nothing; the UI reaches analytics only
// through the calculator ports, which the composition root (src/scripts) wires to PostHog.
const localOnly = (dir) => ({
  regex: '^(?!\\./)',
  message: `src/${dir} imports only from src/${dir}.`,
});
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
    rules: {
      'no-restricted-globals': [
        'error',
        ...['Date', 'performance'].map((name) => ({
          name,
          message: 'The engine never reads the clock: take today as a parameter.',
        })),
        ...['window', 'document', 'navigator', 'location', 'history', 'localStorage'].map(
          (name) => ({ name, message: 'The engine runs without a browser.' }),
        ),
      ],
    },
  }),
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
