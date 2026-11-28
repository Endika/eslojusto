import { defineConfig } from 'vitest/config';
import base from '../vitest.config';
// Stryker-only: instrumented code is much slower, so wall-clock budgets are meaningless there.
// STRYKER_TESTS narrows the suite to the area being mutated (comma-separated globs).
const only = process.env.STRYKER_TESTS?.split(',');
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    ...(only && { include: only }),
    testTimeout: 300_000,
    testNamePattern:
      /^(?!.*(well under 15 ms|finish fast and never throw|never put where another split would give less interest)).*$/,
  },
});
