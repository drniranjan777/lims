import { Router, type Request } from 'express';
import {
  registrationSchema,
  registrationTestSchema,
  registrationUpdateSchema,
  signatureSchema,
  type RegistrationStatus,
} from '@lims/shared';
import { prisma, Prisma, type Tx } from '../lib/prisma';
import { body, ilike, listQuery, paged, param } from '../lib/http';
import { badRequest, forbidden, notFound, rule } from '../lib/errors';
import { assertSectionAccess, can, currentUser, labScope, recordSignature, requirePerm, verifySignaturePassword, type AuthUser } from '../lib/auth';
import { audit } from '../lib/audit';
import { nextNumber } from '../lib/numbering';
import { fmtDate } from '../lib/dates';
import { notifyRoles, queueEmail } from '../lib/notify';

/** §4.4 Pre-Registration & Registration */
export const registrationsRouter = Router();

type TestInput = ReturnType<typeof registrationTestSchema.parse>;

export const registrationInclude = {
  customer: { select: { id: true, code: true, name: true, address: true, city: true, state: true, gstin: true, email: true } },
  receipt: {
    include: {
      quotation: { select: { id: true, number: true, contactId: true, items: { orderBy: { sortOrder: 'asc' as const } } } },
      purchaseOrder: { select: { id: true, poNumber: true, poDate: true } },
    },
  },
  tests: { orderBy: { sortOrder: 'asc' as const }, include: { analyst: { select: { id: true, name: true } } } },
  sections: true,
  reports: { select: { id: true, number: true, status: true, sectionId: true, releasedAt: true } },
  retained: true,
} satisfies Prisma.RegistrationInclude;

export async function loadRegistration(id: string) {
  const r = await prisma.registration.findUnique({ where: { id }, include: registrationInclude });
  if (!r) throw notFound('Registration');
  const sectionIds = [...new Set(r.tests.map((t) => t.sectionId))];
  const [sections, contact, users] = await Promise.all([
    prisma.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, code: true, name: true } }),
    r.contactId ? prisma.contact.findUnique({ where: { id: r.contactId } }) : null,
    prisma.user.findMany({ where: { id: { in: [r.preRegisteredById, r.approvedById].filter(Boolean) as string[] } }, select: { id: true, name: true } }),
  ]);
  const name = (uid?: string | null) => users.find((u) => u.id === uid)?.name ?? null;
  return { ...r, sectionList: sections, contact, preRegisteredByName: name(r.preRegisteredById), approvedByName: name(r.approvedById) };
}

/**
 * Approval boundary (§4.4, §9): tests and methods are copied from the quotation. Changing a
 * method, or adding a test that is not on the quotation, needs the "Edit / modify tests &
 * methods" permission held by Registration Reviewers and Section Approvers.
 */
function assertTestEditRights(user: AuthUser, tests: TestInput[], quotationItems: { id: string; testName: string; method: string | null }[]) {
  if (can(user, 'test.editMethod')) return;
  for (const t of tests) {
    const src = quotationItems.find((qi) => qi.id === t.sourceQuotationItemId);
    if (!src) throw forbidden(`"${t.testName}" is not on the quotation — only an authorized reviewer can add tests`);
    if ((src.method ?? '') !== t.method || src.testName !== t.testName) {
      throw forbidden(`Changing the test or method of "${src.testName}" requires the Edit / modify tests & methods permission`);
    }
  }
}

async function buildTests(tx: Tx, tests: TestInput[]) {
  const masterIds = tests.map((t) => t.testId).filter(Boolean) as string[];
  const formulaIds = tests.map((t) => t.formulaId).filter(Boolean) as string[];
  const [sections, formulas] = await Promise.all([
    tx.section.findMany({ where: { id: { in: tests.map((t) => t.sectionId) }, active: true }, select: { id: true } }),
    tx.formula.findMany({ where: { id: { in: formulaIds } } }),
  ]);
  void masterIds;
  return tests.map((t, idx) => {
    if (!sections.some((s) => s.id === t.sectionId)) throw badRequest(`Select a valid lab section for "${t.testName}"`);
    const f = formulas.find((x) => x.id === t.formulaId);
    if (t.formulaId && !f) throw badRequest(`Formula for "${t.testName}" not found`);
    return {
      testId: t.testId || null,
      sourceQuotationItemId: t.sourceQuotationItemId || null,
      sectionId: t.sectionId,
      testName: t.testName,
      method: t.method,
      specification: t.specification,
      unit: t.unit,
      reportType: t.reportType,
      replicates: t.reportType === 'MULTI_VALUE' ? Math.max(2, t.replicates) : t.replicates,
      nablAccredited: t.nablAccredited,
      formulaId: f?.id ?? null,
      // Formula frozen at registration so later master-data edits cannot alter historic results.
      formulaSnapshot: f ? ({ code: f.code, name: f.name, expression: f.expression, displayExpression: f.displayExpression, variables: f.variables, resultUnit: f.resultUnit } as Prisma.InputJsonValue) : Prisma.DbNull,
      decimals: t.decimals,
      sortOrder: idx,
    };
  });
}

registrationsRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const q = listQuery(req);
  const scope = labScope(me);
  const where: Prisma.RegistrationWhereInput = {
    ...(q.status ? { status: { in: q.status.split(',') as RegistrationStatus[] } } : {}),
    ...(typeof req.query.customerId === 'string' ? { customerId: req.query.customerId } : {}),
    ...(q.q ? { OR: [{ number: ilike(q.q) }, { sampleName: ilike(q.q) }, { customer: { name: ilike(q.q) } }] } : {}),
    // Section-scoped staff only see registrations that include their sections.
    ...(scope && !can(me, 'reg.pre') && !can(me, 'dispatch.record') ? { tests: { some: { sectionId: { in: scope } } } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.registration.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        sections: true,
        tests: { select: { id: true, sectionId: true, status: true } },
        receipt: { select: { number: true, quotation: { select: { number: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: q.skip,
      take: q.take,
    }),
    prisma.registration.count({ where }),
  ]);
  res.json(paged(items, total, q));
});

/** Prefill data for pre-registration: receipt + quotation items to copy into the test group. */
registrationsRouter.get('/prefill/:receiptId', requirePerm('reg.pre'), async (req, res) => {
  const receipt = await prisma.sampleReceipt.findUnique({
    where: { id: param(req, 'receiptId') },
    include: {
      quotation: { include: { customer: true, items: { orderBy: { sortOrder: 'asc' } } } },
      purchaseOrder: true,
      registrations: { select: { id: true, number: true, sampleName: true } },
    },
  });
  if (!receipt) throw notFound('Sample receipt');
  const masters = await prisma.testMaster.findMany({ where: { id: { in: receipt.quotation.items.map((i) => i.testId).filter(Boolean) as string[] } } });
  const tests = receipt.quotation.items.map((i) => {
    const m = masters.find((x) => x.id === i.testId);
    return {
      sourceQuotationItemId: i.id,
      testId: i.testId,
      sectionId: i.sectionId ?? m?.sectionId ?? '',
      testName: i.testName,
      method: i.method ?? m?.method ?? '',
      specification: i.specification ?? m?.specification ?? '',
      unit: i.unit ?? m?.unit ?? '',
      reportType: m?.reportType ?? 'FINAL_RESULT',
      replicates: m?.replicates ?? 1,
      nablAccredited: m?.nablAccredited ?? false,
      formulaId: m?.formulaId ?? null,
      decimals: m?.decimals ?? 2,
      sampleDescription: i.sampleDescription,
    };
  });
  res.json({ receipt, tests });
});

registrationsRouter.get('/:id', async (req, res) => {
  const me = currentUser(req);
  const r = await loadRegistration(param(req, 'id'));
  const scope = labScope(me);
  if (scope && !can(me, 'reg.pre') && !can(me, 'dispatch.record') && !r.tests.some((t) => scope.includes(t.sectionId))) {
    throw forbidden('This registration has no tests in your sections');
  }
  res.json(r);
});

/** Full traceability chain for a registration (§8). */
registrationsRouter.get('/:id/trace', async (req, res) => {
  const r = await loadRegistration(param(req, 'id'));
  const quotation = await prisma.quotation.findUnique({
    where: { id: r.receipt.quotationId },
    include: { enquiry: true, purchaseOrders: true },
  });
  const [dispatches, invoices, signatures] = await Promise.all([
    prisma.dispatch.findMany({ where: { items: { some: { reportId: { in: r.reports.map((x) => x.id) } } } }, include: { items: true } }),
    prisma.invoice.findMany({ where: { items: { some: { registrationId: r.id } } }, select: { id: true, number: true, draftNumber: true, status: true, total: true, date: true } }),
    prisma.signature.findMany({
      where: { OR: [{ entityType: 'Registration', entityId: r.id }, { entityType: 'RegistrationTest', entityId: { in: r.tests.map((t) => t.id) } }, { entityType: 'Report', entityId: { in: r.reports.map((x) => x.id) } }] },
      include: { user: { select: { name: true } } },
      orderBy: { signedAt: 'asc' },
    }),
  ]);
  res.json({ registration: r, enquiry: quotation?.enquiry ?? null, quotation, purchaseOrders: quotation?.purchaseOrders ?? [], dispatches, invoices, signatures });
});

registrationsRouter.post('/', requirePerm('reg.pre'), async (req, res) => {
  const me = currentUser(req);
  const d = body(req, registrationSchema);
  const receipt = await prisma.sampleReceipt.findUnique({
    where: { id: d.receiptId },
    include: { quotation: { include: { items: true } }, _count: { select: { registrations: true } } },
  });
  if (!receipt) throw notFound('Sample receipt');
  if (!['RECEIVED', 'PRE_REGISTERED'].includes(receipt.status)) throw rule('Sample receipt is already fully registered');
  if (receipt._count.registrations >= receipt.numberOfSamples) {
    throw rule(`All ${receipt.numberOfSamples} sample(s) on this receipt are already registered. Update the receipt's sample count to add more.`);
  }
  assertTestEditRights(me, d.tests, receipt.quotation.items);
  const reg = await prisma.$transaction(async (tx) => {
    const tests = await buildTests(tx, d.tests);
    const created = await tx.registration.create({
      data: {
        number: await nextNumber(tx, 'REGISTRATION'),
        receiptId: receipt.id,
        customerId: receipt.quotation.customerId,
        contactId: receipt.quotation.contactId,
        template: d.template,
        sampleName: d.sampleName,
        sampleDescription: d.sampleDescription,
        quantity: d.quantity,
        condition: d.condition,
        templateData: d.templateData,
        remarks: d.remarks,
        preRegisteredById: me.id,
        tests: { create: tests },
      },
    });
    await tx.sampleReceipt.update({ where: { id: receipt.id }, data: { status: 'PRE_REGISTERED' } });
    await audit(tx, me, { action: 'PRE_REGISTER', entityType: 'Registration', entityId: created.id, after: d }, req);
    await notifyRoles(tx, ['REG_REVIEWER'], { type: 'REGISTRATION_REVIEW', title: `Pre-registration ${created.number} awaits verification`, body: d.sampleName, link: `/registrations/${created.id}` });
    return created;
  });
  res.status(201).json(await loadRegistration(reg.id));
});

registrationsRouter.put('/:id', requirePerm('reg.pre', 'reg.approve'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, registrationUpdateSchema);
  const existing = await loadRegistration(id);
  if (existing.status !== 'PRE_REGISTERED') throw rule('Only pre-registrations can be edited here. Use test/method edit on a registered sample.');
  assertTestEditRights(me, d.tests, existing.receipt.quotation.items);
  await prisma.$transaction(async (tx) => {
    const tests = await buildTests(tx, d.tests);
    await tx.registrationTest.deleteMany({ where: { registrationId: id } });
    await tx.registration.update({
      where: { id },
      data: {
        template: d.template,
        sampleName: d.sampleName,
        sampleDescription: d.sampleDescription,
        quantity: d.quantity,
        condition: d.condition,
        templateData: d.templateData,
        remarks: d.remarks,
        tests: { create: tests },
      },
    });
    await audit(tx, me, { action: 'UPDATE', entityType: 'Registration', entityId: id, before: { ...existing, tests: existing.tests }, after: d }, req);
  });
  res.json(await loadRegistration(id));
});

/**
 * Registration Reviewer/Approver verifies and registers the sample to one or more sections.
 * Creates per-section work rows, notifies Section Approvers and the customer contact.
 */
registrationsRouter.post('/:id/approve', requirePerm('reg.approve'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const { password } = body(req, signatureSchema);
  const r = await loadRegistration(id);
  if (r.status !== 'PRE_REGISTERED') throw rule('Registration is not awaiting approval');
  if (!r.tests.length) throw rule('Add at least one test before approving');
  await verifySignaturePassword(me, password);
  await prisma.$transaction(async (tx) => {
    const upd = await tx.registration.updateMany({ where: { id, status: 'PRE_REGISTERED' }, data: { status: 'REGISTERED', approvedById: me.id, approvedAt: new Date(), customerNotifiedAt: new Date() } });
    if (upd.count !== 1) throw rule('Registration was changed by someone else — reload and try again');
    const sectionIds = [...new Set(r.tests.map((t) => t.sectionId))];
    await tx.registrationSection.createMany({ data: sectionIds.map((sectionId) => ({ registrationId: id, sectionId })), skipDuplicates: true });
    const siblings = await tx.registration.count({ where: { receiptId: r.receiptId, status: 'PRE_REGISTERED' } });
    if (siblings === 0) await tx.sampleReceipt.update({ where: { id: r.receiptId }, data: { status: 'REGISTERED' } });
    await recordSignature(tx, me, 'Registration', id, 'APPROVED');
    await audit(tx, me, { action: 'REGISTERED', entityType: 'Registration', entityId: id, before: { status: 'PRE_REGISTERED' }, after: { status: 'REGISTERED', sections: sectionIds } }, req);
    for (const sid of sectionIds) {
      const n = r.tests.filter((t) => t.sectionId === sid).length;
      await notifyRoles(tx, ['SECTION_APPROVER'], { type: 'SECTION_RECEIVE', title: `New sample ${r.number} for your section`, body: `${r.sampleName} · ${n} test(s) to allocate`, link: `/section?registration=${id}` }, sid);
    }
    const sectionNames = r.sectionList.map((s) => s.name).join(', ');
    await queueEmail(tx, {
      to: r.contact?.email || r.customer.email,
      subject: `Sample registered — ${r.number}`,
      body: `Dear ${r.contact?.name ?? r.customer.name},\n\nYour sample "${r.sampleName}" received on ${fmtDate(r.receipt.receivedAt)} (receipt ${r.receipt.number}) has been registered under number ${r.number}.\n\nTests registered:\n${r.tests.map((t) => `  • ${t.testName} — ${t.method}`).join('\n')}\n\nLaboratory section(s): ${sectionNames}\nQuotation: ${r.receipt.quotation.number}${r.receipt.purchaseOrder ? `   PO: ${r.receipt.purchaseOrder.poNumber}` : ''}\n\nPlease quote ${r.number} in all correspondence.\n\nRegards,\nLucid Labs`,
      entityType: 'Registration',
      entityId: id,
    });
  });
  res.json(await loadRegistration(id));
});

registrationsRouter.post('/:id/cancel', requirePerm('reg.approve'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const reason = typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : null;
  if (!reason) throw badRequest('Give a reason for cancelling', { fields: { reason: 'Required' } });
  const r = await loadRegistration(id);
  if (!['PRE_REGISTERED', 'REGISTERED'].includes(r.status) || r.tests.some((t) => !['UNASSIGNED', 'ASSIGNED'].includes(t.status))) {
    throw rule('Only registrations where testing has not started can be cancelled');
  }
  await prisma.$transaction(async (tx) => {
    await tx.registration.update({ where: { id }, data: { status: 'CANCELLED' } });
    await audit(tx, me, { action: 'CANCELLED', entityType: 'Registration', entityId: id, before: { status: r.status }, after: { status: 'CANCELLED' }, reason }, req);
  });
  res.json(await loadRegistration(id));
});

// ---------------------------------------------------------------- tests & methods after registration

const testEditSchema = registrationTestSchema.pick({ testName: true, method: true, specification: true, unit: true, reportType: true, replicates: true, nablAccredited: true, decimals: true }).extend({
  reason: registrationTestSchema.shape.testName,
});

/** Reviewer / Section Approver modifies a test or method on a registered sample (§4.4, §4.5). */
export async function editRegisteredTest(req: Request) {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, testEditSchema);
  const t = await prisma.registrationTest.findUnique({ where: { id }, include: { registration: true } });
  if (!t) throw notFound('Test');
  assertSectionAccess(me, t.sectionId);
  if (['SUBMITTED', 'APPROVED'].includes(t.status)) throw rule('Tests submitted for review or approved cannot be modified');
  const { reason, ...data } = d;
  await prisma.$transaction(async (tx) => {
    await tx.registrationTest.update({ where: { id }, data });
    await audit(tx, me, { action: 'TEST_METHOD_EDITED', entityType: 'RegistrationTest', entityId: id, before: { testName: t.testName, method: t.method, specification: t.specification, unit: t.unit, reportType: t.reportType, replicates: t.replicates }, after: data, reason }, req);
  });
  return loadRegistration(t.registrationId);
}

registrationsRouter.patch('/tests/:id', requirePerm('test.editMethod'), async (req, res) => {
  res.json(await editRegisteredTest(req));
});

/** Add a test to an already registered sample (authorized reviewers only). */
registrationsRouter.post('/:id/tests', requirePerm('test.editMethod'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const t = body(req, registrationTestSchema);
  const r = await loadRegistration(id);
  if (!['REGISTERED', 'IN_TESTING', 'TESTING_COMPLETE'].includes(r.status)) throw rule('Tests can be added to registered samples that are not yet reported');
  assertSectionAccess(me, t.sectionId);
  await prisma.$transaction(async (tx) => {
    const [built] = await buildTests(tx, [t]);
    await tx.registrationTest.create({ data: { ...built, registrationId: id, sortOrder: r.tests.length } });
    const key = { registrationId_sectionId: { registrationId: id, sectionId: t.sectionId } };
    const sec = await tx.registrationSection.findUnique({ where: key });
    if (!sec) await tx.registrationSection.create({ data: { registrationId: id, sectionId: t.sectionId } });
    else if (sec.status === 'COMPLETED') await tx.registrationSection.update({ where: key, data: { status: 'IN_PROGRESS', completedAt: null } });
    if (r.status === 'TESTING_COMPLETE') await tx.registration.update({ where: { id }, data: { status: 'IN_TESTING' } });
    await audit(tx, me, { action: 'TEST_ADDED', entityType: 'Registration', entityId: id, after: t }, req);
  });
  res.status(201).json(await loadRegistration(id));
});
