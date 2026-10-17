/**
 * Create (or reset the password of) a local user — for development / UAT access.
 *   npx tsx --env-file=../../.env scripts/ensure-user.ts <email> <ROLE[,ROLE]> [SECTIONCODE,...]
 * The password is read from the E2E_PASSWORD environment variable, never from the command line.
 */
import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const [email, rolesArg, sectionsArg] = process.argv.slice(2);
const password = process.env.E2E_PASSWORD ?? '';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production');
  if (!email || !rolesArg) throw new Error('usage: ensure-user.ts <email> <ROLE[,ROLE]> [SECTION,...]');
  if (password.length < 10) throw new Error('Set E2E_PASSWORD (>= 10 chars) in .env');
  const roles = rolesArg.split(',') as Role[];
  const sections = sectionsArg ? await prisma.section.findMany({ where: { code: { in: sectionsArg.split(',') } } }) : [];
  const hash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: hash, passwordChangedAt: new Date(), active: true, failedLogins: 0, lockedUntil: null } });
    console.log(`Password reset for ${email}`);
  } else {
    await prisma.user.create({
      data: { email, name: email.split('@')[0], passwordHash: hash, roles: { create: roles.map((role) => ({ role })) }, sections: { create: sections.map((s) => ({ sectionId: s.id })) } },
    });
    console.log(`Created ${email} (${roles.join(', ')})`);
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
