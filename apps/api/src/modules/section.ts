import { Router } from 'express';
import { z } from 'zod';
import { assignTestsSchema, type SectionWorkStatus } from '@lims/shared';
import { prisma, type Prisma } from '../lib/prisma';
import { body, parse } from '../lib/http';
import { badRequest, notFound, rule } from '../lib/errors';
import { assertSectionAccess, currentUser, labScope, requirePerm } from '../lib/auth';
import { audit } from '../lib/audit';
import { notifyUsers } from '../lib/notify';

/** §4.5 Section Allocation — Section Approver queue, sample receipt into section, analyst assignment. */
export const sectionRouter = Router();

sectionRouter.get('/queue', requirePerm('sec.assign', 'test.review'), async (req, res) => {
  const me = currentUser(req);
  const scope = labScope(me);
  const sectionId = typeof req.query.sectionId === 'string' && req.query.sectionId ? req.query.sectionId : undefined;
  if (sectionId) assertSectionAccess(me, sectionId);
  const status = typeof req.query.status === 'string' && req.query.status ? (req.query.status.split(',') as SectionWorkStatus[]) : (['PENDING', 'RECEIVED', 'IN_PROGRESS'] as SectionWorkStatus[]);
  const where: Prisma.RegistrationSectionWhereInput = {
    status: { in: status },
    registration: { status: { notIn: ['CANCELLED', 'PRE_REGISTERED'] } },
    ...(sectionId ? { sectionId } : scope ? { sectionId: { in: scope } } : {}),
  };
  const rows = await prisma.registrationSection.findMany({
    where,
    include: {
      registration: {
        select: {
          id: true,
          number: true,
          sampleName: true,
          template: true,
          approvedAt: true,
          customer: { select: { name: true } },
          tests: { orderBy: { sortOrder: 'asc' }, include: { analyst: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: { registration: { approvedAt: 'asc' } },
    take: 200,
  });
  const sections = await prisma.section.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.sectionId))] } }, select: { id: true, name: true, code: true } });
  res.json(
    rows.map((r) => ({
      ...r,
      section: sections.find((s) => s.id === r.sectionId),
      registration: { ...r.registration, tests: r.registration.tests.filter((t) => t.sectionId === r.sectionId) },
    })),
  );
});

const receiveSchema = z.object({ registrationId: z.string().min(1), sectionId: z.string().min(1) });

sectionRouter.post('/receive', requirePerm('sec.assign'), async (req, res) => {
  const me = currentUser(req);
  const d = parse(receiveSchema, req.body);
  assertSectionAccess(me, d.sectionId);
  const key = { registrationId_sectionId: { registrationId: d.registrationId, sectionId: d.sectionId } };
  const row = await prisma.registrationSection.findUnique({ where: key });
  if (!row) throw notFound('Section work item');
  if (row.status !== 'PENDING') throw rule('Sample already received in this section');
  await prisma.$transaction(async (tx) => {
    await tx.registrationSection.update({ where: key, data: { status: 'RECEIVED', receivedById: me.id, receivedAt: new Date() } });
    await audit(tx, me, { action: 'SECTION_RECEIVED', entityType: 'Registration', entityId: d.registrationId, after: { sectionId: d.sectionId } }, req);
  });
  res.json({ ok: true });
});

/** Allocate one or more tests to an analyst of the section. Re-assignment is allowed until testing starts. */
sectionRouter.post('/assign', requirePerm('sec.assign'), async (req, res) => {
  const me = currentUser(req);
  const d = body(req, assignTestsSchema);
  const tests = await prisma.registrationTest.findMany({ where: { id: { in: d.testIds } }, include: { registration: { select: { id: true, number: true, sampleName: true, status: true } } } });
  if (tests.length !== d.testIds.length) throw notFound('One or more tests');
  const sectionIds = [...new Set(tests.map((t) => t.sectionId))];
  if (sectionIds.length !== 1) throw badRequest('Assign tests of one section at a time');
  const sectionId = sectionIds[0];
  assertSectionAccess(me, sectionId);
  for (const t of tests) {
    if (!['REGISTERED', 'IN_TESTING', 'TESTING_COMPLETE'].includes(t.registration.status)) throw rule(`${t.registration.number} is not registered for testing`);
    if (!['UNASSIGNED', 'ASSIGNED'].includes(t.status)) throw rule(`"${t.testName}" has already started — it cannot be re-assigned`);
  }
  const analyst = await prisma.user.findFirst({
    where: { id: d.analystId, active: true, roles: { some: { role: 'ANALYST' } }, sections: { some: { sectionId } } },
  });
  if (!analyst) throw badRequest('Select an active analyst assigned to this section');

  await prisma.$transaction(async (tx) => {
    await tx.registrationTest.updateMany({ where: { id: { in: d.testIds } }, data: { analystId: analyst.id, assignedById: me.id, assignedAt: new Date(), status: 'ASSIGNED' } });
    for (const regId of [...new Set(tests.map((t) => t.registrationId))]) {
      const key = { registrationId_sectionId: { registrationId: regId, sectionId } };
      const sec = await tx.registrationSection.findUnique({ where: key });
      if (sec && sec.status !== 'IN_PROGRESS') {
        await tx.registrationSection.update({ where: key, data: { status: 'IN_PROGRESS', receivedById: sec.receivedById ?? me.id, receivedAt: sec.receivedAt ?? new Date() } });
      }
      await tx.registration.updateMany({ where: { id: regId, status: 'REGISTERED' }, data: { status: 'IN_TESTING' } });
    }
    await audit(tx, me, { action: 'TESTS_ASSIGNED', entityType: 'RegistrationTest', entityId: d.testIds.join(','), before: tests.map((t) => ({ id: t.id, analystId: t.analystId })), after: { analystId: analyst.id } }, req);
    await notifyUsers(tx, [analyst.id], {
      type: 'TEST_ASSIGNED',
      title: `${tests.length} test(s) assigned to you`,
      body: [...new Set(tests.map((t) => `${t.registration.number} · ${t.testName}`))].join('\n'),
      link: '/analyst',
    });
  });
  res.json({ ok: true });
});
