import { defineConfig, devices } from '@playwright/test';

const chromePath = process.env.FC_CHROME_PATH;
const launchOptions = chromePath ? { executablePath: chromePath } : {};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 20_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.FC_TEST_BASE_URL ?? 'http://127.0.0.1:8790',
    headless: true,
    screenshot: 'off',
    trace: 'off',
    launchOptions,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], launchOptions },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['iPhone 13'], browserName: 'chromium', launchOptions },
    },
  ],
});
