import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { listQuerySchema, type ListQuery } from '@lims/shared';
import { badRequest } from './errors';

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const i of r.error.issues) fields[i.path.join('.') || '_'] = i.message;
    throw badRequest('Please correct the highlighted fields', { fields });
  }
  return r.data;
}

export const body = <S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> => parse(schema, req.body);

export function listQuery(req: Request): ListQuery & { skip: number; take: number } {
  const q = parse(listQuerySchema, req.query);
  return { ...q, skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function paged<T>(items: T[], total: number, q: ListQuery) {
  return { items, total, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(total / q.pageSize)) };
}

export const param = (req: Request, name: string): string => {
  const v = req.params[name];
  if (typeof v !== 'string' || !v) throw badRequest(`Missing ${name}`);
  return v;
};

export const noCache = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

/** Case-insensitive "contains" helper for Prisma text search. */
export const ilike = (q?: string) => (q ? { contains: q, mode: 'insensitive' as const } : undefined);
