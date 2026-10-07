import { defineConfig, devices } from '@playwright/test';

// The RTL project needs a TEST_RTL=1 build, so it only exists when that build is asked for.
const rtl = process.env['TEST_RTL'] === '1';
// The analytics project needs a build with an analytics key; every other build has none.
const analytics = process.env['TEST_ANALYTICS'] === '1';
// The documents project needs a build with a (fake) documents API; the page routes it.
const documents = process.env['TEST_DOCUMENTS'] === '1';
const optInSpecs = /(rtl|analytics|documents)\.spec\.ts/;
const port = Number(process.env['E2E_PORT'] ?? 4321);
const DOCUMENTS_API = 'https://api.eslojusto.test';

const buildEnv = {
  ...(analytics ? { PUBLIC_POSTHOG_KEY: 'phc_test' } : {}),
  ...(documents
    ? { PUBLIC_API_URL: DOCUMENTS_API, PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' }
    : {}),
};

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: `http://localhost:${port}/` },
  webServer: {
    command: `npm run build && npm run preview -- --port ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env['CI'],
    ...(Object.keys(buildEnv).length > 0 ? { env: buildEnv } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: optInSpecs },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: optInSpecs },
    ...(rtl
      ? [{ name: 'rtl', use: { ...devices['Desktop Chrome'] }, testMatch: /rtl\.spec\.ts/ }]
      : []),
    ...(analytics
      ? [
          {
            name: 'analytics',
            use: { ...devices['Desktop Chrome'] },
            testMatch: /analytics\.spec\.ts/,
          },
        ]
      : []),
    ...(documents
      ? [
          {
            name: 'documents',
            use: { ...devices['Desktop Chrome'] },
            testMatch: /documents\.spec\.ts/,
          },
        ]
      : []),
  ],
});
