import fs from 'node:fs';
import path from 'node:path';

/**
 * Environment shared by the Playwright config, global setup and specs. The suite runs its own API
 * and web servers on separate ports against TEST_DATABASE_URL, so it never touches the dev database
 * or a dev server that may already be running on 3000/4000.
 */
export const ROOT = path.resolve(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
export const API_PORT = Number(process.env.E2E_API_PORT ?? 4100);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
export const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;
export const STORAGE_DIR = path.join(ROOT, 'apps/api/test-storage-e2e');

/** Password of every user the setup creates (test-only accounts in the wiped test database). */
export const PASSWORD = 'E2e-Test-Password-123';
