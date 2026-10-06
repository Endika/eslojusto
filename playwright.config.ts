import { defineConfig, devices } from '@playwright/test';

// The RTL project needs a TEST_RTL=1 build, so it only exists when that build is asked for.
const rtl = process.env['TEST_RTL'] === '1';
// The analytics project needs a build with an analytics key; every other build has none.
const analytics = process.env['TEST_ANALYTICS'] === '1';
const optInSpecs = /(rtl|analytics)\.spec\.ts/;

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4321/' },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4321/',
    reuseExistingServer: !process.env['CI'],
    ...(analytics ? { env: { PUBLIC_POSTHOG_KEY: 'phc_test' } } : {}),
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
  ],
});
