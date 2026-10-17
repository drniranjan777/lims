import { Router } from 'express';
import type { ZodTypeAny } from 'zod';
import {
  chemicalSchema,
  customerSchema,
  equipmentSchema,
  formulaSchema,
  formulaVariables,
  FormulaError,
  labSettingsSchema,
  sectionSchema,
  stateCodeFromGstin,
  testMasterSchema,
} from '@lims/shared';
import { prisma, Prisma } from '../lib/prisma';
import { body, ilike, listQuery, paged, param } from '../lib/http';
import { badRequest, conflict, notFound } from '../lib/errors';
import { currentUser, requirePerm } from '../lib/auth';
import { audit, diff } from '../lib/audit';
import { nextNumber } from '../lib/numbering';
import { getLabSettings, LAB_SETTINGS_KEY } from '../lib/settings';

export const mastersRouter = Router();

type Delegate = {
  findMany: (a: object) => Promise<unknown[]>;
  count: (a: object) => Promise<number>;
  findUnique: (a: object) => Promise<Record<string, unknown> | null>;
  create: (a: object) => Promise<Record<string, unknown>>;
  update: (a: object) => Promise<Record<string, unknown>>;
};

interface MasterDef {
  path: string;
  entity: string;
  delegate: () => Delegate;
  schema: ZodTypeAny;
  searchFields: string[];
  orderBy: object;
  include?: object;
  validate?: (data: Record<string, unknown>) => void;
}

function validateFormula(d: Record<string, unknown>) {
  const expr = String(d.expression ?? '');
  const vars = (d.variables as { key: string }[] | undefined) ?? [];
  let used: string[];
  try {
    used = formulaVariables(expr);
  } catch (e) {
    throw badRequest(`Formula error: ${(e as FormulaError).message}`, { fields: { expression: (e as Error).message } });
  }
  const declared = new Set(vars.map((v) => v.key));
  const missing = used.filter((u) => !declared.has(u));
  if (missing.length) throw badRequest(`Declare variables used in the formula: ${missing.join(', ')}`, { fields: { variables: `Missing: ${missing.join(', ')}` } });
}

const MASTERS: MasterDef[] = [
  { path: 'sections', entity: 'Section', delegate: () => prisma.section as unknown as Delegate, schema: sectionSchema, searchFields: ['code', 'name'], orderBy: { name: 'asc' } },
  {
    path: 'tests',
    entity: 'TestMaster',
    delegate: () => prisma.testMaster as unknown as Delegate,
    schema: testMasterSchema,
    searchFields: ['code', 'name', 'method'],
    orderBy: [{ section: { name: 'asc' } }, { name: 'asc' }],
    include: { section: { select: { id: true, code: true, name: true } }, formula: { select: { id: true, code: true, name: true } } },
  },
  {
    path: 'formulas',
    entity: 'Formula',
    delegate: () => prisma.formula as unknown as Delegate,
    schema: formulaSchema,
    searchFields: ['code', 'name'],
    orderBy: { name: 'asc' },
    validate: validateFormula,
  },
  {
    path: 'equipment',
    entity: 'Equipment',
    delegate: () => prisma.equipment as unknown as Delegate,
    schema: equipmentSchema,
    searchFields: ['code', 'name', 'make'],
    orderBy: { code: 'asc' },
    include: { section: { select: { id: true, name: true } } },
  },
  { path: 'chemicals', entity: 'Chemical', delegate: () => prisma.chemical as unknown as Delegate, schema: chemicalSchema, searchFields: ['code', 'name', 'lotNumber'], orderBy: { name: 'asc' } },
];

for (const m of MASTERS) {
  // Lists are readable by every signed-in user (needed for selection lists across modules).
  mastersRouter.get(`/${m.path}`, async (req, res) => {
    const q = listQuery(req);
    const where: Record<string, unknown> = {};
    if (q.q) where.OR = m.searchFields.map((f) => ({ [f]: ilike(q.q) }));
    if (req.query.active === 'true') where.active = true;
    if (typeof req.query.sectionId === 'string' && (m.path === 'tests' || m.path === 'equipment')) where.sectionId = req.query.sectionId;
    const all = req.query.all === 'true';
    const [items, total] = await Promise.all([
      m.delegate().findMany({ where, orderBy: m.orderBy, include: m.include, ...(all ? {} : { skip: q.skip, take: q.take }) }),
      m.delegate().count({ where }),
    ]);
    res.json(all ? { items, total, page: 1, pageSize: total, pages: 1 } : paged(items, total, q));
  });

  mastersRouter.get(`/${m.path}/:id`, async (req, res) => {
    const row = await m.delegate().findUnique({ where: { id: param(req, 'id') }, include: m.include });
    if (!row) throw notFound(m.entity);
    res.json(row);
  });

  mastersRouter.post(`/${m.path}`, requirePerm('masters.manage'), async (req, res) => {
    const me = currentUser(req);
    const d = body(req, m.schema) as Record<string, unknown>;
    m.validate?.(d);
    try {
      const row = await prisma.$transaction(async (tx) => {
        const created = await (tx[m.entity.charAt(0).toLowerCase() + m.entity.slice(1) as 'section'] as unknown as Delegate).create({ data: d, include: m.include });
        await audit(tx, me, { action: 'CREATE', entityType: m.entity, entityId: String(created.id), after: d }, req);
        return created;
      });
      res.status(201).json(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('A record with this code already exists');
      throw e;
    }
  });

  mastersRouter.put(`/${m.path}/:id`, requirePerm('masters.manage'), async (req, res) => {
    const me = currentUser(req);
    const id = param(req, 'id');
    const d = body(req, m.schema) as Record<string, unknown>;
    m.validate?.(d);
    const existing = await m.delegate().findUnique({ where: { id } });
    if (!existing) throw notFound(m.entity);
    try {
      const row = await prisma.$transaction(async (tx) => {
        const updated = await (tx[m.entity.charAt(0).toLowerCase() + m.entity.slice(1) as 'section'] as unknown as Delegate).update({ where: { id }, data: d, include: m.include });
        const ch = diff(existing, d);
        if (ch.changed) await audit(tx, me, { action: 'UPDATE', entityType: m.entity, entityId: id, before: ch.before, after: ch.after }, req);
        return updated;
      });
      res.json(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('A record with this code already exists');
      throw e;
    }
  });
}

// ---------------------------------------------------------------- customers & contacts (§4.1)

const customerInclude = { contacts: { where: { active: true }, orderBy: [{ isPrimary: 'desc' as const }, { name: 'asc' as const }] } };

mastersRouter.get('/customers', async (req, res) => {
  const q = listQuery(req);
  const where = q.q ? { OR: [{ name: ilike(q.q) }, { code: ilike(q.q) }, { gstin: ilike(q.q) }, { city: ilike(q.q) }] } : {};
  const all = req.query.all === 'true';
  const [items, total] = await Promise.all([
    prisma.customer.findMany({ where, include: customerInclude, orderBy: { name: 'asc' }, ...(all ? {} : { skip: q.skip, take: q.take }) }),
    prisma.customer.count({ where }),
  ]);
  res.json(all ? { items, total, page: 1, pageSize: total, pages: 1 } : paged(items, total, q));
});

mastersRouter.get('/customers/:id', async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: param(req, 'id') }, include: customerInclude });
  if (!c) throw notFound('Customer');
  res.json(c);
});

function normaliseCustomer(d: ReturnType<typeof customerSchema.parse>) {
  const gstin = d.gstin ? d.gstin : null;
  return {
    name: d.name,
    address: d.address,
    city: d.city,
    state: d.state,
    stateCode: d.stateCode || stateCodeFromGstin(gstin) || null,
    pincode: d.pincode,
    gstin,
    email: d.email || null,
    phone: d.phone,
    active: d.active,
  };
}

mastersRouter.post('/customers', requirePerm('enq.create', 'masters.manage'), async (req, res) => {
  const me = currentUser(req);
  const d = body(req, customerSchema);
  const c = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        code: await nextNumber(tx, 'CUSTOMER'),
        ...normaliseCustomer(d),
        contacts: { create: d.contacts.map(({ id: _id, ...c }) => ({ ...c, email: c.email || null })) },
      },
      include: customerInclude,
    });
    await audit(tx, me, { action: 'CREATE', entityType: 'Customer', entityId: created.id, after: d }, req);
    return created;
  });
  res.status(201).json(c);
});

mastersRouter.put('/customers/:id', requirePerm('enq.create', 'masters.manage', 'report.editCustomer'), async (req, res) => {
  const me = currentUser(req);
  const id = param(req, 'id');
  const d = body(req, customerSchema);
  const existing = await prisma.customer.findUnique({ where: { id }, include: customerInclude });
  if (!existing) throw notFound('Customer');
  const c = await prisma.$transaction(async (tx) => {
    const keepIds = d.contacts.filter((c) => c.id).map((c) => c.id as string);
    // Contacts are referenced by enquiries/quotations — deactivate instead of deleting.
    await tx.contact.updateMany({ where: { customerId: id, id: { notIn: keepIds } }, data: { active: false } });
    for (const { id: cid, ...ct } of d.contacts) {
      const data = { ...ct, email: ct.email || null };
      if (cid) await tx.contact.update({ where: { id: cid }, data });
      else await tx.contact.create({ data: { ...data, customerId: id } });
    }
    const updated = await tx.customer.update({ where: { id }, data: normaliseCustomer(d), include: customerInclude });
    const ch = diff(existing as unknown as Record<string, unknown>, normaliseCustomer(d));
    await audit(tx, me, { action: 'UPDATE', entityType: 'Customer', entityId: id, before: { ...ch.before, contacts: existing.contacts }, after: { ...ch.after, contacts: d.contacts } }, req);
    return updated;
  });
  res.json(c);
});

// ---------------------------------------------------------------- lab settings

mastersRouter.get('/settings/lab', async (_req, res) => {
  res.json(await getLabSettings());
});

mastersRouter.put('/settings/lab', requirePerm('masters.manage'), async (req, res) => {
  const me = currentUser(req);
  const d = body(req, labSettingsSchema);
  const before = await getLabSettings();
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({ where: { key: LAB_SETTINGS_KEY }, update: { value: d }, create: { key: LAB_SETTINGS_KEY, value: d } });
    const ch = diff(before as unknown as Record<string, unknown>, d);
    if (ch.changed) await audit(tx, me, { action: 'UPDATE', entityType: 'Setting', entityId: LAB_SETTINGS_KEY, before: ch.before, after: ch.after }, req);
  });
  res.json(d);
});
