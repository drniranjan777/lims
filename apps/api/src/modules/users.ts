import { Router } from 'express';
import { userCreateSchema, userUpdateSchema, type Role } from '@lims/shared';
import { prisma } from '../lib/prisma';
import { body, ilike, listQuery, paged, param } from '../lib/http';
import { conflict, notFound, rule } from '../lib/errors';
import { currentUser, hashPassword, requirePerm } from '../lib/auth';
import { audit } from '../lib/audit';

export const usersRouter = Router();

const userSelect = {
  id: true,
  name: true,
  email: true,
  designation: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: true } },
  sections: { select: { section: { select: { id: true, code: true, name: true } } } },
} as const;

type UserRow = {
  roles: { role: Role }[];
  sections: { section: { id: string; code: string; name: string } }[];
} & Record<string, unknown>;

const shape = (u: UserRow) => ({ ...u, roles: u.roles.map((r) => r.role), sections: u.sections.map((s) => s.section) });

usersRouter.get('/', requirePerm('users.manage'), async (req, res) => {
  const q = listQuery(req);
  const where = q.q ? { OR: [{ name: ilike(q.q) }, { email: ilike(q.q) }] } : {};
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, select: userSelect, orderBy: { name: 'asc' }, skip: q.skip, take: q.take }),
    prisma.user.count({ where }),
  ]);
  res.json(paged(items.map(shape), total, q));
});

/** Analysts of a section — used by Section Approvers when allocating work (§4.5). */
usersRouter.get('/analysts', requirePerm('sec.assign', 'users.manage'), async (req, res) => {
  const sectionId = typeof req.query.sectionId === 'string' ? req.query.sectionId : undefined;
  const users = await prisma.user.findMany({
    where: {
      active: true,
      roles: { some: { role: 'ANALYST' } },
      ...(sectionId ? { sections: { some: { sectionId } } } : {}),
    },
    select: { id: true, name: true, designation: true, _count: { select: { assignedTests: { where: { status: { in: ['ASSIGNED', 'IN_TESTING', 'CORRECTION_REQUIRED'] } } } } } },
    orderBy: { name: 'asc' },
  });
  res.json(users.map((u) => ({ id: u.id, name: u.name, designation: u.designation, openTests: u._count.assignedTests })));
});

usersRouter.post('/', requirePerm('users.manage'), async (req, res) => {
  const me = currentUser(req);
  const d = body(req, userCreateSchema);
  if (await prisma.user.findUnique({ where: { email: d.email } })) throw conflict('A user with this e-mail already exists');
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: d.name,
        email: d.email,
        designation: d.designation,
        active: d.active,
        passwordHash: await hashPassword(d.password),
        roles: { create: d.roles.map((role) => ({ role })) },
        sections: { create: d.sectionIds.map((sectionId) => ({ sectionId })) },
      },
      select: userSelect,
    });
    await audit(tx, me, { action: 'USER_CREATED', entityType: 'User', entityId: u.id, after: { ...shape(u as UserRow) } }, req);
    return u;
  });
  res.status(201).json(shape(user as UserRow));
});

usersRouter.patch('/:id', requirePerm('users.manage'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, userUpdateSchema);
  const existing = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!existing) throw notFound('User');
  if (id === me.id && (d.active === false || (d.roles && !d.roles.includes('ADMIN') && me.roles.includes('ADMIN')))) {
    throw rule('You cannot deactivate yourself or remove your own administrator role');
  }
  if (d.email && d.email !== existing.email && (await prisma.user.findUnique({ where: { email: d.email } }))) {
    throw conflict('A user with this e-mail already exists');
  }
  const user = await prisma.$transaction(async (tx) => {
    if (d.roles) {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: d.roles.map((role) => ({ userId: id, role })) });
    }
    if (d.sectionIds) {
      await tx.userSection.deleteMany({ where: { userId: id } });
      await tx.userSection.createMany({ data: d.sectionIds.map((sectionId) => ({ userId: id, sectionId })) });
    }
    const u = await tx.user.update({
      where: { id },
      data: {
        name: d.name,
        email: d.email,
        designation: d.designation,
        active: d.active,
        ...(d.password ? { passwordHash: await hashPassword(d.password), passwordChangedAt: new Date() } : {}),
      },
      select: userSelect,
    });
    await audit(
      tx,
      me,
      {
        action: d.password ? 'USER_UPDATED_PASSWORD_RESET' : 'USER_UPDATED',
        entityType: 'User',
        entityId: id,
        before: shape(existing as UserRow),
        after: shape(u as UserRow),
      },
      req,
    );
    return u;
  });
  res.json(shape(user as UserRow));
});
