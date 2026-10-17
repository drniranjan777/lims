import { Router } from 'express';
import { canTransition, INVOICE_TRANSITIONS, invoiceSchema, signatureSchema, type InvoiceStatus } from '@lims/shared';
import { prisma, type Tx } from '../lib/prisma';
import { body, ilike, listQuery, paged, param } from '../lib/http';
import { badRequest, notFound, rule } from '../lib/errors';
import { currentUser, recordSignature, requirePerm, verifySignaturePassword } from '../lib/auth';
import { audit } from '../lib/audit';
import { nextNumber } from '../lib/numbering';
import { asDateOnly } from '../lib/dates';
import { getLabSettings } from '../lib/settings';
import { computeCommercials, totalsToColumns } from '../lib/commercial';
import { notifyRoles } from '../lib/notify';
import { invoicePdf } from '../pdf/documents';

/** §4.13 Tax Invoice Preparation */
export const invoicesRouter = Router();

const include = {
  customer: true,
  quotation: { select: { id: true, number: true } },
  purchaseOrder: { select: { id: true, poNumber: true, poDate: true, poValue: true } },
  items: { orderBy: { sortOrder: 'asc' as const }, include: { registration: { select: { id: true, number: true, sampleName: true } } } },
  dispatchItems: { include: { dispatch: { select: { id: true, number: true, dispatchDate: true, status: true } } } },
} as const;

async function loadInvoice(id: string) {
  const inv = await prisma.invoice.findUnique({ where: { id }, include });
  if (!inv) throw notFound('Invoice');
  const [contact, users] = await Promise.all([
    inv.contactId ? prisma.contact.findUnique({ where: { id: inv.contactId } }) : null,
    prisma.user.findMany({ where: { id: { in: [inv.createdById, inv.approvedById].filter(Boolean) as string[] } }, select: { id: true, name: true, designation: true } }),
  ]);
  const u = (id?: string | null) => users.find((x) => x.id === id) ?? null;
  return { ...inv, contact, createdBy: u(inv.createdById), approvedBy: u(inv.approvedById) };
}

async function buildInvoice(tx: Tx, d: ReturnType<typeof invoiceSchema.parse>, invoiceId?: string) {
  const lab = await getLabSettings(tx);
  const customer = await tx.customer.findUnique({ where: { id: d.customerId } });
  if (!customer) throw badRequest('Customer not found');
  if (d.contactId && !(await tx.contact.findFirst({ where: { id: d.contactId, customerId: d.customerId } }))) throw badRequest('Contact does not belong to the customer');
  if (d.quotationId && !(await tx.quotation.findFirst({ where: { id: d.quotationId, customerId: d.customerId } }))) throw badRequest('Quotation does not belong to the customer');
  const po = d.purchaseOrderId ? await tx.purchaseOrder.findUnique({ where: { id: d.purchaseOrderId }, include: { quotation: true } }) : null;
  if (d.purchaseOrderId && (!po || po.quotation.customerId !== d.customerId)) throw badRequest('PO does not belong to the customer');
  const regIds = [...new Set(d.items.map((i) => i.registrationId).filter(Boolean) as string[])];
  if (regIds.length) {
    const regs = await tx.registration.findMany({ where: { id: { in: regIds } }, select: { id: true, number: true, customerId: true } });
    for (const r of regs) if (r.customerId !== d.customerId) throw badRequest(`Registration ${r.number} belongs to another customer`);
    // Guard against billing the same sample twice.
    const clash = await tx.invoiceItem.findFirst({
      where: { registrationId: { in: regIds }, invoice: { status: { not: 'CANCELLED' }, ...(invoiceId ? { id: { not: invoiceId } } : {}) } },
      include: { invoice: { select: { number: true, draftNumber: true } }, registration: { select: { number: true } } },
    });
    if (clash) throw rule(`Registration ${clash.registration?.number} is already billed on invoice ${clash.invoice.number ?? clash.invoice.draftNumber}`);
  }
  const items = d.items.map((i) => ({ ...i, qty: Number(i.qty), rate: Number(i.rate) }));
  const { placeOfSupplyStateCode, gstType, totals } = computeCommercials({
    lab,
    customer,
    placeOfSupplyStateCode: d.placeOfSupplyStateCode,
    items,
    discountType: d.discountType,
    discountValue: d.discountValue,
    taxRelaxation: d.taxRelaxation,
    advance: d.advanceReceived,
  });
  if (d.taxRelaxation !== 'NONE' && !d.relaxationReference) throw badRequest('Give the LUT / exemption reference for the tax relaxation', { fields: { relaxationReference: 'Required' } });
  return {
    header: {
      date: asDateOnly(d.date),
      customerId: d.customerId,
      contactId: d.contactId || null,
      quotationId: d.quotationId || po?.quotationId || null,
      purchaseOrderId: d.purchaseOrderId || null,
      customerGstin: customer.gstin,
      placeOfSupplyStateCode,
      gstType,
      taxRelaxation: d.taxRelaxation,
      relaxationReference: d.relaxationReference,
      discountType: d.discountType ?? null,
      discountValue: d.discountValue ?? null,
      poValue: po?.poValue ?? null,
      advanceReceived: totals.advance,
      advanceReference: d.advanceReference,
      balanceDue: totals.balanceDue,
      terms: d.terms ?? lab.invoiceTerms,
      remarks: d.remarks,
      ...totalsToColumns(totals),
    },
    items: items.map((i, idx) => ({ registrationId: i.registrationId || null, description: i.description, sacCode: i.sacCode || lab.sacCode, qty: i.qty, rate: i.rate, amount: totals.lineAmounts[idx], sortOrder: idx })),
  };
}

invoicesRouter.get('/', async (req, res) => {
  const q = listQuery(req);
  const where = {
    ...(q.status ? { status: { in: q.status.split(',') as InvoiceStatus[] } } : {}),
    ...(typeof req.query.customerId === 'string' ? { customerId: req.query.customerId } : {}),
    ...(q.q ? { OR: [{ number: ilike(q.q) }, { draftNumber: ilike(q.q) }, { customer: { name: ilike(q.q) } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.invoice.findMany({ where, include: { customer: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take }),
    prisma.invoice.count({ where }),
  ]);
  res.json(paged(items, total, q));
});

/**
 * Suggested invoice lines: final test charges for the selected registrations, priced from the
 * quotation they were registered against (falls back to the test master rate).
 */
invoicesRouter.get('/prefill', requirePerm('invoice.edit'), async (req, res) => {
  const ids = String(req.query.registrationIds ?? '').split(',').filter(Boolean);
  if (!ids.length) throw badRequest('Select registrations to invoice');
  const regs = await prisma.registration.findMany({
    where: { id: { in: ids } },
    include: { tests: true, receipt: { include: { quotation: { include: { items: true } }, purchaseOrder: true } } },
  });
  if (new Set(regs.map((r) => r.customerId)).size > 1) throw badRequest('Select registrations of one customer');
  const masters = await prisma.testMaster.findMany({ where: { id: { in: regs.flatMap((r) => r.tests.map((t) => t.testId)).filter(Boolean) as string[] } } });
  const items = regs.flatMap((r) =>
    r.tests.map((t) => {
      const qi = r.receipt.quotation.items.find((i) => i.id === t.sourceQuotationItemId);
      const rate = qi ? Number(qi.rate) : Number(masters.find((m) => m.id === t.testId)?.rate ?? 0);
      return { registrationId: r.id, description: `${t.testName} — ${r.sampleName} (${r.number})`, qty: 1, rate };
    }),
  );
  const first = regs[0];
  res.json({
    customerId: first?.customerId,
    contactId: first?.contactId,
    quotationId: first?.receipt.quotationId,
    purchaseOrderId: first?.receipt.purchaseOrderId,
    discountType: first?.receipt.quotation.discountType,
    discountValue: first?.receipt.quotation.discountValue,
    items,
  });
});

/** Registrations with approved/reported results that are not yet invoiced. */
invoicesRouter.get('/billable', requirePerm('invoice.edit'), async (_req, res) => {
  const regs = await prisma.registration.findMany({
    where: { status: { in: ['TESTING_COMPLETE', 'REPORTED', 'IN_TESTING'] }, invoiceItems: { none: { invoice: { status: { not: 'CANCELLED' } } } } },
    select: { id: true, number: true, sampleName: true, status: true, customerId: true, customer: { select: { name: true } }, receipt: { select: { quotation: { select: { number: true } }, purchaseOrder: { select: { poNumber: true } } } } },
    orderBy: { createdAt: 'asc' },
    take: 300,
  });
  res.json(regs);
});

invoicesRouter.get('/:id', async (req, res) => {
  res.json(await loadInvoice(param(req, 'id')));
});

invoicesRouter.get('/:id/pdf', async (req, res) => {
  const inv = await loadInvoice(param(req, 'id'));
  const pdf = await invoicePdf(inv, await getLabSettings());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(inv.number ?? inv.draftNumber).replace(/\//g, '-')}.pdf"`);
  res.send(pdf);
});

invoicesRouter.post('/', requirePerm('invoice.edit'), async (req, res) => {
  const me = currentUser(req);
  const d = body(req, invoiceSchema);
  const inv = await prisma.$transaction(async (tx) => {
    const { header, items } = await buildInvoice(tx, d);
    const created = await tx.invoice.create({ data: { ...header, draftNumber: await nextNumber(tx, 'INVOICE_DRAFT', header.date), createdById: me.id, items: { create: items } } });
    await audit(tx, me, { action: 'CREATE', entityType: 'Invoice', entityId: created.id, after: { ...header, items } }, req);
    return created;
  });
  res.status(201).json(await loadInvoice(inv.id));
});

invoicesRouter.put('/:id', requirePerm('invoice.edit'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, invoiceSchema);
  const existing = await prisma.invoice.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw notFound('Invoice');
  if (existing.status !== 'DRAFT') throw rule('Only draft invoices can be edited');
  await prisma.$transaction(async (tx) => {
    const { header, items } = await buildInvoice(tx, d, id);
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({ where: { id }, data: { ...header, items: { create: items } } });
    await audit(tx, me, { action: 'UPDATE', entityType: 'Invoice', entityId: id, before: existing, after: { ...header, items } }, req);
  });
  res.json(await loadInvoice(id));
});

async function move(req: Parameters<typeof currentUser>[0], id: string, to: InvoiceStatus, extra: Record<string, unknown> = {}, reason?: string | null) {
  const me = currentUser(req);
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) throw notFound('Invoice');
  if (!canTransition(INVOICE_TRANSITIONS, inv.status, to)) throw rule(`Invoice is ${inv.status.toLowerCase()} — it cannot be moved to ${to.toLowerCase()}`);
  return { me, inv, run: (fn?: (tx: Tx) => Promise<Record<string, unknown> | void>) =>
    prisma.$transaction(async (tx) => {
      const more = (await fn?.(tx)) ?? {};
      const upd = await tx.invoice.updateMany({ where: { id, status: inv.status }, data: { status: to, ...extra, ...more } });
      if (upd.count !== 1) throw rule('The invoice was changed by someone else — reload and try again');
      await audit(tx, me, { action: `INVOICE_${to}`, entityType: 'Invoice', entityId: id, before: { status: inv.status }, after: { status: to, ...extra, ...more }, reason }, req);
    }) };
}

invoicesRouter.post('/:id/approve', requirePerm('invoice.authorize'), async (req, res) => {
  const id = param(req, 'id');
  const { password } = body(req, signatureSchema);
  const { me, run } = await move(req, id, 'APPROVED', {});
  await verifySignaturePassword(me, password);
  await run(async (tx) => {
    await recordSignature(tx, me, 'Invoice', id, 'AUTHORIZED');
    await notifyRoles(tx, ['ACCOUNTS'], { type: 'INVOICE_APPROVED', title: 'Invoice authorized — ready to issue', link: `/invoices/${id}` });
    return { approvedById: me.id, approvedAt: new Date() };
  });
  res.json(await loadInvoice(id));
});

invoicesRouter.post('/:id/revert', requirePerm('invoice.edit', 'invoice.authorize'), async (req, res) => {
  const id = param(req, 'id');
  const { run } = await move(req, id, 'DRAFT', { approvedById: null, approvedAt: null }, typeof req.body?.reason === 'string' ? req.body.reason : null);
  await run();
  res.json(await loadInvoice(id));
});

/** Issue: assigns the statutory invoice number (consecutive per financial year). */
invoicesRouter.post('/:id/issue', requirePerm('invoice.edit', 'invoice.authorize'), async (req, res) => {
  const id = param(req, 'id');
  const { inv, run } = await move(req, id, 'ISSUED');
  await run(async (tx) => ({ number: await nextNumber(tx, 'INVOICE', inv.date), issuedAt: new Date() }));
  res.json(await loadInvoice(id));
});

invoicesRouter.post('/:id/cancel', requirePerm('invoice.authorize'), async (req, res) => {
  const id = param(req, 'id');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) throw badRequest('Give a reason for cancelling the invoice', { fields: { reason: 'Required' } });
  const { run } = await move(req, id, 'CANCELLED', { cancelledReason: reason }, reason);
  await run();
  res.json(await loadInvoice(id));
});
