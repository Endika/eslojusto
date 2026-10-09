import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

// Import boundaries: the engine is the core and depends on nothing; the UI reaches analytics only
// through the calculator ports, which the composition root (src/scripts) wires to PostHog.
// Only canonical relative paths pass: a `.` or `..` segment after the leading one (`./../x`,
// `.././x`, `../a/../../x`) or an empty one (`..//x`) would spell a path around the patterns below.
const notCanonical = '^\\.\\.?/(.*/)?\\.\\.?(/|$)|//';
const localOnly = (dir) => ({
  regex: `^(?!\\./)|${notCanonical}`,
  message: `src/${dir} imports only from src/${dir}.`,
});
// Each section of the engine (src/engine/<section>) reaches the rest of the engine one level up,
// never another section, and only its edges (data/, where its tables live) hold data: its rules take
// those tables as arguments. Sections share the norm model through src/engine/law.
const SECTIONS = ['rental', 'employment', 'household', 'credit', 'insurance', 'mortgage'];
const sectionOnly = (name) => ({
  regex: `^(?!\\.\\.?/)|${notCanonical}`,
  message: `src/engine/${name} imports only from src/engine.`,
});
// A section's data/ may also reach the tables every section shares, in src/engine/law/data.
const lawData = '\\.\\./\\.\\./law/data/[\\w-]+$';
const sectionDataOnly = (name) => ({
  regex: `^(?!\\.\\.?/)|^(?!${lawData})(\\.\\.?/(.*/)?\\.\\.?(/|$)|.*//)`,
  message: `src/engine/${name}/data imports only from src/engine and the shared tables in src/engine/law/data.`,
});
const noSectionData = (name) => ({
  regex: '(^|/)data(/|$)',
  message: `src/engine/${name} takes its tables as arguments; only its data/ holds them.`,
});
const noOtherSection = (name) => ({
  regex: `^\\.\\./(${SECTIONS.filter((s) => s !== name).join('|')})(/|$)`,
  message: `src/engine/${name} shares with other sections only through src/engine/law.`,
});
// A root file re-exporting a section would be a barrel around the section boundaries.
const noSectionFromRoot = {
  regex: `^\\./(${SECTIONS.join('|')})(/|$)`,
  message: 'Only a section imports itself; the rest of the engine never reaches into one.',
};
const lawOnly = {
  regex: `^(?!\\./|\\.\\./(date|money|sources)$)|${notCanonical}`,
  message: 'src/engine/law imports only from itself and src/engine/{date,money,sources}.',
};
// The shared tables reach only the law module that types them.
const lawDataOnly = {
  regex: `^(?!\\.\\./[\\w-]+$)|${notCanonical}`,
  message: 'src/engine/law/data imports only from src/engine/law.',
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
  regex: `(^|/)posthog(\\.[jt]s)?/?$|${notCanonical}`,
  message: 'Only the composition root (src/scripts) imports the PostHog adapter.',
};
const analyticsReach = {
  regex: `^\\.\\./(?!engine/|content/(rental-|employment-|household-)?faq-topics$|i18n/client$|calculator/ports$|rental/ports$|employment/ports$|household/ports$|documents/ports$|documents/config$)|${notCanonical}`,
  message:
    'src/analytics reaches only the engine, the help topics, the translator type, the calculator, rental, employment, household and documents ports and the documents switch.',
};
// Every review section walks its sheets on the same navigation and tabs, which learn a section's
// steps from the Flow they are given, so a new section plugs in without touching them.
const flowOnly = {
  regex: `^(?!\\./(flow|tabs)$|\\.\\./engine/date$)|${notCanonical}`,
  message: 'Navigation and tabs serve every section: its specifics come in through a Flow.',
};
// The rental review reaches the rental engine through its modules, never its tables, which its
// composition root passes in; of the calculator, only what every section shares; of reading
// documents, only the shared contract, ports, letter details and summary lines, never the final
// pay's pieces.
const rentalReach = {
  regex: `^(?!\\./|\\.\\./engine/(date|rental/(?!data$)[\\w-]+)$|\\.\\./calculator/(amounts|dom|fill|flow|navigation|number)$|\\.\\./documents/(contract|letter|ports|summary)$|\\.\\./i18n/client$)|${notCanonical}`,
  message:
    'src/rental reaches the rental engine (its tables come from the composition root), the shared sheets, the documents contract, ports and letter details, and the translator type.',
};
const noRental = {
  regex: '(^|/)rental/',
  message: 'The final pay never reaches into the rental review.',
};
// The employment contract review reaches the employment engine through its modules, never its
// tables, which its composition root passes in; of the calculator, only what every section shares;
// of reading documents, only the shared contract, ports, letter details and summary lines, never
// the final pay's pieces.
const employmentReach = {
  regex: `^(?!\\./|\\.\\./engine/(date|calculation|sources|law/sources|employment/(?!data$)[\\w-]+)$|\\.\\./calculator/(amounts|dom|fill|flow|navigation|number)$|\\.\\./documents/(contract|letter|ports|summary)$|\\.\\./i18n/client$)|${notCanonical}`,
  message:
    'src/employment reaches the employment engine (its tables come from the composition root), the shared sheets, the documents contract, ports and letter details, and the translator type.',
};
// The insurance review reaches the insurance engine through its modules, never its tables, which
// its composition root passes in; of the calculator, only what every section shares.
const insuranceReach = {
  regex: `^(?!\\./|\\.\\./engine/(date|calculation|law/sources|insurance/(?!data$)[\\w-]+)$|\\.\\./calculator/(dom|flow|navigation|number)$|\\.\\./i18n/client$)|${notCanonical}`,
  message:
    'src/insurance reaches the insurance engine (its tables come from the composition root), the shared sheets and the translator type.',
};
const noInsurance = {
  regex: '(^|/)insurance/',
  message: 'The final pay never reaches into the insurance review.',
};
const noEmployment = {
  regex: '(^|/)employment/',
  message: 'The final pay never reaches into the employment contract review.',
};
// The household worker review reaches the household engine through its modules, never its tables,
// which its composition root passes in; of the calculator, only what every section shares. It
// reads no documents.
const householdReach = {
  regex: `^(?!\\./|\\.\\./engine/(date|money|types|calculation|sources|law/sources|household/(?!data$)[\\w-]+)$|\\.\\./calculator/(amounts|calculation|dom|flow|navigation|number)$|\\.\\./i18n/client$)|${notCanonical}`,
  message:
    'src/household reaches the household engine (its tables come from the composition root), the shared sheets and the translator type.',
};
const noHousehold = {
  regex: '(^|/)household/',
  message: 'The final pay never reaches into the household worker review.',
};
// Reading documents and the pass serve every review section the same way: what is particular to
// one (the final pay's case, reading, prefill and report) comes in through their ports, wired by
// that section's composition root. Allowlists, so no spelling of a path gets around them.
const FINAL_PAY_DOCUMENTS = ['case', 'final-pay-reading', 'prefill', 'report'];
const sharedDocuments =
  'api|config|contract|files|letter|merge|notice|outage|pass|pdf|pdf-pages|pdf-writer|ports|quality|skipped|summary|upload';
// The contract mirrors one constant of the API package, two levels up.
const apiMirror = '\\.\\./\\.\\./api/src/domain/image-limit$';
const documentsPlatform = {
  regex: `^(?!\\./(${sharedDocuments})$|\\./fonts/(sans|serif)$|\\.\\./calculator/(dom|fill|number)$|\\.\\./engine/date$|\\.\\./i18n/client$|${apiMirror})|^(?!${apiMirror})(\\.\\.?/(.*/)?\\.\\.?(/|$)|.*//)`,
  message:
    'Document reading and the pass serve every section: its specifics come in through ports.',
};
const documentsRoot = {
  regex: `^(?!\\.\\./analytics/(documents|posthog)$|\\.\\./calculator/(fill|flow)$|\\.\\./documents/(api|config|contract|files|outage|pass|payment|ports|upload)$|\\.\\./i18n/client$|\\./(clock|jpeg|quality)$)|${notCanonical}`,
  message:
    'The documents wiring serves every section: its specifics come in as a DocumentsSection.',
};
// The documents wiring loads the PDF writer and pdf.js when they are needed, and nothing else.
const documentsRootLazy = {
  selector:
    'ImportExpression:not([source.type="Literal"][source.value=/^(\\.\\.\\/documents\\/pdf|\\.\\/pdf-pages)$/])',
  message: 'The documents wiring loads only the PDF writer and pdf.js on demand.',
};
const hiddenImports = [
  ['ImportExpression', 'Dynamic imports'],
  ['TSImportType', 'Type imports (`typeof import(…)`)'],
  ['TSExternalModuleReference', 'Imports through `import x = require(…)`'],
].map(([selector, what]) => ({
  selector,
  message: `${what} would slip past the import boundaries.`,
}));
const boundary = (files, patterns, { ignores, rules } = {}) => ({
  files,
  ...(ignores ? { ignores } : {}),
  rules: {
    'no-restricted-imports': ['error', { patterns }],
    'no-restricted-syntax': ['error', ...hiddenImports],
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
    // Every handle on the global object or the host, so no alias can reach a clock through it.
    ...[
      'global',
      'globalThis',
      'self',
      'top',
      'parent',
      'frames',
      'opener',
      'process',
      'eval',
      'Function',
      'Temporal',
      'Intl',
    ].map((name) => ({
      name,
      message: 'The engine never reaches the global object or the host: take inputs as parameters.',
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
  boundary(['src/engine/**'], [localOnly('engine'), noSectionFromRoot], {
    ignores: ['src/engine/law/**', ...SECTIONS.map((name) => `src/engine/${name}/**`)],
    rules: engineGlobals,
  }),
  boundary(['src/engine/law/**'], [lawOnly], {
    ignores: ['src/engine/law/data/**'],
    rules: engineGlobals,
  }),
  boundary(['src/engine/law/data/**'], [lawDataOnly], { rules: engineGlobals }),
  ...SECTIONS.flatMap((name) => [
    boundary(
      [`src/engine/${name}/**`],
      [sectionOnly(name), noSectionData(name), noOtherSection(name)],
      { ignores: [`src/engine/${name}/data/**`], rules: engineGlobals },
    ),
    boundary([`src/engine/${name}/data/**`], [sectionDataOnly(name)], { rules: engineGlobals }),
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
  boundary(
    ['src/calculator/{flow,navigation,tabs}.ts'],
    [noAnalytics, noRoot, noPosthogSdk, flowOnly],
  ),
  boundary(
    ['src/calculator/**'],
    [noAnalytics, noRoot, noPosthogSdk, noRental, noEmployment, noHousehold, noInsurance],
    {
      ignores: ['src/calculator/{flow,navigation,tabs}.ts'],
    },
  ),
  boundary(['src/rental/**'], [noAnalytics, noRoot, noPosthogSdk, rentalReach]),
  boundary(['src/employment/**'], [noAnalytics, noRoot, noPosthogSdk, employmentReach]),
  boundary(['src/household/**'], [noAnalytics, noRoot, noPosthogSdk, householdReach]),
  boundary(['src/insurance/**'], [noAnalytics, noRoot, noPosthogSdk, insuranceReach]),
  boundary(['src/documents/*.ts'], [noAnalytics, noRoot, noPosthogSdk, documentsPlatform], {
    ignores: FINAL_PAY_DOCUMENTS.map((name) => `src/documents/${name}.ts`),
  }),
  boundary(
    ['src/documents/*/**'],
    [
      {
        regex: `^(?!\\.\\./pdf-writer$)|${notCanonical}`,
        message: 'A subfolder of src/documents holds data: it reaches only the PDF writer.',
      },
    ],
  ),
  {
    files: ['src/scripts/documents.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [documentsRoot] }],
      'no-restricted-syntax': [
        'error',
        documentsRootLazy,
        ...hiddenImports.filter((h) => h.selector !== 'ImportExpression'),
      ],
    },
  },
);
