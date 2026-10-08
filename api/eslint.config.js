import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// The hexagon: the domain imports nothing, the HTTP layer only the domain, and only the
// composition roots in src/handlers wire real adapters in.
const noDynamicImport = {
  selector: 'ImportExpression',
  message: 'Dynamic imports would slip past the import boundaries.',
};
const boundary = (files, regex, message, rules = {}) => ({
  files,
  rules: {
    'no-restricted-imports': ['error', { patterns: [{ regex, message }] }],
    'no-restricted-syntax': ['error', noDynamicImport],
    ...rules,
  },
});

export default tseslint.config(
  { ignores: ['cdk.out', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { languageOptions: { globals: { ...globals.node } } },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
    },
  },
  boundary(['src/domain/**'], '^(?!\\./)', 'The domain imports only its own modules.', {
    'no-restricted-properties': [
      'error',
      { object: 'Date', property: 'now', message: 'The domain reads time through the Clock port.' },
    ],
    'no-restricted-globals': [
      'error',
      { name: 'performance', message: 'The domain reads time through the Clock port.' },
      { name: 'process', message: 'The domain gets its configuration as parameters.' },
    ],
  }),
  boundary(
    ['src/http/**'],
    '^(?!\\./|\\.\\./domain/)',
    'The HTTP layer imports only the domain; adapters are wired in src/handlers.',
  ),
  boundary(
    ['src/adapters/**'],
    '^(\\.\\./(http|handlers)/|aws-cdk-lib|constructs)',
    'Adapters implement domain ports; they never reach the HTTP layer or the handlers.',
  ),
  boundary(
    ['src/config.ts'],
    '.',
    'Config is plain constants shared by the code and the infrastructure.',
  ),
  {
    ...boundary(
      ['eval/**'],
      '^(?!\\./|\\.\\./src/domain/)',
      'The evaluation reaches only the domain; eval/run.ts wires the adapters in.',
    ),
    ignores: ['eval/run.ts'],
  },
  boundary(
    ['infra/**'],
    '^\\.\\./src/(?!config$)',
    'The infrastructure reads src/config only; handler entry points are paths, not imports.',
  ),
);
