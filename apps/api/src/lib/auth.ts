import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { hasPermission, permissionsFor, type Permission, type Role } from '@lims/shared';
import { config } from '../config';
import { prisma, type Tx } from './prisma';
import { badPassword, forbidden, unauthorized } from './errors';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  designation: string | null;
  roles: Role[];
  permissions: Permission[];
  sectionIds: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload {
  sub: string;
  /** password-changed timestamp — changing the password invalidates existing sessions */
  pv: number;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function issueToken(userId: string, passwordChangedAt: Date): string {
  const payload: TokenPayload = { sub: userId, pv: passwordChangedAt.getTime() };
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: `${config.JWT_TTL_HOURS}h` });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: config.JWT_TTL_HOURS * 3600 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(config.cookieName, { path: '/' });
}

export async function loadAuthUser(userId: string): Promise<(AuthUser & { passwordChangedAt: Date; active: boolean }) | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: true, sections: true },
  });
  if (!u) return null;
  const roles = u.roles.map((r) => r.role as Role);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    designation: u.designation,
    roles,
    permissions: permissionsFor(roles),
    sectionIds: u.sections.map((s) => s.sectionId),
    passwordChangedAt: u.passwordChangedAt,
    active: u.active,
  };
}

/** Authenticate every request under /api/v1 except the public auth routes. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[config.cookieName] ?? bearer(req);
  if (!token) return next(unauthorized());
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET) as unknown as TokenPayload;
  } catch {
    return next(unauthorized('Your session has expired — please sign in again'));
  }
  const user = await loadAuthUser(payload.sub);
  if (!user || !user.active || user.passwordChangedAt.getTime() !== payload.pv) {
    return next(unauthorized('Your session is no longer valid — please sign in again'));
  }
  const { passwordChangedAt: _p, active: _a, ...authUser } = user;
  req.user = authUser;
  next();
}

function bearer(req: Request): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requirePerm(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u = req.user;
    if (!u) return next(unauthorized());
    if (!perms.some((p) => hasPermission(u.roles, p))) return next(forbidden());
    next();
  };
}

export const can = (u: AuthUser, p: Permission) => hasPermission(u.roles, p);
export const isAdmin = (u: AuthUser) => u.roles.includes('ADMIN');

/**
 * Laboratory section scope. Admin, Registration Reviewer and Authorized Signatory work across
 * all sections; Section Approvers and Analysts only see sections assigned to them.
 * Returns null when unrestricted, otherwise the permitted section ids.
 */
export function labScope(u: AuthUser): string[] | null {
  if (u.roles.some((r) => r === 'ADMIN' || r === 'REG_REVIEWER' || r === 'SIGNATORY')) return null;
  return u.sectionIds;
}

export function assertSectionAccess(u: AuthUser, sectionId: string) {
  const scope = labScope(u);
  if (scope && !scope.includes(sectionId)) throw forbidden('This sample/test belongs to a section you are not assigned to');
}

/**
 * Electronic signature: the signer re-enters their password; on success a Signature row is
 * recorded inside the caller's transaction.
 */
export async function verifySignaturePassword(u: AuthUser, password: string | undefined) {
  if (!password) throw badPassword('Re-enter your password to sign');
  const row = await prisma.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    throw badPassword('Signature failed — the password is incorrect');
  }
}

export async function recordSignature(tx: Tx, u: AuthUser, entityType: string, entityId: string, meaning: string) {
  return tx.signature.create({ data: { userId: u.id, entityType, entityId, meaning } });
}
