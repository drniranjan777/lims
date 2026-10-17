import { logger } from './lib/logger';
import { deliverPendingEmails } from './lib/notify';
import { expireQuotations } from './modules/quotations';
import { markDueForDisposal } from './modules/stores';

/**
 * Lightweight in-process scheduler for periodic housekeeping. Each job is idempotent, so running
 * more than one API instance is safe (at worst a job runs twice). Swap for BullMQ/cron when scaling out.
 */
const JOBS: { name: string; everyMs: number; run: () => Promise<number> }[] = [
  { name: 'email-delivery', everyMs: 60_000, run: () => deliverPendingEmails() },
  { name: 'quotation-expiry', everyMs: 60 * 60_000, run: expireQuotations },
  { name: 'disposal-due', everyMs: 60 * 60_000, run: markDueForDisposal },
];

export function startJobs() {
  const timers = JOBS.map((job) => {
    const tick = async () => {
      try {
        const n = await job.run();
        if (n) logger.info({ job: job.name, affected: n }, 'job ran');
      } catch (err) {
        logger.error({ err, job: job.name }, 'job failed');
      }
    };
    setTimeout(tick, 5_000);
    return setInterval(tick, job.everyMs);
  });
  return () => timers.forEach(clearInterval);
}
