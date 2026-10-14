import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

config({ path: '.env', quiet: true });
if (!process.env.SEED_PASSWORD) throw new Error('Explicit SEED_PASSWORD is required for browser tests');
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure', ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } } : {}) },
  webServer: [
    { command: 'pnpm --filter @pos/api start', url: 'http://localhost:4000/v1/health/ready', reuseExistingServer: !process.env.CI, timeout: 60000 },
    { command: 'pnpm --filter @pos/pos preview --host 127.0.0.1', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 60000 },
    { command: 'pnpm --filter @pos/admin start', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI, timeout: 60000 },
  ],
});
