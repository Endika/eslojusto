import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    // Unit tests see a build with the documents API, so its analytics events exist; the pages'
    // gating is tested through documentsConfig with explicit values.
    env: {
      PUBLIC_API_EXTRACT_URL: 'https://extract.api.test/',
      PUBLIC_API_CHECKOUT_URL: 'https://checkout.api.test/',
      PUBLIC_API_PASS_URL: 'https://pass.api.test/',
      PUBLIC_TURNSTILE_SITE_KEY: 'test-site-key',
    },
    include: [
      'tests/engine/**/*.test.ts',
      'tests/calculator/**/*.test.ts',
      'tests/content/**/*.test.ts',
      'tests/analytics/**/*.test.ts',
      'tests/lint/**/*.test.ts',
      'tests/documents/**/*.test.ts',
      'tests/rental/**/*.test.ts',
      'tests/employment/**/*.test.ts',
      'tests/erte/**/*.test.ts',
      'tests/household/**/*.test.ts',
      'tests/insurance/**/*.test.ts',
      'tests/mortgage/**/*.test.ts',
      'tests/content/**/*.test.ts',
      'tests/law/**/*.test.ts',
    ],
  },
});
