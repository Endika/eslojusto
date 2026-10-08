import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The evaluation run calls Bedrock: only its pieces are tested, from test/.
    exclude: [...configDefaults.exclude, 'eval/**'],
    // Synthesizing the stack bundles three functions with esbuild.
    testTimeout: 60_000,
  },
});
