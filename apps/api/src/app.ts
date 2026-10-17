import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import multer from 'multer';
import { config } from './config';
import { logger } from './lib/logger';
import { AppError, forbidden } from './lib/errors';
import { authenticate } from './lib/auth';
import { Prisma, prisma } from './lib/prisma';
import { noCache } from './lib/http';
import { authRouter } from './modules/auth';
import { usersRouter } from './modules/users';
import { mastersRouter } from './modules/masters';
import { enquiriesRouter } from './modules/enquiries';
import { quotationsRouter } from './modules/quotations';
import { receiptsRouter } from './modules/receipts';
import { registrationsRouter } from './modules/registrations';
import { sectionRouter } from './modules/section';
import { testsRouter } from './modules/tests';
import { reportsRouter } from './modules/reports';
import { dispatchRouter } from './modules/dispatch';
import { storesRouter } from './modules/stores';
import { invoicesRouter } from './modules/invoices';
import { attachmentsRouter, auditRouter, dashboardRouter, notificationsRouter } from './modules/misc';

/** Reject cross-site state-changing requests (defence in depth on top of SameSite cookies). */
function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && origin !== config.WEB_ORIGIN && !(config.NODE_ENV !== 'production' && /^http:\/\/localhost(:\d+)?$/.test(origin))) {
    return next(forbidden('Cross-origin request rejected'));
  }
  next();
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  if (config.NODE_ENV !== 'test') app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  const api = express.Router();
  api.use(noCache, originCheck);
  api.use('/auth', authRouter);
  api.use(authenticate);
  api.use('/users', usersRouter);
  api.use('/masters', mastersRouter);
  api.use('/enquiries', enquiriesRouter);
  api.use('/quotations', quotationsRouter);
  api.use('/receipts', receiptsRouter);
  api.use('/registrations', registrationsRouter);
  api.use('/section', sectionRouter);
  api.use('/tests', testsRouter);
  api.use('/reports', reportsRouter);
  api.use('/dispatches', dispatchRouter);
  api.use('/stores', storesRouter);
  api.use('/invoices', invoicesRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/audit', auditRouter);
  api.use('/attachments', attachmentsRouter);
  app.use('/api/v1', api);

  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: { code: 'UPLOAD', message: err.code === 'LIMIT_FILE_SIZE' ? `File is larger than ${config.MAX_UPLOAD_MB} MB` : err.message } });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these details already exists' } });
      if (err.code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
      if (err.code === 'P2003') return res.status(400).json({ error: { code: 'BAD_REFERENCE', message: 'A referenced record does not exist' } });
    }
    if ((err as { type?: string }).type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body' } });
    }
    (req.log ?? logger).error({ err }, 'unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. The error has been logged.' } });
  });

  return app;
}
