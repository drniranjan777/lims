import { Router, type Request } from 'express';
import multer from 'multer';
import path from 'node:path';
import { z } from 'zod';
import {
  average,
  checkConformity,
  chemicalUsageSchema,
  equipmentUsageSchema,
  evaluateFormula,
  observationSchema,
  reviewDecisionSchema,
  roundTo,
  signatureSchema,
  type TestStatus,
} from '@lims/shared';
import { prisma, Prisma } from '../lib/prisma';
import { body, param, parse } from '../lib/http';
import { badRequest, forbidden, notFound, rule } from '../lib/errors';
import { assertSectionAccess, can, currentUser, labScope, recordSignature, requirePerm, verifySignaturePassword, type AuthUser } from '../lib/auth';
import { audit } from '../lib/audit';
import { notifyRoles, notifyUsers } from '../lib/notify';
import { refreshCompletion } from '../lib/workflow';
import { assertAllowedMime, removeFile, saveBuffer } from '../lib/storage';
import { config } from '../config';
import { todayDate } from '../lib/dates';

/** §4.6 Testing & Observation Recording and §4.7 Technical Review & Approval */
export const testsRouter = Router();

const EDITABLE: TestStatus[] = ['ASSIGNED', 'IN_TESTING', 'CORRECTION_REQUIRED'];

const detailInclude = {
  registration: {
    select: {
      id: true,
      number: true,
      sampleName: true,
      sampleDescription: true,
      template: true,
      templateData: true,
      quantity: true,
      condition: true,
      status: true,
      customer: { select: { name: true } },
    },
  },
  analyst: { select: { id: true, name: true } },
  chemicals: { include: { chemical: true }, orderBy: { createdAt: 'asc' as const } },
  equipment: { include: { equipment: true }, orderBy: { createdAt: 'asc' as const } },
  reviewEvents: { orderBy: { at: 'asc' as const } },
} as const;

async function loadTest(id: string) {
  const t = await prisma.registrationTest.findUnique({ where: { id }, include: detailInclude });
  if (!t) throw notFound('Test');
  const [attachments, section, reviewer] = await Promise.all([
    prisma.attachment.findMany({ where: { entityType: 'RegistrationTest', entityId: id }, orderBy: { createdAt: 'asc' } }),
    prisma.section.findUnique({ where: { id: t.sectionId }, select: { id: true, name: true, code: true } }),
    t.reviewedById ? prisma.user.findUnique({ where: { id: t.reviewedById }, select: { name: true } }) : null,
  ]);
  return { ...t, attachments, section, reviewedByName: reviewer?.name ?? null };
}

function assertCanView(me: AuthUser, t: { analystId: string | null; sectionId: string }) {
  if (t.analystId === me.id) return;
  if (labScope(me) === null) return;
  if (can(me, 'sec.assign') || can(me, 'test.review') || can(me, 'test.editMethod')) return assertSectionAccess(me, t.sectionId);
  throw forbidden('This test is not assigned to you');
}

function assertAnalystCanEdit(me: AuthUser, t: { analystId: string | null; status: TestStatus }) {
  if (t.analystId !== me.id) throw forbidden('Only the assigned analyst can record data for this test');
  if (!EDITABLE.includes(t.status)) throw rule(`Test is ${t.status.replace(/_/g, ' ').toLowerCase()} — data entry is locked`);
}

type FormulaSnapshot = { expression: string; variables: { key: string; label: string; unit?: string | null }[]; resultUnit?: string | null } | null;

/** Apply the frozen formula (or plain readings) to replicate rows and derive the result. */
export function computeResult(
  t: { formulaSnapshot: unknown; reportType: string; decimals: number; specification: string | null },
  replicates: Record<string, number | string | null>[],
) {
  const f = t.formulaSnapshot as FormulaSnapshot;
  const computed: { value: number | null; error?: string }[] = replicates.map((row) => {
    try {
      if (f) {
        const vars: Record<string, number> = {};
        for (const v of f.variables) {
          const raw = row[v.key];
          if (raw === null || raw === undefined || raw === '') throw new Error(`Enter ${v.label}`);
          const n = Number(raw);
          if (!Number.isFinite(n)) throw new Error(`${v.label} must be a number`);
          vars[v.key] = n;
        }
        return { value: evaluateFormula(f.expression, vars) };
      }
      const raw = row.value;
      if (raw === null || raw === undefined || raw === '') return { value: null };
      const n = Number(raw);
      return Number.isFinite(n) ? { value: n } : { value: null };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  });
  const values = computed.map((c) => c.value).filter((v): v is number => v !== null);
  const mean = average(values);
  const calculated = mean === null ? null : roundTo(mean, t.decimals);
  return { computed: computed.map((c) => ({ ...c, value: c.value === null ? null : roundTo(c.value, t.decimals + 2) })), calculated, conformity: checkConformity(t.specification, calculated), errors: computed.filter((c) => c.error).map((c) => c.error as string) };
}

// ---------------------------------------------------------------- queues

testsRouter.get('/mine', requirePerm('test.enter'), async (req, res) => {
  const me = currentUser(req);
  const status = typeof req.query.status === 'string' && req.query.status ? (req.query.status.split(',') as TestStatus[]) : EDITABLE.concat(['SUBMITTED']);
  const tests = await prisma.registrationTest.findMany({
    where: { analystId: me.id, status: { in: status } },
    include: { registration: { select: { id: true, number: true, sampleName: true, customer: { select: { name: true } } } } },
    orderBy: [{ assignedAt: 'asc' }],
    take: 300,
  });
  res.json(tests);
});

testsRouter.get('/review-queue', requirePerm('test.review'), async (req, res) => {
  const me = currentUser(req);
  const scope = labScope(me);
  const tests = await prisma.registrationTest.findMany({
    where: { status: 'SUBMITTED', ...(scope ? { sectionId: { in: scope } } : {}) },
    include: { registration: { select: { id: true, number: true, sampleName: true, customer: { select: { name: true } } } }, analyst: { select: { name: true } } },
    orderBy: { submittedAt: 'asc' },
    take: 300,
  });
  res.json(tests);
});

testsRouter.get('/:id', async (req, res) => {
  const me = currentUser(req);
  const t = await loadTest(param(req, 'id'));
  assertCanView(me, t);
  res.json(t);
});

// ---------------------------------------------------------------- analyst data entry

testsRouter.put('/:id/observations', requirePerm('test.enter'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, observationSchema);
  const t = await prisma.registrationTest.findUnique({ where: { id } });
  if (!t) throw notFound('Test');
  assertAnalystCanEdit(me, t);
  if (d.replicates.length > t.replicates) throw badRequest(`This test takes at most ${t.replicates} replicate value(s)`);
  const r = computeResult(t, d.replicates);
  const finalResult = d.finalResult?.trim() ? d.finalResult.trim() : r.calculated !== null ? r.calculated.toFixed(t.decimals) : null;
  const data = {
    observations: { replicates: d.replicates, computed: r.computed } as Prisma.InputJsonValue,
    rawData: d.rawData,
    readingNotes: d.readingNotes,
    environment: d.environment,
    remarks: d.remarks,
    calculatedValue: r.calculated,
    finalResult,
    conformity: r.calculated !== null ? r.conformity : null,
    startedAt: t.startedAt ?? d.startedAt ?? new Date(),
    completedAt: d.completedAt ?? null,
    status: t.status === 'ASSIGNED' ? ('IN_TESTING' as const) : t.status,
  };
  await prisma.$transaction(async (tx) => {
    await tx.registrationTest.update({ where: { id }, data });
    await audit(tx, me, { action: 'OBSERVATIONS_SAVED', entityType: 'RegistrationTest', entityId: id, before: { observations: t.observations, finalResult: t.finalResult, rawData: t.rawData }, after: { observations: data.observations, finalResult, rawData: d.rawData } }, req);
  });
  res.json({ ...(await loadTest(id)), calculationErrors: r.errors });
});

testsRouter.post('/:id/chemicals', requirePerm('test.enter'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, chemicalUsageSchema);
  const t = await prisma.registrationTest.findUnique({ where: { id } });
  if (!t) throw notFound('Test');
  assertAnalystCanEdit(me, t);
  const chem = await prisma.chemical.findUnique({ where: { id: d.chemicalId } });
  if (!chem || !chem.active) throw badRequest('Select an active chemical / standard');
  if (chem.expiryDate && chem.expiryDate < todayDate()) throw rule(`${chem.name} (lot ${chem.lotNumber ?? '—'}) expired on ${chem.expiryDate.toISOString().slice(0, 10)} and cannot be used`);
  await prisma.$transaction(async (tx) => {
    const u = await tx.chemicalUsage.create({ data: { testId: id, chemicalId: chem.id, lotNumber: chem.lotNumber, quantity: d.quantity ?? undefined, unit: d.unit, remarks: d.remarks } });
    await audit(tx, me, { action: 'CHEMICAL_USED', entityType: 'RegistrationTest', entityId: id, after: { usageId: u.id, chemical: chem.code, lot: chem.lotNumber, quantity: d.quantity, unit: d.unit } }, req);
  });
  res.status(201).json(await loadTest(id));
});

testsRouter.delete('/:id/chemicals/:usageId', requirePerm('test.enter'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const t = await prisma.registrationTest.findUnique({ where: { id } });
  if (!t) throw notFound('Test');
  assertAnalystCanEdit(me, t);
  const u = await prisma.chemicalUsage.findFirst({ where: { id: param(req, 'usageId'), testId: id } });
  if (!u) throw notFound('Usage entry');
  await prisma.$transaction(async (tx) => {
    await tx.chemicalUsage.delete({ where: { id: u.id } });
    await audit(tx, me, { action: 'CHEMICAL_USAGE_REMOVED', entityType: 'RegistrationTest', entityId: id, before: u }, req);
  });
  res.json(await loadTest(id));
});

testsRouter.post('/:id/equipment', requirePerm('test.enter'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, equipmentUsageSchema);
  const t = await prisma.registrationTest.findUnique({ where: { id } });
  if (!t) throw notFound('Test');
  assertAnalystCanEdit(me, t);
  const eq = await prisma.equipment.findUnique({ where: { id: d.equipmentId } });
  if (!eq || !eq.active) throw badRequest('Select active equipment');
  if (eq.calibrationDue && eq.calibrationDue < todayDate()) throw rule(`${eq.code} calibration was due on ${eq.calibrationDue.toISOString().slice(0, 10)} — it cannot be used until recalibrated`);
  await prisma.$transaction(async (tx) => {
    const u = await tx.equipmentUsage.create({ data: { testId: id, equipmentId: eq.id, usedFrom: d.usedFrom, usedTo: d.usedTo, remarks: d.remarks, calibrationDueAtUse: eq.calibrationDue } });
    await audit(tx, me, { action: 'EQUIPMENT_USED', entityType: 'RegistrationTest', entityId: id, after: { usageId: u.id, equipment: eq.code, from: d.usedFrom, to: d.usedTo } }, req);
  });
  res.status(201).json(await loadTest(id));
});

testsRouter.delete('/:id/equipment/:usageId', requirePerm('test.enter'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const t = await prisma.registrationTest.findUnique({ where: { id } });
  if (!t) throw notFound('Test');
  assertAnalystCanEdit(me, t);
  const u = await prisma.equipmentUsage.findFirst({ where: { id: param(req, 'usageId'), testId: id } });
  if (!u) throw notFound('Usage entry');
  await prisma.$transaction(async (tx) => {
    await tx.equipmentUsage.delete({ where: { id: u.id } });
    await audit(tx, me, { action: 'EQUIPMENT_USAGE_REMOVED', entityType: 'RegistrationTest', entityId: id, before: u }, req);
  });
  res.json(await loadTest(id));
});

// ---------------------------------------------------------------- attachments (images, peaks, graphs, raw data)

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 10 } });
const attachmentMeta = z.object({
  kind: z.enum(['IMAGE', 'PEAK', 'GRAPH', 'RAW_DATA', 'DOCUMENT']).default('IMAGE'),
  caption: z.string().trim().max(300).optional(),
  includeInReport: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
});

testsRouter.post('/:id/attachments', requirePerm('test.enter'), upload.array('files', 10), async (req: Request, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const meta = parse(attachmentMeta, req.body);
  const t = await prisma.registrationTest.findUnique({ where: { id } });
  if (!t) throw notFound('Test');
  assertAnalystCanEdit(me, t);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw badRequest('Choose at least one file');
  for (const f of files) assertAllowedMime(f.mimetype);
  for (const f of files) {
    const stored = await saveBuffer(f.buffer, path.extname(f.originalname).toLowerCase());
    await prisma.$transaction(async (tx) => {
      const a = await tx.attachment.create({
        data: {
          entityType: 'RegistrationTest',
          entityId: id,
          kind: meta.kind,
          fileName: f.originalname.slice(0, 200),
          mimeType: f.mimetype,
          size: stored.size,
          storageKey: stored.storageKey,
          sha256: stored.sha256,
          caption: meta.caption,
          includeInReport: meta.includeInReport && f.mimetype.startsWith('image/'),
          uploadedById: me.id,
        },
      });
      await audit(tx, me, { action: 'ATTACHMENT_ADDED', entityType: 'RegistrationTest', entityId: id, after: { attachmentId: a.id, fileName: a.fileName, sha256: a.sha256, kind: a.kind } }, req);
    });
  }
  res.status(201).json(await loadTest(id));
});

testsRouter.patch('/:id/attachments/:attachmentId', requirePerm('test.enter'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = parse(attachmentMeta.partial(), req.body);
  const t = await prisma.registrationTest.findUnique({ where: { id } });
  if (!t) throw notFound('Test');
  assertAnalystCanEdit(me, t);
  const a = await prisma.attachment.findFirst({ where: { id: param(req, 'attachmentId'), entityType: 'RegistrationTest', entityId: id } });
  if (!a) throw notFound('Attachment');
  await prisma.attachment.update({ where: { id: a.id }, data: { caption: d.caption, kind: d.kind, includeInReport: d.includeInReport === undefined ? undefined : d.includeInReport && a.mimeType.startsWith('image/') } });
  await audit(prisma, me, { action: 'ATTACHMENT_UPDATED', entityType: 'RegistrationTest', entityId: id, before: { caption: a.caption, includeInReport: a.includeInReport }, after: d }, req);
  res.json(await loadTest(id));
});

testsRouter.delete('/:id/attachments/:attachmentId', requirePerm('test.enter'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const t = await prisma.registrationTest.findUnique({ where: { id } });
  if (!t) throw notFound('Test');
  assertAnalystCanEdit(me, t);
  const a = await prisma.attachment.findFirst({ where: { id: param(req, 'attachmentId'), entityType: 'RegistrationTest', entityId: id } });
  if (!a) throw notFound('Attachment');
  await prisma.$transaction(async (tx) => {
    await tx.attachment.delete({ where: { id: a.id } });
    await audit(tx, me, { action: 'ATTACHMENT_REMOVED', entityType: 'RegistrationTest', entityId: id, before: a }, req);
  });
  await removeFile(a.storageKey);
  res.json(await loadTest(id));
});

// ---------------------------------------------------------------- submit & review

testsRouter.post('/:id/submit', requirePerm('test.enter'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const { password } = body(req, signatureSchema);
  const t = await prisma.registrationTest.findUnique({ where: { id }, include: { registration: { select: { number: true } } } });
  if (!t) throw notFound('Test');
  assertAnalystCanEdit(me, t);
  if (t.status === 'ASSIGNED') throw rule('Record observations before submitting');
  if (!t.finalResult) throw rule('Enter or calculate the final result before submitting for review');
  const obs = t.observations as { computed?: { error?: string }[] } | null;
  if (obs?.computed?.some((c) => c.error)) throw rule('Resolve the calculation errors before submitting');
  await verifySignaturePassword(me, password);
  await prisma.$transaction(async (tx) => {
    await tx.registrationTest.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: new Date(), completedAt: t.completedAt ?? new Date() } });
    await tx.testReviewEvent.create({ data: { testId: id, action: 'SUBMIT', byId: me.id, byName: me.name } });
    await recordSignature(tx, me, 'RegistrationTest', id, 'AUTHORED');
    await audit(tx, me, { action: 'SUBMITTED', entityType: 'RegistrationTest', entityId: id, before: { status: t.status }, after: { status: 'SUBMITTED', finalResult: t.finalResult } }, req);
    await notifyRoles(tx, ['SECTION_APPROVER'], { type: 'REVIEW_PENDING', title: `${t.registration.number} · ${t.testName} submitted for review`, body: `Analyst: ${me.name}`, link: `/tests/${id}` }, t.sectionId);
  });
  res.json(await loadTest(id));
});

testsRouter.post('/:id/review', requirePerm('test.review'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, reviewDecisionSchema);
  const t = await prisma.registrationTest.findUnique({ where: { id }, include: { registration: { select: { id: true, number: true } } } });
  if (!t) throw notFound('Test');
  assertSectionAccess(me, t.sectionId);
  if (t.status !== 'SUBMITTED') throw rule('Test is not awaiting review');
  // Four-eyes principle: the analyst who generated the data cannot approve it.
  if (t.analystId === me.id) throw forbidden('You cannot review a test you performed');
  if (d.decision === 'RETURN' && !d.comments) throw badRequest('Describe the correction required', { fields: { comments: 'Required' } });
  await verifySignaturePassword(me, d.password);
  await prisma.$transaction(async (tx) => {
    const status = d.decision === 'APPROVE' ? 'APPROVED' : 'CORRECTION_REQUIRED';
    const upd = await tx.registrationTest.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status, reviewedById: me.id, reviewedAt: new Date(), reviewComments: d.comments } });
    if (upd.count !== 1) throw rule('The test was changed by someone else — reload and try again');
    await tx.testReviewEvent.create({ data: { testId: id, action: d.decision === 'APPROVE' ? 'APPROVE' : 'RETURN', comments: d.comments, byId: me.id, byName: me.name } });
    await audit(tx, me, { action: d.decision === 'APPROVE' ? 'REVIEW_APPROVED' : 'REVIEW_RETURNED', entityType: 'RegistrationTest', entityId: id, before: { status: 'SUBMITTED' }, after: { status }, reason: d.comments }, req);
    if (d.decision === 'APPROVE') {
      await recordSignature(tx, me, 'RegistrationTest', id, 'REVIEWED');
      await refreshCompletion(tx, t.registrationId, t.sectionId);
    } else if (t.analystId) {
      await notifyUsers(tx, [t.analystId], { type: 'CORRECTION_REQUIRED', title: `Correction required — ${t.registration.number} · ${t.testName}`, body: d.comments ?? undefined, link: `/tests/${id}` });
    }
  });
  res.json(await loadTest(id));
});
