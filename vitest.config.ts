import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'tests/engine/**/*.test.ts',
      'tests/calculator/**/*.test.ts',
      'tests/analytics/**/*.test.ts',
      'tests/lint/**/*.test.ts',
      'tests/documents/**/*.test.ts',
    ],
  },
});
