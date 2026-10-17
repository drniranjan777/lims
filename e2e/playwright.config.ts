import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { API_PORT, API_URL, ROOT, STORAGE_DIR, TEST_DATABASE_URL, WEB_ORIGIN, WEB_PORT } from './env';

if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must be set for the e2e suite (it wipes that database)');

const CI = Boolean(process.env.CI);

// The e2e web server builds into .next-e2e; Next adds that folder's types to the tsconfig it uses, so give
// it its own (gitignored) tsconfig instead of letting it rewrite apps/web/tsconfig.json.
const E2E_TSCONFIG = 'tsconfig.e2e.json';
fs.writeFileSync(
  path.join(ROOT, 'apps/web', E2E_TSCONFIG),
  JSON.stringify({ extends: './tsconfig.json', include: ['next-env.d.ts', 'src/**/*.ts', 'src/**/*.tsx', '.next-e2e/types/**/*.ts'] }, null, 2) + '\n',
);

export default defineConfig({
  testDir: '.',
  // One end-to-end workflow that walks a single sample through every stage — run it serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: 0,
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: path.join(ROOT, 'playwright-report') }]] : 'list',
  outputDir: path.join(ROOT, 'test-results'),
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: WEB_ORIGIN,
    navigationTimeout: 90_000,
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      name: 'api',
      command: 'npx tsx src/index.ts',
      cwd: path.join(ROOT, 'apps/api'),
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: TEST_DATABASE_URL,
        API_PORT: String(API_PORT),
        WEB_ORIGIN,
        STORAGE_DIR,
        SMTP_HOST: '',
        JWT_SECRET: process.env.JWT_SECRET || 'e2e-secret-e2e-secret-e2e-secret-0123456789',
      },
    },
    {
      name: 'web',
      // A separate build directory keeps this server from clashing with a dev server on port 3000.
      command: `npx next dev -p ${WEB_PORT}`,
      cwd: path.join(ROOT, 'apps/web'),
      url: `${WEB_ORIGIN}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_INTERNAL_URL: API_URL, NEXT_DIST_DIR: '.next-e2e', NEXT_TSCONFIG: E2E_TSCONFIG, NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],
});
