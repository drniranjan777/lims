import { Router } from 'express';
import { prisma, Prisma } from '../lib/prisma';
import { ilike, listQuery, paged, param } from '../lib/http';
import { forbidden, notFound } from '../lib/errors';
import { can, currentUser, labScope, requirePerm } from '../lib/auth';
import { readFile } from '../lib/storage';
import { todayDate, addDays } from '../lib/dates';

// ---------------------------------------------------------------- dashboard (§6) — live data only

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

  const range = RANGES[String(req.query.range)] ? String(req.query.range) : 'today';
  const { days, spark } = RANGES[range];
  const now = todayDate(); // today's IST calendar date as UTC midnight
  const periodStart = istMidnight(addDays(now, 1 - days));
  const since = istMidnight(addDays(now, 1 - Math.max(2 * days, spark)));
  const testScopeSql = scope ? (scope.length ? Prisma.sql`x."sectionId" IN (${Prisma.join(scope)})` : Prisma.sql`FALSE`) : null;

  /** Rows per IST day for one timestamp column: a dense series for the sparkline plus period totals. */
  const flow = async (table: string, column: string, extra: Prisma.Sql = Prisma.empty) => {
    const col = Prisma.raw(`x."${column}"`);
    const rows = await prisma.$queryRaw<{ d: string; n: number }[]>`
      SELECT to_char(${col} + interval '330 minutes', 'YYYY-MM-DD') AS d, count(*)::int AS n
      FROM ${Prisma.raw(`"${table}"`)} x
      WHERE ${col} >= ${since} ${extra}
      GROUP BY 1`;
    const byDay = new Map(rows.map((r) => [r.d, r.n]));
    const at = (daysAgo: number) => byDay.get(isoDay(addDays(now, -daysAgo))) ?? 0;
    const sum = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => at(from + i)).reduce((a, b) => a + b, 0);
    return {
      series: Array.from({ length: spark }, (_, i) => ({ day: isoDay(addDays(now, i - spark + 1)), n: at(spark - 1 - i) })),
      current: sum(0, days),
      previous: sum(days, 2 * days),
    };
  };

  const testScope = scope ? { sectionId: { in: scope } } : {};
  const regScope = scope ? { tests: { some: { sectionId: { in: scope } } } } : {};
  const reportScope = scope ? { OR: [{ sectionId: { in: scope } }, { sectionId: null }] } : {};
  const regScopeSql = scope ? Prisma.sql`AND EXISTS (SELECT 1 FROM "RegistrationTest" t WHERE t."registrationId" = x."id" AND t."sectionId" IN (${scope.length ? Prisma.join(scope) : Prisma.sql`NULL`}))` : Prisma.empty;
  const [openEnquiries, activeSamples, testsInProgress, reportsAwaiting, enquiryFlow, registeredFlow, assignedFlow, reportFlow] = await Promise.all([
    prisma.enquiry.count({ where: { status: { in: ['NEW', 'IN_DISCUSSION'] } } }),
    prisma.registration.count({ where: { status: { in: ['REGISTERED', 'IN_TESTING', 'TESTING_COMPLETE'] }, ...regScope } }),
    prisma.registrationTest.count({ where: { status: { in: ['ASSIGNED', 'IN_TESTING', 'SUBMITTED', 'CORRECTION_REQUIRED'] }, ...testScope } }),
    prisma.report.count({ where: { status: { in: ['DRAFT', 'PREVIEW'] }, ...reportScope } }),
    flow('Enquiry', 'createdAt'),
    flow('Registration', 'approvedAt', regScopeSql),
    flow('RegistrationTest', 'assignedAt', testScopeSql ? Prisma.sql`AND ${testScopeSql}` : Prisma.empty),
    flow('Report', 'createdAt', testScopeSql ? Prisma.sql`AND (x."sectionId" IS NULL OR ${testScopeSql})` : Prisma.empty),
  ]);

  // Pipeline across the whole workflow (§2): open records per stage; the two flow stages follow the range.
  const pipeline = await Promise.all([
    prisma.enquiry.count({ where: { status: { in: ['NEW', 'IN_DISCUSSION'] } } }),
    prisma.quotation.count({ where: { status: { in: ['DRAFT', 'INTERNAL_REVIEW'] } } }),
    prisma.sampleReceipt.count({ where: { receivedAt: { gte: periodStart } } }),
    prisma.registration.count({ where: { status: { in: ['REGISTERED', 'IN_TESTING'] } } }),
    prisma.registrationTest.count({ where: { status: 'SUBMITTED', ...testScope } }),
    prisma.report.count({ where: { releasedAt: { gte: periodStart } } }),
    prisma.invoice.count({ where: { status: { in: ['DRAFT', 'APPROVED'] } } }),
  ]);

  // Section progress: approved tests out of all tests on samples currently registered / in testing.
  const [sections, progress] = await Promise.all([
    prisma.section.findMany({ where: { active: true }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
    prisma.registrationTest.groupBy({
      by: ['sectionId', 'status'],
      where: { registration: { status: { in: ['REGISTERED', 'IN_TESTING'] } }, ...testScope },
      _count: { _all: true },
    }),
  ]);

  res.json({
    range,
    counts,
    kpis: {
      openEnquiries: { value: openEnquiries, ...enquiryFlow },
      activeSamples: { value: activeSamples, ...registeredFlow },
      testsInProgress: { value: testsInProgress, ...assignedFlow },
      reportsAwaitingApproval: { value: reportsAwaiting, ...reportFlow },
    },
    pipeline: ['enquiries', 'quotations', 'samplesReceived', 'testing', 'review', 'reportsReleased', 'invoicing'].map((key, i) => ({ key, count: pipeline[i] })),
    // `index` is the section's position in the full list, so a section keeps its colour whatever the user's scope.
    sections: sections
      .map((s, index) => {
        const rows = progress.filter((g) => g.sectionId === s.id);
        return { id: s.id, name: s.name, index, done: rows.find((g) => g.status === 'APPROVED')?._count._all ?? 0, total: rows.reduce((a, g) => a + g._count._all, 0) };
      })
      .filter((s) => !scope || scope.includes(s.id)),
    recent: LAB_PERMS.some((p) => can(me, p)) ? await recentActivity(scope) : null,
  });
});

const RANGES: Record<string, { days: number; spark: number }> = { today: { days: 1, spark: 14 }, week: { days: 7, spark: 28 }, month: { days: 30, spark: 60 } };
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** The instant an IST calendar day (given as UTC midnight) begins. */
const istMidnight = (d: Date) => new Date(d.getTime() - 330 * 60000);
/** Users who work with samples see the recent-activity feed. */
const LAB_PERMS = ['reg.pre', 'reg.approve', 'test.editMethod', 'sec.assign', 'test.enter', 'test.review', 'report.release'] as const;

const ACTIVITY: Record<string, string> = {
  PRE_REGISTER: 'Sample pre-registered',
  REGISTERED: 'Registration completed',
  TESTS_ASSIGNED: 'Tests allocated',
  CANCELLED: 'Registration cancelled',
  OBSERVATIONS_SAVED: 'Observations recorded',
  SUBMITTED: 'Test result submitted',
  REVIEW_APPROVED: 'Reviewed and approved',
  REVIEW_RETURNED: 'Returned for correction',
  REPORT_RELEASED: 'Report released',
};

/** Latest workflow events from the audit trail, resolved to their sample and limited to the user's sections. */
async function recentActivity(scope: string[] | null) {
  const logs = await prisma.auditLog.findMany({
    where: { entityType: { in: ['Registration', 'RegistrationTest', 'Report'] }, action: { in: Object.keys(ACTIVITY) }, entityId: { not: null } },
    orderBy: { at: 'desc' },
    take: 60,
    select: { id: true, entityType: true, entityId: true, action: true, at: true, userName: true },
  });
  const ids = (type: string) => [...new Set(logs.filter((l) => l.entityType === type).map((l) => l.entityId!))];
  const reg = { select: { id: true, number: true, sampleName: true, customer: { select: { name: true } }, tests: { select: { sectionId: true } } } } as const;
  const [sectionList, tests, regs, reports] = await Promise.all([
    prisma.section.findMany({ select: { id: true, name: true } }),
    prisma.registrationTest.findMany({ where: { id: { in: ids('RegistrationTest') } }, select: { id: true, testName: true, status: true, sectionId: true, registration: reg } }),
    prisma.registration.findMany({ where: { id: { in: ids('Registration') } }, select: { ...reg.select, status: true } }),
    prisma.report.findMany({ where: { id: { in: ids('Report') } }, select: { id: true, status: true, sectionId: true, registration: reg } }),
  ]);
  const sectionName = new Map(sectionList.map((x) => [x.id, x.name]));
  type Reg = (typeof tests)[number]['registration'];
  const inScope = (r: Reg) => !scope || r.tests.some((t) => scope.includes(t.sectionId));
  const sample = (r: Reg) => ({ registrationId: r.id, sampleId: r.number, customer: r.customer.name });

  const rows = [];
  for (const l of logs) {
    const base = { id: l.id, activity: ACTIVITY[l.action], at: l.at, by: l.userName, testId: null as string | null };
    if (l.entityType === 'RegistrationTest') {
      const t = tests.find((x) => x.id === l.entityId);
      if (!t || (scope && !scope.includes(t.sectionId))) continue;
      rows.push({ ...base, ...sample(t.registration), testId: t.id, what: `${t.testName} / ${sectionName.get(t.sectionId)}`, status: t.status });
    } else if (l.entityType === 'Registration') {
      const r = regs.find((x) => x.id === l.entityId);
      if (!r || !inScope(r)) continue;
      rows.push({ ...base, ...sample(r), what: `${r.sampleName} / ${[...new Set(r.tests.map((t) => sectionName.get(t.sectionId)))].join(', ')}`, status: r.status });
    } else {
      const rep = reports.find((x) => x.id === l.entityId);
      if (!rep || !inScope(rep.registration)) continue;
      rows.push({ ...base, ...sample(rep.registration), what: `${rep.registration.sampleName} / ${rep.sectionId ? sectionName.get(rep.sectionId) : 'Combined report'}`, status: rep.status });
    }
    if (rows.length === 5) break;
  }
  return rows;
}

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
