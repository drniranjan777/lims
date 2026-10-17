import { Router } from 'express';
import { dispatchReceiptSchema, dispatchSchema } from '@lims/shared';
import { prisma } from '../lib/prisma';
import { body, ilike, listQuery, paged, param } from '../lib/http';
import { badRequest, notFound, rule } from '../lib/errors';
import { currentUser, requirePerm } from '../lib/auth';
import { audit } from '../lib/audit';
import { nextNumber } from '../lib/numbering';
import { asDateOnly, fmtDate } from '../lib/dates';
import { queueEmail } from '../lib/notify';

/** §4.11 Customer Submission & Dispatch */
export const dispatchRouter = Router();

const include = {
  customer: { select: { id: true, name: true, email: true } },
  items: {
    include: {
      report: { select: { id: true, number: true, revision: true, sectionId: true, registration: { select: { number: true, sampleName: true } } } },
      invoice: { select: { id: true, number: true, total: true } },
    },
  },
} as const;

dispatchRouter.get('/', async (req, res) => {
  const q = listQuery(req);
  const where = {
    ...(q.status ? { status: q.status as 'DISPATCHED' | 'DELIVERED' } : {}),
    ...(q.q ? { OR: [{ number: ilike(q.q) }, { docketNumber: ilike(q.q) }, { customer: { name: ilike(q.q) } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.dispatch.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take }),
    prisma.dispatch.count({ where }),
  ]);
  res.json(paged(items, total, q));
});

/** Released reports and issued invoices not yet dispatched, grouped for the dispatch form. */
dispatchRouter.get('/pending', requirePerm('dispatch.record'), async (_req, res) => {
  const [reports, invoices] = await Promise.all([
    prisma.report.findMany({
      where: { status: 'RELEASED' },
      omit: { contentSnapshot: true },
      include: { registration: { select: { id: true, number: true, sampleName: true, customerId: true, customer: { select: { name: true } }, sections: { select: { sectionId: true } } } } },
      orderBy: { releasedAt: 'asc' },
    }),
    prisma.invoice.findMany({ where: { status: 'ISSUED' }, select: { id: true, number: true, total: true, customerId: true, date: true, customer: { select: { name: true } } }, orderBy: { issuedAt: 'asc' } }),
  ]);
  res.json({ reports, invoices });
});

dispatchRouter.post('/', requirePerm('dispatch.record'), async (req, res) => {
  const me = currentUser(req);
  const d = body(req, dispatchSchema);
  if (!d.reportIds.length && !d.invoiceIds.length) throw badRequest('Select at least one report or invoice to dispatch');
  const [reports, invoices] = await Promise.all([
    prisma.report.findMany({ where: { id: { in: d.reportIds } }, include: { registration: { include: { sections: true } } } }),
    prisma.invoice.findMany({ where: { id: { in: d.invoiceIds } } }),
  ]);
  if (reports.length !== d.reportIds.length || invoices.length !== d.invoiceIds.length) throw notFound('One or more documents');
  for (const r of reports) {
    if (r.status !== 'RELEASED') throw rule(`Report ${r.number} is not released`);
    if (r.registration.customerId !== d.customerId) throw rule(`Report ${r.number} belongs to a different customer`);
  }
  for (const i of invoices) {
    if (i.status !== 'ISSUED') throw rule(`Invoice ${i.number ?? i.draftNumber} is not issued`);
    if (i.customerId !== d.customerId) throw rule(`Invoice ${i.number} belongs to a different customer`);
  }
  // §4.10: one responsible user verifies that the complete combined report is dispatched.
  const multiSection = reports.some((r) => !r.sectionId && r.registration.sections.length > 1);
  if (multiSection && !d.combinedVerified) {
    throw rule('Confirm that the complete combined report (all sections) is included before dispatch', { fields: { combinedVerified: 'Required for combined reports' } });
  }
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: d.customerId } });
  const dispatch = await prisma.$transaction(async (tx) => {
    const created = await tx.dispatch.create({
      data: {
        number: await nextNumber(tx, 'DISPATCH', d.dispatchDate),
        customerId: d.customerId,
        dispatchDate: asDateOnly(d.dispatchDate),
        dispatchedById: me.id,
        dispatchedByName: me.name,
        mode: d.mode,
        courierName: d.courierName,
        docketNumber: d.docketNumber,
        remarks: d.remarks,
        combinedVerifiedById: multiSection ? me.id : null,
        items: { create: [...d.reportIds.map((reportId) => ({ reportId })), ...d.invoiceIds.map((invoiceId) => ({ invoiceId }))] },
      },
      include,
    });
    await tx.report.updateMany({ where: { id: { in: d.reportIds } }, data: { status: 'DISPATCHED' } });
    await tx.invoice.updateMany({ where: { id: { in: d.invoiceIds } }, data: { status: 'DISPATCHED' } });
    await audit(tx, me, { action: 'DISPATCHED', entityType: 'Dispatch', entityId: created.id, after: d }, req);
    const docs = [...reports.map((r) => `Test report ${r.number}${r.revision ? ` Rev ${r.revision}` : ''} (${r.registration.number})`), ...invoices.map((i) => `Tax invoice ${i.number}`)];
    await queueEmail(tx, {
      to: customer.email,
      subject: `Documents dispatched — ${created.number}`,
      body: `Dear ${customer.name},\n\nThe following documents were dispatched on ${fmtDate(created.dispatchDate)} by ${d.mode.replace(/_/g, ' ').toLowerCase()}${d.courierName ? ` via ${d.courierName}` : ''}${d.docketNumber ? ` (docket ${d.docketNumber})` : ''}:\n${docs.map((x) => `  • ${x}`).join('\n')}\n\nRegards,\nLucid Labs`,
      entityType: 'Dispatch',
      entityId: created.id,
    });
    return created;
  });
  res.status(201).json(dispatch);
});

/** Record receipt at customer end (date and person who received). */
dispatchRouter.post('/:id/receipt', requirePerm('dispatch.record'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, dispatchReceiptSchema);
  const existing = await prisma.dispatch.findUnique({ where: { id } });
  if (!existing) throw notFound('Dispatch');
  if (asDateOnly(d.receivedDate) < existing.dispatchDate) throw badRequest('Receipt date cannot be before the dispatch date', { fields: { receivedDate: 'Before dispatch date' } });
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.dispatch.update({ where: { id }, data: { status: 'DELIVERED', receivedDate: asDateOnly(d.receivedDate), receivedByName: d.receivedByName }, include });
    await audit(tx, me, { action: 'DELIVERY_CONFIRMED', entityType: 'Dispatch', entityId: id, before: { status: existing.status }, after: d }, req);
    return u;
  });
  res.json(updated);
});
