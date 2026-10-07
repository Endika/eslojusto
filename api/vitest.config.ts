import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Synthesizing the stack bundles three functions with esbuild.
    testTimeout: 60_000,
  },
});
