import type { Request } from 'express';
import { prisma, Prisma, type Tx } from './prisma';
import type { AuthUser } from './auth';

const toJson = (v: unknown): Prisma.InputJsonValue | undefined =>
  v === undefined || v === null ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/** Append an audit-trail row. Pass the transaction client so the audit commits atomically with the change. */
export async function audit(db: Tx | typeof prisma, user: AuthUser | null | undefined, e: AuditEntry, req?: Request) {
  await db.auditLog.create({
    data: {
      userId: user?.id,
      userName: user?.name,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? undefined,
      before: toJson(e.before),
      after: toJson(e.after),
      reason: e.reason ?? undefined,
      ip: req?.ip,
    },
  });
}

/** Only the fields whose values changed — keeps audit rows readable. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const bv = JSON.stringify(before[k] ?? null);
    const av = JSON.stringify(after[k] ?? null);
    if (bv !== av) {
      b[k] = before[k] ?? null;
      a[k] = after[k] ?? null;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
