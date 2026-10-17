import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { PASSWORD, ROOT, STORAGE_DIR, TEST_DATABASE_URL } from './env';

/** The users the workflow signs in as, keyed by the short name the specs use. */
export const USERS = {
  crm: { roles: ['CRM'], sections: [] },
  hod: { roles: ['HOD'], sections: [] },
  sig: { roles: ['SIGNATORY'], sections: [] },
  reg: { roles: ['REG_REVIEWER'], sections: [] },
  appchem: { roles: ['SECTION_APPROVER'], sections: ['CHEM'] },
  appmech: { roles: ['SECTION_APPROVER'], sections: ['MECH'] },
  anchem: { roles: ['ANALYST'], sections: ['CHEM'] },
  anmech: { roles: ['ANALYST'], sections: ['MECH'] },
  stores: { roles: ['STORES'], sections: [] },
  acc: { roles: ['ACCOUNTS'], sections: [] },
} as const;

/**
 * Apply migrations to the test database, empty every table and seed the master data and users the
 * workflow needs. Mirrors apps/api/test/global-setup.ts.
 */
export default async function globalSetup() {
  if (TEST_DATABASE_URL === process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL — the e2e suite wipes its database');
  execSync('npx prisma migrate deploy', { cwd: path.join(ROOT, 'apps/api'), env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, stdio: 'pipe' });
  fs.rmSync(STORAGE_DIR, { recursive: true, force: true });

  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);

    const chem = await prisma.section.create({ data: { code: 'CHEM', name: 'Chemical' } });
    const mech = await prisma.section.create({ data: { code: 'MECH', name: 'Mechanical' } });
    const sectionIds: Record<string, string> = { CHEM: chem.id, MECH: mech.id };
    const lod = await prisma.formula.create({
      data: { code: 'LOD', name: 'Loss on drying', expression: '(W1 - W2) / (W1 - W0) * 100', variables: [{ key: 'W0', label: 'Empty' }, { key: 'W1', label: 'Before' }, { key: 'W2', label: 'After' }], resultUnit: '%' },
    });
    await prisma.testMaster.create({ data: { code: 'LOD', name: 'Loss on Drying', method: 'USP <731>', sectionId: chem.id, specification: 'NMT 0.5', unit: '%', rate: 800, nablAccredited: true, formulaId: lod.id } });
    await prisma.testMaster.create({ data: { code: 'HARD', name: 'Brinell Hardness', method: 'ASTM E10', sectionId: mech.id, specification: '120 – 180', unit: 'HBW', rate: 1200 } });
    await prisma.customer.create({
      data: {
        code: 'CUST-0001', name: 'Sunrise Pharma', city: 'Pune', state: 'Maharashtra', stateCode: '27', gstin: '27AABCS1234F1Z5', email: 'qa@sunrise.example',
        contacts: { create: [{ name: 'Rahul', email: 'rahul@sunrise.example', isPrimary: true }] },
      },
    });

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    for (const [key, u] of Object.entries(USERS)) {
      await prisma.user.create({
        data: {
          email: `${key}@e2e.local`,
          name: `E2E ${key}`,
          passwordHash,
          roles: { create: u.roles.map((role) => ({ role })) },
          sections: { create: u.sections.map((code) => ({ sectionId: sectionIds[code] })) },
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
