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
// The ERTE project needs a build with /paro/erte/, which a normal build leaves out.
const erte = process.env['TEST_ERTE'] === '1';
const erteSpecs = /[\\/]erte[^\\/]*\.spec\.ts$/;
// The household project needs a build with /empleada-de-hogar/, which a normal build leaves out.
const household = process.env['TEST_HOUSEHOLD'] === '1';
const householdSpecs = /[\\/]household[^\\/]*\.spec\.ts$/;
// The insurance project needs a build with /seguros/, which a normal build leaves out.
const insurance = process.env['TEST_INSURANCE'] === '1';
const insuranceSpecs = /[\\/]insurance[^\\/]*\.spec\.ts$/;
// The credit project needs a build with /financiacion/, which a normal build leaves out.
const credit = process.env['TEST_CREDIT'] === '1';
const creditSpecs = /[\\/]credit[^\\/]*\.spec\.ts$/;
// The mortgage project needs a build with /hipoteca/, which a normal build leaves out.
const mortgage = process.env['TEST_MORTGAGE'] === '1';
const mortgageSpecs = /[\\/]mortgage[^\\/]*\.spec\.ts$/;
const optInSpecs = [
  /(rtl|analytics|documents)\.spec\.ts/,
  rentalSpecs,
  employmentSpecs,
  erteSpecs,
  householdSpecs,
  insuranceSpecs,
  creditSpecs,
  mortgageSpecs,
];
const port = Number(process.env['E2E_PORT'] ?? 4321);

// The documents project reads documents on /alquiler/, /contrato/, /financiacion/, /seguros/ and
// /hipoteca/ too, and offers the letters on /financiacion/ and /seguros/, so its build has them;
// the analytics project measures the first two too.
const buildEnv = {
  ...(rental || documents || analytics ? { PUBLIC_RENTAL: '1' } : {}),
  ...(employment || documents || analytics ? { PUBLIC_EMPLOYMENT: '1' } : {}),
  ...(erte ? { PUBLIC_ERTE: '1' } : {}),
  // The household, insurance and credit projects also measure their own events, so their builds
  // have a test analytics key.
  ...(household ? { PUBLIC_HOUSEHOLD: '1' } : {}),
  ...(insurance || documents ? { PUBLIC_INSURANCE: '1' } : {}),
  ...(credit || documents ? { PUBLIC_CREDIT: '1' } : {}),
  ...(mortgage || documents ? { PUBLIC_MORTGAGE: '1' } : {}),
  ...(analytics || household || insurance || credit ? { PUBLIC_POSTHOG_KEY: 'phc_test' } : {}),
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
            // Reading documents on /contrato/ needs the documents project's build.
            testIgnore: /documents\.spec\.ts/,
          },
        ]
      : []),
    ...(erte
      ? [{ name: 'erte', use: { ...devices['Desktop Chrome'] }, testMatch: erteSpecs }]
      : []),
    ...(household
      ? [
          {
            name: 'household',
            use: { ...devices['Desktop Chrome'] },
            testMatch: householdSpecs,
          },
        ]
      : []),
    ...(insurance
      ? [
          {
            name: 'insurance',
            use: { ...devices['Desktop Chrome'] },
            testMatch: insuranceSpecs,
            // Reading documents on /seguros/ needs the documents project's build.
            testIgnore: /documents\.spec\.ts/,
          },
        ]
      : []),
    ...(credit
      ? [
          {
            name: 'credit',
            use: { ...devices['Desktop Chrome'] },
            testMatch: creditSpecs,
            // Reading documents on /financiacion/ needs the documents project's build.
            testIgnore: /documents\.spec\.ts/,
          },
        ]
      : []),
    ...(mortgage
      ? [
          {
            name: 'mortgage',
            use: { ...devices['Desktop Chrome'] },
            testMatch: mortgageSpecs,
            // Reading documents on /hipoteca/ needs the documents project's build.
            testIgnore: /documents\.spec\.ts/,
          },
        ]
      : []),
    ...(documents
      ? [
          {
            name: 'documents',
            use: { ...devices['Desktop Chrome'] },
            testMatch: /documents\.spec\.ts/,
            // Reading prepares every page in the browser first, slower than the default wait on CI.
            expect: { timeout: 15_000 },
          },
        ]
      : []),
  ],
});
