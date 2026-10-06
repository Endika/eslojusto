import { defineConfig, devices } from '@playwright/test';

// The RTL project needs a PRUEBA_RTL=1 build, so it only exists when that build is asked for.
const rtl = process.env['PRUEBA_RTL'] === '1';
// The measurement project needs a build with an analytics key; every other build has none.
const medicion = process.env['PRUEBA_MEDICION'] === '1';
const soloPorDefecto = /(rtl|medicion)\.spec\.ts/;

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4321/' },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4321/',
    reuseExistingServer: !process.env['CI'],
    ...(medicion ? { env: { PUBLIC_POSTHOG_KEY: 'phc_test' } } : {}),
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] }, testIgnore: soloPorDefecto },
    { name: 'movil', use: { ...devices['Pixel 7'] }, testIgnore: soloPorDefecto },
    ...(rtl
      ? [{ name: 'rtl', use: { ...devices['Desktop Chrome'] }, testMatch: /rtl\.spec\.ts/ }]
      : []),
    ...(medicion
      ? [
          {
            name: 'medicion',
            use: { ...devices['Desktop Chrome'] },
            testMatch: /medicion\.spec\.ts/,
          },
        ]
      : []),
  ],
});
