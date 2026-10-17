import { Router } from 'express';
import { disposalSchema, retentionSchema, type RetentionStatus } from '@lims/shared';
import { prisma, type Prisma } from '../lib/prisma';
import { body, ilike, listQuery, paged, param } from '../lib/http';
import { badRequest, conflict, notFound, rule } from '../lib/errors';
import { currentUser, requirePerm } from '../lib/auth';
import { audit } from '../lib/audit';
import { addMonths, asDateOnly, todayDate } from '../lib/dates';
import { getLabSettings } from '../lib/settings';
import { notifyRoles } from '../lib/notify';

/** §4.12 Remnant Sample Retention & Disposal */
export const storesRouter = Router();

const include = { registration: { select: { id: true, number: true, sampleName: true, template: true, customer: { select: { name: true } } } } } as const;

storesRouter.get('/retained', requirePerm('stores.manage'), async (req, res) => {
  const q = listQuery(req);
  const where: Prisma.RetainedSampleWhereInput = {
    ...(q.status ? { status: { in: q.status.split(',') as RetentionStatus[] } } : {}),
    ...(q.q ? { OR: [{ registration: { number: ilike(q.q) } }, { registration: { sampleName: ilike(q.q) } }, { storageLocation: ilike(q.q) }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.retainedSample.findMany({ where, include, orderBy: [{ status: 'asc' }, { plannedDisposalDate: 'asc' }], skip: q.skip, take: q.take }),
    prisma.retainedSample.count({ where }),
  ]);
  res.json(paged(items, total, q));
});

/** Tested samples not yet received into stores, with the default retention period for their template. */
storesRouter.get('/eligible', requirePerm('stores.manage'), async (_req, res) => {
  const lab = await getLabSettings();
  const regs = await prisma.registration.findMany({
    where: { retained: null, status: { in: ['TESTING_COMPLETE', 'REPORTED', 'IN_TESTING'] } },
    select: { id: true, number: true, sampleName: true, template: true, quantity: true, status: true, customer: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
    take: 300,
  });
  res.json(regs.map((r) => ({ ...r, defaultRetentionMonths: lab.retentionMonthsByTemplate[r.template] ?? lab.defaultRetentionMonths })));
});

storesRouter.post('/retained', requirePerm('stores.manage'), async (req, res) => {
  const me = currentUser(req);
  const d = body(req, retentionSchema);
  const reg = await prisma.registration.findUnique({ where: { id: d.registrationId }, include: { retained: true } });
  if (!reg) throw notFound('Registration');
  if (reg.retained) throw conflict('Remnant sample is already recorded in stores');
  if (['PRE_REGISTERED', 'CANCELLED'].includes(reg.status)) throw rule('Only registered samples can be received into stores');
  const received = asDateOnly(d.receivedInStoreAt);
  const planned = addMonths(received, d.retentionMonths);
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.retainedSample.create({
      data: {
        registrationId: reg.id,
        receivedInStoreAt: d.receivedInStoreAt,
        receivedById: me.id,
        receivedByName: me.name,
        storageLocation: d.storageLocation,
        quantity: d.quantity,
        retentionMonths: d.retentionMonths,
        plannedDisposalDate: planned,
        status: planned <= todayDate() ? 'DUE_FOR_DISPOSAL' : d.retentionMonths > 0 ? 'RETENTION_ACTIVE' : 'IN_STORE',
        remarks: d.remarks,
      },
      include,
    });
    await audit(tx, me, { action: 'RETAINED', entityType: 'RetainedSample', entityId: created.id, after: { ...d, plannedDisposalDate: planned } }, req);
    return created;
  });
  res.status(201).json(row);
});

storesRouter.post('/retained/:id/dispose', requirePerm('stores.manage'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, disposalSchema);
  const row = await prisma.retainedSample.findUnique({ where: { id } });
  if (!row) throw notFound('Retained sample');
  if (row.status === 'DISPOSED') throw rule('Sample is already disposed');
  const disposedAt = asDateOnly(d.disposedAt);
  if (disposedAt < asDateOnly(row.receivedInStoreAt)) throw badRequest('Disposal date cannot be before the store receipt date', { fields: { disposedAt: 'Too early' } });
  const early = disposedAt < row.plannedDisposalDate;
  if (early && !d.remarks) throw badRequest('Disposal before the end of the retention period needs a remark (e.g. customer instruction)', { fields: { remarks: 'Required for early disposal' } });
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.retainedSample.update({
      where: { id },
      data: { status: 'DISPOSED', disposedAt, disposalMethod: d.disposalMethod, disposedById: me.id, disposedByName: me.name, remarks: d.remarks ?? row.remarks },
      include,
    });
    await audit(tx, me, { action: early ? 'DISPOSED_EARLY' : 'DISPOSED', entityType: 'RetainedSample', entityId: id, before: { status: row.status }, after: { status: 'DISPOSED', ...d }, reason: d.remarks }, req);
    return u;
  });
  res.json(updated);
});

/** Move samples whose retention period has ended to "Due for disposal" and alert stores. Run by the job scheduler. */
export async function markDueForDisposal() {
  const due = await prisma.retainedSample.findMany({
    where: { status: { in: ['IN_STORE', 'RETENTION_ACTIVE'] }, plannedDisposalDate: { lte: todayDate() } },
    select: { id: true },
  });
  if (!due.length) return 0;
  await prisma.$transaction(async (tx) => {
    await tx.retainedSample.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { status: 'DUE_FOR_DISPOSAL' } });
    await notifyRoles(tx, ['STORES'], { type: 'DISPOSAL_DUE', title: `${due.length} remnant sample(s) due for disposal`, link: '/stores?status=DUE_FOR_DISPOSAL' });
  });
  return due.length;
}
