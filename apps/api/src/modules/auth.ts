import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { changePasswordSchema, loginSchema, ROLE_LABELS } from '@lims/shared';
import { prisma } from '../lib/prisma';
import { body } from '../lib/http';
import { badPassword, unauthorized } from '../lib/errors';
import {
  authenticate,
  clearSessionCookie,
  currentUser,
  hashPassword,
  issueToken,
  setSessionCookie,
  verifyPassword,
} from '../lib/auth';
import { audit } from '../lib/audit';
import { config } from '../config';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many sign-in attempts. Try again in a few minutes.' } },
});

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = body(req, loginSchema);
  const user = await prisma.user.findUnique({ where: { email } });
  const generic = unauthorized('Incorrect e-mail or password');
  if (!user || !user.active) throw generic;
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw unauthorized(`Account locked after repeated failed sign-ins. Try again after ${user.lockedUntil.toLocaleTimeString('en-IN')}.`);
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed >= LOCK_AFTER ? 0 : failed,
        lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60000) : undefined,
      },
    });
    await audit(prisma, null, { action: 'LOGIN_FAILED', entityType: 'User', entityId: user.id }, req);
    throw generic;
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  setSessionCookie(res, issueToken(user.id, user.passwordChangedAt));
  await audit(prisma, { id: user.id, name: user.name } as never, { action: 'LOGIN', entityType: 'User', entityId: user.id }, req);
  res.json({ ok: true });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', authenticate, async (req, res) => {
  const u = currentUser(req);
  const sections = await prisma.section.findMany({ where: { id: { in: u.sectionIds } }, select: { id: true, code: true, name: true } });
  res.json({ ...u, roleLabels: u.roles.map((r) => ROLE_LABELS[r]), sections });
});

authRouter.post('/change-password', authenticate, async (req, res) => {
  const u = currentUser(req);
  const { currentPassword, newPassword } = body(req, changePasswordSchema);
  const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  if (!(await verifyPassword(currentPassword, row.passwordHash))) throw badPassword('Current password is incorrect');
  const updated = await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
  });
  await audit(prisma, u, { action: 'PASSWORD_CHANGED', entityType: 'User', entityId: u.id }, req);
  setSessionCookie(res, issueToken(u.id, updated.passwordChangedAt));
  res.json({ ok: true });
});
