import { Router } from 'express';
import { purchaseOrderSchema, sampleReceiptSchema, type ReceiptStatus } from '@lims/shared';
import { prisma } from '../lib/prisma';
import { body, ilike, listQuery, paged, param } from '../lib/http';
import { badRequest, conflict, notFound, rule } from '../lib/errors';
import { currentUser, requirePerm } from '../lib/auth';
import { audit } from '../lib/audit';
import { nextNumber } from '../lib/numbering';
import { asDateOnly } from '../lib/dates';
import { notifyRoles } from '../lib/notify';

/** §4.3 PO & Sample Receipt */
export const receiptsRouter = Router();

receiptsRouter.get('/purchase-orders', async (req, res) => {
  const q = listQuery(req);
  const where = q.q ? { OR: [{ poNumber: ilike(q.q) }, { quotation: { number: ilike(q.q) } }, { quotation: { customer: { name: ilike(q.q) } } }] } : {};
  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: { quotation: { select: { id: true, number: true, total: true, customer: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: q.skip,
      take: q.take,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  res.json(paged(items, total, q));
});

receiptsRouter.post('/purchase-orders', requirePerm('po.record'), async (req, res) => {
  const me = currentUser(req);
  const d = body(req, purchaseOrderSchema);
  const quotation = await prisma.quotation.findUnique({ where: { id: d.quotationId } });
  if (!quotation) throw notFound('Quotation');
  if (!['SENT', 'ACCEPTED'].includes(quotation.status)) {
    throw rule('A PO can only be recorded against a quotation that has been sent to or accepted by the customer');
  }
  if (await prisma.purchaseOrder.findFirst({ where: { quotationId: d.quotationId, poNumber: d.poNumber } })) {
    throw conflict('This PO number is already recorded for the quotation');
  }
  const po = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: { quotationId: d.quotationId, poNumber: d.poNumber, poDate: asDateOnly(d.poDate), poValue: d.poValue ?? undefined, remarks: d.remarks, createdById: me.id },
    });
    // Issuing a PO is the customer's acceptance of the quotation (§4.2 client approval point).
    if (quotation.status === 'SENT') {
      await tx.quotation.update({ where: { id: quotation.id }, data: { status: 'ACCEPTED', decidedAt: new Date(), decisionReason: `PO ${d.poNumber} received` } });
      await audit(tx, me, { action: 'ACCEPTED', entityType: 'Quotation', entityId: quotation.id, before: { status: 'SENT' }, after: { status: 'ACCEPTED' }, reason: `PO ${d.poNumber}` }, req);
    }
    await audit(tx, me, { action: 'CREATE', entityType: 'PurchaseOrder', entityId: created.id, after: d }, req);
    return created;
  });
  res.status(201).json(po);
});

const receiptInclude = {
  quotation: {
    select: {
      id: true,
      number: true,
      customerId: true,
      contactId: true,
      customer: { select: { id: true, name: true, code: true } },
      items: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
  purchaseOrder: true,
  registrations: { select: { id: true, number: true, sampleName: true, status: true } },
} as const;

receiptsRouter.get('/', async (req, res) => {
  const q = listQuery(req);
  const where = {
    ...(q.status ? { status: { in: q.status.split(',') as ReceiptStatus[] } } : {}),
    ...(q.q ? { OR: [{ number: ilike(q.q) }, { docketNumber: ilike(q.q) }, { quotation: { number: ilike(q.q) } }, { quotation: { customer: { name: ilike(q.q) } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.sampleReceipt.findMany({ where, include: receiptInclude, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take }),
    prisma.sampleReceipt.count({ where }),
  ]);
  res.json(paged(items, total, q));
});

receiptsRouter.get('/:id', async (req, res) => {
  const r = await prisma.sampleReceipt.findUnique({ where: { id: param(req, 'id') }, include: receiptInclude });
  if (!r) throw notFound('Sample receipt');
  res.json(r);
});

receiptsRouter.post('/', requirePerm('po.record'), async (req, res) => {
  const me = currentUser(req);
  const d = body(req, sampleReceiptSchema);
  const quotation = await prisma.quotation.findUnique({ where: { id: d.quotationId }, include: { purchaseOrders: true } });
  if (!quotation) throw notFound('Quotation');
  if (quotation.status !== 'ACCEPTED') throw rule('Samples are received against an accepted quotation (record the customer PO first)');
  if (d.purchaseOrderId && !quotation.purchaseOrders.some((p) => p.id === d.purchaseOrderId)) throw badRequest('PO does not belong to this quotation');
  const receipt = await prisma.$transaction(async (tx) => {
    const created = await tx.sampleReceipt.create({
      data: {
        number: await nextNumber(tx, 'RECEIPT', d.receivedAt),
        quotationId: d.quotationId,
        purchaseOrderId: d.purchaseOrderId || quotation.purchaseOrders[0]?.id || null,
        receivedAt: d.receivedAt,
        receivedById: me.id,
        mode: d.mode,
        courierName: d.courierName,
        docketNumber: d.docketNumber,
        numberOfSamples: d.numberOfSamples,
        condition: d.condition,
        remarks: d.remarks,
        status: 'RECEIVED',
      },
      include: receiptInclude,
    });
    await audit(tx, me, { action: 'CREATE', entityType: 'SampleReceipt', entityId: created.id, after: d }, req);
    await notifyRoles(tx, ['CRM'], { type: 'SAMPLE_RECEIVED', title: `Sample received — ${created.number}`, body: `${created.quotation.customer.name} · ${d.numberOfSamples} sample(s). Ready for pre-registration.`, link: `/registrations/new?receiptId=${created.id}` });
    return created;
  });
  res.status(201).json(receipt);
});
