import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// The hexagon: the domain imports nothing, the HTTP layer only the domain, and only the
// composition roots in src/handlers wire real adapters in.
const onlyImports = (regex, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ regex, message }] }],
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
  {
    files: ['src/domain/**'],
    rules: onlyImports('^(?!\\./)', 'The domain imports only its own modules.'),
  },
  {
    files: ['src/http/**'],
    rules: onlyImports(
      '^(?!\\./|\\.\\./domain/)',
      'The HTTP layer imports only the domain; adapters are wired in src/handlers.',
    ),
  },
  {
    files: ['src/adapters/**'],
    rules: onlyImports(
      '^(\\.\\./(http|handlers)/|aws-cdk-lib|constructs)',
      'Adapters implement domain ports; they never reach the HTTP layer or the handlers.',
    ),
  },
  {
    files: ['src/config.ts'],
    rules: onlyImports('.', 'Config is plain constants shared by the code and the infrastructure.'),
  },
  {
    files: ['infra/**'],
    rules: onlyImports(
      '^\\.\\./src/(?!config$)',
      'The infrastructure reads src/config only; handler entry points are paths, not imports.',
    ),
  },
);
