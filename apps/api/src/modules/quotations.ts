import { Router, type Request } from 'express';
import { quotationDecisionSchema, quotationSchema, signatureSchema, type QuotationStatus } from '@lims/shared';
import { prisma, type Tx } from '../lib/prisma';
import { body, ilike, listQuery, paged, param } from '../lib/http';
import { badRequest, notFound, rule } from '../lib/errors';
import { currentUser, recordSignature, requirePerm, verifySignaturePassword } from '../lib/auth';
import { audit } from '../lib/audit';
import { nextNumber } from '../lib/numbering';
import { addDays, asDateOnly, fmtDate, todayDate } from '../lib/dates';
import { getLabSettings } from '../lib/settings';
import { computeCommercials, totalsToColumns } from '../lib/commercial';
import { notifyRoles, queueEmail } from '../lib/notify';
import { quotationPdf } from '../pdf/documents';
import { formatINR } from '@lims/shared';

export const quotationsRouter = Router();

const include = {
  customer: { include: { contacts: { where: { active: true } } } },
  items: { orderBy: { sortOrder: 'asc' as const } },
  enquiry: { select: { id: true, number: true } },
  purchaseOrders: { orderBy: { createdAt: 'asc' as const } },
  receipts: { select: { id: true, number: true, status: true, receivedAt: true } },
} as const;

export async function loadQuotation(id: string) {
  const q = await prisma.quotation.findUnique({ where: { id }, include });
  if (!q) throw notFound('Quotation');
  const userIds = [q.createdById, q.hodReviewedById, q.authorizedById].filter(Boolean) as string[];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, designation: true } });
  const u = (id?: string | null) => users.find((x) => x.id === id) ?? null;
  const contact = q.contactId ? q.customer.contacts.find((c) => c.id === q.contactId) ?? (await prisma.contact.findUnique({ where: { id: q.contactId } })) : null;
  return { ...q, contact, createdBy: u(q.createdById), hodReviewedBy: u(q.hodReviewedById), authorizedBy: u(q.authorizedById) };
}

async function buildQuotationData(tx: Tx, d: ReturnType<typeof quotationSchema.parse>) {
  const lab = await getLabSettings(tx);
  const customer = await tx.customer.findUnique({ where: { id: d.customerId } });
  if (!customer) throw badRequest('Customer not found');
  if (d.contactId && !(await tx.contact.findFirst({ where: { id: d.contactId, customerId: d.customerId } }))) {
    throw badRequest('Contact does not belong to the selected customer');
  }
  const items = d.items.map((i) => ({ ...i, rate: Number(i.rate), qty: Number(i.qty) }));
  const { placeOfSupplyStateCode, gstType, totals } = computeCommercials({
    lab,
    customer,
    placeOfSupplyStateCode: d.placeOfSupplyStateCode,
    items,
    discountType: d.discountType,
    discountValue: d.discountValue,
  });
  const date = asDateOnly(d.date);
  return {
    header: {
      date,
      validUntil: d.validUntil ? asDateOnly(d.validUntil) : addDays(date, lab.quotationValidityDays),
      enquiryId: d.enquiryId || null,
      customerId: d.customerId,
      contactId: d.contactId || null,
      placeOfSupplyStateCode,
      gstType,
      discountType: d.discountType ?? null,
      discountValue: d.discountValue ?? null,
      terms: d.terms ?? lab.quotationTerms,
      remarks: d.remarks,
      ...totalsToColumns(totals),
    },
    items: items.map((i, idx) => ({
      testId: i.testId || null,
      sampleDescription: i.sampleDescription,
      testName: i.testName,
      method: i.method,
      specification: i.specification,
      unit: i.unit,
      sectionId: i.sectionId || null,
      qty: i.qty,
      rate: i.rate,
      amount: totals.lineAmounts[idx],
      sortOrder: idx,
    })),
  };
}

quotationsRouter.get('/', async (req, res) => {
  const q = listQuery(req);
  const where = {
    ...(q.status ? { status: { in: q.status.split(',') as QuotationStatus[] } } : {}),
    ...(typeof req.query.customerId === 'string' ? { customerId: req.query.customerId } : {}),
    ...(q.q ? { OR: [{ number: ilike(q.q) }, { customer: { name: ilike(q.q) } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      include: { customer: { select: { id: true, name: true, code: true } }, _count: { select: { items: true, receipts: true } }, purchaseOrders: { select: { poNumber: true } } },
      orderBy: { createdAt: 'desc' },
      skip: q.skip,
      take: q.take,
    }),
    prisma.quotation.count({ where }),
  ]);
  res.json(paged(items, total, q));
});

quotationsRouter.get('/:id', async (req, res) => {
  res.json(await loadQuotation(param(req, 'id')));
});

quotationsRouter.get('/:id/pdf', async (req, res) => {
  const q = await loadQuotation(param(req, 'id'));
  const pdf = await quotationPdf(q, await getLabSettings());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${q.number.replace(/\//g, '-')}.pdf"`);
  res.send(pdf);
});

quotationsRouter.post('/', requirePerm('quote.edit'), async (req, res) => {
  const me = currentUser(req);
  const d = body(req, quotationSchema);
  const q = await prisma.$transaction(async (tx) => {
    const { header, items } = await buildQuotationData(tx, d);
    const created = await tx.quotation.create({
      data: { ...header, number: await nextNumber(tx, 'QUOTATION', header.date), createdById: me.id, items: { create: items } },
    });
    if (header.enquiryId) {
      await tx.enquiry.updateMany({ where: { id: header.enquiryId, status: { in: ['NEW', 'IN_DISCUSSION'] } }, data: { status: 'QUOTATION_PREPARED' } });
    }
    await audit(tx, me, { action: 'CREATE', entityType: 'Quotation', entityId: created.id, after: { ...header, items } }, req);
    return created;
  });
  res.status(201).json(await loadQuotation(q.id));
});

quotationsRouter.put('/:id', requirePerm('quote.edit'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, quotationSchema);
  const existing = await prisma.quotation.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw notFound('Quotation');
  if (existing.status !== 'DRAFT') throw rule('Only draft quotations can be edited. Return it to draft first.');
  await prisma.$transaction(async (tx) => {
    const { header, items } = await buildQuotationData(tx, d);
    await tx.quotationItem.deleteMany({ where: { quotationId: id } });
    await tx.quotation.update({ where: { id }, data: { ...header, items: { create: items } } });
    await audit(tx, me, { action: 'UPDATE', entityType: 'Quotation', entityId: id, before: existing, after: { ...header, items } }, req);
  });
  res.json(await loadQuotation(id));
});

async function transition(
  req: Request,
  id: string,
  from: QuotationStatus[],
  to: QuotationStatus,
  extra: Record<string, unknown>,
  action: string,
  after?: (tx: Tx, q: Awaited<ReturnType<typeof loadQuotation>>) => Promise<void>,
  reason?: string | null,
) {
  const me = currentUser(req);
  const q = await loadQuotation(id);
  if (!from.includes(q.status)) throw rule(`Quotation is ${q.status.replace(/_/g, ' ').toLowerCase()} — this action is not available`);
  await prisma.$transaction(async (tx) => {
    // Optimistic concurrency: the status must not have changed since it was read.
    const r = await tx.quotation.updateMany({ where: { id, status: q.status }, data: { status: to, ...extra } });
    if (r.count !== 1) throw rule('The quotation was changed by someone else — reload and try again');
    await audit(tx, me, { action, entityType: 'Quotation', entityId: id, before: { status: q.status }, after: { status: to, ...extra }, reason }, req);
    await after?.(tx, q);
  });
  return loadQuotation(id);
}

/** CRM submits the draft for internal review (HOD confirmation + authorization). */
quotationsRouter.post('/:id/submit', requirePerm('quote.edit'), async (req, res) => {
  const id = param(req, 'id');
  res.json(
    await transition(req, id, ['DRAFT'], 'INTERNAL_REVIEW', { hodReviewedById: null, hodReviewedAt: null, authorizedById: null, authorizedAt: null }, 'SUBMIT_REVIEW', async (tx, q) => {
      await notifyRoles(tx, ['HOD'], { type: 'QUOTATION_REVIEW', title: `Quotation ${q.number} awaits HOD review`, body: q.customer.name, link: `/quotations/${id}` });
    }),
  );
});

/** Return to draft for changes (any reviewer in the chain). */
quotationsRouter.post('/:id/return', requirePerm('quote.edit', 'quote.review', 'quote.authorize'), async (req, res) => {
  const id = param(req, 'id');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
  res.json(await transition(req, id, ['INTERNAL_REVIEW'], 'DRAFT', { hodReviewedById: null, hodReviewedAt: null, authorizedById: null, authorizedAt: null }, 'RETURN_TO_DRAFT', undefined, reason));
});

/** Lab HOD confirms tests, methods and specifications (§4.2). */
quotationsRouter.post('/:id/hod-review', requirePerm('quote.review'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const q = await loadQuotation(id);
  if (q.status !== 'INTERNAL_REVIEW') throw rule('Quotation is not in internal review');
  if (q.hodReviewedById) throw rule('HOD review is already recorded');
  await prisma.$transaction(async (tx) => {
    await tx.quotation.update({ where: { id }, data: { hodReviewedById: me.id, hodReviewedAt: new Date() } });
    await audit(tx, me, { action: 'HOD_REVIEWED', entityType: 'Quotation', entityId: id }, req);
    await notifyRoles(tx, ['SIGNATORY'], { type: 'QUOTATION_AUTHORIZE', title: `Quotation ${q.number} ready for authorization`, body: q.customer.name, link: `/quotations/${id}` });
  });
  res.json(await loadQuotation(id));
});

/** Authorized Signatory e-signs the quotation. */
quotationsRouter.post('/:id/authorize', requirePerm('quote.authorize'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const { password } = body(req, signatureSchema);
  const q = await loadQuotation(id);
  if (q.status !== 'INTERNAL_REVIEW') throw rule('Quotation is not in internal review');
  if (!q.hodReviewedById) throw rule('Lab HOD must confirm tests, methods and specifications before authorization');
  if (q.authorizedById) throw rule('Quotation is already authorized');
  await verifySignaturePassword(me, password);
  await prisma.$transaction(async (tx) => {
    await tx.quotation.update({ where: { id }, data: { authorizedById: me.id, authorizedAt: new Date() } });
    await recordSignature(tx, me, 'Quotation', id, 'AUTHORIZED');
    await audit(tx, me, { action: 'AUTHORIZED', entityType: 'Quotation', entityId: id }, req);
    await notifyRoles(tx, ['CRM'], { type: 'QUOTATION_AUTHORIZED', title: `Quotation ${q.number} authorized — ready to send`, link: `/quotations/${id}` });
  });
  res.json(await loadQuotation(id));
});

/** Send to customer — e-mails the contact person (via outbox). */
quotationsRouter.post('/:id/send', requirePerm('quote.edit'), async (req, res) => {
  const id = param(req, 'id');
  const current = await loadQuotation(id);
  if (!current.authorizedById) throw rule('Quotation must be authorized before it is sent');
  res.json(
    await transition(req, id, ['INTERNAL_REVIEW'], 'SENT', { sentAt: new Date() }, 'SENT', async (tx, q) => {
      const to = q.contact?.email || q.customer.email;
      await queueEmail(tx, {
        to,
        subject: `Quotation ${q.number} from Lucid Labs`,
        body: `Dear ${q.contact?.name ?? q.customer.name},\n\nPlease find our quotation ${q.number} dated ${fmtDate(q.date)} for ${formatINR(Number(q.total))} (incl. GST), valid until ${fmtDate(q.validUntil)}.\n\nKindly issue your purchase order and send the samples to proceed.\n\nRegards,\nLucid Labs`,
        entityType: 'Quotation',
        entityId: id,
      });
    }),
  );
});

/** Record customer decision (§4.2 client approval point). */
quotationsRouter.post('/:id/decision', requirePerm('quote.edit', 'po.record'), async (req, res) => {
  const id = param(req, 'id');
  const d = body(req, quotationDecisionSchema);
  if (d.decision === 'REJECTED' && !d.reason) throw badRequest('Give the reason for rejection', { fields: { reason: 'Required' } });
  res.json(await transition(req, id, ['SENT'], d.decision, { decidedAt: new Date(), decisionReason: d.reason }, d.decision, undefined, d.reason));
});

/** Mark sent quotations past their validity date as expired. Run by the job scheduler. */
export async function expireQuotations() {
  const r = await prisma.quotation.updateMany({ where: { status: 'SENT', validUntil: { lt: todayDate() } }, data: { status: 'EXPIRED' } });
  return r.count;
}
