import { Router } from 'express';
import { reportCreateSchema, reportUpdateSchema, signatureSchema, type ReportStatus, type ReportType } from '@lims/shared';
import { prisma, Prisma } from '../lib/prisma';
import { body, ilike, listQuery, paged, param } from '../lib/http';
import { badRequest, forbidden, notFound, rule } from '../lib/errors';
import { assertSectionAccess, can, currentUser, labScope, recordSignature, requirePerm, verifySignaturePassword, type AuthUser } from '../lib/auth';
import { audit, diff } from '../lib/audit';
import { nextNumber } from '../lib/numbering';
import { fmtDate, fmtDateTime } from '../lib/dates';
import { getLabSettings } from '../lib/settings';
import { notifyRoles } from '../lib/notify';
import { readFile, saveBuffer } from '../lib/storage';
import { reportPdf, type ReportContent } from '../pdf/documents';

/** §4.8 Report Generation & Release, §4.9 Report Types, §4.10 Multi-Section / Combined Report */
export const reportsRouter = Router();

type ReportRow = NonNullable<Awaited<ReturnType<typeof prisma.report.findUnique>>>;

async function getReport(id: string) {
  const r = await prisma.report.findUnique({ where: { id } });
  if (!r) throw notFound('Report');
  return r;
}

/** Sections a report covers: one section, or every section on the registration for a combined report. */
async function reportSectionIds(r: { registrationId: string; sectionId: string | null }) {
  if (r.sectionId) return [r.sectionId];
  const rows = await prisma.registrationSection.findMany({ where: { registrationId: r.registrationId }, select: { sectionId: true } });
  return rows.map((x) => x.sectionId);
}

function assertReportScope(me: AuthUser, sectionIds: string[]) {
  for (const s of sectionIds) assertSectionAccess(me, s);
}

/** Readiness check — returns blocking reasons (empty when the report may be released). */
async function releaseBlockers(r: { registrationId: string; sectionId: string | null }) {
  const reg = await prisma.registration.findUniqueOrThrow({ where: { id: r.registrationId }, include: { tests: true, sections: true } });
  const sectionIds = r.sectionId ? [r.sectionId] : reg.sections.map((s) => s.sectionId);
  const names = await prisma.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } });
  const nm = (id: string) => names.find((n) => n.id === id)?.name ?? id;
  const blockers: string[] = [];
  if (reg.status === 'CANCELLED') blockers.push('Registration is cancelled');
  for (const sid of sectionIds) {
    const pending = reg.tests.filter((t) => t.sectionId === sid && t.status !== 'APPROVED');
    if (pending.length) blockers.push(`${nm(sid)}: ${pending.length} test(s) not yet approved (${pending.map((p) => p.testName).join(', ')})`);
  }
  if (!r.sectionId) {
    for (const s of reg.sections) if (s.status !== 'COMPLETED') blockers.push(`${nm(s.sectionId)} section has not completed testing`);
  }
  return [...new Set(blockers)];
}

export async function buildReportContent(r: ReportRow): Promise<ReportContent> {
  const lab = await getLabSettings();
  const reg = await prisma.registration.findUniqueOrThrow({
    where: { id: r.registrationId },
    include: {
      tests: { orderBy: { sortOrder: 'asc' } },
      sections: true,
      receipt: { include: { quotation: { select: { number: true } }, purchaseOrder: true } },
    },
  });
  const sectionIds = r.sectionId ? [r.sectionId] : [...new Set(reg.tests.map((t) => t.sectionId))];
  const tests = reg.tests.filter((t) => sectionIds.includes(t.sectionId));
  const [sections, attachments, reviewers, releaser] = await Promise.all([
    prisma.section.findMany({ where: { id: { in: sectionIds } } }),
    prisma.attachment.findMany({ where: { entityType: 'RegistrationTest', entityId: { in: tests.map((t) => t.id) }, includeInReport: true }, orderBy: { createdAt: 'asc' } }),
    prisma.user.findMany({ where: { id: { in: tests.map((t) => t.reviewedById).filter(Boolean) as string[] } }, select: { id: true, name: true } }),
    r.releasedById ? prisma.user.findUnique({ where: { id: r.releasedById }, select: { name: true, designation: true } }) : null,
  ]);
  return {
    lab: { labName: lab.labName, address: lab.address, phone: lab.phone, email: lab.email, nablCertificateNo: lab.nablCertificateNo },
    number: r.number,
    revision: r.revision,
    format: r.format,
    includeNabl: r.includeNabl,
    includeSpecification: r.includeSpecification,
    combined: !r.sectionId,
    sectionName: r.sectionId ? sections[0]?.name ?? null : null,
    issuedTo: { name: r.issuedToName, address: r.issuedToAddress, contact: r.issuedToContact },
    registration: {
      number: reg.number,
      sampleName: reg.sampleName,
      sampleDescription: reg.sampleDescription,
      template: reg.template,
      templateData: (reg.templateData ?? {}) as Record<string, string>,
      quantity: reg.quantity,
      condition: reg.condition,
      receivedAt: fmtDate(reg.receipt.receivedAt),
      registeredAt: reg.approvedAt ? fmtDate(reg.approvedAt) : null,
      quotationNumber: reg.receipt.quotation.number,
      poNumber: reg.receipt.purchaseOrder?.poNumber ?? null,
      poDate: reg.receipt.purchaseOrder ? fmtDate(reg.receipt.purchaseOrder.poDate) : null,
    },
    // Only the final result (and, for multi-value tests, the replicate values) is reported;
    // all other working data stays on the registration record (§4.6 data rule).
    sections: sections
      .sort((a, b) => sectionIds.indexOf(a.id) - sectionIds.indexOf(b.id))
      .map((s) => {
        const st = tests.filter((t) => t.sectionId === s.id);
        return {
          name: s.name,
          reviewedBy: [...new Set(st.map((t) => reviewers.find((u) => u.id === t.reviewedById)?.name).filter(Boolean) as string[])],
          tests: st.map((t) => {
            const obs = t.observations as { computed?: { value: number | null }[] } | null;
            return {
              testName: t.testName,
              method: t.method,
              specification: t.specification,
              unit: t.unit,
              reportType: t.reportType as ReportType,
              nablAccredited: t.nablAccredited,
              replicateValues: t.reportType === 'MULTI_VALUE' ? (obs?.computed ?? []).map((c) => c.value) : [],
              result: t.finalResult,
              conformity: t.conformity,
              remarks: t.remarks,
              performedAt: t.completedAt ? fmtDate(t.completedAt) : null,
              images: ['INSTRUMENT', 'VALIDATION'].includes(t.reportType) || r.format === 'VALIDATION'
                ? attachments.filter((a) => a.entityId === t.id).map((a) => ({ attachmentId: a.id, caption: a.caption, fileName: a.fileName }))
                : [],
            };
          }),
        };
      }),
    remarks: r.remarks,
    validationSummary: r.validationSummary,
    issueDate: r.releasedAt ? fmtDate(r.releasedAt) : null,
    releasedBy: releaser && r.releasedAt ? { name: releaser.name, designation: releaser.designation, at: fmtDateTime(r.releasedAt) } : null,
  };
}

async function loadImages(content: ReportContent) {
  const ids = content.sections.flatMap((s) => s.tests.flatMap((t) => t.images.map((i) => i.attachmentId)));
  const rows = await prisma.attachment.findMany({ where: { id: { in: ids } } });
  const map = new Map<string, string>();
  for (const a of rows) {
    if (!['image/png', 'image/jpeg'].includes(a.mimeType)) continue; // pdfmake embeds PNG/JPEG
    try {
      map.set(a.id, `data:${a.mimeType};base64,${(await readFile(a.storageKey)).toString('base64')}`);
    } catch {
      /* missing file — rendered without the image */
    }
  }
  return map;
}

async function decorate(r: ReportRow) {
  const [reg, section, blockers, users] = await Promise.all([
    prisma.registration.findUnique({ where: { id: r.registrationId }, select: { id: true, number: true, sampleName: true, status: true, customerId: true, customer: { select: { name: true } }, sections: true } }),
    r.sectionId ? prisma.section.findUnique({ where: { id: r.sectionId }, select: { id: true, name: true } }) : null,
    r.status === 'RELEASED' || r.status === 'DISPATCHED' ? Promise.resolve([] as string[]) : releaseBlockers(r),
    prisma.user.findMany({ where: { id: { in: [r.createdById, r.previewedById, r.releasedById].filter(Boolean) as string[] } }, select: { id: true, name: true } }),
  ]);
  const name = (id?: string | null) => users.find((u) => u.id === id)?.name ?? null;
  return { ...r, contentSnapshot: undefined, registration: reg, section, blockers, createdByName: name(r.createdById), previewedByName: name(r.previewedById), releasedByName: name(r.releasedById) };
}

reportsRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const q = listQuery(req);
  const scope = labScope(me);
  const where: Prisma.ReportWhereInput = {
    ...(q.status ? { status: { in: q.status.split(',') as ReportStatus[] } } : {}),
    ...(typeof req.query.registrationId === 'string' ? { registrationId: req.query.registrationId } : {}),
    ...(typeof req.query.customerId === 'string' ? { registration: { customerId: req.query.customerId } } : {}),
    ...(q.q ? { OR: [{ number: ilike(q.q) }, { registration: { number: ilike(q.q) } }, { registration: { sampleName: ilike(q.q) } }, { issuedToName: ilike(q.q) }] } : {}),
    ...(scope && !can(me, 'dispatch.record') ? { OR: [{ sectionId: { in: scope } }, { sectionId: null, registration: { tests: { some: { sectionId: { in: scope } } } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.report.findMany({
      where,
      omit: { contentSnapshot: true },
      include: { registration: { select: { id: true, number: true, sampleName: true, customerId: true, customer: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: q.skip,
      take: q.take,
    }),
    prisma.report.count({ where }),
  ]);
  const sections = await prisma.section.findMany({ select: { id: true, name: true } });
  res.json(paged(items.map((i) => ({ ...i, sectionName: i.sectionId ? sections.find((s) => s.id === i.sectionId)?.name : 'Combined' })), total, q));
});

/** Registrations whose results are (partly) approved and can be reported, within the user's scope. */
reportsRouter.get('/candidates', requirePerm('report.release'), async (req, res) => {
  const me = currentUser(req);
  const scope = labScope(me);
  const regs = await prisma.registration.findMany({
    where: {
      status: { in: ['IN_TESTING', 'TESTING_COMPLETE', 'REPORTED'] },
      sections: { some: { status: 'COMPLETED', ...(scope ? { sectionId: { in: scope } } : {}) } },
    },
    include: { customer: { select: { name: true } }, sections: true, reports: { select: { id: true, number: true, status: true, sectionId: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
  const sections = await prisma.section.findMany({ select: { id: true, name: true } });
  res.json(regs.map((r) => ({ ...r, sections: r.sections.map((s) => ({ ...s, name: sections.find((x) => x.id === s.sectionId)?.name })) })));
});

reportsRouter.get('/:id', async (req, res) => {
  const me = currentUser(req);
  const r = await getReport(param(req, 'id'));
  if (!can(me, 'dispatch.record')) assertReportScope(me, await reportSectionIds(r));
  res.json(await decorate(r));
});

reportsRouter.post('/', requirePerm('report.release'), async (req, res) => {
  const me = currentUser(req);
  const d = body(req, reportCreateSchema);
  const reg = await prisma.registration.findUnique({ where: { id: d.registrationId }, include: { customer: true, sections: true, reports: true } });
  if (!reg) throw notFound('Registration');
  if (!['IN_TESTING', 'TESTING_COMPLETE', 'REPORTED'].includes(reg.status)) throw rule('Results for this registration are not ready for reporting');
  if (d.sectionId && !reg.sections.some((s) => s.sectionId === d.sectionId)) throw badRequest('Section is not part of this registration');
  const sectionIds = d.sectionId ? [d.sectionId] : reg.sections.map((s) => s.sectionId);
  assertReportScope(me, sectionIds);
  const sameScope = reg.reports.filter((x) => (x.sectionId ?? null) === (d.sectionId ?? null));
  if (sameScope.some((x) => x.status === 'DRAFT' || x.status === 'PREVIEW')) throw rule('A draft report already exists for this scope — open it instead');
  const released = sameScope.filter((x) => x.status === 'RELEASED' || x.status === 'DISPATCHED');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (released.length && !reason) throw badRequest('A report was already released. Give the reason for issuing a revised report.', { fields: { reason: 'Required for a revision' } });
  const contact = reg.contactId ? await prisma.contact.findUnique({ where: { id: reg.contactId } }) : null;
  const report = await prisma.$transaction(async (tx) => {
    const base = released.sort((a, b) => b.revision - a.revision)[0];
    const created = await tx.report.create({
      data: {
        number: base ? base.number : await nextNumber(tx, 'REPORT'),
        revision: base ? base.revision + 1 : 0,
        registrationId: reg.id,
        sectionId: d.sectionId || null,
        format: d.format,
        includeNabl: d.includeNabl,
        includeSpecification: d.includeSpecification,
        issuedToName: reg.customer.name,
        issuedToAddress: [reg.customer.address, reg.customer.city, reg.customer.state, reg.customer.pincode].filter(Boolean).join(', '),
        issuedToContact: contact?.name ?? null,
        createdById: me.id,
      },
    });
    await audit(tx, me, { action: base ? 'REPORT_REVISION_CREATED' : 'REPORT_CREATED', entityType: 'Report', entityId: created.id, after: d, reason: reason || null }, req);
    return created;
  });
  res.status(201).json(await decorate(report));
});

reportsRouter.put('/:id', requirePerm('report.release', 'report.editCustomer'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, reportUpdateSchema);
  const r = await getReport(id);
  assertReportScope(me, await reportSectionIds(r));
  if (r.status === 'RELEASED' || r.status === 'DISPATCHED') throw rule('A released report is locked. Issue a revision instead.');
  const customerFields = ['issuedToName', 'issuedToAddress', 'issuedToContact'] as const;
  if (customerFields.some((f) => d[f] !== undefined && d[f] !== r[f]) && !can(me, 'report.editCustomer')) {
    throw forbidden('Editing customer details on a report requires the "Edit customer details before final report" permission');
  }
  const otherChanged = (['includeNabl', 'includeSpecification', 'format', 'remarks', 'validationSummary'] as const).some((f) => d[f] !== undefined && d[f] !== r[f]);
  if (otherChanged && !can(me, 'report.release')) throw forbidden();
  const ch = diff(r as unknown as Record<string, unknown>, d);
  const updated = await prisma.$transaction(async (tx) => {
    // Any change sends the report back to draft — it must be previewed again before release.
    const u = await tx.report.update({ where: { id }, data: { ...d, status: ch.changed ? 'DRAFT' : r.status } });
    if (ch.changed) await audit(tx, me, { action: 'REPORT_UPDATED', entityType: 'Report', entityId: id, before: ch.before, after: ch.after }, req);
    return u;
  });
  res.json(await decorate(updated));
});

/** Preview PDF (watermarked). Marks the report as previewed — a precondition for release. */
reportsRouter.get('/:id/preview', requirePerm('report.release', 'report.editCustomer'), async (req, res) => {
  const me = currentUser(req);
  const r = await getReport(param(req, 'id'));
  assertReportScope(me, await reportSectionIds(r));
  if (r.status === 'RELEASED' || r.status === 'DISPATCHED') throw rule('Report is released — download the final PDF');
  const content = await buildReportContent(r);
  const pdf = await reportPdf(content, { draft: true, images: await loadImages(content) });
  if (r.status === 'DRAFT' && can(me, 'report.release')) {
    await prisma.report.update({ where: { id: r.id }, data: { status: 'PREVIEW', previewedById: me.id, previewedAt: new Date() } });
    await audit(prisma, me, { action: 'REPORT_PREVIEWED', entityType: 'Report', entityId: r.id }, req);
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${r.number.replace(/\//g, '-')}-preview.pdf"`);
  res.send(pdf);
});

reportsRouter.post('/:id/release', requirePerm('report.release'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const { password } = body(req, signatureSchema);
  const r = await getReport(id);
  const sectionIds = await reportSectionIds(r);
  assertReportScope(me, sectionIds);
  if (r.status !== 'PREVIEW') throw rule(r.status === 'DRAFT' ? 'Preview the report before releasing it' : 'Report is already released');
  const blockers = await releaseBlockers(r);
  if (blockers.length) throw rule('Report cannot be released yet', { blockers });
  await verifySignaturePassword(me, password);

  const releasedAt = new Date();
  const content = await buildReportContent({ ...r, releasedById: me.id, releasedAt });
  const pdf = await reportPdf(content, { draft: false, images: await loadImages(content) });
  const stored = await saveBuffer(pdf, '.pdf');

  const updated = await prisma.$transaction(async (tx) => {
    const att = await tx.attachment.create({
      data: { entityType: 'Report', entityId: id, kind: 'REPORT_PDF', fileName: `${r.number.replace(/\//g, '-')}${r.revision ? `-R${r.revision}` : ''}.pdf`, mimeType: 'application/pdf', size: stored.size, storageKey: stored.storageKey, sha256: stored.sha256, uploadedById: me.id },
    });
    const upd = await tx.report.updateMany({ where: { id, status: 'PREVIEW' }, data: { status: 'RELEASED', releasedById: me.id, releasedAt, pdfAttachmentId: att.id, contentSnapshot: content as unknown as Prisma.InputJsonValue } });
    if (upd.count !== 1) throw rule('The report was changed by someone else — reload and try again');
    const reg = await tx.registration.findUniqueOrThrow({ where: { id: r.registrationId }, include: { sections: true } });
    if (!r.sectionId || reg.sections.length === 1) await tx.registration.update({ where: { id: reg.id }, data: { status: 'REPORTED' } });
    await recordSignature(tx, me, 'Report', id, 'RELEASED');
    await audit(tx, me, { action: 'REPORT_RELEASED', entityType: 'Report', entityId: id, before: { status: 'PREVIEW' }, after: { status: 'RELEASED', pdfSha256: stored.sha256 } }, req);
    await notifyRoles(tx, ['CRM'], { type: 'REPORT_RELEASED', title: `Report ${r.number} released — ready for submission to customer`, body: `${reg.number} · ${reg.sampleName}${!r.sectionId && reg.sections.length > 1 ? ' (combined)' : ''}`, link: `/dispatch?report=${id}` });
    return tx.report.findUniqueOrThrow({ where: { id } });
  });
  res.json(await decorate(updated));
});

/** Final released PDF (byte-identical to what was signed — SHA-256 recorded in the audit trail). */
reportsRouter.get('/:id/pdf', async (req, res) => {
  const me = currentUser(req);
  const r = await getReport(param(req, 'id'));
  if (!can(me, 'dispatch.record')) assertReportScope(me, await reportSectionIds(r));
  if (!r.pdfAttachmentId) throw rule('The report has not been released yet');
  const a = await prisma.attachment.findUniqueOrThrow({ where: { id: r.pdfAttachmentId } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${a.fileName}"`);
  res.send(await readFile(a.storageKey));
});
