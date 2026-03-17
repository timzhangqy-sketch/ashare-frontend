import { defineConfig, devices } from '@playwright/test';

const loopbackNoProxy = '127.0.0.1,localhost';
const appendNoProxy = (value: string | undefined) => {
  if (!value) return loopbackNoProxy;
  const parts = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (!parts.includes('127.0.0.1')) parts.push('127.0.0.1');
  if (!parts.includes('localhost')) parts.push('localhost');
  return parts.join(',');
};

process.env.NO_PROXY = appendNoProxy(process.env.NO_PROXY);
process.env.no_proxy = appendNoProxy(process.env.no_proxy);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'cmd /c npm run preview:e2e:smoke',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
