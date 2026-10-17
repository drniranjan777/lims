import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { Role } from '@lims/shared';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

export const app = createApp();
export const PASSWORD = 'Test-Password-123';

let hash: string | null = null;

export async function makeUser(email: string, roles: Role[], sectionIds: string[] = [], name = email.split('@')[0]) {
  hash ??= await bcrypt.hash(PASSWORD, 4);
  return prisma.user.create({
    data: { email, name, passwordHash: hash, roles: { create: roles.map((role) => ({ role })) }, sections: { create: sectionIds.map((sectionId) => ({ sectionId })) } },
  });
}

/** A supertest agent signed in as the given user (keeps the session cookie). */
export async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export { prisma, request };
