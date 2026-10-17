import path from 'node:path';
import fs from 'node:fs';

// Load the repo .env, then point the app at the dedicated test database and storage folder.
const envFile = path.resolve(import.meta.dirname, '../../../.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must be set for the API test-suite');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.STORAGE_DIR = path.resolve(import.meta.dirname, '../test-storage');
process.env.SMTP_HOST = '';
process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret-123';
