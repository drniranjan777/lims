import { Router } from 'express';
import { prisma, type Prisma } from '../lib/prisma';
import { ilike, listQuery, paged, param } from '../lib/http';
import { forbidden, notFound } from '../lib/errors';
import { can, currentUser, labScope, requirePerm } from '../lib/auth';
import { readFile } from '../lib/storage';
import { todayDate, addDays } from '../lib/dates';

// ---------------------------------------------------------------- dashboard (§6) — live counts only

export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const scope = labScope(me);
  const sectionWhere = scope ? { sectionId: { in: scope } } : {};
  const today = todayDate();
  const counts: Record<string, number> = {};
  const jobs: [string, Promise<number>][] = [];
  const add = (k: string, p: Promise<number>) => jobs.push([k, p]);

  if (can(me, 'enq.create')) {
    add('openEnquiries', prisma.enquiry.count({ where: { status: { in: ['NEW', 'IN_DISCUSSION'] } } }));
    add('receiptsToPreRegister', prisma.sampleReceipt.count({ where: { status: 'RECEIVED' } }));
  }
  if (can(me, 'quote.edit')) {
    add('draftQuotations', prisma.quotation.count({ where: { status: 'DRAFT' } }));
    add('quotationsSent', prisma.quotation.count({ where: { status: 'SENT' } }));
  }
  if (can(me, 'quote.review')) add('quotationsAwaitingHod', prisma.quotation.count({ where: { status: 'INTERNAL_REVIEW', hodReviewedById: null } }));
  if (can(me, 'quote.authorize')) add('quotationsAwaitingAuthorization', prisma.quotation.count({ where: { status: 'INTERNAL_REVIEW', hodReviewedById: { not: null }, authorizedById: null } }));
  if (can(me, 'po.record')) add('acceptedAwaitingSample', prisma.quotation.count({ where: { status: 'ACCEPTED', receipts: { none: {} } } }));
  if (can(me, 'reg.approve')) add('registrationsAwaitingApproval', prisma.registration.count({ where: { status: 'PRE_REGISTERED' } }));
  if (can(me, 'sec.assign')) {
    add('sectionPendingReceipt', prisma.registrationSection.count({ where: { status: 'PENDING', registration: { status: { notIn: ['CANCELLED', 'PRE_REGISTERED'] } }, ...sectionWhere } }));
    add('testsUnassigned', prisma.registrationTest.count({ where: { status: 'UNASSIGNED', registration: { status: { in: ['REGISTERED', 'IN_TESTING'] } }, ...sectionWhere } }));
  }
  if (can(me, 'test.enter')) {
    add('myOpenTests', prisma.registrationTest.count({ where: { analystId: me.id, status: { in: ['ASSIGNED', 'IN_TESTING'] } } }));
    add('myCorrections', prisma.registrationTest.count({ where: { analystId: me.id, status: 'CORRECTION_REQUIRED' } }));
  }
  if (can(me, 'test.review')) add('testsAwaitingReview', prisma.registrationTest.count({ where: { status: 'SUBMITTED', ...sectionWhere } }));
  if (can(me, 'report.release')) {
    add('reportsInDraft', prisma.report.count({ where: { status: { in: ['DRAFT', 'PREVIEW'] }, ...(scope ? { OR: [{ sectionId: { in: scope } }, { sectionId: null }] } : {}) } }));
    add('registrationsReadyToReport', prisma.registration.count({ where: { status: 'TESTING_COMPLETE', reports: { none: { status: { in: ['RELEASED', 'DISPATCHED'] } } } } }));
  }
  if (can(me, 'dispatch.record')) {
    add('reportsToDispatch', prisma.report.count({ where: { status: 'RELEASED' } }));
    add('invoicesToDispatch', prisma.invoice.count({ where: { status: 'ISSUED' } }));
    add('awaitingCustomerReceipt', prisma.dispatch.count({ where: { status: 'DISPATCHED' } }));
  }
  if (can(me, 'stores.manage')) {
    add('dueForDisposal', prisma.retainedSample.count({ where: { status: { not: 'DISPOSED' }, plannedDisposalDate: { lte: today } } }));
    add('disposalNext30Days', prisma.retainedSample.count({ where: { status: { not: 'DISPOSED' }, plannedDisposalDate: { gt: today, lte: addDays(today, 30) } } }));
    add('awaitingStoreReceipt', prisma.registration.count({ where: { retained: null, status: { in: ['TESTING_COMPLETE', 'REPORTED'] } } }));
  }
  if (can(me, 'invoice.edit')) {
    add('draftInvoices', prisma.invoice.count({ where: { status: 'DRAFT' } }));
    add('invoicesToIssue', prisma.invoice.count({ where: { status: 'APPROVED' } }));
  }
  if (can(me, 'invoice.authorize')) add('invoicesAwaitingAuthorization', prisma.invoice.count({ where: { status: 'DRAFT' } }));

  const results = await Promise.all(jobs.map(([, p]) => p));
  jobs.forEach(([k], i) => (counts[k] = results[i]));

  // Lab-wide workload by section and status (scoped).
  const workload = await prisma.registrationTest.groupBy({
    by: ['sectionId', 'status'],
    where: { status: { not: 'APPROVED' }, registration: { status: { notIn: ['CANCELLED', 'PRE_REGISTERED'] } }, ...sectionWhere },
    _count: { _all: true },
  });
  const sections = await prisma.section.findMany({ where: { active: true, ...(scope ? { id: { in: scope } } : {}) }, select: { id: true, name: true } });

  // Pipeline across the whole workflow (§2) — current records per stage.
  const pipeline = await Promise.all([
    prisma.enquiry.count({ where: { status: { in: ['NEW', 'IN_DISCUSSION'] } } }),
    prisma.quotation.count({ where: { status: { in: ['DRAFT', 'INTERNAL_REVIEW', 'SENT'] } } }),
    prisma.sampleReceipt.count({ where: { status: { in: ['RECEIVED', 'PRE_REGISTERED'] } } }),
    prisma.registration.count({ where: { status: { in: ['REGISTERED', 'IN_TESTING'] } } }),
    prisma.registration.count({ where: { status: 'TESTING_COMPLETE' } }),
    prisma.report.count({ where: { status: 'RELEASED' } }),
    prisma.invoice.count({ where: { status: { in: ['DRAFT', 'APPROVED', 'ISSUED'] } } }),
  ]);

  res.json({
    counts,
    workload: sections.map((s) => ({
      section: s,
      byStatus: Object.fromEntries(workload.filter((w) => w.sectionId === s.id).map((w) => [w.status, w._count._all])),
    })),
    pipeline: ['Enquiries', 'Quotations', 'Samples received', 'In testing', 'Ready to report', 'Reports to dispatch', 'Invoices open'].map((label, i) => ({ label, count: pipeline[i] })),
  });
});

// ---------------------------------------------------------------- notifications

export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const q = listQuery(req);
  const where: Prisma.NotificationWhereInput = { userId: me.id, ...(req.query.unread === 'true' ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: me.id, readAt: null } }),
  ]);
  res.json({ ...paged(items, total, q), unread });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const me = currentUser(req);
  await prisma.notification.updateMany({ where: { id: param(req, 'id'), userId: me.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

notificationsRouter.post('/read-all', async (req, res) => {
  const me = currentUser(req);
  await prisma.notification.updateMany({ where: { userId: me.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- audit trail & e-mail outbox

export const auditRouter = Router();

auditRouter.get('/', requirePerm('audit.view'), async (req, res) => {
  const q = listQuery(req);
  const where: Prisma.AuditLogWhereInput = {
    ...(typeof req.query.entityType === 'string' && req.query.entityType ? { entityType: req.query.entityType } : {}),
    ...(typeof req.query.entityId === 'string' && req.query.entityId ? { entityId: req.query.entityId } : {}),
    ...(q.q ? { OR: [{ action: ilike(q.q) }, { userName: ilike(q.q) }, { entityType: ilike(q.q) }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip: q.skip, take: q.take }),
    prisma.auditLog.count({ where }),
  ]);
  res.json(paged(items, total, q));
});

/** Audit history of one record — visible to anyone who can see the record's screen. */
auditRouter.get('/entity/:type/:id', async (req, res) => {
  const items = await prisma.auditLog.findMany({ where: { entityType: param(req, 'type'), entityId: param(req, 'id') }, orderBy: { at: 'asc' }, take: 500 });
  res.json(items.map(({ ip: _ip, ...rest }) => rest));
});

auditRouter.get('/email-outbox', requirePerm('users.manage'), async (req, res) => {
  const q = listQuery(req);
  const where = q.status ? { status: q.status as 'PENDING' | 'SENT' | 'FAILED' | 'NOT_CONFIGURED' } : {};
  const [items, total] = await Promise.all([
    prisma.emailOutbox.findMany({ where, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take }),
    prisma.emailOutbox.count({ where }),
  ]);
  res.json(paged(items, total, q));
});

// ---------------------------------------------------------------- attachments

export const attachmentsRouter = Router();

attachmentsRouter.get('/:id', async (req, res) => {
  const me = currentUser(req);
  const a = await prisma.attachment.findUnique({ where: { id: param(req, 'id') } });
  if (!a) throw notFound('File');
  if (a.entityType === 'RegistrationTest') {
    const t = await prisma.registrationTest.findUnique({ where: { id: a.entityId }, select: { analystId: true, sectionId: true } });
    const scope = labScope(me);
    if (t && t.analystId !== me.id && scope && !scope.includes(t.sectionId)) throw forbidden();
  }
  res.setHeader('Content-Type', a.mimeType);
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(a.fileName)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(await readFile(a.storageKey));
});
