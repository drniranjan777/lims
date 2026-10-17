import { Router } from 'express';
import { canTransition, ENQUIRY_TRANSITIONS, enquirySchema, enquiryStatusSchema, type EnquiryStatus } from '@lims/shared';
import { prisma } from '../lib/prisma';
import { body, ilike, listQuery, paged, param } from '../lib/http';
import { badRequest, notFound, rule } from '../lib/errors';
import { currentUser, requirePerm } from '../lib/auth';
import { audit, diff } from '../lib/audit';
import { nextNumber } from '../lib/numbering';
import { asDateOnly } from '../lib/dates';

export const enquiriesRouter = Router();

const include = {
  customer: { select: { id: true, code: true, name: true, gstin: true, stateCode: true } },
  tests: true,
  quotations: { select: { id: true, number: true, status: true, total: true, date: true } },
} as const;

async function withRefs<T extends { contactId: string | null; tests: { testId: string }[]; createdById: string }>(e: T) {
  const [contact, tests, createdBy] = await Promise.all([
    e.contactId ? prisma.contact.findUnique({ where: { id: e.contactId } }) : null,
    prisma.testMaster.findMany({ where: { id: { in: e.tests.map((t) => t.testId) } }, include: { section: { select: { name: true } } } }),
    prisma.user.findUnique({ where: { id: e.createdById }, select: { name: true } }),
  ]);
  return { ...e, contact, testDetails: tests, createdByName: createdBy?.name };
}

async function assertContact(customerId: string, contactId?: string | null) {
  if (!contactId) return;
  const c = await prisma.contact.findFirst({ where: { id: contactId, customerId } });
  if (!c) throw badRequest('Contact does not belong to the selected customer');
}

enquiriesRouter.get('/', async (req, res) => {
  const q = listQuery(req);
  const where = {
    ...(q.status ? { status: q.status as EnquiryStatus } : {}),
    ...(q.q ? { OR: [{ number: ilike(q.q) }, { customer: { name: ilike(q.q) } }, { queryReference: ilike(q.q) }, { projectReference: ilike(q.q) }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enquiry.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take }),
    prisma.enquiry.count({ where }),
  ]);
  res.json(paged(items, total, q));
});

enquiriesRouter.get('/:id', async (req, res) => {
  const e = await prisma.enquiry.findUnique({ where: { id: param(req, 'id') }, include });
  if (!e) throw notFound('Enquiry');
  res.json(await withRefs(e));
});

enquiriesRouter.post('/', requirePerm('enq.create'), async (req, res) => {
  const me = currentUser(req);
  const d = body(req, enquirySchema);
  await assertContact(d.customerId, d.contactId);
  const e = await prisma.$transaction(async (tx) => {
    const created = await tx.enquiry.create({
      data: {
        number: await nextNumber(tx, 'ENQUIRY', d.date),
        date: asDateOnly(d.date),
        source: d.source,
        customerId: d.customerId,
        contactId: d.contactId,
        queryReference: d.queryReference,
        projectReference: d.projectReference,
        receiptDetails: d.receiptDetails,
        courierDetails: d.courierDetails,
        description: d.description,
        createdById: me.id,
        tests: { create: [...new Set(d.testIds)].map((testId) => ({ testId })) },
      },
      include,
    });
    await audit(tx, me, { action: 'CREATE', entityType: 'Enquiry', entityId: created.id, after: d }, req);
    return created;
  });
  res.status(201).json(e);
});

enquiriesRouter.put('/:id', requirePerm('enq.create'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, enquirySchema);
  const existing = await prisma.enquiry.findUnique({ where: { id }, include: { tests: true } });
  if (!existing) throw notFound('Enquiry');
  if (existing.status === 'CLOSED') throw rule('A closed enquiry cannot be edited');
  await assertContact(d.customerId, d.contactId);
  const e = await prisma.$transaction(async (tx) => {
    await tx.enquiryTest.deleteMany({ where: { enquiryId: id } });
    const data = {
      date: asDateOnly(d.date),
      source: d.source,
      customerId: d.customerId,
      contactId: d.contactId ?? null,
      queryReference: d.queryReference,
      projectReference: d.projectReference,
      receiptDetails: d.receiptDetails,
      courierDetails: d.courierDetails,
      description: d.description,
    };
    const updated = await tx.enquiry.update({
      where: { id },
      data: { ...data, tests: { create: [...new Set(d.testIds)].map((testId) => ({ testId })) } },
      include,
    });
    const ch = diff(existing as unknown as Record<string, unknown>, data);
    await audit(tx, me, { action: 'UPDATE', entityType: 'Enquiry', entityId: id, before: { ...ch.before, testIds: existing.tests.map((t) => t.testId) }, after: { ...ch.after, testIds: d.testIds } }, req);
    return updated;
  });
  res.json(e);
});

enquiriesRouter.post('/:id/status', requirePerm('enq.create'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, enquiryStatusSchema);
  const existing = await prisma.enquiry.findUnique({ where: { id } });
  if (!existing) throw notFound('Enquiry');
  if (!canTransition(ENQUIRY_TRANSITIONS, existing.status, d.status)) {
    throw rule(`Enquiry cannot move from ${existing.status} to ${d.status}`);
  }
  const e = await prisma.$transaction(async (tx) => {
    const updated = await tx.enquiry.update({ where: { id }, data: { status: d.status }, include });
    await audit(tx, me, { action: 'STATUS', entityType: 'Enquiry', entityId: id, before: { status: existing.status }, after: { status: d.status }, reason: d.remarks }, req);
    return updated;
  });
  res.json(e);
});
