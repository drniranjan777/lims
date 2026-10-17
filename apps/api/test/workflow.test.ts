/**
 * End-to-end workflow through the HTTP API against a real PostgreSQL test database:
 * enquiry → quotation (HOD review, e-signed authorization) → PO → sample receipt → pre-registration
 * → registration to two sections → allocation → analyst data (formula + replicates) → review with
 * correction loop → combined report preview/release → invoice → dispatch → retention/disposal.
 * Approval boundaries from §9 are asserted along the way.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Agent } from 'supertest';
import { login, makeUser, PASSWORD, prisma } from './helpers';

const S: Record<string, string> = {};
let A: Record<string, Agent>;
let ids: Record<string, string> = {};

beforeAll(async () => {
  const [chem, mech] = await Promise.all([
    prisma.section.create({ data: { code: 'CHEM', name: 'Chemical' } }),
    prisma.section.create({ data: { code: 'MECH', name: 'Mechanical' } }),
  ]);
  S.chem = chem.id;
  S.mech = mech.id;
  const lod = await prisma.formula.create({
    data: { code: 'LOD', name: 'Loss on drying', expression: '(W1 - W2) / (W1 - W0) * 100', variables: [{ key: 'W0', label: 'Empty' }, { key: 'W1', label: 'Before' }, { key: 'W2', label: 'After' }], resultUnit: '%' },
  });
  const [tLod, tHard] = await Promise.all([
    prisma.testMaster.create({ data: { code: 'LOD', name: 'Loss on Drying', method: 'USP <731>', sectionId: chem.id, specification: 'NMT 0.5', unit: '%', rate: 800, nablAccredited: true, formulaId: lod.id } }),
    prisma.testMaster.create({ data: { code: 'HARD', name: 'Brinell Hardness', method: 'ASTM E10', sectionId: mech.id, specification: '120 – 180', unit: 'HBW', rate: 1200, reportType: 'MULTI_VALUE', replicates: 3 } }),
  ]);
  ids.tLod = tLod.id;
  ids.tHard = tHard.id;
  await prisma.equipment.create({ data: { code: 'BAL-01', name: 'Balance', calibrationDue: new Date('2099-01-01') } });
  await prisma.equipment.create({ data: { code: 'OLD-01', name: 'Expired oven', calibrationDue: new Date('2020-01-01') } });

  await makeUser('admin@t.local', ['ADMIN'], [chem.id, mech.id]);
  await makeUser('crm@t.local', ['CRM']);
  await makeUser('hod@t.local', ['HOD']);
  await makeUser('sig@t.local', ['SIGNATORY']);
  await makeUser('reg@t.local', ['REG_REVIEWER']);
  await makeUser('appchem@t.local', ['SECTION_APPROVER'], [chem.id]);
  await makeUser('appmech@t.local', ['SECTION_APPROVER'], [mech.id]);
  await makeUser('anchem@t.local', ['ANALYST'], [chem.id]);
  await makeUser('anmech@t.local', ['ANALYST'], [mech.id]);
  await makeUser('stores@t.local', ['STORES']);
  await makeUser('acc@t.local', ['ACCOUNTS']);
  A = {};
  for (const k of ['admin', 'crm', 'hod', 'sig', 'reg', 'appchem', 'appmech', 'anchem', 'anmech', 'stores', 'acc']) A[k] = await login(`${k}@t.local`);
});

describe('authentication', () => {
  it('rejects bad credentials and unauthenticated access', async () => {
    const { request, app } = await import('./helpers');
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'crm@t.local', password: 'wrong' })).status).toBe(401);
    expect((await request(app).get('/api/v1/dashboard')).status).toBe(401);
    const me = await A.crm.get('/api/v1/auth/me');
    expect(me.body.roles).toEqual(['CRM']);
    expect(me.body.permissions).toContain('quote.edit');
  });
});

describe('end-to-end LIMS workflow', () => {
  it('CRM creates customer and enquiry', async () => {
    const c = await A.crm.post('/api/v1/masters/customers').send({
      name: 'Sunrise Pharma', city: 'Pune', state: 'Maharashtra', gstin: '27AABCS1234F1Z5', email: 'qa@sunrise.example',
      contacts: [{ name: 'Rahul', email: 'rahul@sunrise.example', isPrimary: true }],
    });
    expect(c.status).toBe(201);
    expect(c.body.stateCode).toBe('27');
    ids.customer = c.body.id;
    ids.contact = c.body.contacts[0].id;
    const e = await A.crm.post('/api/v1/enquiries').send({ source: 'PHONE', customerId: ids.customer, contactId: ids.contact, queryReference: 'Q-1', testIds: [ids.tLod, ids.tHard] });
    expect(e.status).toBe(201);
    expect(e.body.number).toMatch(/^ENQ\/\d{4}-\d{2}\/0001$/);
    ids.enquiry = e.body.id;
    // Analysts cannot create enquiries
    expect((await A.anchem.post('/api/v1/enquiries').send({ source: 'PHONE', customerId: ids.customer })).status).toBe(403);
  });

  it('quotation: GST split, HOD review, e-signed authorization, send', async () => {
    const q = await A.crm.post('/api/v1/quotations').send({
      enquiryId: ids.enquiry, customerId: ids.customer, contactId: ids.contact, discountType: 'PERCENT', discountValue: 10,
      items: [
        { testId: ids.tLod, testName: 'Loss on Drying', method: 'USP <731>', sectionId: S.chem, qty: 1, rate: 800, specification: 'NMT 0.5', unit: '%' },
        { testId: ids.tHard, testName: 'Brinell Hardness', method: 'ASTM E10', sectionId: S.mech, qty: 1, rate: 1200, specification: '120 – 180', unit: 'HBW' },
      ],
    });
    expect(q.status).toBe(201);
    expect(q.body.subtotal).toBe(2000);
    expect(q.body.taxable).toBe(1800);
    expect(q.body.gstType).toBe('INTRA');
    expect(q.body.cgst).toBe(162);
    expect(q.body.total).toBe(2124);
    ids.quotation = q.body.id;
    const enq = await A.crm.get(`/api/v1/enquiries/${ids.enquiry}`);
    expect(enq.body.status).toBe('QUOTATION_PREPARED');

    expect((await A.crm.post(`/api/v1/quotations/${ids.quotation}/send`)).status).toBe(422);
    expect((await A.crm.post(`/api/v1/quotations/${ids.quotation}/submit`)).body.status).toBe('INTERNAL_REVIEW');
    // Signatory cannot authorize before HOD confirmation
    expect((await A.sig.post(`/api/v1/quotations/${ids.quotation}/authorize`).send({ password: PASSWORD })).status).toBe(422);
    expect((await A.crm.post(`/api/v1/quotations/${ids.quotation}/hod-review`)).status).toBe(403);
    expect((await A.hod.post(`/api/v1/quotations/${ids.quotation}/hod-review`)).status).toBe(200);
    expect((await A.sig.post(`/api/v1/quotations/${ids.quotation}/authorize`).send({ password: 'wrong-password' })).status).toBe(401);
    const auth = await A.sig.post(`/api/v1/quotations/${ids.quotation}/authorize`).send({ password: PASSWORD });
    expect(auth.status).toBe(200);
    expect(auth.body.authorizedBy.name).toBe('sig');
    const sent = await A.crm.post(`/api/v1/quotations/${ids.quotation}/send`);
    expect(sent.body.status).toBe('SENT');
    const mail = await prisma.emailOutbox.findFirst({ where: { entityType: 'Quotation', entityId: ids.quotation } });
    expect(mail?.to).toBe('rahul@sunrise.example');
    expect(mail?.status).toBe('NOT_CONFIGURED');
    const pdf = await A.crm.get(`/api/v1/quotations/${ids.quotation}/pdf`).buffer(true);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('PO accepts the quotation; sample receipt', async () => {
    expect((await A.crm.post('/api/v1/receipts').send({ quotationId: ids.quotation })).status).toBe(422);
    const po = await A.crm.post('/api/v1/receipts/purchase-orders').send({ quotationId: ids.quotation, poNumber: 'PO-77', poDate: '2026-10-10', poValue: 2124 });
    expect(po.status).toBe(201);
    const q = await A.crm.get(`/api/v1/quotations/${ids.quotation}`);
    expect(q.body.status).toBe('ACCEPTED');
    const r = await A.crm.post('/api/v1/receipts').send({ quotationId: ids.quotation, mode: 'COURIER', courierName: 'BlueDart', docketNumber: 'BD123', numberOfSamples: 1 });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('RECEIVED');
    ids.receipt = r.body.id;
  });

  it('pre-registration copies tests; method changes need authorization', async () => {
    const pre = await A.crm.get(`/api/v1/registrations/prefill/${ids.receipt}`);
    expect(pre.status).toBe(200);
    const tests = pre.body.tests;
    expect(tests).toHaveLength(2);
    const changed = tests.map((t: Record<string, unknown>, i: number) => (i === 0 ? { ...t, method: 'In-house method' } : t));
    const denied = await A.crm.post('/api/v1/registrations').send({ receiptId: ids.receipt, template: 'PHARMA', sampleName: 'Paracetamol API', tests: changed });
    expect(denied.status).toBe(403);
    const reg = await A.crm.post('/api/v1/registrations').send({ receiptId: ids.receipt, template: 'PHARMA', sampleName: 'Paracetamol API', templateData: { 'Batch No.': 'B-101' }, tests });
    expect(reg.status).toBe(201);
    expect(reg.body.status).toBe('PRE_REGISTERED');
    ids.reg = reg.body.id;
    ids.testLod = reg.body.tests.find((t: { sectionId: string }) => t.sectionId === S.chem).id;
    ids.testHard = reg.body.tests.find((t: { sectionId: string }) => t.sectionId === S.mech).id;
    // Only one sample on the receipt
    expect((await A.crm.post('/api/v1/registrations').send({ receiptId: ids.receipt, template: 'GEN', sampleName: 'Extra', tests })).status).toBe(422);
  });

  it('reviewer registers to two sections and the customer is notified', async () => {
    expect((await A.crm.post(`/api/v1/registrations/${ids.reg}/approve`).send({ password: PASSWORD })).status).toBe(403);
    const ok = await A.reg.post(`/api/v1/registrations/${ids.reg}/approve`).send({ password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('REGISTERED');
    expect(ok.body.sections).toHaveLength(2);
    expect(await prisma.emailOutbox.count({ where: { entityType: 'Registration', entityId: ids.reg } })).toBe(1);
    expect(await prisma.notification.count({ where: { type: 'SECTION_RECEIVE' } })).toBe(2);
  });

  it('section approvers allocate only within their sections', async () => {
    const q = await A.appchem.get('/api/v1/section/queue');
    expect(q.body).toHaveLength(1);
    expect(q.body[0].sectionId).toBe(S.chem);
    const anchem = await prisma.user.findUniqueOrThrow({ where: { email: 'anchem@t.local' } });
    const anmech = await prisma.user.findUniqueOrThrow({ where: { email: 'anmech@t.local' } });
    expect((await A.appchem.post('/api/v1/section/assign').send({ testIds: [ids.testHard], analystId: anmech.id })).status).toBe(403);
    expect((await A.appchem.post('/api/v1/section/assign').send({ testIds: [ids.testLod], analystId: anmech.id })).status).toBe(400);
    expect((await A.appchem.post('/api/v1/section/receive').send({ registrationId: ids.reg, sectionId: S.chem })).status).toBe(200);
    expect((await A.appchem.post('/api/v1/section/assign').send({ testIds: [ids.testLod], analystId: anchem.id })).status).toBe(200);
    expect((await A.appmech.post('/api/v1/section/assign').send({ testIds: [ids.testHard], analystId: anmech.id })).status).toBe(200);
    const reg = await A.admin.get(`/api/v1/registrations/${ids.reg}`);
    expect(reg.body.status).toBe('IN_TESTING');
  });

  it('analyst records observations with formula, equipment and attachments', async () => {
    expect((await A.anmech.put(`/api/v1/tests/${ids.testLod}/observations`).send({ replicates: [] })).status).toBe(403);
    const obs = await A.anchem.put(`/api/v1/tests/${ids.testLod}/observations`).send({ replicates: [{ W0: 24.1021, W1: 26.1043, W2: 26.0997 }], rawData: 'Dried at 105 °C for 3 h' });
    expect(obs.status).toBe(200);
    expect(obs.body.status).toBe('IN_TESTING');
    expect(obs.body.finalResult).toBe('0.23');
    expect(obs.body.conformity).toBe('COMPLIES');
    const eqs = await A.anchem.get('/api/v1/masters/equipment?all=true');
    const bal = eqs.body.items.find((e: { code: string }) => e.code === 'BAL-01');
    const old = eqs.body.items.find((e: { code: string }) => e.code === 'OLD-01');
    expect((await A.anchem.post(`/api/v1/tests/${ids.testLod}/equipment`).send({ equipmentId: old.id })).status).toBe(422);
    expect((await A.anchem.post(`/api/v1/tests/${ids.testLod}/equipment`).send({ equipmentId: bal.id })).status).toBe(201);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a35e3b4e0000000049454e44ae426082', 'hex');
    const up = await A.anchem.post(`/api/v1/tests/${ids.testLod}/attachments`).field('kind', 'GRAPH').field('includeInReport', 'true').attach('files', png, { filename: 'graph.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    expect(up.body.attachments).toHaveLength(1);
    expect(up.body.attachments[0].sha256).toHaveLength(64);
  });

  it('review: four-eyes rule, correction loop, approval', async () => {
    expect((await A.anchem.post(`/api/v1/tests/${ids.testLod}/submit`).send({ password: 'nope' })).status).toBe(401);
    expect((await A.anchem.post(`/api/v1/tests/${ids.testLod}/submit`).send({ password: PASSWORD })).body.status).toBe('SUBMITTED');
    expect((await A.anchem.put(`/api/v1/tests/${ids.testLod}/observations`).send({ replicates: [] })).status).toBe(422);
    expect((await A.anchem.post(`/api/v1/tests/${ids.testLod}/review`).send({ decision: 'APPROVE', password: PASSWORD })).status).toBe(403);
    expect((await A.appmech.post(`/api/v1/tests/${ids.testLod}/review`).send({ decision: 'APPROVE', password: PASSWORD })).status).toBe(403);
    expect((await A.appchem.post(`/api/v1/tests/${ids.testLod}/review`).send({ decision: 'RETURN', password: PASSWORD })).status).toBe(400);
    const ret = await A.appchem.post(`/api/v1/tests/${ids.testLod}/review`).send({ decision: 'RETURN', comments: 'Attach balance printout', password: PASSWORD });
    expect(ret.body.status).toBe('CORRECTION_REQUIRED');
    expect(await prisma.notification.count({ where: { type: 'CORRECTION_REQUIRED' } })).toBe(1);
    await A.anchem.put(`/api/v1/tests/${ids.testLod}/observations`).send({ replicates: [{ W0: 24.1021, W1: 26.1043, W2: 26.0997 }], rawData: 'Balance printout attached' });
    expect((await A.anchem.post(`/api/v1/tests/${ids.testLod}/submit`).send({ password: PASSWORD })).body.status).toBe('SUBMITTED');
    const appr = await A.appchem.post(`/api/v1/tests/${ids.testLod}/review`).send({ decision: 'APPROVE', password: PASSWORD });
    expect(appr.body.status).toBe('APPROVED');
    expect(appr.body.reviewEvents.map((e: { action: string }) => e.action)).toEqual(['SUBMIT', 'RETURN', 'SUBMIT', 'APPROVE']);
    const sec = await prisma.registrationSection.findUniqueOrThrow({ where: { registrationId_sectionId: { registrationId: ids.reg, sectionId: S.chem } } });
    expect(sec.status).toBe('COMPLETED');
    expect(await prisma.notification.count({ where: { type: 'COMBINED_PENDING' } })).toBeGreaterThan(0);
  });

  it('combined report is blocked until every section completes', async () => {
    const rep = await A.sig.post('/api/v1/reports').send({ registrationId: ids.reg, includeNabl: true, includeSpecification: true });
    expect(rep.status).toBe(201);
    ids.report = rep.body.id;
    expect(rep.body.blockers.join(' ')).toMatch(/Mechanical/);
    expect((await A.sig.get(`/api/v1/reports/${ids.report}/preview`)).status).toBe(200);
    const blocked = await A.sig.post(`/api/v1/reports/${ids.report}/release`).send({ password: PASSWORD });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.details.blockers.length).toBeGreaterThan(0);
  });

  it('mechanical multi-value test completes the registration', async () => {
    const obs = await A.anmech.put(`/api/v1/tests/${ids.testHard}/observations`).send({ replicates: [{ value: 150 }, { value: 152 }, { value: 154 }] });
    expect(obs.body.finalResult).toBe('152.00');
    expect((await A.anmech.put(`/api/v1/tests/${ids.testHard}/observations`).send({ replicates: [{ value: 1 }, { value: 1 }, { value: 1 }, { value: 1 }] })).status).toBe(400);
    await A.anmech.post(`/api/v1/tests/${ids.testHard}/submit`).send({ password: PASSWORD });
    expect((await A.appmech.post(`/api/v1/tests/${ids.testHard}/review`).send({ decision: 'APPROVE', password: PASSWORD })).body.status).toBe('APPROVED');
    const reg = await A.admin.get(`/api/v1/registrations/${ids.reg}`);
    expect(reg.body.status).toBe('TESTING_COMPLETE');
  });

  it('report: customer-detail edits need permission; preview before release; locked after', async () => {
    expect((await A.crm.put(`/api/v1/reports/${ids.report}`).send({ issuedToName: 'X' })).status).toBe(403);
    const ed = await A.appchem.put(`/api/v1/reports/${ids.report}`).send({ issuedToName: 'Sunrise Pharmaceuticals Pvt. Ltd.' });
    // Combined report spans Mechanical too — the Chemical approver is outside that scope.
    expect(ed.status).toBe(403);
    const ok = await A.admin.put(`/api/v1/reports/${ids.report}`).send({ issuedToName: 'Sunrise Pharmaceuticals Pvt. Ltd.' });
    expect(ok.body.status).toBe('DRAFT');
    expect((await A.sig.post(`/api/v1/reports/${ids.report}/release`).send({ password: PASSWORD })).status).toBe(422);
    const preview = await A.sig.get(`/api/v1/reports/${ids.report}/preview`).buffer(true);
    expect(preview.body.subarray(0, 4).toString()).toBe('%PDF');
    const rel = await A.sig.post(`/api/v1/reports/${ids.report}/release`).send({ password: PASSWORD });
    expect(rel.status).toBe(200);
    expect(rel.body.status).toBe('RELEASED');
    expect(rel.body.number).toMatch(/^TR\//);
    const pdf = await A.crm.get(`/api/v1/reports/${ids.report}/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    expect((await A.admin.put(`/api/v1/reports/${ids.report}`).send({ remarks: 'late edit' })).status).toBe(422);
    const reg = await A.admin.get(`/api/v1/registrations/${ids.reg}`);
    expect(reg.body.status).toBe('REPORTED');
  });

  it('tax invoice: prefill from registration, authorize, issue', async () => {
    const billable = await A.acc.get('/api/v1/invoices/billable');
    expect(billable.body.map((r: { id: string }) => r.id)).toContain(ids.reg);
    const pre = await A.acc.get(`/api/v1/invoices/prefill?registrationIds=${ids.reg}`);
    expect(pre.body.items).toHaveLength(2);
    const inv = await A.acc.post('/api/v1/invoices').send({ ...pre.body, advanceReceived: 1000, advanceReference: 'NEFT-1' });
    expect(inv.status).toBe(201);
    expect(inv.body.total).toBe(2124);
    expect(inv.body.balanceDue).toBe(1124);
    expect(inv.body.number).toBeNull();
    ids.invoice = inv.body.id;
    expect((await A.acc.post('/api/v1/invoices').send(pre.body)).status).toBe(422); // already billed
    expect((await A.acc.post(`/api/v1/invoices/${ids.invoice}/approve`).send({ password: PASSWORD })).status).toBe(403);
    expect((await A.sig.post(`/api/v1/invoices/${ids.invoice}/approve`).send({ password: PASSWORD })).body.status).toBe('APPROVED');
    const issued = await A.acc.post(`/api/v1/invoices/${ids.invoice}/issue`);
    expect(issued.body.status).toBe('ISSUED');
    expect(issued.body.number).toMatch(/^INV\/\d{4}-\d{2}\/0001$/);
  });

  it('dispatch of combined report and invoice, then customer receipt', async () => {
    const pending = await A.crm.get('/api/v1/dispatches/pending');
    expect(pending.body.reports).toHaveLength(1);
    const body = { customerId: ids.customer, reportIds: [ids.report], invoiceIds: [ids.invoice], mode: 'COURIER', courierName: 'BlueDart', docketNumber: 'BD999' };
    expect((await A.crm.post('/api/v1/dispatches').send(body)).status).toBe(422); // combined verification missing
    const d = await A.crm.post('/api/v1/dispatches').send({ ...body, combinedVerified: true });
    expect(d.status).toBe(201);
    expect(d.body.combinedVerifiedById).toBeTruthy();
    const r = await A.crm.post(`/api/v1/dispatches/${d.body.id}/receipt`).send({ receivedDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), receivedByName: 'Rahul' });
    expect(r.body.status).toBe('DELIVERED');
    expect((await A.crm.get(`/api/v1/reports/${ids.report}`)).body.status).toBe('DISPATCHED');
    expect((await A.crm.get(`/api/v1/invoices/${ids.invoice}`)).body.status).toBe('DISPATCHED');
  });

  it('stores: retention and disposal with responsible person', async () => {
    const elig = await A.stores.get('/api/v1/stores/eligible');
    expect(elig.body[0].id).toBe(ids.reg);
    const ret = await A.stores.post('/api/v1/stores/retained').send({ registrationId: ids.reg, retentionMonths: 6, storageLocation: 'Rack A-3' });
    expect(ret.status).toBe(201);
    expect(ret.body.status).toBe('RETENTION_ACTIVE');
    const today = new Date().toISOString().slice(0, 10);
    expect((await A.stores.post(`/api/v1/stores/retained/${ret.body.id}/dispose`).send({ disposedAt: today, disposalMethod: 'Incineration' })).status).toBe(400);
    const disp = await A.stores.post(`/api/v1/stores/retained/${ret.body.id}/dispose`).send({ disposedAt: today, disposalMethod: 'Incineration', remarks: 'Customer requested early disposal' });
    expect(disp.body.status).toBe('DISPOSED');
    expect(disp.body.disposedByName).toBe('stores');
  });

  it('traceability, audit trail and dashboard reflect real data', async () => {
    const trace = await A.admin.get(`/api/v1/registrations/${ids.reg}/trace`);
    expect(trace.body.enquiry.id).toBe(ids.enquiry);
    expect(trace.body.purchaseOrders[0].poNumber).toBe('PO-77');
    expect(trace.body.invoices[0].id).toBe(ids.invoice);
    expect(trace.body.signatures.map((s: { meaning: string }) => s.meaning)).toEqual(expect.arrayContaining(['APPROVED', 'AUTHORED', 'REVIEWED', 'RELEASED']));
    const audit = await A.sig.get('/api/v1/audit?pageSize=200');
    const actions = audit.body.items.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['REPORT_RELEASED', 'REVIEW_RETURNED', 'REGISTERED', 'DISPATCHED', 'DISPOSED_EARLY']));
    expect((await A.crm.get('/api/v1/audit')).status).toBe(403);
    const dash = await A.crm.get('/api/v1/dashboard');
    expect(dash.status).toBe(200);
    expect(dash.body.counts).toHaveProperty('openEnquiries');
    expect(dash.body.counts).not.toHaveProperty('testsAwaitingReview');
  });
});
