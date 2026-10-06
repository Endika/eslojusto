import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/motor/**/*.test.ts', 'tests/calculadora/**/*.test.ts'] },
});
