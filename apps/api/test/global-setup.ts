import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Apply migrations to the test database and empty every table before the suite runs. */
export default async function setup() {
  const envFile = path.resolve(import.meta.dirname, '../../../.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL must be set');
  if (url === process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL — the test-suite wipes its database');
  const cwd = path.resolve(import.meta.dirname, '..');
  execSync('npx prisma migrate deploy', { cwd, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await prisma.$disconnect();
  fs.rmSync(path.resolve(import.meta.dirname, '../test-storage'), { recursive: true, force: true });
}
