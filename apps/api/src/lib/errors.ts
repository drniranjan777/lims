export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Please sign in') => new AppError(401, msg, 'UNAUTHORIZED');
/** Wrong password on re-entry (e-signature, password change) — the session itself is still valid. */
export const badPassword = (msg: string) => new AppError(401, msg, 'BAD_PASSWORD');
export const forbidden = (msg = 'You do not have permission for this action') => new AppError(403, msg, 'FORBIDDEN');
export const notFound = (what = 'Record') => new AppError(404, `${what} not found`, 'NOT_FOUND');
export const conflict = (msg: string) => new AppError(409, msg, 'CONFLICT');
/** Business-rule violation (e.g. invalid status transition, approval boundary). */
export const rule = (msg: string, details?: unknown) => new AppError(422, msg, 'BUSINESS_RULE', details);
