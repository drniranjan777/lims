import { config } from './config';
import { createApp } from './app';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { startJobs } from './jobs';

const app = createApp();
const server = app.listen(config.API_PORT, () => {
  logger.info(`LIMS API listening on http://localhost:${config.API_PORT} (${config.NODE_ENV})`);
  if (!config.smtpConfigured) logger.warn('SMTP is not configured — customer e-mails are kept in the outbox (status NOT_CONFIGURED)');
});
const stopJobs = startJobs();

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  stopJobs();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
