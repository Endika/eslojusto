import { defineConfig, devices } from '@playwright/test';

// The RTL project needs a TEST_RTL=1 build, so it only exists when that build is asked for.
const rtl = process.env['TEST_RTL'] === '1';
// The analytics project needs a build with an analytics key; every other build has none.
const analytics = process.env['TEST_ANALYTICS'] === '1';
// The documents project needs a build with a (fake) documents API; the page routes it.
const documents = process.env['TEST_DOCUMENTS'] === '1';
// The rental project needs a build with /alquiler/, which a normal build leaves out.
const rental = process.env['TEST_RENTAL'] === '1';
// Matched on the file name alone, so a folder named after a section never opts every spec in.
const rentalSpecs = /[\\/]rental[^\\/]*\.spec\.ts$/;
// The employment project needs a build with /contrato/, which a normal build leaves out.
const employment = process.env['TEST_EMPLOYMENT'] === '1';
const employmentSpecs = /[\\/]employment[^\\/]*\.spec\.ts$/;
const optInSpecs = [/(rtl|analytics|documents)\.spec\.ts/, rentalSpecs, employmentSpecs];
const port = Number(process.env['E2E_PORT'] ?? 4321);

// The documents project reads documents on /alquiler/ too, so its build has that page.
const buildEnv = {
  ...(rental || documents ? { PUBLIC_RENTAL: '1' } : {}),
  ...(employment ? { PUBLIC_EMPLOYMENT: '1' } : {}),
  ...(analytics ? { PUBLIC_POSTHOG_KEY: 'phc_test' } : {}),
  ...(documents
    ? {
        PUBLIC_API_EXTRACT_URL: 'https://extract.api.eslojusto.test/',
        PUBLIC_API_CHECKOUT_URL: 'https://checkout.api.eslojusto.test/',
        PUBLIC_API_PASS_URL: 'https://pass.api.eslojusto.test/',
        PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      }
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
    ...(rental
      ? [
          {
            name: 'rental',
            use: { ...devices['Desktop Chrome'] },
            testMatch: rentalSpecs,
            // Reading documents on /alquiler/ needs the documents project's build.
            testIgnore: /documents\.spec\.ts/,
          },
        ]
      : []),
    ...(employment
      ? [
          {
            name: 'employment',
            use: { ...devices['Desktop Chrome'] },
            testMatch: employmentSpecs,
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
